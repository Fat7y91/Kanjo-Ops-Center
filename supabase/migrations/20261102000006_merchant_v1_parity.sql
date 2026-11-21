begin;

/* ─────────────────────────────────────────────────────────────────────────
 * V1 parity — merchant working fields.
 *
 * V1's merchant sheet carried four things the V2 card never modelled:
 *
 *   - a street address and the merchant's social/web links;
 *   - an "published to the app" switch, independent of the contract state;
 *   - a VIP / preliminary menu flag, so a merchant can be listed before the
 *     commission contract is signed;
 *   - a link to the official Google Drive folder plus an Excel export.
 *
 * Each of those is its own capability, granted to L3+ on top of the existing
 * merchant grants. The API enforces the per-field split; the policy here only
 * opens the table to an operator holding at least one of the four.
 *
 * Re-runnable: `create table if not exists`, guarded `add column if not
 * exists`, `on conflict` upserts and dropped-then-created policies.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('edit_merchant_socials', 'تعديل عنوان وروابط التاجر', 'تحديث العنوان الفعلي وروابط فيسبوك وإنستغرام والموقع.', 'التجار', 53),
  ('toggle_app_publish', 'نشر التاجر في التطبيق', 'التحكم في ظهور التاجر ومنتجاته داخل تطبيق كانجو.', 'التجار', 54),
  ('manage_vip_menu', 'إدارة قائمة VIP', 'إدراج التاجر تحت التعاقد أو عرض مبدئي دون اتفاق نهائي.', 'التجار', 55),
  ('export_merchant_data', 'تصدير بيانات التاجر', 'فتح ملفات التاجر الرسمية وتصدير بياناته إلى Excel.', 'التجار', 56)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* Backfill: executives (clearance >= 3) already hold every merchant
 * capability. Re-granting an existing key is a no-op. */
insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
  cross join app.permissions p
 where u.active
   and u.clearance_level >= 3
   and p.key in (
     'edit_merchant_socials',
     'toggle_app_publish',
     'manage_vip_menu',
     'export_merchant_data'
   )
on conflict (user_id, permission_key) do nothing;

create table if not exists app.merchant_v1_profiles (
  merchant_id      text        primary key,
  actual_address   text        not null default '',
  facebook_url     text        not null default '',
  instagram_url    text        not null default '',
  drive_folder_url text        not null default '',
  app_published    boolean     not null default false,
  vip_menu         boolean     not null default false,
  updated_by       uuid        references app.users (id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table app.merchant_v1_profiles
  add column if not exists actual_address   text        not null default '',
  add column if not exists facebook_url     text        not null default '',
  add column if not exists instagram_url    text        not null default '',
  add column if not exists drive_folder_url text        not null default '',
  add column if not exists app_published    boolean     not null default false,
  add column if not exists vip_menu         boolean     not null default false,
  add column if not exists updated_by       uuid references app.users (id) on delete set null,
  add column if not exists updated_at       timestamptz not null default now();

comment on table app.merchant_v1_profiles is
  'V1 merchant working fields that are not part of the contract record: address, socials, app publish state, VIP listing and the official Drive folder.';
comment on column app.merchant_v1_profiles.vip_menu is
  'Allows a menu listing without a final commission contract (VIP / preliminary offer).';
comment on column app.merchant_v1_profiles.app_published is
  'Independent of contract_state: publish state is a product decision, not a legal one.';

alter table app.merchant_v1_profiles enable row level security;
alter table app.merchant_v1_profiles force  row level security;

drop policy if exists merchant_v1_profiles_read_capable on app.merchant_v1_profiles;
create policy merchant_v1_profiles_read_capable on app.merchant_v1_profiles
  for select to authenticated
  using (
    app.is_active_user() and (
      app.has_permission('view_merchants') or
      app.has_permission('view_all_teams_visits')
    )
  );

drop policy if exists merchant_v1_profiles_write_capable on app.merchant_v1_profiles;
create policy merchant_v1_profiles_write_capable on app.merchant_v1_profiles
  for all to authenticated
  using (
    app.is_active_user() and (
      app.has_permission('edit_merchant_socials') or
      app.has_permission('toggle_app_publish') or
      app.has_permission('manage_vip_menu') or
      app.has_permission('export_merchant_data')
    )
  )
  with check (
    app.is_active_user() and (
      app.has_permission('edit_merchant_socials') or
      app.has_permission('toggle_app_publish') or
      app.has_permission('manage_vip_menu') or
      app.has_permission('export_merchant_data')
    )
  );

grant select, insert, update on app.merchant_v1_profiles to authenticated;
grant select, insert, update, delete on app.merchant_v1_profiles to service_role;

/* Any authorization change must bump the session revision, otherwise an open
 * session keeps the stale grant set until it expires. */
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3;

commit;
