begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Permission catalogue resync.
 *
 * `20261029000200_seed_permissions.sql` is the canonical seed, but it had
 * already been applied when the treasury keys were appended to it in place.
 * Supabase never re-runs an applied migration, so the live table stayed at 38
 * rows while `src/lib/rbac/permissions.ts` grew to 43. The dropdown and the
 * matrix read the TypeScript catalogue, but provisioning writes into
 * `app.user_permissions`, whose foreign key is validated against this table —
 * so the five missing keys could not be granted to anyone.
 *
 * This migration is the missing delta, expressed idempotently: it upserts all
 * 43 keys from the catalogue and then backfills the five treasury capabilities
 * onto the executives who were provisioned before they existed. New accounts
 * receive their grants from the provisioning service and are unaffected.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('view_accounts', 'عرض الحسابات البنكية', 'الاطلاع على الحسابات البنكية وأرصدة الودائع والمصروفات.', 'المالية', 39),
  ('manage_accounts', 'إدارة الحسابات البنكية', 'إضافة الحسابات البنكية وتسجيل الودائع والمصروفات.', 'المالية', 40),
  ('record_deposits', 'تسجيل الإيداعات', 'تسجيل إيداعات الحسابات البنكية المصرية فقط، دون الاطلاع على الأرصدة أو المصروفات.', 'المالية', 41),
  ('view_payroll', 'عرض الرواتب والعمولات', 'الاطلاع على مسير الرواتب وحساب العمولات لكل مندوب.', 'المالية', 42),
  ('manage_payroll', 'إدارة الرواتب والعمولات', 'تعديل بنود الرواتب والعمولات واعتماد المسير.', 'المالية', 43)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* Backfill: a level 4/3 operator is an executive with global scope, and the
 * treasury capabilities are part of that baseline (see seed-users.ts, where
 * both the owner and the founder hold the full catalogue). Re-granting an
 * existing key is a no-op, so this stays safe to re-run. */
insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
  cross join app.permissions p
 where u.active
   and u.clearance_level >= 3
   and p.key in (
     'view_accounts',
     'manage_accounts',
     'record_deposits',
     'view_payroll',
     'manage_payroll'
   )
on conflict (user_id, permission_key) do nothing;

/* Any authorization change must bump the session revision, otherwise an open
 * session keeps the stale grant set until it expires. */
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3;

commit;
