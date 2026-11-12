begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Capabilities for the new finance and operations workflows.
 *
 *   import_orders                 bulk CSV import of fulfilled orders.
 *   settle_clearinghouse_partial  release a partial settlement (less than the
 *                                 outstanding balance) in the clearinghouse.
 *   post_fx_transfer              post a manual SAR→EGP transfer between the
 *                                 two bank ledgers.
 *
 * Each is distinct from the capability that opens its screen: importing orders
 * is not the same as logging one, a partial release carries more risk than a
 * full close, and an FX transfer moves money between banks. Executives and
 * above receive them; a narrower desk can be granted any of them on its own.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('import_orders',                'استيراد الطلبات',        'رفع ملف طلبات وتوجيه مستحقات التجار والمناديب دفعة واحدة.', 'المقاصة والعمليات', 53),
  ('settle_clearinghouse_partial', 'تسوية جزئية',            'سداد أو تحصيل جزء من رصيد طرف في المقاصة مع إبقاء الباقي مفتوحاً.', 'المقاصة والعمليات', 54),
  ('post_fx_transfer',             'تحويل عملة بين البنكين', 'تسجيل تحويل يدوي من بنك الرياض (ريال) إلى البنك المصري (جنيه) مع إرفاق إيصال التحويل.', 'الحسابات البنكية', 40)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* The orders screen is now "الطلبات"; keep the catalogue label in step with
 * the navigation and the generated data file. */
update app.permissions
   set label = 'تسجيل الطلبات'
 where key = 'log_operations';

insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
 cross join (values
   ('import_orders'),
   ('settle_clearinghouse_partial'),
   ('post_fx_transfer')
 ) as p(key)
 where u.active
   and u.clearance_level >= 3
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3;

commit;
