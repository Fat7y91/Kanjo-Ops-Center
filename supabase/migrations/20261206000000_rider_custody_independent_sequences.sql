begin;

alter table app.rider_custody_receipts
  add column if not exists governorate_code text,
  add column if not exists city_code text,
  add column if not exists receipt_sequence integer;

update app.rider_custody_receipts r
   set governorate_code = d.governorate_code,
       city_code        = d.city_code,
       receipt_sequence = coalesce(
         r.receipt_sequence,
         nullif(pg_catalog.substring(r.custody_number, '([0-9]{1,4})$'), '')::integer
       )
  from app.delivery_riders d
 where d.id = r.rider_id
   and (
     r.governorate_code is null or
     r.city_code is null or
     r.receipt_sequence is null
   );

alter table app.rider_custody_receipts
  drop constraint if exists rider_custody_receipts_receipt_sequence_check;
alter table app.rider_custody_receipts
  add constraint rider_custody_receipts_receipt_sequence_check
  check (receipt_sequence is null or (receipt_sequence between 1 and 9999));

drop index if exists app.rider_custody_receipts_one_active;

create unique index if not exists rider_custody_receipts_city_sequence_idx
  on app.rider_custody_receipts (governorate_code, city_code, receipt_sequence)
  where receipt_sequence is not null;

create index if not exists rider_custody_receipts_city_idx
  on app.rider_custody_receipts (governorate_code, city_code, created_at desc);

drop function if exists app.issue_rider_custody(
  text, text, integer, text, text, text, text, date, text,
  jsonb, numeric, numeric, text, text, uuid
);

create or replace function app.rider_next_sequences(
  p_governorate text,
  p_city        text
)
returns table (
  governorate_alpha text,
  governorate_num   text,
  city_alpha        text,
  city_num          text,
  starting_sequence integer,
  max_rider_seq     integer,
  next_rider_seq    integer,
  max_receipt_seq   integer,
  next_receipt_seq  integer,
  next_hb_seq       integer,
  next_hp_seq       integer,
  next_tsh_seq      integer,
  next_cap_seq      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $rider$
declare
  v_gov          app.governorate_city_codes;
  v_city         app.governorate_city_codes;
  v_max_rider    integer := 0;
  v_max_receipt  integer := 0;
  v_hb           integer := 0;
  v_hp           integer := 0;
  v_tsh          integer := 0;
  v_cap          integer := 0;
  v_prefix       text;
begin
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

  select coalesce(max(sequence_number), 0)
    into v_max_rider
    from app.delivery_riders
   where governorate_code = v_gov.alpha_code
     and city_code = v_city.alpha_code;

  select coalesce(max(receipt_sequence), 0)
    into v_max_receipt
    from app.rider_custody_receipts
   where governorate_code = v_gov.alpha_code
     and city_code = v_city.alpha_code;

  v_prefix := v_gov.alpha_code || '-' || v_city.alpha_code || '-';

  select
    coalesce(max(case
      when pg_catalog.upper(serial) ~ ('^' || v_prefix || 'HB-[0-9]{1,9}$')
      then pg_catalog.substring(pg_catalog.upper(serial), '([0-9]+)$')::integer
    end), 0),
    coalesce(max(case
      when pg_catalog.upper(serial) ~ ('^' || v_prefix || 'HP-[0-9]{1,9}$')
      then pg_catalog.substring(pg_catalog.upper(serial), '([0-9]+)$')::integer
    end), 0),
    coalesce(max(case
      when pg_catalog.upper(serial) ~ ('^' || v_prefix || 'TSH-[0-9]{1,9}$')
      then pg_catalog.substring(pg_catalog.upper(serial), '([0-9]+)$')::integer
    end), 0),
    coalesce(max(case
      when pg_catalog.upper(serial) ~ ('^' || v_prefix || 'CAP-[0-9]{1,9}$')
      then pg_catalog.substring(pg_catalog.upper(serial), '([0-9]+)$')::integer
    end), 0)
    into v_hb, v_hp, v_tsh, v_cap
    from (
      select item ->> 'serial' as serial
        from app.rider_custody_receipts r
        cross join lateral pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(r.items) = 'array' then r.items
            else '[]'::jsonb
          end
        ) as t(item)
       where r.governorate_code = v_gov.alpha_code
         and r.city_code = v_city.alpha_code
    ) as serials
   where serial is not null;

  return query
    select
      v_gov.alpha_code,
      v_gov.numeric_code,
      v_city.alpha_code,
      v_city.numeric_code,
      v_city.starting_sequence,
      v_max_rider,
      greatest(v_max_rider + 1, v_city.starting_sequence),
      v_max_receipt,
      greatest(v_max_receipt + 1, v_city.starting_sequence),
      v_hb + 1,
      v_hp + 1,
      v_tsh + 1,
      v_cap + 1;
end;
$rider$;

revoke all on function app.rider_next_sequences(text, text) from public;
grant execute on function app.rider_next_sequences(text, text) to service_role;

create or replace function app.issue_rider_custody(
  p_rider_id            uuid,
  p_governorate         text,
  p_city                text,
  p_sequence            integer,
  p_receipt_sequence    integer,
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
as $rider$
declare
  v_gov            app.governorate_city_codes;
  v_city           app.governorate_city_codes;
  v_rider          app.delivery_riders;
  v_receipt_id     uuid;
  v_receipt_seq    integer;
  v_max_receipt    integer;
  v_rider_code     text;
  v_custody_number text;
  v_items          jsonb;
  v_items_total    numeric(12, 2);
  v_total          numeric(12, 2);
  v_padded         text;
begin
  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or exists (
       select 1
         from pg_catalog.jsonb_array_elements(p_items) as t(item)
        where pg_catalog.jsonb_typeof(item) <> 'object'
     ) then
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

  if p_rider_id is not null then
    select * into v_rider
      from app.delivery_riders
     where id = p_rider_id;
    if not found then
      raise exception 'RIDER_NOT_FOUND';
    end if;
    if v_rider.status <> 'active' then
      raise exception 'RIDER_INACTIVE';
    end if;
    if v_rider.governorate_code <> v_gov.alpha_code
       or v_rider.city_code <> v_city.alpha_code then
      raise exception 'RIDER_LOCATION_MISMATCH';
    end if;
  else
    if p_sequence is null or p_sequence < 1 or p_sequence > 9999 then
      raise exception 'INVALID_SEQUENCE';
    end if;
    if p_national_id is null or p_national_id !~ '^[0-9]{14}$' then
      raise exception 'INVALID_NATIONAL_ID';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_national_id, 0)
    );

    if exists (
      select 1 from app.delivery_riders where national_id = p_national_id
    ) then
      raise exception 'RIDER_ALREADY_EXISTS';
    end if;

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

  select coalesce(max(receipt_sequence), 0)
    into v_max_receipt
    from app.rider_custody_receipts
   where governorate_code = v_gov.alpha_code
     and city_code = v_city.alpha_code;

  if p_receipt_sequence is null then
    v_receipt_seq := greatest(v_max_receipt + 1, v_city.starting_sequence);
  else
    if p_receipt_sequence < 1 or p_receipt_sequence > 9999 then
      raise exception 'INVALID_RECEIPT_SEQUENCE';
    end if;
    if exists (
      select 1
        from app.rider_custody_receipts
       where governorate_code = v_gov.alpha_code
         and city_code = v_city.alpha_code
         and receipt_sequence = p_receipt_sequence
    ) then
      raise exception 'RECEIPT_SEQUENCE_TAKEN';
    end if;
    v_receipt_seq := p_receipt_sequence;
  end if;

  v_padded := pg_catalog.lpad(v_receipt_seq::text, 4, '0');
  v_custody_number :=
    v_gov.alpha_code || '-' || v_city.alpha_code || '-' || v_padded;

  select pg_catalog.jsonb_agg(
           item || pg_catalog.jsonb_build_object(
             'lineTotal',
             pg_catalog.round(
               coalesce((item ->> 'quantity')::numeric, 0) *
               coalesce((item ->> 'unitPrice')::numeric, 0),
               2
             ),
             'serial',
             nullif(pg_catalog.btrim(item ->> 'serial'), '')
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
      rider_id, custody_number, governorate_code, city_code, receipt_sequence,
      delivery_date, handover_officer, items, cash_custody, total_amount,
      total_amount_words, status, notes, created_by
    ) values (
      v_rider.id, v_custody_number, v_gov.alpha_code, v_city.alpha_code,
      v_receipt_seq, p_delivery_date, p_handover_officer, v_items,
      coalesce(p_cash_custody, 0), v_total, p_total_amount_words, 'active',
      coalesce(p_notes, ''), p_created_by
    )
    returning id into v_receipt_id;
  exception when unique_violation then
    raise exception 'RECEIPT_SEQUENCE_TAKEN';
  end;

  return query
    select v_rider.id, v_receipt_id, v_rider.rider_code, v_custody_number;
end;
$rider$;

revoke all on function app.issue_rider_custody(
  uuid, text, text, integer, integer, text, text, text, text, date, text,
  jsonb, numeric, numeric, text, text, uuid
) from public;

grant execute on function app.issue_rider_custody(
  uuid, text, text, integer, integer, text, text, text, text, date, text,
  jsonb, numeric, numeric, text, text, uuid
) to service_role;

commit;
