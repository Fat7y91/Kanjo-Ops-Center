begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Delivery riders and custody receipts.
 *
 * Codes are deterministic: a rider's numeric code is
 * `<governorate numeric><city numeric><sequence padded to 4>` and the custody
 * number is `<governorate alpha>-<city alpha>-<sequence padded to 4>`.
 * The reference table keeps those codes data-driven so new governorates and
 * cities can be added without a migration.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.governorate_city_codes (
  id                uuid primary key default gen_random_uuid(),
  governorate_name  text not null,
  city_name         text not null default '',
  level             text not null check (level in ('governorate', 'city')),
  alpha_code        text not null check (alpha_code ~ '^[A-Z]{2,4}$'),
  numeric_code      text not null check (numeric_code ~ '^[0-9]{2,4}$'),
  starting_sequence integer not null default 1 check (starting_sequence >= 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (governorate_name, city_name),
  check (
    (level = 'governorate' and city_name = '') or
    (level = 'city' and city_name <> '')
  )
);

comment on table app.governorate_city_codes is
  'Alpha and numeric governorate/city codes used to build rider, custody and item serials.';
comment on column app.governorate_city_codes.starting_sequence is
  'First suggested sequence for a city. Desouk starts at 5 because riders 1-4 were issued on paper.';

create index if not exists governorate_city_codes_level_idx
  on app.governorate_city_codes (level, governorate_name, city_name);

drop trigger if exists governorate_city_codes_touch on app.governorate_city_codes;
create trigger governorate_city_codes_touch
  before update on app.governorate_city_codes
  for each row execute function app.touch_updated_at();

insert into app.governorate_city_codes (
  governorate_name, city_name, level, alpha_code, numeric_code, starting_sequence
) values
  ('كفر الشيخ', '',     'governorate', 'KFS', '10', 1),
  ('كفر الشيخ', 'دسوق', 'city',        'DQ',  '01', 5)
on conflict (governorate_name, city_name) do update
  set level             = excluded.level,
      alpha_code        = excluded.alpha_code,
      numeric_code      = excluded.numeric_code,
      starting_sequence = excluded.starting_sequence,
      updated_at        = now();

create table if not exists app.delivery_riders (
  id               uuid primary key default gen_random_uuid(),
  rider_code       text not null unique,
  governorate_code text not null,
  city_code        text not null,
  sequence_number  integer not null check (sequence_number > 0),
  full_name        text not null,
  national_id      text not null unique check (national_id ~ '^[0-9]{14}$'),
  phone            text not null,
  work_area        text not null default '',
  status           text not null default 'active'
                     check (status in ('active', 'suspended', 'offboarded')),
  created_by       uuid references app.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (governorate_code, city_code, sequence_number)
);

comment on table app.delivery_riders is
  'Delivery riders registered through the custody receipt flow. Rider codes are deterministic.';
comment on column app.delivery_riders.governorate_code is
  'Governorate alpha code (for example KFS); the numeric prefix lives in governorate_city_codes.';

create index if not exists delivery_riders_location_idx
  on app.delivery_riders (governorate_code, city_code, sequence_number);
create index if not exists delivery_riders_status_idx
  on app.delivery_riders (status, created_at desc);

drop trigger if exists delivery_riders_touch on app.delivery_riders;
create trigger delivery_riders_touch
  before update on app.delivery_riders
  for each row execute function app.touch_updated_at();

create table if not exists app.rider_custody_receipts (
  id                  uuid primary key default gen_random_uuid(),
  rider_id            uuid not null references app.delivery_riders(id) on delete restrict,
  custody_number      text not null unique,
  delivery_date       date not null,
  handover_officer    text not null default 'م/ محمود الجمل',
  items               jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(items) = 'array'),
  cash_custody        numeric(12, 2) not null default 2000 check (cash_custody >= 0),
  total_amount        numeric(12, 2) not null check (total_amount >= 0),
  total_amount_words  text not null,
  status              text not null default 'active'
                        check (status in ('active', 'returned', 'replaced')),
  notes               text not null default '',
  created_by          uuid references app.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table app.rider_custody_receipts is
  'Issued custody receipts. The items JSON keeps the printed line snapshot.';

create index if not exists rider_custody_receipts_rider_idx
  on app.rider_custody_receipts (rider_id, delivery_date desc);
create index if not exists rider_custody_receipts_status_idx
  on app.rider_custody_receipts (status, created_at desc);
create unique index if not exists rider_custody_receipts_one_active
  on app.rider_custody_receipts (rider_id)
  where status = 'active';

drop trigger if exists rider_custody_receipts_touch on app.rider_custody_receipts;
create trigger rider_custody_receipts_touch
  before update on app.rider_custody_receipts
  for each row execute function app.touch_updated_at();

/* ── Access ─────────────────────────────────────────────────────────────── */

alter table app.governorate_city_codes  enable row level security;
alter table app.delivery_riders         enable row level security;
alter table app.rider_custody_receipts  enable row level security;

alter table app.governorate_city_codes  force row level security;
alter table app.delivery_riders         force row level security;
alter table app.rider_custody_receipts  force row level security;

drop policy if exists governorate_city_codes_read on app.governorate_city_codes;
create policy governorate_city_codes_read on app.governorate_city_codes
  for select to authenticated
  using (app.is_active_user());

drop policy if exists governorate_city_codes_write on app.governorate_city_codes;
create policy governorate_city_codes_write on app.governorate_city_codes
  for all to authenticated
  using (app.has_permission('manage_couriers'))
  with check (app.has_permission('manage_couriers'));

drop policy if exists delivery_riders_read on app.delivery_riders;
create policy delivery_riders_read on app.delivery_riders
  for select to authenticated
  using (
    app.has_permission('view_couriers') or
    app.has_permission('manage_couriers')
  );

drop policy if exists delivery_riders_write on app.delivery_riders;
create policy delivery_riders_write on app.delivery_riders
  for all to authenticated
  using (app.has_permission('manage_couriers'))
  with check (app.has_permission('manage_couriers'));

drop policy if exists rider_custody_receipts_read on app.rider_custody_receipts;
create policy rider_custody_receipts_read on app.rider_custody_receipts
  for select to authenticated
  using (
    app.has_permission('view_couriers') or
    app.has_permission('manage_couriers')
  );

drop policy if exists rider_custody_receipts_write on app.rider_custody_receipts;
create policy rider_custody_receipts_write on app.rider_custody_receipts
  for all to authenticated
  using (app.has_permission('manage_couriers'))
  with check (app.has_permission('manage_couriers'));

grant usage on schema app to authenticated, service_role;

grant select, insert, update, delete
  on app.governorate_city_codes to authenticated;
grant select, insert, update
  on app.delivery_riders to authenticated;
grant select, insert, update
  on app.rider_custody_receipts to authenticated;

grant all on app.governorate_city_codes to service_role;
grant all on app.delivery_riders to service_role;
grant all on app.rider_custody_receipts to service_role;

/* ── Atomic rider + receipt creation ────────────────────────────────────── */

create or replace function app.issue_rider_custody(
  p_governorate         text,
  p_city                text,
  p_sequence            integer,
  p_full_name           text,
  p_national_id         text,
  p_phone               text,
  p_work_area           text,
  p_delivery_date       date,
  p_handover_officer    text,
  p_items               jsonb,
  p_cash_custody        numeric,
  p_total_amount        numeric,
  p_total_amount_words  text,
  p_notes               text,
  p_created_by          uuid
)
returns table (
  rider_id        uuid,
  receipt_id      uuid,
  rider_code      text,
  custody_number  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gov            app.governorate_city_codes;
  v_city           app.governorate_city_codes;
  v_rider          app.delivery_riders;
  v_receipt_id     uuid;
  v_padded         text;
  v_rider_code     text;
  v_custody_number text;
  v_items          jsonb;
  v_items_total    numeric(12, 2);
  v_total          numeric(12, 2);
begin
  if p_sequence is null or p_sequence < 1 or p_sequence > 9999 then
    raise exception 'INVALID_SEQUENCE';
  end if;
  if p_national_id !~ '^[0-9]{14}$' then
    raise exception 'INVALID_NATIONAL_ID';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS';
  end if;

  select * into v_gov
    from app.governorate_city_codes
   where governorate_name = p_governorate
     and level = 'governorate';
  if not found then
    raise exception 'LOCATION_NOT_FOUND';
  end if;

  select * into v_city
    from app.governorate_city_codes
   where governorate_name = p_governorate
     and city_name = p_city
     and level = 'city';
  if not found then
    raise exception 'LOCATION_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_governorate || ':' || p_city, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_national_id, 0)
  );

  select * into v_rider
    from app.delivery_riders
   where national_id = p_national_id;

  if found then
    if v_rider.status <> 'active' then
      raise exception 'RIDER_INACTIVE';
    end if;
    if v_rider.governorate_code <> v_gov.alpha_code
       or v_rider.city_code <> v_city.alpha_code then
      raise exception 'RIDER_LOCATION_MISMATCH';
    end if;
    if exists (
      select 1 from app.rider_custody_receipts where rider_id = v_rider.id
    ) then
      raise exception 'RIDER_ALREADY_HAS_CUSTODY';
    end if;

    update app.delivery_riders
       set full_name = p_full_name,
           phone     = p_phone,
           work_area = p_work_area
     where id = v_rider.id
     returning * into v_rider;
  else
    v_padded := pg_catalog.lpad(p_sequence::text, 4, '0');
    v_rider_code := v_gov.numeric_code || v_city.numeric_code || v_padded;

    begin
      insert into app.delivery_riders (
        rider_code, governorate_code, city_code, sequence_number,
        full_name, national_id, phone, work_area, status, created_by
      ) values (
        v_rider_code, v_gov.alpha_code, v_city.alpha_code, p_sequence,
        p_full_name, p_national_id, p_phone, p_work_area, 'active', p_created_by
      )
      returning * into v_rider;
    exception when unique_violation then
      raise exception 'SEQUENCE_TAKEN';
    end;
  end if;

  v_padded := pg_catalog.lpad(v_rider.sequence_number::text, 4, '0');
  v_custody_number :=
    v_gov.alpha_code || '-' || v_city.alpha_code || '-' || v_padded;

  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_set(
             pg_catalog.jsonb_set(
               item,
               '{lineTotal}',
               pg_catalog.to_jsonb(
                 pg_catalog.round(
                   coalesce((item ->> 'quantity')::numeric, 0) *
                   coalesce((item ->> 'unitPrice')::numeric, 0),
                   2
                 )
               )
             ),
             '{serial}',
             case
               when coalesce((item ->> 'quantity')::int, 0) > 0
                and nullif(item ->> 'codePrefix', '') is not null
               then pg_catalog.to_jsonb(
                 v_gov.alpha_code || '-' || v_city.alpha_code || '-' ||
                 pg_catalog.upper(item ->> 'codePrefix') || '-' || v_padded
               )
               else 'null'::jsonb
             end
           )
           order by ordinality
         )
    into v_items
    from pg_catalog.jsonb_array_elements(p_items) with ordinality
      as t(item, ordinality);

  select coalesce(pg_catalog.sum((item ->> 'lineTotal')::numeric), 0)
    into v_items_total
    from pg_catalog.jsonb_array_elements(v_items) as item;

  v_total := v_items_total + coalesce(p_cash_custody, 0);

  if pg_catalog.abs(v_total - p_total_amount) > 0.005 then
    raise exception 'TOTAL_MISMATCH';
  end if;

  begin
    insert into app.rider_custody_receipts (
      rider_id, custody_number, delivery_date, handover_officer, items,
      cash_custody, total_amount, total_amount_words, status, notes, created_by
    ) values (
      v_rider.id, v_custody_number, p_delivery_date, p_handover_officer, v_items,
      coalesce(p_cash_custody, 0), v_total, p_total_amount_words, 'active',
      coalesce(p_notes, ''), p_created_by
    )
    returning id into v_receipt_id;
  exception when unique_violation then
    raise exception 'CUSTODY_NUMBER_TAKEN';
  end;

  return query
    select v_rider.id, v_receipt_id, v_rider.rider_code, v_custody_number;
end;
$$;

revoke all on function app.issue_rider_custody(
  text, text, integer, text, text, text, text, date, text, jsonb,
  numeric, numeric, text, text, uuid
) from public;

grant execute on function app.issue_rider_custody(
  text, text, integer, text, text, text, text, date, text, jsonb,
  numeric, numeric, text, text, uuid
) to service_role;

commit;
