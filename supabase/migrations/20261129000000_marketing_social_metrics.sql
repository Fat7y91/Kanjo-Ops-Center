begin;

/* Append-only social follower snapshots.
 *
 * The dashboard reads the latest snapshot per account and a 30-day trend.
 * Rows are never updated: a correction is the next scheduled read of the
 * official API. Credentials stay in `marketing_platform_settings`; this table
 * only holds public page metrics. */

create table if not exists app.marketing_social_metrics (
  id           uuid        primary key default gen_random_uuid(),
  platform     text        not null,
  account_id   text        not null,
  account_name text        not null default '',
  followers    bigint      not null default 0,
  likes        bigint      not null default 0,
  captured_at  timestamptz not null default now(),
  captured_by  uuid        references app.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint marketing_social_platform_allowed check (
    platform in ('meta', 'instagram', 'tiktok', 'snapchat')
  ),
  constraint marketing_social_account_present check (
    length(btrim(account_id)) > 0
  ),
  constraint marketing_social_nonnegative check (
    followers >= 0 and likes >= 0
  )
);

alter table app.marketing_social_metrics
  add column if not exists id           uuid        default gen_random_uuid(),
  add column if not exists platform     text        not null,
  add column if not exists account_id   text        not null,
  add column if not exists account_name text        not null default '',
  add column if not exists followers    bigint      not null default 0,
  add column if not exists likes        bigint      not null default 0,
  add column if not exists captured_at  timestamptz not null default now(),
  add column if not exists captured_by  uuid        references app.users (id) on delete set null,
  add column if not exists created_at   timestamptz not null default now();

comment on table app.marketing_social_metrics is
  'Append-only follower/like snapshots read from the official platform APIs.';
comment on column app.marketing_social_metrics.captured_at is
  'Time of the API read. Multiple reads per day are allowed; the dashboard keeps the latest per account.';

create index if not exists marketing_social_metrics_captured_idx
  on app.marketing_social_metrics (captured_at desc);

create index if not exists marketing_social_metrics_account_idx
  on app.marketing_social_metrics (platform, account_id, captured_at desc);

alter table app.marketing_social_metrics enable row level security;
alter table app.marketing_social_metrics force row level security;

drop policy if exists marketing_social_metrics_read on app.marketing_social_metrics;
create policy marketing_social_metrics_read on app.marketing_social_metrics
  for select to authenticated
  using (
    app.has_permission('view_campaigns')
    or app.has_permission('manage_marketing_metrics')
    or app.has_permission('manage_platform_settings')
  );

grant select on app.marketing_social_metrics to authenticated;
grant select, insert on app.marketing_social_metrics to service_role;

commit;
