begin;

-- A small set of V1 rows reached the export with a literal backslash-n suffix
-- or doubled spaces. Normalize the display and search names in place; prices,
-- images and category mappings stay untouched.
with cleaned as (
  select
    id,
    btrim(regexp_replace(replace(name, chr(92) || 'n', ' '), '[[:space:]]+', ' ', 'g')) as clean_name,
    btrim(regexp_replace(replace(normalized_name, chr(92) || 'n', ' '), '[[:space:]]+', ' ', 'g')) as clean_normalized
  from app.master_catalog_products
)
update app.master_catalog_products p
set
  name = c.clean_name,
  normalized_name = c.clean_normalized
from cleaned c
where p.id = c.id
  and (
    p.name is distinct from c.clean_name
    or p.normalized_name is distinct from c.clean_normalized
  );

commit;
