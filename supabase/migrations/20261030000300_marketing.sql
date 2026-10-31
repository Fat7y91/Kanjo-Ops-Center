begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Marketing facts and per-platform integration settings.
 *
 * A marketing row is append-only for the same reason as the ledger: an edited
 * spend figure destroys the audit trail. A correction is a new row.
 *
 * `channel` is where the audience saw the ad; `platform` is who billed us.
 * They are separate columns on purpose so one platform can run many channels.
 *
 * API keys never live in a readable column. `api_key_ciphertext` is written by
 * the Tier 3 service and never selected by a client role; the app only reads
 * `api_key_configured`.
 * ───────────────────────────────────────────────────────────────────────── */

create table app.marketing_platform_settings (
  platform           text        primary key,
  enabled            boolean     not null default false,
  api_key_ciphertext text,
  webhook_url        text        not null default '',
  updated_at         timestamptz not null default now(),
  updated_by         uuid        references app.users (id) on delete set null,
  constraint marketing_platform_allowed check (
    platform in ('meta', 'tiktok', 'google', 'snapchat', 'offline')
  ),
  constraint marketing_webhook_shape check (
    webhook_url = '' or webhook_url ~* '^https?://'
  )
);

comment on table app.marketing_platform_settings is
  'Per-platform sync settings. The API key is ciphertext and is never exposed to client roles.';

create table app.marketing_entries (
  id                uuid        primary key default gen_random_uuid(),
  platform          text        not null,
  channel           text        not null,
  campaign          text        not null,
  spend_minor       bigint      not null default 0,
  impressions       bigint      not null default 0,
  clicks            bigint      not null default 0,
  conversions       bigint      not null default 0,
  occurred_at       timestamptz not null,
  city_id           text,
  recorded_by       uuid        references app.users (id) on delete set null,
  recorded_at       timestamptz not null default now(),
  constraint marketing_entries_platform_allowed check (
    platform in ('meta', 'tiktok', 'google', 'snapchat', 'offline')
  ),
  constraint marketing_entries_channel_allowed check (
    channel in ('instagram', 'tiktok', 'google', 'referral', 'field')
  ),
  constraint marketing_entries_nonnegative check (
    spend_minor >= 0 and impressions >= 0 and clicks >= 0 and conversions >= 0
  ),
  constraint marketing_entries_clicks_within_impressions
    check (clicks <= impressions),
  constraint marketing_entries_conversions_within_clicks
    check (conversions <= clicks),
  constraint marketing_entries_campaign_present
    check (length(btrim(campaign)) > 0)
);

comment on table app.marketing_entries is
  'Manual campaign facts. Append-only: corrections are new rows so spend stays auditable.';
comment on column app.marketing_entries.city_id is
  'Firestore city document id. Null means the campaign covers all cities.';

create index marketing_entries_platform_idx
  on app.marketing_entries (platform, occurred_at desc);

create index marketing_entries_city_idx
  on app.marketing_entries (city_id, occurred_at desc);

create function app.marketing_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'MARKETING_IMMUTABLE: marketing entries are append-only; record a correcting row instead'
    using errcode = '55000';
end;
$$;

create trigger marketing_entries_immutable_update
before update on app.marketing_entries
for each row execute function app.marketing_reject_mutation();

create trigger marketing_entries_immutable_delete
before delete on app.marketing_entries
for each row execute function app.marketing_reject_mutation();

/* ─────────────────────────────────────────────────────────────────────────
 * Row Level Security. Reading and writing both require
 * manage_marketing_metrics; the settings table hides the ciphertext from every
 * non-service role through a column-level view.
 * ───────────────────────────────────────────────────────────────────────── */
alter table app.marketing_platform_settings enable row level security;
alter table app.marketing_entries           enable row level security;

alter table app.marketing_platform_settings force row level security;
alter table app.marketing_entries           force row level security;

create policy marketing_settings_read on app.marketing_platform_settings
  for select to authenticated
  using (app.has_permission('manage_marketing_metrics'));

create policy marketing_settings_write on app.marketing_platform_settings
  for all to authenticated
  using (app.has_permission('manage_marketing_metrics'))
  with check (app.has_permission('manage_marketing_metrics'));

create policy marketing_entries_read on app.marketing_entries
  for select to authenticated
  using (app.has_permission('manage_marketing_metrics'));

create policy marketing_entries_insert on app.marketing_entries
  for insert to authenticated
  with check (app.has_permission('manage_marketing_metrics'));

/* Safe projection: exposes whether a key exists, never the key itself. */
create view app.marketing_platform_settings_public
with (security_invoker = true)
as
select
  platform,
  enabled,
  (api_key_ciphertext is not null and length(api_key_ciphertext) > 0)
    as api_key_configured,
  webhook_url,
  updated_at
from app.marketing_platform_settings;

comment on view app.marketing_platform_settings_public is
  'Client-safe projection of platform settings: no ciphertext, only a configured flag.';

commit;
