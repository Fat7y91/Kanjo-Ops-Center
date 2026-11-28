-- Vendor types for the V1 dashboard CSV sync.
--
-- `categories.csv` refers to its vendor scope by id, key or display name. The
-- uploader upserts this table from `vendor-types.csv` and resolves category
-- references against both this table and the uploaded rows. The table starts
-- empty on purpose: existing category scopes still resolve from the generated
-- V2 seed until the operator uploads the V1 file.

create table if not exists app.vendor_types (
  id integer primary key,
  key text not null unique,
  name_ar text not null,
  name_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on app.vendor_types to service_role;

comment on table app.vendor_types is
  'Vendor types synced from the V1 dashboard vendor-types.csv (numeric id is the dashboard contract).';
