begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Grant the merchant-edit and product-delete capabilities.
 *
 *   edit_merchants  correct a merchant's core details (name, contact, category,
 *                   city, target commission, notes) from the profile.
 *   delete_products permanently remove a catalog product.
 *
 * Both keys already exist in the V2 catalogue; this migration guarantees the
 * rows are present and that the owner and every active executive/global admin
 * hold them immediately after deploy. It is idempotent: re-running changes
 * nothing for a user who already has the grant.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('edit_merchants',  'تعديل التجار',  'تصحيح بيانات التاجر الأساسية من ملفه دون فتح دورة الحالة.', 'التجار', 24),
  ('delete_products', 'حذف المنتجات', 'حذف منتج نهائياً من كتالوج التاجر.', 'الكتالوج', 41)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* Owner and every active executive / global admin receive both capabilities on
 * deploy. Narrower desks can still be granted either one on its own. */
insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
 cross join (values
   ('edit_merchants'),
   ('delete_products')
 ) as p(key)
 where u.active
   and (u.clearance_level >= 4 or u.global_scope)
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where active
   and (clearance_level >= 4 or global_scope);

commit;
