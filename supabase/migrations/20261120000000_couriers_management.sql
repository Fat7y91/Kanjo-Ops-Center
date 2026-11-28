begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Courier management + operations KPI surface.
 *
 * The delivery roster in `20261102000003_operations_clearinghouse.sql` only
 * carried the cut rate and an active flag. The couriers screen needs the
 * partner's vehicle, its plate, live availability and the day they joined.
 * Those are roster facts, not identity facts, so they stay on `app.couriers`
 * next to the cut percent. Phone, email and the display name continue to come
 * from `app.users`, which remains the single identity record.
 *
 * Three capabilities travel with this surface:
 *   - `view_couriers`         open the roster
 *   - `manage_couriers`       add / edit / deactivate a partner
 *   - `view_operations_kpi`   read the per-employee operations ledger
 *
 * Idempotent: `add column if not exists`, upsert the catalogue, grant with
 * `on conflict do nothing`, and drop policies before recreate.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Roster detail columns ───────────────────────────────────────────── */

alter table app.couriers
  add column if not exists vehicle_type text not null default '',
  add column if not exists vehicle_plate text not null default '',
  add column if not exists availability text not null default 'available',
  add column if not exists applied_at   timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'couriers_availability_allowed'
       and conrelid = 'app.couriers'::regclass
  ) then
    alter table app.couriers
      add constraint couriers_availability_allowed
      check (availability in ('available', 'busy', 'offline'));
  end if;
end;
$$;

comment on column app.couriers.vehicle_type is
  'Free-text vehicle description entered by the partner (motorcycle, car, van).';
comment on column app.couriers.vehicle_plate is
  'Licence plate as printed, kept verbatim for field identification.';
comment on column app.couriers.availability is
  'Live delivery availability: available | busy | offline.';
comment on column app.couriers.applied_at is
  'Date the partner joined the delivery roster; shown on the couriers list.';

create index if not exists couriers_availability_idx
  on app.couriers (availability);

/* ── 2. RLS: reading and writing the roster ─────────────────────────────── */

drop policy if exists couriers_read_active on app.couriers;
create policy couriers_read_active on app.couriers
  for select to authenticated
  using (app.is_active_user());

drop policy if exists couriers_write_capable on app.couriers;
create policy couriers_write_capable on app.couriers
  for insert to authenticated
  with check (
    app.has_permission('manage_couriers') or
    app.has_permission('log_operations') or
    app.has_permission('manage_system_users')
  );

drop policy if exists couriers_update_capable on app.couriers;
create policy couriers_update_capable on app.couriers
  for update to authenticated
  using (
    app.has_permission('manage_couriers') or
    app.has_permission('log_operations') or
    app.has_permission('manage_system_users')
  )
  with check (
    app.has_permission('manage_couriers') or
    app.has_permission('log_operations') or
    app.has_permission('manage_system_users')
  );

drop policy if exists couriers_delete_capable on app.couriers;
create policy couriers_delete_capable on app.couriers
  for delete to authenticated
  using (app.has_permission('manage_couriers'));

/* Operations reads feed the per-employee report, so the KPI capability opens
 * the same append-only rows the clearinghouse already reads. */
drop policy if exists operation_logs_read_capable on app.operation_logs;
create policy operation_logs_read_capable on app.operation_logs
  for select to authenticated
  using (
    app.has_permission('log_operations') or
    app.has_permission('view_clearinghouse') or
    app.has_permission('settle_clearinghouse') or
    app.has_permission('view_operations_kpi')
  );

grant delete on app.couriers to authenticated;

/* ── 3. Capability catalogue ────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('view_couriers',        'عرض المناديب',            'فتح دليل شركاء التوصيل وبيانات مركباتهم وتوفرهم وأرصدتهم.', 'المقاصة والعمليات', 104),
  ('manage_couriers',      'إدارة المناديب',          'إضافة شريك توصيل وتعديل بياناته وتعطيله أو حذفه.',           'المقاصة والعمليات', 105),
  ('view_operations_kpi',  'عرض سجل أداء الموظفين',   'الاطلاع على عدد العمليات المسجلة لكل موظف وقيمتها لحساب المؤشرات.', 'المقاصة والعمليات', 106)
on conflict (key) do update
   set label       = excluded.label,
       description = excluded.description,
       group_key   = excluded.group_key,
       sort_order  = excluded.sort_order;

/* Level 4 holds the whole catalogue; grant explicitly so the executive tier
 * can open the surface without a follow-up manual grant. */
insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
 cross join (values
   ('view_couriers'),
   ('manage_couriers'),
   ('view_operations_kpi')
 ) as p(key)
 where u.clearance_level = 4
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where clearance_level = 4;

commit;
