begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Courier roster correction.
 *
 * The delivery partner is a back-office roster record, not an operator. This
 * migration removes the authentication coupling and the field-ops data the
 * product no longer wants, and replaces the percentage cut with a fixed profit
 * per order.
 *
 *   - `user_id`             dropped; no auth user, no password, no profile
 *   - `vehicle_type`        dropped
 *   - `vehicle_plate`       dropped
 *   - `availability`        dropped
 *   - `courier_cut_percent` dropped (a percentage cannot become a fixed amount
 *                           without an order value; re-price the roster)
 *   - `fixed_profit_per_order_minor` added (minor units)
 *   - `phone`               added, editable and unique when present
 *   - `payout_preferences`  added, JSONB describing how the partner is paid
 *
 * The operations logger keeps its own frozen `courier_cut_minor` column; only
 * the source of the default changes: it now reads the fixed profit instead of
 * deriving a percentage of the delivery fee.
 *
 * Idempotent: every column add / drop is guarded, constraints are added in
 * `do` blocks, and the freeze trigger body is replaced.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. New roster columns ──────────────────────────────────────────────── */

alter table app.couriers
  add column if not exists phone text not null default '',
  add column if not exists fixed_profit_per_order_minor bigint not null default 0,
  add column if not exists payout_preferences jsonb not null default '{}'::jsonb;

/* Preserve identity entered through the old auth-linked flow before the link
 * is removed, so no partner loses their name or contact number. */
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'app' and table_name = 'couriers'
       and column_name = 'user_id'
  ) then
    update app.couriers c
       set phone = coalesce(nullif(c.phone, ''), u.phone, ''),
           display_name = coalesce(nullif(c.display_name, ''), u.full_name, '')
      from app.users u
     where u.id = c.user_id;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'app.couriers'::regclass
       and conname = 'couriers_fixed_profit_non_negative'
  ) then
    alter table app.couriers
      add constraint couriers_fixed_profit_non_negative
      check (fixed_profit_per_order_minor >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'app.couriers'::regclass
       and conname = 'couriers_payout_preferences_object'
  ) then
    alter table app.couriers
      add constraint couriers_payout_preferences_object
      check (jsonb_typeof(payout_preferences) = 'object');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'app.couriers'::regclass
       and conname = 'couriers_name_present'
  ) then
    alter table app.couriers
      add constraint couriers_name_present
      check (length(btrim(display_name)) > 0);
  end if;
end;
$$;

comment on column app.couriers.fixed_profit_per_order_minor is
  'Fixed profit the partner keeps per delivered order, in minor units (piastres/halalas).';
comment on column app.couriers.payout_preferences is
  'How the partner is paid: method plus the method-specific destination fields.';
comment on column app.couriers.phone is
  'Roster contact number. Unique when present so one partner cannot be entered twice.';

/* ── 2. Drop the retired columns ────────────────────────────────────────── */

alter table app.couriers
  drop constraint if exists couriers_availability_allowed,
  drop constraint if exists couriers_courier_cut_percent_check;

drop index if exists app.couriers_availability_idx;

alter table app.couriers
  drop column if exists vehicle_type,
  drop column if exists vehicle_plate,
  drop column if exists availability,
  drop column if exists courier_cut_percent;

/* ── 3. Remove the authentication coupling ──────────────────────────────── */

alter table app.couriers drop constraint if exists couriers_user_id_fkey;
alter table app.couriers drop constraint if exists couriers_user_id_key;
drop index if exists app.couriers_user_key;
drop index if exists app.couriers_user_id_key;
alter table app.couriers drop column if exists user_id;

/* ── 4. Roster indexes ──────────────────────────────────────────────────── */

create unique index if not exists couriers_phone_key
  on app.couriers (phone)
  where phone <> '';

create index if not exists couriers_active_idx
  on app.couriers (active);

/* ── 5. Fixed profit replaces the percentage in the operations trigger ──── */

create or replace function app.operation_freeze_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_rate numeric(6, 2);
  fixed_profit  bigint;
begin
  select coalesce(agreed_commission, target_commission)
    into merchant_rate
    from app.merchants
   where id = new.merchant_id;

  if merchant_rate is null then
    raise exception
      'OPERATION_MERCHANT_MISSING: merchant % does not exist', new.merchant_id
      using errcode = '23503';
  end if;

  /* The merchant rate is captured even when the caller passes a percent: the
   * contract, not the form, decides what the order pays. */
  new.commission_percent := coalesce(merchant_rate, 0);
  new.commission_minor := round(new.order_value_minor * new.commission_percent / 100)::bigint;

  /* The courier is paid a fixed profit per order. A caller-supplied amount
   * still wins, which is how an ad-hoc delivery bonus is entered. */
  if new.courier_cut_minor is null or new.courier_cut_minor = 0 then
    select fixed_profit_per_order_minor into fixed_profit
      from app.couriers
     where id = new.courier_id;
    new.courier_cut_minor := coalesce(fixed_profit, 0);
  end if;

  /* The frozen percent column is retained for historical reporting; a fixed
   * profit has no meaningful percent of the delivery fee. */
  new.courier_cut_percent := 0;

  return new;
end;
$$;

comment on function app.operation_freeze_amounts() is
  'Resolves the merchant commission and the courier fixed profit, then freezes both onto the operation row.';

commit;
