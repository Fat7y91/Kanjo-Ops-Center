begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Add the whole-catalog delete capability.
 *
 *   delete_catalog  wipe every product in a single merchant's catalog in one
 *                   action, behind a typed confirmation in the UI.
 *
 * The endpoint only removes `app.catalog_products` rows for the target
 * merchant; orders (`app.operation_logs`), the merchant record and every
 * journal entry are untouched. This migration registers the capability and
 * grants it to the owner and every active executive/global admin. It is
 * idempotent: re-running changes nothing for a user who already holds it.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('delete_catalog', 'حذف الكتالوج بالكامل', 'مسح جميع منتجات تاجر واحد نهائياً في خطوة واحدة.', 'الكتالوج', 42)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

insert into app.user_permissions (user_id, permission_key)
select u.id, 'delete_catalog'
  from app.users u
 where u.active
   and (u.clearance_level >= 4 or u.global_scope)
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where active
   and (clearance_level >= 4 or global_scope);

commit;
