-- ─────────────────────────────────────────────────────────────────────────────
-- Kanjo V2 — capability-catalogue repair
--
-- Symptom this repairs
--   The operator dialog saves the rest of a patch but reports, in Arabic,
--   "لم تُمنح: <label>" for one or more capabilities — for example
--   "لم تُمنح: عرض الإشعارات". That message is produced by
--   `updateUserProfile()` in `src/lib/rbac/profile-writes.ts`: the key exists in
--   the TypeScript catalogue but not yet in `app.permissions`, so the grant is
--   skipped instead of aborting the whole statement on the `23503` foreign key.
--
--   It is a deployment-ordering fact, not a permission decision. The grant rule
--   is rank-based (`mayGrantPermissions()` in `src/lib/rbac/hierarchy.ts`), so an
--   L4 granting the key is never the blocker; the catalogue row simply is not
--   there.
--
-- Scope
--   The six capabilities introduced by
--   `supabase/migrations/20261112000000_legacy_gap_resolutions.sql`:
--     view_audit_logs, view_notifications, view_archived_reports,
--     manage_archived_reports, view_marketing_leads, manage_marketing_leads
--
--   This is that migration's capability section, extracted so it can be applied
--   to a database that is already past the migration's run date. It lives
--   outside `supabase/migrations/` on purpose: the chain itself is complete, and
--   a second copy inside it would make `supabase db push` replay statements the
--   ledger already records as applied.
--
-- Properties
--   Idempotent (`do nothing` / `do update`), safe to re-run, wrapped in one
--   transaction, and it refuses to commit a half-applied catalogue.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. What is actually missing. Read-only; this first result set is the diagnosis,
--    and an empty result means the table is already complete.
select k.key as missing_key
  from (
    values ('view_audit_logs'), ('view_notifications'),
           ('view_archived_reports'), ('manage_archived_reports'),
           ('view_marketing_leads'), ('manage_marketing_leads')
  ) as k(key)
 where not exists (
   select 1 from app.permissions p where p.key = k.key
 );

-- 2. Seed the catalogue. Labels, descriptions, groups and sort orders are copied
--    verbatim from the migration so the table converges on the intended state.
--    `sort_order` continues at 98; the wire-format bit index lives in
--    `src/lib/rbac/data/permissions.ts` and is never derived from this column.
insert into app.permissions (key, label, description, group_key, sort_order) values
  ('view_audit_logs', 'عرض سجل التدقيق', 'الاطلاع على سجل التغييرات (الصندوق الأسود) لمن ولماذا عدّل أي سجل.', 'الحوكمة', 98),
  ('view_notifications', 'عرض الإشعارات', 'فتح صندوق إشعارات المشغّل وقراءة التنبيهات الموجهة إليه.', 'مساحة العمل', 99),
  ('view_archived_reports', 'عرض التقارير المؤرشفة', 'الاطلاع على تقارير الزيارات التي أُزيلت من مسار المهمة مع سبب الأرشفة.', 'العمليات الميدانية', 100),
  ('manage_archived_reports', 'إدارة التقارير المؤرشفة', 'أرشفة تقرير زيارة أو استعادته إلى مسار المهمة.', 'العمليات الميدانية', 101),
  ('view_marketing_leads', 'عرض عملاء الحملات', 'الاطلاع على العملاء المحتملين الواردين من الحملات وصفحة الانضمام.', 'التسويق', 102),
  ('manage_marketing_leads', 'إدارة عملاء الحملات', 'تحديث حالة العميل المحتمل وربطه بحملة وتسجيل الملاحظات.', 'التسويق', 103)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

-- 3. Backfill the grants the migration intended: the notification inbox is a
--    workspace surface (every active operator), the other five are governance,
--    operations and marketing surfaces (level 3 and above). Re-granting an
--    existing key is a no-op.
insert into app.user_permissions (user_id, permission_key)
select u.id, 'view_notifications'
  from app.users u
 where u.active
on conflict (user_id, permission_key) do nothing;

insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
  cross join (
    values ('view_audit_logs'), ('view_archived_reports'),
           ('manage_archived_reports'), ('view_marketing_leads'),
           ('manage_marketing_leads')
  ) as p(key)
 where u.active
   and u.clearance_level >= 3
on conflict (user_id, permission_key) do nothing;

-- 4. Advance every session so the new grants reach the client without a manual
--    sign-out. `app.session_revision()` floors to whole seconds, so bumping the
--    stored revision is what makes the change observable immediately.
update app.users
   set auth_revision = auth_revision + 1
 where active;

-- 5. Refuse to commit a half-applied catalogue: a policy that gates on a key the
--    table does not hold would silently lock a whole screen for everybody.
do $$
declare
  missing text;
begin
  select string_agg(required.key, ', ')
    into missing
    from (
      values ('view_audit_logs'), ('view_notifications'),
             ('view_archived_reports'), ('manage_archived_reports'),
             ('view_marketing_leads'), ('manage_marketing_leads')
    ) as required(key)
   where not exists (
     select 1 from app.permissions p where p.key = required.key
   );

  if missing is not null then
    raise exception 'RBAC_SEED_DRIFT: missing capability keys: %', missing
      using errcode = '23514';
  end if;
end;
$$;

commit;

-- 6. Verification: who now holds what. The inbox row should be true for every
--    active operator; the other five for level 3 and above. A row that is still
--    false for an expected holder is fixed by re-saving that operator in the
--    roster, or directly:
--
--      insert into app.user_permissions (user_id, permission_key)
--      values ('<operator-uuid>', 'view_notifications')
--      on conflict (user_id, permission_key) do nothing;
--
--      update app.users set auth_revision = auth_revision + 1
--       where id = '<operator-uuid>';
select u.id,
       u.full_name,
       u.clearance_level,
       v.key as permission_key,
       exists (
         select 1
           from app.user_permissions up
          where up.user_id = u.id
            and up.permission_key = v.key
       ) as holds_permission
  from app.users u
  cross join (
    values ('view_notifications'), ('view_audit_logs'),
           ('view_archived_reports'), ('manage_archived_reports'),
           ('view_marketing_leads'), ('manage_marketing_leads')
  ) as v(key)
 where u.active
   and (v.key = 'view_notifications' or u.clearance_level >= 3)
 order by u.clearance_level desc, u.full_name, v.key;
