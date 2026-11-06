begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Merchant logo becomes a first-class merchant attribute.
 *
 * V1 stored `logoUrl` on the merchant document (Firebase Storage, public
 * object URLs). V2 never had the column, so 99 of the migrated merchants lost
 * their logo and every surface fell back to text-only or a product image.
 *
 * This adds one nullable text column. `null` is the honest state for "this
 * merchant never uploaded a logo"; the UI renders a brand monogram instead of
 * inventing an image.
 *
 * Re-runnable: guarded `add column if not exists` plus `create index if not
 * exists` (a partial index, since the great majority of rows may stay null).
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.merchants
  add column if not exists logo_url text;

comment on column app.merchants.logo_url is
  'Merchant logo image URL (V1 Firebase Storage object or Drive link). Null means the merchant has no logo; the UI falls back to a brand monogram.';

/* Only rows that actually have a logo are indexed: the column is sparse and
 * every read is "logo present?", never a lookup by URL. */
create index if not exists merchants_with_logo_idx
  on app.merchants (id)
  where logo_url is not null;

commit;
