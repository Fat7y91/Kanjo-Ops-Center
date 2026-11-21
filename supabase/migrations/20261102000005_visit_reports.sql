begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Pillar 2b — durable visit reports.
 *
 * `POST /api/field-ops/merchants/[id]/reports` and `.../visits/sync` returned
 * 201 while writing only to the process-local `__kanjoV2FieldOpsStore`. Every
 * isolate has its own store, so a report survived only until the worker
 * recycled and no row was ever written to a shared database. The merchant
 * timeline, the first-visit gate and payroll attribution all read that store,
 * which is why the loss was silent: the response looked successful.
 *
 * This table is the append-only record of a completed visit. It mirrors the
 * `VisitReport` domain type:
 *
 *   - `merchant_id` is text with no foreign key. Field-ops merchants are still
 *     resolved from the in-memory catalogue (seed ids like `m-abar-sham`),
 *     which do not exist in `app.merchants`. An FK would reject those writes.
 *   - `rep_id` is text for the same reason: it is the session user id, but
 *     seeded reports carry `u-*` ids that are not UUIDs.
 *   - `(merchant_id, client_visit_id)` is unique when a client id is present,
 *     so an offline batch replay cannot duplicate a visit.
 *
 * Re-runnable: `create table if not exists`, guarded `add column if not
 * exists`, and every policy/trigger is dropped before it is recreated.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.visit_reports (
  id                       uuid        primary key default gen_random_uuid(),
  merchant_id              text        not null,
  merchant_name            text        not null default '',
  task_id                  text,
  rep_id                   text        not null,
  rep_name                 text        not null default '',
  team                     text        not null default '',
  outcome                  text        not null,
  previous_state           text        not null,
  notes                    text        not null default '',
  commission_amount        numeric(14, 2) not null default 0,
  agreed_commission        numeric(6, 2),
  created_at               timestamptz not null default now(),
  started_at               timestamptz,
  ended_at                 timestamptz,
  duration_seconds         integer,
  start_location           jsonb,
  end_location             jsonb,
  contact                  jsonb,
  opinions                 jsonb       not null default '[]'::jsonb,
  follow_up_at             timestamptz,
  follow_up_task_id        text,
  follow_up_contact_number text,
  source                   text        not null default 'task',
  client_visit_id          text,
  logged_by                uuid        references app.users (id) on delete set null,
  constraint visit_reports_merchant_present
    check (length(btrim(merchant_id)) > 0),
  constraint visit_reports_rep_present
    check (length(btrim(rep_id)) > 0),
  constraint visit_reports_outcome_allowed
    check (outcome in ('no_agreement', 'provisional', 'final_contract', 'signed_contract')),
  constraint visit_reports_previous_state_allowed
    check (previous_state in ('no_agreement', 'provisional', 'final_contract', 'signed_contract')),
  constraint visit_reports_source_allowed
    check (source in ('task', 'unplanned', 'offline', 'override')),
  constraint visit_reports_duration_non_negative
    check (duration_seconds is null or duration_seconds >= 0),
  constraint visit_reports_commission_non_negative
    check (commission_amount >= 0),
  constraint visit_reports_agreed_commission_range
    check (
      agreed_commission is null or
      (agreed_commission >= 0 and agreed_commission <= 100)
    )
);

/* Reconciliation: widen a table left by an earlier deployment instead of
 * skipping it wholesale. Mirrors the other Pillar migrations. */
alter table app.visit_reports
  add column if not exists id                       uuid default gen_random_uuid(),
  add column if not exists merchant_id              text,
  add column if not exists merchant_name            text not null default '',
  add column if not exists task_id                  text,
  add column if not exists rep_id                   text,
  add column if not exists rep_name                 text not null default '',
  add column if not exists team                     text not null default '',
  add column if not exists outcome                  text,
  add column if not exists previous_state           text,
  add column if not exists notes                    text not null default '',
  add column if not exists commission_amount        numeric(14, 2) not null default 0,
  add column if not exists agreed_commission        numeric(6, 2),
  add column if not exists created_at               timestamptz not null default now(),
  add column if not exists started_at               timestamptz,
  add column if not exists ended_at                 timestamptz,
  add column if not exists duration_seconds         integer,
  add column if not exists start_location           jsonb,
  add column if not exists end_location             jsonb,
  add column if not exists contact                  jsonb,
  add column if not exists opinions                 jsonb not null default '[]'::jsonb,
  add column if not exists follow_up_at             timestamptz,
  add column if not exists follow_up_task_id        text,
  add column if not exists follow_up_contact_number text,
  add column if not exists source                   text not null default 'task',
  add column if not exists client_visit_id          text,
  add column if not exists logged_by                uuid references app.users (id) on delete set null;

comment on table app.visit_reports is
  'Append-only record of a completed field visit. Replaces the process-local field-ops store as the durable write target.';
comment on column app.visit_reports.merchant_id is
  'Field-ops merchant id (text, cross-database reference). No FK: field-ops merchants are not all rows of app.merchants yet.';
comment on column app.visit_reports.client_visit_id is
  'Offline queue id. Unique per merchant so a replayed batch cannot duplicate a visit.';
comment on column app.visit_reports.opinions is
  'Weighted rep opinions captured with the visit, as JSON.';

create unique index if not exists visit_reports_client_visit_key
  on app.visit_reports (merchant_id, client_visit_id)
  where client_visit_id is not null;

create index if not exists visit_reports_merchant_idx
  on app.visit_reports (merchant_id, created_at desc);

create index if not exists visit_reports_rep_idx
  on app.visit_reports (rep_id, created_at desc);

create index if not exists visit_reports_team_idx
  on app.visit_reports (team, created_at desc);

/* ── Immutability ────────────────────────────────────────────────────────
 * A report is evidence of a visit. Correcting one is an edit-request workflow
 * (`app` keeps the original until a manager approves a replacement), so the
 * stored row must never be rewritten or removed by an API caller.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.visit_report_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'VISIT_REPORT_IMMUTABLE: لا يمكن تعديل أو حذف تقرير زيارة مسجّل.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists visit_reports_guard_update on app.visit_reports;
create trigger visit_reports_guard_update
before update on app.visit_reports
for each row execute function app.visit_report_guard();

drop trigger if exists visit_reports_guard_delete on app.visit_reports;
create trigger visit_reports_guard_delete
before delete on app.visit_reports
for each row execute function app.visit_report_guard();

/* ── Row Level Security ──────────────────────────────────────────────────
 * Writing a visit is a field capability. Reading the timeline is shared by
 * field operations and the merchant directory, so both grants open the read.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.visit_reports enable row level security;
alter table app.visit_reports force  row level security;

drop policy if exists visit_reports_read_capable on app.visit_reports;
create policy visit_reports_read_capable on app.visit_reports
  for select to authenticated
  using (
    app.is_active_user() and (
      app.has_permission('view_all_teams_visits') or
      app.has_permission('view_merchants')
    )
  );

drop policy if exists visit_reports_insert_capable on app.visit_reports;
create policy visit_reports_insert_capable on app.visit_reports
  for insert to authenticated
  with check (
    app.is_active_user() and
    app.has_permission('view_all_teams_visits')
  );

grant select, insert on app.visit_reports to authenticated;
grant select, insert, update, delete on app.visit_reports to service_role;

commit;
