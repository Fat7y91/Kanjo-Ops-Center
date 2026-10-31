begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Campaign-based manual marketing.
 *
 * Until now a marketing row was a bare fact: a platform, a spend figure and a
 * date with no owner. That made it impossible to answer "which campaign is
 * over budget" or "which campaign produced these leads". A campaign is now the
 * unit of work and daily results hang off it.
 *
 *   app.marketing_campaigns        plan: target, budget, window, status
 *   app.marketing_entries          daily results, append-only, campaign-scoped
 *
 * `channel` stays separate from `platform` (where the audience saw the ad vs
 * who billed us), and both constraints are preserved from 20261030000300.
 *
 * Status ladder: active ⇄ paused → closed. `closed` is terminal, enforced by a
 * trigger, because a closed campaign's figures must never move again.
 * ───────────────────────────────────────────────────────────────────────── */

create table app.marketing_campaigns (
  id                 uuid        primary key default gen_random_uuid(),
  name               text        not null,
  platform           text        not null,
  channel            text        not null,
  city_id            text,
  budget_minor       bigint      not null default 0,
  target_leads       bigint      not null default 0,
  target_conversions bigint      not null default 0,
  starts_on          date        not null,
  ends_on            date        not null,
  status             text        not null default 'active',
  created_by         uuid        references app.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  closed_at          timestamptz,
  constraint marketing_campaign_platform_allowed check (
    platform in ('meta', 'tiktok', 'google', 'snapchat', 'offline')
  ),
  constraint marketing_campaign_channel_allowed check (
    channel in ('instagram', 'tiktok', 'google', 'referral', 'field')
  ),
  constraint marketing_campaign_status_allowed check (
    status in ('active', 'paused', 'closed')
  ),
  constraint marketing_campaign_name_present check (length(btrim(name)) > 0),
  constraint marketing_campaign_budget_nonnegative check (budget_minor >= 0),
  constraint marketing_campaign_targets_nonnegative check (
    target_leads >= 0 and target_conversions >= 0
  ),
  constraint marketing_campaign_window_ordered check (ends_on >= starts_on),
  constraint marketing_campaign_closed_shape check (
    (status = 'closed') = (closed_at is not null)
  )
);

comment on table app.marketing_campaigns is
  'Marketing campaign plan. Closed campaigns are terminal: their results can no longer change.';

create index marketing_campaigns_status_idx
  on app.marketing_campaigns (status, starts_on desc);

/* `leads` joins the fact row: a campaign is judged on qualified leads, not just
 * raw traffic, so the daily report must carry it.
 *
 * `platform` and `channel` are no longer typed per row: they are owned by the
 * campaign, and the guard trigger copies them down so the two can never drift.
 */
alter table app.marketing_entries
  add column campaign_id uuid references app.marketing_campaigns (id) on delete restrict,
  add column leads bigint not null default 0,
  add column note text not null default '';

alter table app.marketing_entries
  alter column platform drop not null,
  alter column channel drop not null;

alter table app.marketing_entries
  add constraint marketing_entries_leads_nonnegative check (leads >= 0),
  add constraint marketing_entries_leads_within_clicks check (leads <= clicks);

create index marketing_entries_campaign_idx
  on app.marketing_entries (campaign_id, occurred_at desc);

/* A closed campaign is frozen. The entry trigger already blocks updates and
 * deletes; this one blocks new inserts after the close and stamps each row with
 * the campaign's platform and channel. */
create function app.marketing_entry_guard()
returns trigger
language plpgsql
as $$
declare
  campaign_status   text;
  campaign_platform text;
  campaign_channel  text;
begin
  select status, platform, channel
    into campaign_status, campaign_platform, campaign_channel
    from app.marketing_campaigns
   where id = new.campaign_id;

  if campaign_status is null then
    raise exception 'MARKETING_UNKNOWN_CAMPAIGN: % does not exist', new.campaign_id
      using errcode = '23503';
  end if;

  if campaign_status = 'closed' then
    raise exception 'MARKETING_CAMPAIGN_CLOSED: cannot append results to a closed campaign'
      using errcode = '55000';
  end if;

  new.platform := campaign_platform;
  new.channel  := campaign_channel;

  return new;
end;
$$;

create trigger marketing_entries_guard_insert
before insert on app.marketing_entries
for each row execute function app.marketing_entry_guard();

/* Nothing may move a campaign out of `closed`. */
create function app.marketing_campaign_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'closed' then
    raise exception 'MARKETING_CAMPAIGN_TERMINAL: a closed campaign cannot be reopened'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger marketing_campaigns_terminal_status
before update on app.marketing_campaigns
for each row execute function app.marketing_campaign_terminal();

alter table app.marketing_campaigns enable row level security;
alter table app.marketing_campaigns force row level security;

create policy marketing_campaigns_read on app.marketing_campaigns
  for select to authenticated
  using (app.has_permission('manage_marketing_metrics'));

create policy marketing_campaigns_insert on app.marketing_campaigns
  for insert to authenticated
  with check (app.has_permission('manage_marketing_metrics'));

create policy marketing_campaigns_update on app.marketing_campaigns
  for update to authenticated
  using (app.has_permission('manage_marketing_metrics'))
  with check (app.has_permission('manage_marketing_metrics'));

grant select, insert, update on app.marketing_campaigns to authenticated;
grant select, insert, update, delete on app.marketing_campaigns to service_role;

/* Per-campaign rollup: spend, leads and the budget remainder, computed from the
 * append-only entries so the card and the table can never disagree. */
create view app.marketing_campaign_totals
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.platform,
  c.channel,
  c.city_id,
  c.budget_minor,
  c.status,
  c.starts_on,
  c.ends_on,
  coalesce(sum(e.spend_minor), 0)       as spend_minor,
  coalesce(sum(e.leads), 0)             as leads,
  coalesce(sum(e.conversions), 0)       as conversions,
  greatest(c.budget_minor - coalesce(sum(e.spend_minor), 0), 0) as budget_left_minor
from app.marketing_campaigns c
left join app.marketing_entries e on e.campaign_id = c.id
group by c.id;

comment on view app.marketing_campaign_totals is
  'Per-campaign spend/leads rollup derived from the append-only entries.';

grant select on app.marketing_campaign_totals to authenticated, service_role;

commit;
