-- Make the taxonomy read model reflect the V1 dashboard sync.
--
-- The seed migration inserted the generated V2 catalogue with the seed vendor
-- ids. A V1 upload can renumber vendor types (for example `الحلو` arrives as
-- 15, while the seed reserved 5), so the same category name can exist under two
-- deterministic uuids. Rows written by the V1 sync are tagged `source = 'v1'`
-- with their dashboard vendor/numeric ids; the governance screen reads only that
-- layer. The legacy seed rows stay in place as an audit trail.

begin;

alter table app.taxonomy_categories
  add column if not exists vendor_type_id integer,
  add column if not exists numeric_id integer,
  add column if not exists source text not null default 'seed';

-- The uuid itself is md5("kanjo-taxonomy-v1:<vendor_type_id>:<numeric id>").
-- Recreate that pair for every persisted vendor type and numeric id so the rows
-- written before the columns existed can be tagged. Existing numeric ids are
-- below 1,000; the range leaves room for a normal upload without a full scan.
with candidates as (
  select
    vendor.id as vendor_id,
    vendor.name_ar,
    numeric_id,
    (
      substr(md5('kanjo-taxonomy-v1:' || vendor.id || ':' || numeric_id), 1, 8)
      || '-'
      || substr(md5('kanjo-taxonomy-v1:' || vendor.id || ':' || numeric_id), 9, 4)
      || '-'
      || substr(md5('kanjo-taxonomy-v1:' || vendor.id || ':' || numeric_id), 13, 4)
      || '-'
      || substr(md5('kanjo-taxonomy-v1:' || vendor.id || ':' || numeric_id), 17, 4)
      || '-'
      || substr(md5('kanjo-taxonomy-v1:' || vendor.id || ':' || numeric_id), 21, 12)
    )::uuid as category_id
  from app.vendor_types as vendor
  cross join generate_series(1, 2000) as numeric_id
)
update app.taxonomy_categories as category
set
  vendor_type_id = candidate.vendor_id,
  numeric_id = candidate.numeric_id,
  source = 'v1'
from candidates as candidate
where category.id = candidate.category_id
  and category.vendor_type = candidate.name_ar;

create index if not exists taxonomy_categories_vendor_numeric_idx
  on app.taxonomy_categories (vendor_type_id, numeric_id)
  where source = 'v1';

create unique index if not exists taxonomy_categories_v1_scope_idx
  on app.taxonomy_categories (vendor_type_id, numeric_id)
  where source = 'v1';

create table if not exists app.taxonomy_state (
  id integer primary key check (id = 1),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

insert into app.taxonomy_state (id, revision)
values (1, 1)
on conflict (id) do nothing;

grant select, insert, update on app.taxonomy_state to service_role;

comment on column app.taxonomy_categories.source is
  'seed = generated V2 reference row; v1 = snapshot written by the dashboard CSV sync.';
comment on column app.taxonomy_categories.vendor_type_id is
  'Dashboard vendor-type id from vendor-types.csv; null for legacy seed rows.';
comment on column app.taxonomy_categories.numeric_id is
  'Dashboard category id scoped to vendor_type_id; null for legacy seed rows.';
comment on table app.taxonomy_state is
  'Singleton revision counter bumped after a successful taxonomy sync.';

commit;
