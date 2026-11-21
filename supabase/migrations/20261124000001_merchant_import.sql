begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Merchants CSV import.
 *
 * The PO export carries five essential columns: name, phone, vendor type,
 * commission rate and address. Phone and address were only ever stored inside
 * the free-form `contact` block, which the directory does not read, so give
 * them first-class columns before the importer starts writing them.
 *
 * `import_merchants` is a distinct capability from `add_merchant`: a bulk write
 * carries more risk than one manually reviewed record.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.merchants
  add column if not exists phone   text not null default '',
  add column if not exists address text not null default '';

comment on column app.merchants.phone is
  'Contact phone captured from the merchant import or profile.';
comment on column app.merchants.address is
  'Street address captured from the merchant import or profile.';

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('import_merchants', 'استيراد التجار', 'رفع ملف تجار وإضافتهم دفعة واحدة من دليل التجار.', 'التجار', 12)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

insert into app.user_permissions (user_id, permission_key)
select u.id, 'import_merchants'
  from app.users u
 where u.active
   and u.clearance_level >= 3
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3;

commit;
