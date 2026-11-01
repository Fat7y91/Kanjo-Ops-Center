begin;

/* ─────────────────────────────────────────────────────────────────────────
 * 15-module catalogue seed + Level 4 convergence.
 *
 * Incident: the RBAC refactor replaced the capability vocabulary in
 * `src/lib/rbac/permissions.ts` (15 modules / 49 keys), but `app.permissions`
 * still held the legacy catalogue. Two consequences:
 *
 *   1. `app.user_permissions.permission_key` references `app.permissions`, so a
 *      grant for a new key could not be inserted at all.
 *   2. `loadRbacSnapshot()` drops grants whose key is absent from the TypeScript
 *      catalogue (`isPermission`), so the Founder resolved 3/49 permissions —
 *      only the three legacy strings that happened to survive the rename.
 *
 * This migration is the data half of the refactor:
 *
 *   - upserts the 49 source-of-truth keys into `app.permissions`;
 *   - deletes every Level 4 grant pointing outside that catalogue (the outdated
 *     records), leaving intact grants whose key still exists;
 *   - grants a Level 4 account the whole 49-key catalogue;
 *   - advances `auth_revision` so live sessions discard the stale token.
 *
 * Invariant enforced here and mirrored in `seed-users.ts`:
 *
 *   clearance_level = 4  =>  exactly the 49 catalogue keys granted
 *
 * Suspension is expressed by `app.users.active` and `is_active_user()`, never by
 * withholding grants, so a suspended L4 that is reactivated comes back whole
 * instead of half-blind. Idempotent: re-running converges, it does not duplicate.
 *
 * Legacy catalogue rows are deliberately NOT deleted. Other ranks still hold
 * grants that reference them (`on delete restrict`), and choosing each user's
 * replacement capabilities is a decision that must not be guessed here.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 0. Re-point the SQL authorization surface at the new governor key ──────
 * The foundation migration still names the legacy `manage_permissions` key in
 * three guard functions and eight RLS policies. Deleting the Founder's legacy
 * grants (step 2) would therefore abort this transaction with `RBAC_INVARIANT`,
 * and the policies would gate on a capability the application can no longer
 * issue. The functions are replaced first, then the policies, so the guards are
 * already reading the new key when the grants change. `create or replace` keeps
 * the constraint triggers bound to the same function names.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.assert_governor_remaining(affected_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app.users u
    join app.user_permissions p on p.user_id = u.id
    where u.id = affected_user
      and u.active
      and p.permission_key = 'manage_system_users'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from app.users u
    join app.user_permissions p on p.user_id = u.id
    where u.active
      and p.permission_key = 'manage_system_users'
  ) then
    raise exception
      'RBAC_INVARIANT: at least one active operator must retain manage_system_users'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function app.user_permissions_governor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
begin
  if tg_op = 'INSERT' then
    return null; -- granting can never remove a governor
  end if;

  if old.permission_key = 'manage_system_users' then
    affected := old.user_id;
  end if;

  if affected is not null then
    perform app.assert_governor_remaining(affected);
  end if;

  return null;
end;
$$;

create or replace function app.users_governor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  was_governor boolean;
begin
  was_governor := old.active and exists (
    select 1 from app.user_permissions p
    where p.user_id = old.id
      and p.permission_key = 'manage_system_users'
  );

  if not was_governor then
    return null;
  end if;

  if tg_op = 'UPDATE' and new.active then
    return null; -- still active, governorship unchanged
  end if;

  perform app.assert_governor_remaining(old.id);
  return null;
end;
$$;

alter policy users_read_self_or_governor on app.users
  using (id = auth.uid() or app.has_permission('manage_system_users'));

alter policy users_write_governor on app.users
  using (app.has_permission('manage_system_users'))
  with check (app.has_permission('manage_system_users'));

alter policy users_insert_governor on app.users
  with check (app.has_permission('manage_system_users'));

alter policy users_delete_governor on app.users
  using (app.has_permission('manage_system_users'));

alter policy user_permissions_read_self_or_governor on app.user_permissions
  using (user_id = auth.uid() or app.has_permission('manage_system_users'));

alter policy user_permissions_write_governor on app.user_permissions
  using (app.has_permission('manage_system_users'))
  with check (app.has_permission('manage_system_users'));

alter policy user_city_scope_read_self_or_governor on app.user_city_scope
  using (user_id = auth.uid() or app.has_permission('manage_system_users'));

alter policy user_city_scope_write_governor on app.user_city_scope
  using (app.has_permission('manage_system_users'))
  with check (app.has_permission('manage_system_users'));

-- The 49 keys in catalogue order. A temp table gives every statement below one
-- source of truth instead of four copies of the same literal list.
create temporary table l4_catalogue (
  key         text primary key,
  label       text not null,
  description text not null,
  group_key   text not null,
  sort_order  integer not null
) on commit drop;

insert into l4_catalogue (key, label, description, group_key, sort_order) values
  ('view_overview_contracts',   'نظرة عامة · العقود',           'عرض مؤشرات العقود في النظرة العامة.',                 'نظرة عامة',  1),
  ('view_overview_negotiation', 'نظرة عامة · التفاوض',          'عرض مؤشرات التفاوض والزيارات في النظرة العامة.',       'نظرة عامة',  2),
  ('view_overview_finance',     'نظرة عامة · المالية',          'عرض اللقطة المالية في النظرة العامة.',                 'نظرة عامة',  3),
  ('view_overview_catalog',     'نظرة عامة · الكتالوج',         'عرض مؤشرات الكتالوج في النظرة العامة.',                'نظرة عامة',  4),
  ('view_overview_compliance',  'نظرة عامة · الالتزام',         'عرض مؤشرات الالتزام والجودة في النظرة العامة.',        'نظرة عامة',  5),
  ('view_overview_marketing',   'نظرة عامة · التسويق',          'عرض مؤشرات التسويق في النظرة العامة.',                 'نظرة عامة',  6),
  ('manage_cities',             'إدارة المدن',                  'تعديل حدود المدينة ونطاقها التشغيلي وإسناد مديريها.',   'المدن',      7),
  ('view_active_cities',        'عرض المدن النشطة',             'فتح دورة حياة المدن النشطة وسجلاتها.',                 'المدن',      8),
  ('view_geo_operations',       'عرض العمليات الجغرافية',       'الاطلاع على تقديرات السكان والتجار ومؤشر المنافسة.',   'المدن',      9),
  ('add_city',                  'إضافة مدينة',                  'إنشاء مدينة جديدة عبر معالج ذكاء الأعمال الجغرافي.',    'المدن',     10),
  ('view_merchants',            'عرض التجار',                   'فتح دليل التجار.',                                     'التجار',    11),
  ('view_merchant_profile',     'عرض وتعديل ملف التاجر',        'الاطلاع على ملف التاجر وتحديث بياناته التجارية.',       'التجار',    12),
  ('add_merchant',              'إضافة تاجر',                   'إضافة سجلات تجار جديدة.',                              'التجار',    13),
  ('view_catalog',              'عرض الكتالوج',                 'فتح كتالوج المنتجات.',                                 'الكتالوج',  14),
  ('edit_catalog',              'تعديل الكتالوج',               'تعديل المنتجات وحذفها من الكتالوج.',                    'الكتالوج',  15),
  ('add_catalog',               'إضافة إلى الكتالوج',           'إضافة منتجات جديدة إلى الكتالوج.',                      'الكتالوج',  16),
  ('edit_product_images',       'تعديل صور المنتجات',           'تحسين صور المنتجات ورفع نسخ بديلة.',                    'مراجعة الصور', 17),
  ('review_image_quality',      'مراجعة جودة الصور',            'اعتماد صور المنتجات أو رفضها قبل النشر.',               'مراجعة الصور', 18),
  ('review_add_requests',       'مراجعة طلبات الإضافة',         'مراجعة طلبات إضافة تصنيفات جديدة واعتمادها.',           'التصنيفات', 19),
  ('manage_merchant_types',     'إدارة أنواع التجار',           'إضافة وتعديل أنواع التجار المرتبطة بمعرّفات لوحة المستهلك.', 'التصنيفات', 20),
  ('manage_categories',         'إدارة التصنيفات',              'إدارة التصنيف المركزي للكتالوج.',                       'التصنيفات', 21),
  ('manage_variables',          'إدارة المتغيرات',              'إدارة المتغيرات المرتبطة بالتصنيفات.',                  'التصنيفات', 22),
  ('view_global_kpi',           'عرض مؤشرات كل المناديب',       'فتح مؤشرات مناديب كل المدن مع التصفية.',                'مؤشرات المناديب', 23),
  ('view_rep_kpi',              'عرض مؤشرات المندوب',           'عرض مؤشرات المندوب الخاصة فقط.',                        'مؤشرات المناديب', 24),
  ('assign_tasks',              'إسناد المهام',                 'إنشاء المهام الميدانية وإسنادها للمناديب.',             'العمليات الميدانية', 25),
  ('view_all_teams_visits',     'عرض زيارات كل الفرق',          'الاطلاع على زيارات وتقارير كل الفرق الميدانية.',         'العمليات الميدانية', 26),
  ('start_end_visit',           'بدء وإنهاء الزيارات',          'بدء الزيارة الميدانية وإنهاؤها وتسجيل مدتها.',           'العمليات الميدانية', 27),
  ('write_report',              'كتابة التقارير',               'كتابة تقارير الزيارات وإرسالها للاعتماد.',              'العمليات الميدانية', 28),
  ('request_ownership_transfer','طلب نقل الملكية',              'طلب نقل ملكية تاجر بين الفرق.',                         'العمليات الميدانية', 29),
  ('approve_ownership_transfer','اعتماد نقل الملكية',            'اعتماد طلبات نقل ملكية التجار بين الفرق.',               'العمليات الميدانية', 30),
  ('approve_report_edits',      'اعتماد تعديلات التقارير',      'اعتماد طلبات تعديل التقارير المقفلة.',                   'العمليات الميدانية', 31),
  ('draft_contract',            'صياغة العقود',                 'صياغة عقود تجار جديدة.',                                'العقود',    32),
  ('edit_contract',             'تعديل العقود',                 'تحديث شروط العقود وبياناتها الوصفية.',                  'العقود',    33),
  ('sign_contract',             'توقيع العقود',                 'تطبيق التوقيع المعتمد على العقد.',                      'العقود',    34),
  ('cancel_contract',           'إلغاء العقود',                 'إلغاء سجلات العقود وأرشفتها.',                          'العقود',    35),
  ('view_bank_balances',        'عرض الأرصدة البنكية',          'الاطلاع على أرصدة الحسابات البنكية.',                   'الحسابات البنكية', 36),
  ('add_bank_account',          'إضافة حساب بنكي',              'إضافة حسابات بنكية جديدة.',                             'الحسابات البنكية', 37),
  ('view_bank_transactions',    'عرض حركات الحسابات',           'الاطلاع على حركات الودائع والمصروفات.',                  'الحسابات البنكية', 38),
  ('record_bank_transaction',   'تسجيل حركة بنكية',             'تسجيل الودائع والمصروفات على الحسابات البنكية.',          'الحسابات البنكية', 39),
  ('view_payroll_sheets',       'عرض مسير الرواتب',             'الاطلاع على مسير الرواتب لكل المناديب.',                'الرواتب',   40),
  ('view_employee_payslip',     'عرض قسيمة الموظف',             'عرض قسيمة راتب الموظف الخاصة.',                         'الرواتب',   41),
  ('view_campaigns',            'عرض الحملات',                  'الاطلاع على الحملات التسويقية ونتائجها.',                'التسويق',   42),
  ('create_campaign',           'إنشاء حملة',                   'إنشاء حملات تسويقية جديدة.',                            'التسويق',   43),
  ('record_campaign_results',   'تسجيل نتائج الحملات',          'تسجيل أرقام الوصول ونتائج الحملات.',                    'التسويق',   44),
  ('view_marketing_logs',       'عرض سجلات التسويق',            'الاطلاع على سجل عمليات التسويق.',                       'التسويق',   45),
  ('manage_platform_settings',  'إدارة إعدادات المنصات',        'تعديل إعدادات منصات الإعلان المربوطة.',                  'التسويق',   46),
  ('view_pricing_and_status',   'عرض الأسعار والحالات',         'استعراض التجار والمنتجات وأسعارها وحالاتها.',            'إدخال البيانات', 47),
  ('manage_commission_rates',   'إدارة أسعار العمولات',         'تعديل رسوم التفعيل والصور والتعاقد لكل مدينة.',          'أسعار العمولات', 48),
  ('manage_system_users',       'إدارة مستخدمين النظام',        'إنشاء المستخدمين وتعديل رتبهم وصلاحياتهم ونطاق مدنهم.',   'مستخدمين النظام', 49);

-- 1. Catalogue. Every grant below is FK-validated against this table, so the
--    keys must exist before a single row can be granted.
insert into app.permissions (key, label, description, group_key, sort_order)
select key, label, description, group_key, sort_order from l4_catalogue
on conflict (key) do update
   set label       = excluded.label,
       description = excluded.description,
       group_key   = excluded.group_key,
       sort_order  = excluded.sort_order;

-- 2. Outdated grants. Scoped to Level 4 and to keys the new catalogue dropped,
--    so a grant whose key still exists is never churned — and the governor
--    guard never observes `manage_system_users` disappearing.
delete from app.user_permissions up
 using app.users u
 where up.user_id = u.id
   and u.clearance_level = 4
   and not exists (select 1 from l4_catalogue c where c.key = up.permission_key);

-- 3. Grant the whole catalogue. `granted_by` stays NULL: nobody granted this,
--    the migration did.
insert into app.user_permissions (user_id, permission_key)
select u.id, c.key
  from app.users u
 cross join l4_catalogue c
 where u.clearance_level = 4
on conflict (user_id, permission_key) do nothing;

-- 4. Authorization changed, so every Level 4 session must refetch instead of
--    trusting the token minted from the legacy grant set.
update app.users
   set auth_revision = auth_revision + 1
 where clearance_level = 4;

-- 5. Refuse to commit a half-fixed deployment. Silent catalogue drift is what
--    locked the Founder out, so it fails loudly here instead of in production.
do $$
declare
  catalogue_size integer;
  broken         record;
begin
  select count(*) into catalogue_size from l4_catalogue;
  if catalogue_size <> 49 then
    raise exception 'L4 catalogue holds % keys, expected 49', catalogue_size;
  end if;

  select u.id, u.phone, count(up.permission_key) as held
    into broken
    from app.users u
    left join app.user_permissions up on up.user_id = u.id
   where u.clearance_level = 4
   group by u.id, u.phone
  having count(up.permission_key) <> 49
   limit 1;

  if found then
    raise exception 'Level 4 account % (%) holds % of 49 permissions',
      broken.id, broken.phone, broken.held;
  end if;

  -- Anti-lockout: if the deployment has operators at all, one of them must be
  -- able to administer the catalogue. Same rule `assertActiveGovernor()`
  -- enforces in the application, checked here so a migration cannot ship a
  -- deployment where nobody can mint or repair an account.
  if exists (select 1 from app.users) and not exists (
    select 1
      from app.users u
      join app.user_permissions up on up.user_id = u.id
     where u.active
       and up.permission_key = 'manage_system_users'
  ) then
    raise exception
      'RBAC_INVARIANT: no active operator holds manage_system_users after the L4 backfill';
  end if;
end;
$$;

commit;
