begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Order deletion + admin grant.
 *
 * `operation_logs` is append-only: deleting a row would break the audit trail
 * and its financial ledgers are protected by `on delete restrict`. A delete
 * therefore records a tombstone, and the list queries filter those ids out.
 * The log, the ledgers and the derived balances stay untouched.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.operation_log_deletions (
  operation_id uuid        primary key references app.operation_logs (id) on delete cascade,
  deleted_by   uuid        references app.users (id) on delete set null,
  deleted_at   timestamptz not null default now()
);

comment on table app.operation_log_deletions is
  'Orders hidden from the working lists. The operation log itself stays append-only.';

alter table app.operation_log_deletions enable row level security;

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('delete_orders', 'حذف الطلبات', 'إخفاء الطلبات المحددة من شاشة الطلبات والمقاصة.', 'المقاصة والعمليات', 103)
on conflict (key) do update
   set label       = excluded.label,
       description = excluded.description,
       group_key   = excluded.group_key,
       sort_order  = excluded.sort_order;

/* Level 4 is the System Admin tier: grant explicitly so the PO inherits the
 * capability as soon as the migration runs, without a manual SQL step. */
insert into app.user_permissions (user_id, permission_key)
select u.id, 'delete_orders'
  from app.users u
 where u.clearance_level = 4
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where clearance_level = 4;

commit;
