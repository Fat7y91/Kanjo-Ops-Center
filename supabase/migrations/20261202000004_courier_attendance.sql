begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Courier daily attendance.
 *
 * Courier pay is now a daily amount: 165 EGP for every attended day, 7 EGP for
 * the first 15 delivered orders and 15 EGP for every order above 15. A day with
 * at least one delivered order is auto-attended, so most rows are derived and
 * never stored. This table exists only for the exceptions an operator must
 * decide by hand: marking a zero-order day present (paid), or an attended day
 * absent/excused (unpaid). One row per courier per Cairo calendar day.
 *
 * The pay arithmetic lives in `src/lib/couriers/tiered-pay.ts`; this table is
 * the override ledger only, never the earnings source.
 *
 * Idempotent: `create table if not exists`, drop policy before recreate.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.courier_attendance (
  id              uuid primary key default gen_random_uuid(),
  courier_id      uuid not null references app.couriers(id) on delete cascade,
  attendance_date date not null,
  status          text not null default 'present'
                    check (status in ('present', 'absent', 'excused')),
  note            text not null default '',
  created_by      uuid references app.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (courier_id, attendance_date)
);

comment on table app.courier_attendance is
  'Manual courier attendance overrides keyed to one Cairo calendar day. Auto-attendance (any delivered order) needs no row.';
comment on column app.courier_attendance.status is
  'present = paid 165 base, absent/excused = unpaid base; order tiers apply regardless.';

create index if not exists courier_attendance_courier_idx
  on app.courier_attendance (courier_id, attendance_date desc);

drop trigger if exists courier_attendance_touch_updated_at on app.courier_attendance;
create trigger courier_attendance_touch_updated_at
  before update on app.courier_attendance
  for each row execute function app.touch_updated_at();

/* ── RLS: read with the roster, write with the roster managers ─────────── */

alter table app.courier_attendance enable row level security;
alter table app.courier_attendance force row level security;

drop policy if exists courier_attendance_read on app.courier_attendance;
create policy courier_attendance_read on app.courier_attendance
  for select to authenticated
  using (app.is_active_user());

drop policy if exists courier_attendance_write on app.courier_attendance;
create policy courier_attendance_write on app.courier_attendance
  for insert to authenticated
  with check (
    app.has_permission('manage_couriers') or
    app.has_permission('log_operations')
  );

drop policy if exists courier_attendance_update on app.courier_attendance;
create policy courier_attendance_update on app.courier_attendance
  for update to authenticated
  using (
    app.has_permission('manage_couriers') or
    app.has_permission('log_operations')
  )
  with check (
    app.has_permission('manage_couriers') or
    app.has_permission('log_operations')
  );

drop policy if exists courier_attendance_delete on app.courier_attendance;
create policy courier_attendance_delete on app.courier_attendance
  for delete to authenticated
  using (app.has_permission('manage_couriers'));

grant select, insert, update, delete on app.courier_attendance to authenticated;

commit;
