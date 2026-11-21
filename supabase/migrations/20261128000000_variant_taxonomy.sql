begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Variant taxonomy for the V1 dashboard CSV sync.
 *
 * `variant_attributes` is the group (for example الحجم / Size) and
 * `variant_options` is one option inside it (صغير / Small). The dashboard's
 * numeric ids are the contract used by catalog products, so they are stored as
 * integers instead of derived uuids: option ids are globally unique in the V1
 * export and product attributes reference the pair directly.
 *
 * The sync is additive and idempotent. A standalone variant-attributes.csv is
 * valid even when vendor-types.csv and categories.csv are not uploaded, because
 * variants are global and do not depend on either parent.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.variant_attributes (
  id integer primary key,
  name_ar text not null,
  name_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.variant_options (
  id integer primary key,
  variant_id integer not null references app.variant_attributes(id) on delete cascade,
  name_ar text not null,
  name_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists variant_options_variant_id_idx
  on app.variant_options (variant_id);

grant select, insert, update on app.variant_attributes to service_role;
grant select, insert, update on app.variant_options to service_role;

comment on table app.variant_attributes is
  'Variant groups synced from the V1 dashboard (numeric id is the dashboard contract).';
comment on table app.variant_options is
  'Variant options synced from the V1 dashboard; option ids are globally unique.';

commit;
