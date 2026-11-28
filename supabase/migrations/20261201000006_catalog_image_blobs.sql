begin;

-- Product photos captured in the field used to be stored inline as
-- `data:image/...;base64,...` in `app.catalog_products.image_data_url`. That
-- bloats the catalog payload and the Excel export, and produces empty image
-- links. Blobs now live in a dedicated table and rows keep only a public URL.
create table if not exists app.catalog_image_blobs (
  id text primary key,
  merchant_id text,
  content_type text not null default 'image/jpeg',
  data_url text not null,
  byte_size integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table app.catalog_image_blobs is
  'Content-addressed product photos served by /api/catalog/images/[id].';

alter table app.catalog_image_blobs enable row level security;
grant select, insert, update, delete on app.catalog_image_blobs to service_role;

-- Move every legacy inline image into the blob table, keyed by the product id
-- so the backfill is deterministic and idempotent.
insert into app.catalog_image_blobs
  (id, merchant_id, content_type, data_url, byte_size)
select p.id,
       p.merchant_id,
       coalesce(
         nullif(substring(p.image_data_url from '^data:([^;,]+)'), ''),
         'image/jpeg'
       ),
       p.image_data_url,
       greatest(
         0,
         (
           (length(p.image_data_url) - coalesce(position(',' in p.image_data_url), 0))
           * 3
         ) / 4
       )
from app.catalog_products p
where p.image_data_url like 'data:%'
on conflict (id) do update
  set merchant_id = excluded.merchant_id,
      content_type = excluded.content_type,
      data_url = excluded.data_url,
      byte_size = excluded.byte_size;

-- Replace each inline value with the public URL that now serves those bytes.
update app.catalog_products p
set image_data_url =
  'https://kanjo-ops-center.pages.dev/api/catalog/images/' || p.id
where p.image_data_url like 'data:%';

-- Invariant: no product row may ever hold inline image bytes again. The
-- repository converts captures before writing, so this only catches regressions.
alter table app.catalog_products
  add constraint catalog_products_image_not_inline
  check (image_data_url is null or image_data_url not ilike 'data:%');

commit;
