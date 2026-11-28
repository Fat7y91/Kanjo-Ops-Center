begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Merchants and catalog products become the single source of truth.
 *
 * Before this migration the two tables existed but nothing ever wrote to them:
 * `/merchants`, `/catalog` and the search endpoint served a process-local seed
 * instead. That made every isolate disagree about the network, lost a merchant
 * on redeploy, and produced a different answer from payroll and KPI, which
 * already read SQL.
 *
 * This migration closes the gap:
 *
 *   1. `app.merchants` gains the CRM fields the V2 card renders — documents,
 *      contact, opinions — plus the earned commission amount. They are `jsonb`
 *      columns rather than child tables: a merchant is always read as one row,
 *      and the arrays are replaced wholesale, never queried individually.
 *   2. `app.catalog_products` gains every column the domain model carries
 *      (vendor type, category, product type, variants, review note, authorship,
 *      offline client id) so a catalog row can be reconstructed losslessly.
 *   3. `state` is normalised to the three states the product actually models.
 *      The old `'draft'` default was never produced by the application.
 *   4. Uniqueness is enforced in the database, not only in JavaScript: a
 *      concurrent pair of requests can no longer create two merchants with the
 *      same normalised name or two products with the same SKU/barcode.
 *
 * Re-runnable: guarded `add column if not exists`, `do` blocks for value
 * normalisation and dropped-then-created constraints/indexes.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Merchant CRM and earnings columns ──────────────────────────────── */

alter table app.merchants
  add column if not exists commission_amount   numeric(14, 2) not null default 0,
  add column if not exists documents           jsonb          not null default '[]'::jsonb,
  add column if not exists contact             jsonb,
  add column if not exists opinions            jsonb          not null default '[]'::jsonb,
  add column if not exists contact_updated_at  timestamptz;

comment on column app.merchants.commission_amount is
  'Commission earned at signature, in currency units. Frozen until the contract changes.';
comment on column app.merchants.documents is
  'Ordered JSON array of MerchantDocument. Replaced wholesale; never queried per element.';
comment on column app.merchants.contact is
  'Latest CRM contact block (name, role, mobile) or null when no visit captured one.';
comment on column app.merchants.opinions is
  'Weighted rep opinions merged across visits. Kept on the row so the card needs one read.';

alter table app.merchants
  drop constraint if exists merchants_commission_amount_non_negative,
  add constraint merchants_commission_amount_non_negative
    check (commission_amount >= 0);

/* The directory and the create guard both look merchants up by their
 * normalised name. The unique index makes that guard hold under concurrency. */
create unique index if not exists merchants_normalized_name_key
  on app.merchants (normalized_name)
  where length(btrim(normalized_name)) > 0;

/* ── 2. Catalog columns ────────────────────────────────────────────────── */

alter table app.catalog_products
  add column if not exists vendor_type_id  integer,
  add column if not exists category_key    text,
  add column if not exists product_type    text    not null default 'simple',
  add column if not exists attributes      jsonb   not null default '[]'::jsonb,
  add column if not exists review_note     text    not null default '',
  add column if not exists entered_by_name text,
  add column if not exists client_product_id text,
  add column if not exists normalized_name text    not null default '';

comment on column app.catalog_products.category_key is
  'Taxonomy category key. Mandatory in the domain; nullable here for legacy rows.';
comment on column app.catalog_products.attributes is
  'JSON array of {variantId, optionIds} selections. Kept with the product, not normalised.';
comment on column app.catalog_products.client_product_id is
  'Offline draft id. Unique when present so a replay cannot create a duplicate row.';

alter table app.catalog_products
  drop constraint if exists catalog_products_product_type_check,
  add constraint catalog_products_product_type_check
    check (product_type in ('simple', 'variable'));

/* `draft` was never a modelled state: the application only ever writes the
 * three below. Normalise legacy rows once, then lock the domain. */
update app.catalog_products
   set state = 'pending_review'
 where state not in ('pending_review', 'completed', 'published');

alter table app.catalog_products
  alter column state set default 'pending_review';

alter table app.catalog_products
  drop constraint if exists catalog_products_state_check,
  add constraint catalog_products_state_check
    check (state in ('pending_review', 'completed', 'published'));

create unique index if not exists catalog_products_client_id_key
  on app.catalog_products (client_product_id)
  where client_product_id is not null;

create unique index if not exists catalog_products_merchant_name_key
  on app.catalog_products (merchant_id, normalized_name)
  where length(btrim(normalized_name)) > 0;

create unique index if not exists catalog_products_sku_key
  on app.catalog_products (sku)
  where sku is not null and length(btrim(sku)) > 0;

create unique index if not exists catalog_products_barcode_key
  on app.catalog_products (barcode)
  where barcode is not null and length(btrim(barcode)) > 0;

/* ── 3. Read path ────────────────────────────────────────────────────────
 * The directory lists merchants alphabetically; the catalog lists products per
 * merchant. Both are the first read of their screen, so they get their own
 * supporting indexes.
 * ───────────────────────────────────────────────────────────────────────── */

create index if not exists merchants_name_idx on app.merchants (name);
create index if not exists catalog_products_state_idx
  on app.catalog_products (state);
create index if not exists catalog_products_merchant_name_idx
  on app.catalog_products (merchant_id, name);

commit;
