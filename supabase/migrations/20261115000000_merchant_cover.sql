begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Merchant cover image + the storage bucket that holds merchant assets.
 *
 * `logo_url` already exists as the merchant identity mark. `cover_url` is the
 * wide banner behind it on the catalog tile: two different crops of the same
 * brand, so they are two columns, not one. `null` is the honest state for
 * "no cover uploaded" and the tile falls back to a brand gradient.
 *
 * The `merchant-assets` bucket keeps operator uploads out of `avatars`, which
 * is keyed by user id. Paths are `<merchant id>/<asset>-<uuid>.<ext>` so a
 * merchant's files sort together and replacing an image never collides.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.merchants
  add column if not exists cover_url text;

comment on column app.merchants.cover_url is
  'Merchant cover/banner image URL. Null means no cover uploaded; the catalog tile renders a brand gradient.';

/* Sparse like logo_url: the index only covers rows that actually have a cover. */
create index if not exists merchants_with_cover_idx
  on app.merchants (id)
  where cover_url is not null;

/* Supabase-only: a stock PostgreSQL has no `storage` schema, so guard it. */
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('merchant-assets', 'merchant-assets', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public             = excluded.public,
          file_size_limit    = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

commit;
