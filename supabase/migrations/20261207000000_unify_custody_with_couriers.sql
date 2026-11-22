begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Unify custody riders with the canonical operational courier roster.
 *
 * The custody register originally introduced `app.delivery_riders`, a siloed
 * roster that the clearinghouse never saw. The operations screen already
 * owns the canonical roster in `app.couriers`. This migration folds the two
 * together so a rider is one row:
 *
 *   - `app.couriers` gains the custody identity columns it needs. They stay
 *     nullable so the partners that predate custody remain valid until they
 *     receive their first receipt.
 *   - `app.rider_custody_receipts.rider_id` now points at `app.couriers`.
 *   - `app.delivery_riders` is removed. Any rows it still holds are folded
 *     into the canonical roster and their receipts remapped first, so the
 *     migration is safe even outside the empty production table.
 *   - `app.rider_next_sequences` and `app.issue_rider_custody` read and write
 *     the canonical roster. Issuing a receipt can assign a missing rider code,
 *     sequence, national id, phone and work area to an existing partner in the
 *     same transaction that prints the receipt.
 *
 * Idempotent: every add is `if not exists`, constraints are guarded, and the
 * replacement functions keep their existing signatures.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Custody identity columns on the canonical roster ────────────────── */

alter table app.couriers
  add column if not exists rider_code       text,
  add column if not exists governorate_code text,
  add column if not exists city_code        text,
  add column if not exists sequence_number  integer,
  add column if not exists national_id      text,
  add column if not exists work_area        text not null default '';

comment on column app.couriers.rider_code is
  'Deterministic rider code (<gov numeric><city numeric><sequence>). Null until the partner receives custody.';
comment on column app.couriers.governorate_code is
  'Governorate alpha code (for example KFS). Null until the partner receives custody.';
comment on column app.couriers.city_code is
  'City alpha code (for example DQ). Null until the partner receives custody.';
comment on column app.couriers.sequence_number is
  'Rider sequence for the city. Independent from the custody and asset counters.';
comment on column app.couriers.national_id is
  '14-digit national id collected when the partner receives custody. Unique when present.';
comment on column app.couriers.work_area is
  'Delivery area printed on the custody receipt.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'couriers_sequence_positive'
       and conrelid = 'app.couriers'::regclass
  ) then
    alter table app.couriers
      add constraint couriers_sequence_positive
      check (sequence_number is null or sequence_number > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'couriers_national_id_format'
       and conrelid = 'app.couriers'::regclass
  ) then
    alter table app.couriers
      add constraint couriers_national_id_format
      check (national_id is null or national_id ~ '^[0-9]{14}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'couriers_rider_location_present'
       and conrelid = 'app.couriers'::regclass
  ) then
    alter table app.couriers
      add constraint couriers_rider_location_present
      check (
        (governorate_code is null and city_code is null) or
        (governorate_code is not null and city_code is not null)
      );
  end if;
end;
$$;

create unique index if not exists couriers_rider_code_key
  on app.couriers (rider_code)
  where rider_code is not null;

create unique index if not exists couriers_national_id_key
  on app.couriers (national_id)
  where national_id is not null;

create unique index if not exists couriers_location_sequence_key
  on app.couriers (governorate_code, city_code, sequence_number)
  where sequence_number is not null;

/* ── 2. Fold any siloed rows in and repoint the receipts ───────────────── */

alter table app.rider_custody_receipts
  drop constraint if exists rider_custody_receipts_rider_id_fkey;

do $$
declare
  rider_row record;
  new_id    uuid;
  new_phone text;
begin
  if to_regclass('app.delivery_riders') is null then
    return;
  end if;

  create temp table if not exists _custody_rider_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  for rider_row in select * from app.delivery_riders loop
    select id into new_id
      from app.couriers
     where national_id = rider_row.national_id
     limit 1;

    if new_id is null then
      new_phone := rider_row.phone;
      if new_phone <> ''
         and exists (select 1 from app.couriers where phone = new_phone) then
        new_phone := '';
      end if;

      insert into app.couriers (
        display_name, phone, fixed_profit_per_order_minor,
        payout_preferences, active, applied_at,
        rider_code, governorate_code, city_code, sequence_number,
        national_id, work_area, created_at, updated_at
      ) values (
        rider_row.full_name, new_phone, 0, '{}'::jsonb,
        rider_row.status = 'active', rider_row.created_at,
        rider_row.rider_code, rider_row.governorate_code,
        rider_row.city_code, rider_row.sequence_number,
        rider_row.national_id, rider_row.work_area,
        rider_row.created_at, rider_row.updated_at
      )
      returning id into new_id;
    end if;

    insert into _custody_rider_map (old_id, new_id)
    values (rider_row.id, new_id);
  end loop;

  update app.rider_custody_receipts receipt
     set rider_id = map.new_id
    from _custody_rider_map map
   where receipt.rider_id = map.old_id;
end;
$$;

drop table if exists app.delivery_riders;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'rider_custody_receipts_rider_id_fkey'
       and conrelid = 'app.rider_custody_receipts'::regclass
  ) then
    alter table app.rider_custody_receipts
      add constraint rider_custody_receipts_rider_id_fkey
      foreign key (rider_id) references app.couriers (id) on delete restrict;
  end if;
end;
$$;

/* ── 3. Next sequences read the canonical roster ───────────────────────── */

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
    from app.couriers
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

/* ── 4. Issuance writes the canonical roster ───────────────────────────── */

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
  v_rider          app.couriers;
  v_receipt_id     uuid;
  v_receipt_seq    integer;
  v_max_receipt    integer;
  v_sequence       integer;
  v_rider_code     text;
  v_national_id    text;
  v_phone          text;
  v_work_area      text;
  v_name           text;
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
    /* Existing operational rider: fill any custody identity that is still
     * missing, keep everything that is already recorded, then top up. */
    select * into v_rider
      from app.couriers
     where id = p_rider_id;
    if not found then
      raise exception 'RIDER_NOT_FOUND';
    end if;
    if not v_rider.active then
      raise exception 'RIDER_INACTIVE';
    end if;

    if v_rider.governorate_code is not null then
      if v_rider.governorate_code <> v_gov.alpha_code
         or coalesce(v_rider.city_code, '') <> v_city.alpha_code then
        raise exception 'RIDER_LOCATION_MISMATCH';
      end if;
    end if;

    v_sequence := v_rider.sequence_number;
    if v_sequence is null then
      if p_sequence is null or p_sequence < 1 or p_sequence > 9999 then
        raise exception 'INVALID_SEQUENCE';
      end if;
      v_sequence := p_sequence;
    elsif p_sequence is not null and p_sequence <> v_sequence then
      raise exception 'INVALID_SEQUENCE';
    end if;

    v_national_id := nullif(pg_catalog.btrim(coalesce(v_rider.national_id, '')), '');
    if v_national_id is null then
      if p_national_id is null
         or pg_catalog.btrim(p_national_id) !~ '^[0-9]{14}$' then
        raise exception 'INVALID_NATIONAL_ID';
      end if;
      v_national_id := pg_catalog.btrim(p_national_id);
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_national_id, 0)
    );

    v_rider_code := nullif(pg_catalog.btrim(coalesce(v_rider.rider_code, '')), '');
    if v_rider_code is null then
      v_rider_code :=
        v_gov.numeric_code || v_city.numeric_code ||
        pg_catalog.lpad(v_sequence::text, 4, '0');
    end if;

    if exists (
      select 1
        from app.couriers c
       where c.rider_code = v_rider_code
         and c.id <> v_rider.id
    ) then
      raise exception 'SEQUENCE_TAKEN';
    end if;

    if exists (
      select 1
        from app.couriers
       where national_id = v_national_id
         and id <> v_rider.id
    ) then
      raise exception 'RIDER_ALREADY_EXISTS';
    end if;

    v_name := nullif(pg_catalog.btrim(coalesce(v_rider.display_name, '')), '');
    if v_name is null then
      v_name := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
      if v_name is null then
        raise exception 'NAME_REQUIRED';
      end if;
    end if;

    v_phone := nullif(pg_catalog.btrim(coalesce(v_rider.phone, '')), '');
    if v_phone is null then
      v_phone := nullif(pg_catalog.btrim(coalesce(p_phone, '')), '');
    end if;

    v_work_area := nullif(pg_catalog.btrim(coalesce(v_rider.work_area, '')), '');
    if v_work_area is null then
      v_work_area := nullif(pg_catalog.btrim(coalesce(p_work_area, '')), '');
    end if;

    if v_phone is not null
       and exists (
         select 1
           from app.couriers c
          where c.phone = v_phone
            and c.id <> v_rider.id
       ) then
      raise exception 'PHONE_TAKEN';
    end if;

    begin
      update app.couriers
         set display_name     = v_name,
             phone            = coalesce(v_phone, ''),
             work_area        = coalesce(v_work_area, ''),
             governorate_code = v_gov.alpha_code,
             city_code        = v_city.alpha_code,
             sequence_number  = v_sequence,
             rider_code       = v_rider_code,
             national_id      = v_national_id,
             updated_at       = now()
       where id = v_rider.id
       returning * into v_rider;
    exception when unique_violation then
      raise exception 'RIDER_ALREADY_EXISTS';
    end;
  else
    /* New partner: create the operational roster row directly so they show
     * up in the clearinghouse alongside their colleagues. */
    if p_sequence is null or p_sequence < 1 or p_sequence > 9999 then
      raise exception 'INVALID_SEQUENCE';
    end if;
    if p_national_id is null
       or pg_catalog.btrim(p_national_id) !~ '^[0-9]{14}$' then
      raise exception 'INVALID_NATIONAL_ID';
    end if;

    v_national_id := pg_catalog.btrim(p_national_id);

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_national_id, 0)
    );

    if exists (
      select 1 from app.couriers where national_id = v_national_id
    ) then
      raise exception 'RIDER_ALREADY_EXISTS';
    end if;

    v_sequence := p_sequence;
    v_padded := pg_catalog.lpad(p_sequence::text, 4, '0');
    v_rider_code := v_gov.numeric_code || v_city.numeric_code || v_padded;

    if exists (
      select 1 from app.couriers c where c.rider_code = v_rider_code
    ) then
      raise exception 'SEQUENCE_TAKEN';
    end if;

    v_name := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
    if v_name is null then
      raise exception 'NAME_REQUIRED';
    end if;

    v_phone := coalesce(nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''), '');
    if v_phone <> ''
       and exists (
         select 1 from app.couriers c where c.phone = v_phone
       ) then
      raise exception 'PHONE_TAKEN';
    end if;

    begin
      insert into app.couriers (
        display_name, phone, fixed_profit_per_order_minor,
        payout_preferences, active, applied_at,
        rider_code, governorate_code, city_code, sequence_number,
        national_id, work_area
      ) values (
        v_name,
        v_phone,
        0,
        '{}'::jsonb,
        true,
        now(),
        v_rider_code,
        v_gov.alpha_code,
        v_city.alpha_code,
        v_sequence,
        v_national_id,
        coalesce(pg_catalog.btrim(coalesce(p_work_area, '')), '')
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
