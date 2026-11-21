begin;

-- The V1 export double-escaped newlines in 14 names, so the previous cleanup
-- left a trailing backslash. Drop any remaining backslashes and re-collapse
-- whitespace for the affected rows.
update app.master_catalog_products
set
  name = btrim(regexp_replace(replace(name, chr(92), ''), '[[:space:]]+', ' ', 'g')),
  normalized_name = btrim(regexp_replace(replace(normalized_name, chr(92), ''), '[[:space:]]+', ' ', 'g'))
where strpos(name, chr(92)) > 0
   or strpos(normalized_name, chr(92)) > 0;

commit;
