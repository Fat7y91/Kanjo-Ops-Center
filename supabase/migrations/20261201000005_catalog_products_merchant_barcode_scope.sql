-- Autopilot matches merchant POS rows by barcode.
--
-- The V1-era unique index treated barcode as a network-wide identity, so two
-- merchants could not both carry the same manufacturer barcode. Merchant stock
-- lists are independent: scope the uniqueness to (merchant_id, barcode) so the
-- importer can upsert per store without colliding across stores.

begin;

drop index if exists app.catalog_products_barcode_key;
create unique index if not exists catalog_products_merchant_barcode_key
  on app.catalog_products (merchant_id, barcode)
  where barcode is not null and length(btrim(barcode)) > 0;

commit;
