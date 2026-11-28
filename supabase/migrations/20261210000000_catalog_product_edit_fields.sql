-- Product editing parity: unit, stock and compare-at price.
--
-- These are product-level merchandising fields. Variant-level price, SKU,
-- barcode and availability stay inside `attributes` JSON so an edit replaces the
-- variant set atomically in the same row update.

alter table app.catalog_products
  add column if not exists unit text not null default '',
  add column if not exists stock_quantity integer,
  add column if not exists compare_at_price_minor bigint;

comment on column app.catalog_products.unit is
  'Sale unit label shown to the merchant, e.g. كيلو / علبة.';
comment on column app.catalog_products.stock_quantity is
  'Optional on-hand quantity. Null means stock is not tracked.';
comment on column app.catalog_products.compare_at_price_minor is
  'Optional original price in minor units, for sale strikethrough.';
