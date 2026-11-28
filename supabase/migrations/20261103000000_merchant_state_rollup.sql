begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Pillar 1 — merchant state is computed once, in Postgres.
 *
 * The agreement state of a merchant is not the value stored on the row: it is
 * the newest of three sources — a completed visit outcome, a manager override,
 * and the stored column itself. Every screen used to re-derive that in
 * JavaScript on the Edge runtime by loading the whole `app.visit_reports`
 * table and reducing it per merchant. `/merchants` therefore paid for a
 * multi-thousand-row read plus a full scan on every request and regularly
 * exceeded the Cloudflare Worker CPU limit (1102 / HTTP 500).
 *
 * This migration moves the derivation into SQL:
 *
 *   1. `app.merchant_state_overrides` — durable, append-only record of a
 *      manager state decision. Overrides previously lived only in the
 *      process-local store, so a manager decision vanished with the isolate
 *      that served it and never reached the profile served by another worker.
 *   2. `app.merchant_state_rollup` — one pre-computed row per merchant with
 *      the resolved state, its timestamp, its source, and the visit counters.
 *      Repositories read this view instead of the report table.
 *
 * `security_invoker = true` matches the other derived views in this schema: the
 * caller's RLS still applies to the underlying rows.
 *
 * Re-runnable: every object is created with `if not exists` or replaced, and
 * policies/triggers are dropped before they are recreated.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Manager state overrides ────────────────────────────────────────── */

create table if not exists app.merchant_state_overrides (
  id            uuid        primary key default gen_random_uuid(),
  /* Text, no FK: field-ops merchants are resolved from the in-memory
   * catalogue (seed ids like `m-abar-sham`) and do not exist in
   * `app.merchants`. Same reasoning as `app.visit_reports`. */
  merchant_id   text        not null,
  merchant_name text        not null default '',
  from_state    text        not null,
  to_state      text        not null,
  actor_id      text        not null,
  actor_name    text        not null default '',
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  /* Nullable FK: seeded actors use non-UUID ids and must not be rejected. */
  logged_by     uuid        references app.users (id) on delete set null,
  constraint merchant_state_overrides_states check (
    from_state in ('no_agreement', 'provisional', 'final_contract', 'signed_contract')
    and to_state in ('no_agreement', 'provisional', 'final_contract', 'signed_contract')
  )
);

alter table app.merchant_state_overrides
  add column if not exists merchant_name text not null default '',
  add column if not exists actor_name    text not null default '',
  add column if not exists note          text not null default '',
  add column if not exists logged_by     uuid references app.users (id) on delete set null;

comment on table app.merchant_state_overrides is
  'Durable, append-only record of a manager agreement-state decision. Read by app.merchant_state_rollup.';
comment on column app.merchant_state_overrides.merchant_id is
  'Field-ops merchant id. No FK by design: the merchant catalogue is seeded in the application.';

create index if not exists merchant_state_overrides_merchant_idx
  on app.merchant_state_overrides (merchant_id, created_at desc);

/* A state decision is financial history: it is recorded, never rewritten. */
create or replace function app.merchant_state_override_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'MERCHANT_STATE_OVERRIDE_IMMUTABLE: a recorded state decision cannot be changed or deleted'
    using errcode = '23514';
end;
$$;

comment on function app.merchant_state_override_guard() is
  'Rejects UPDATE and DELETE: overrides are an append-only audit record.';

drop trigger if exists merchant_state_overrides_guard_update on app.merchant_state_overrides;
create trigger merchant_state_overrides_guard_update
before update on app.merchant_state_overrides
for each row execute function app.merchant_state_override_guard();

drop trigger if exists merchant_state_overrides_guard_delete on app.merchant_state_overrides;
create trigger merchant_state_overrides_guard_delete
before delete on app.merchant_state_overrides
for each row execute function app.merchant_state_override_guard();

/* ── 2. Pre-computed rollup ──────────────────────────────────────────────
 * One row per merchant that has any signal at all. The ranking mirrors the
 * TypeScript resolver it replaces: newest timestamp wins, and on an exact tie
 * a manager override outranks the visit that preceded it, which outranks the
 * stored column.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace view app.merchant_state_rollup
with (security_invoker = true)
as
with visit_stats as (
  select
    r.merchant_id,
    count(*)::integer                                    as visit_count,
    coalesce(sum(r.duration_seconds), 0)::bigint          as total_duration_seconds,
    max(coalesce(r.ended_at, r.started_at, r.created_at)) as last_visit_at
  from app.visit_reports r
  group by r.merchant_id
),
latest_visit as (
  select distinct on (r.merchant_id)
    r.merchant_id,
    r.outcome                                        as state,
    coalesce(r.ended_at, r.started_at, r.created_at) as state_at,
    r.rep_name                                       as actor
  from app.visit_reports r
  order by
    r.merchant_id,
    coalesce(r.ended_at, r.started_at, r.created_at) desc,
    r.created_at desc
),
latest_override as (
  select distinct on (o.merchant_id)
    o.merchant_id,
    o.to_state   as state,
    o.created_at as state_at,
    o.actor_name as actor
  from app.merchant_state_overrides o
  order by o.merchant_id, o.created_at desc
),
stored as (
  select
    m.id             as merchant_id,
    m.contract_state as state,
    m.updated_at     as state_at
  from app.merchants m
),
candidates as (
  select merchant_id, state, state_at, 'merchant'::text as source, 0 as source_rank, null::text as actor
  from stored
  union all
  select merchant_id, state, state_at, 'visit'::text, 1, actor from latest_visit
  union all
  select merchant_id, state, state_at, 'override'::text, 2, actor from latest_override
),
resolved as (
  select distinct on (merchant_id)
    merchant_id, state, state_at, source, actor
  from candidates
  where state_at is not null
  order by merchant_id, state_at desc, source_rank desc
),
merchant_keys as (
  select merchant_id from stored
  union
  select merchant_id from visit_stats
  union
  select merchant_id from latest_override
)
select
  k.merchant_id,
  coalesce(res.state, 'no_agreement')   as current_state,
  res.state_at                          as current_state_at,
  coalesce(res.source, 'none')          as current_state_source,
  res.actor                             as current_state_actor,
  coalesce(s.visit_count, 0)            as visit_count,
  coalesce(s.total_duration_seconds, 0) as total_duration_seconds,
  s.last_visit_at                       as last_visit_at,
  v.state                               as last_outcome,
  v.state_at                            as last_outcome_at,
  v.actor                               as last_rep_name,
  st.state                              as stored_state,
  st.state_at                           as stored_state_at
from merchant_keys k
left join resolved     res on res.merchant_id = k.merchant_id
left join visit_stats  s   on s.merchant_id   = k.merchant_id
left join latest_visit v   on v.merchant_id   = k.merchant_id
left join stored       st  on st.merchant_id  = k.merchant_id;

comment on view app.merchant_state_rollup is
  'Pre-computed merchant agreement state: newest of visit outcome, manager override and stored column, plus visit counters. Read instead of scanning app.visit_reports.';

/* ── 3. Read path ───────────────────────────────────────────────────────────
 * The rollup resolves "newest visit" with `distinct on (merchant_id)` ordered by
 * the same expression the visit outcome took effect at. A plain
 * `(merchant_id, created_at)` index cannot serve that ordering, so the report
 * table gets an expression index instead of a full sort per request.
 * ───────────────────────────────────────────────────────────────────────── */

create index if not exists visit_reports_merchant_state_idx
  on app.visit_reports (
    merchant_id,
    (coalesce(ended_at, started_at, created_at)) desc
  );

/* ── 4. Access ────────────────────────────────────────────────────────────
 * Reading state belongs to both the merchant directory and field operations.
 * Writing a decision is the `edit_contract` capability, mirrored by the API.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.merchant_state_overrides enable row level security;
alter table app.merchant_state_overrides force  row level security;

drop policy if exists merchant_state_overrides_read_capable on app.merchant_state_overrides;
create policy merchant_state_overrides_read_capable on app.merchant_state_overrides
  for select to authenticated
  using (
    app.is_active_user() and (
      app.has_permission('view_merchants') or
      app.has_permission('view_all_teams_visits')
    )
  );

drop policy if exists merchant_state_overrides_insert_contract on app.merchant_state_overrides;
create policy merchant_state_overrides_insert_contract on app.merchant_state_overrides
  for insert to authenticated
  with check (
    app.is_active_user() and
    app.has_permission('edit_contract')
  );

grant select, insert on app.merchant_state_overrides to authenticated;
grant select, insert, update, delete on app.merchant_state_overrides to service_role;

grant select on app.merchant_state_rollup to authenticated;
grant select on app.merchant_state_rollup to service_role;

commit;
