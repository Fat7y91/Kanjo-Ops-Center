begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Bank-exclusive settlement, EGP-only operations, and coupon discount caps.
 *
 * Three strict operational rules are enforced here at the database, so no
 * client can bypass them:
 *
 *   1. Every clearinghouse settlement and every manual treasury movement posts
 *      to the EGP bank account (`1000`). The SAR account (`1000-SAR`) is a
 *      holding/funding account and can never be touched by daily operations.
 *   2. The SAR account rejects manual deposits/expenses outright; a SAR balance
 *      only moves through capital funding or an explicit finance FX transfer.
 *   3. A coupon may carry `max_discount_minor`, an absolute per-order cap. For a
 *      percentage coupon the computed discount is clamped to it before any
 *      funding split, so `Cp + Cv = C` still holds.
 *
 * Idempotent: `add column if not exists`, `create or replace function`.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Coupon per-order cap ────────────────────────────────────────────── */

alter table app.coupons
  add column if not exists max_discount_minor bigint;

alter table app.coupons
  drop constraint if exists coupons_max_discount_non_negative,
  add constraint coupons_max_discount_non_negative check (
    max_discount_minor is null or max_discount_minor >= 0
  );

comment on column app.coupons.max_discount_minor is
  'Absolute per-order discount cap in minor units. Null means no cap. Clamps the percentage/base discount before the funding split.';

/* ── 2. Freeze: clamp the coupon discount to the per-order cap ───────────── */

create or replace function app.operation_freeze_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_rate  numeric(6, 2);
  fixed_profit   bigint;
  c_type         app.coupon_type;
  c_active       boolean;
  c_vendor_pct   numeric(5, 2);
  c_amount       bigint;
  c_shipping     bigint;
  c_cashback     bigint;
  c_max          bigint;
  base_minor     bigint;
  shipping_part  bigint;
  total_coupon   bigint;
  ceiling_disc   bigint;
  platform_share bigint;
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

  new.commission_percent := coalesce(merchant_rate, 0);
  new.commission_minor := round(new.order_value_minor * new.commission_percent / 100)::bigint;

  if new.courier_cut_minor is null or new.courier_cut_minor = 0 then
    select fixed_profit_per_order_minor into fixed_profit
      from app.couriers
     where id = new.courier_id;
    new.courier_cut_minor := coalesce(fixed_profit, 0);
  end if;
  new.courier_cut_percent := 0;

  new.coupon_discount_minor          := 0;
  new.coupon_shipping_minor          := 0;
  new.coupon_cashback_minor          := 0;
  new.coupon_platform_funded_minor   := 0;
  new.coupon_vendor_funded_minor     := 0;

  if new.coupon_id is not null then
    select coupon_type, active, vendor_funding_percent,
           discount_amount_minor, shipping_discount_minor,
           cashback_amount_minor, max_discount_minor
      into c_type, c_active, c_vendor_pct, c_amount, c_shipping,
           c_cashback, c_max
      from app.coupons
     where id = new.coupon_id;

    if c_type is null then
      raise exception 'OPERATION_COUPON_MISSING: coupon % does not exist', new.coupon_id
        using errcode = '23503';
    end if;
    if not c_active then
      raise exception 'OPERATION_COUPON_INACTIVE: coupon % is not active', new.coupon_id
        using errcode = '23514';
    end if;

    base_minor := case c_type
      when 'percentage_discount' then round(new.order_value_minor * c_amount / 10000.0)::bigint
      when 'fixed_amount'        then c_amount
      when 'welcome_coupon'      then c_amount
      when 'free_shipping'       then 0
      when 'cashback'            then 0
      else 0
    end;

    /* Absolute per-order cap. Applied to the value-based discount only, so a
     * free-shipping coupon still waives the fee it promises and the funding
     * split of the capped discount stays exact. */
    if c_max is not null and base_minor > c_max then
      base_minor := c_max;
    end if;

    shipping_part := case
      when c_type = 'free_shipping' then new.delivery_fee_minor
      else c_shipping
    end;

    total_coupon := base_minor + shipping_part;
    ceiling_disc := new.order_value_minor + new.delivery_fee_minor;
    if total_coupon > ceiling_disc then
      total_coupon := ceiling_disc;
    end if;

    select code into new.coupon_code from app.coupons where id = new.coupon_id;

    new.coupon_discount_minor := total_coupon;
    new.coupon_shipping_minor := shipping_part;
    new.coupon_cashback_minor := case when c_type = 'cashback' then c_cashback else 0 end;

    if c_type = 'free_shipping' then
      platform_share := total_coupon;
    else
      platform_share := round(total_coupon * (100 - c_vendor_pct) / 100.0)::bigint;
    end if;
    new.coupon_platform_funded_minor := platform_share;
    new.coupon_vendor_funded_minor := total_coupon - platform_share;
  end if;

  return new;
end;
$$;

/* ── 3. Settlement posts to the EGP bank, EGP parties only ───────────────── */

create or replace function app.post_settlement(
  p_account_id   uuid,
  p_actor        uuid,
  p_receipt_no   text    default null,
  p_storage_path text    default null,
  p_mime_type    text    default null,
  p_size_bytes   integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct     app.accounts;
  bal      bigint;
  bank_id  uuid;
  entry_id uuid;
  source   app.journal_source;
  label    text;
begin
  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'SETTLEMENT_ACCOUNT_MISSING: account % does not exist', p_account_id
      using errcode = '23503';
  end if;
  if acct.party_type is null then
    raise exception 'SETTLEMENT_NOT_A_PARTY: account % is a control account', p_account_id
      using errcode = '23514';
  end if;
  if acct.currency <> 'EGP' then
    raise exception
      'SETTLEMENT_EGP_ONLY: operational settlements post to the Egyptian bank; party % is %',
      p_account_id, acct.currency
      using errcode = '23514';
  end if;

  select coalesce(sum(debit_minor), 0) - coalesce(sum(credit_minor), 0)
    into bal
    from app.journal_lines
   where account_id = p_account_id;

  if bal = 0 then
    raise exception 'SETTLEMENT_ZERO_BALANCE: account % has nothing outstanding', p_account_id
      using errcode = '23514';
  end if;

  /* Daily operations always settle against the Egyptian bank. The SAR account
   * is holding/funding only and is never an operational counterparty. */
  bank_id := app.system_account('1000');
  source  := case acct.party_type
    when 'courier' then 'courier_payout'::app.journal_source
    else 'merchant_settlement'::app.journal_source
  end;
  label := 'تسوية ' || acct.name;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (current_date, label, source, 'EGP', p_actor)
  returning id into entry_id;

  if bal < 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, -bal, 'سداد مستحق');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, bank_id, -bal, 'سداد من البنك');
  else
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, bank_id, bal, 'تحصيل مستحق');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, p_account_id, bal, 'تحصيل من الطرف');
  end if;

  if p_receipt_no is not null and length(btrim(p_receipt_no)) > 0 then
    if p_storage_path is null or length(btrim(p_storage_path)) = 0 then
      raise exception 'SETTLEMENT_RECEIPT_PATH_REQUIRED: storage path is required with a receipt number'
        using errcode = '23514';
    end if;
    insert into app.transaction_receipts (
      entry_id, receipt_no, storage_path, mime_type, size_bytes, uploaded_by
    ) values (
      entry_id, btrim(p_receipt_no), p_storage_path,
      coalesce(p_mime_type, 'application/octet-stream'),
      coalesce(p_size_bytes, 0), p_actor
    );
  end if;

  return entry_id;
end;
$$;

comment on function app.post_settlement(uuid, uuid, text, text, text, integer) is
  'Settles an EGP party account by posting a balanced journal entry against the EGP bank (1000), optionally attaching a receipt.';

/* ── 4. Manual treasury movements are EGP-only ──────────────────────────── */

create or replace function app.post_bank_movement(
  p_account_id   uuid,
  p_kind         text,
  p_label        text,
  p_amount_minor bigint,
  p_occurred_at  timestamptz,
  p_actor        uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct     app.accounts;
  entry_id uuid;
  contra   uuid;
  amount   bigint := p_amount_minor;
begin
  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'BANK_MOVEMENT_ACCOUNT_MISSING: account % does not exist', p_account_id
      using errcode = '23503';
  end if;
  if acct.party_type is not null then
    raise exception 'BANK_MOVEMENT_NOT_CONTROL: account % is a party account', p_account_id
      using errcode = '23514';
  end if;
  if acct.currency <> 'EGP' then
    raise exception
      'BANK_MOVEMENT_EGP_ONLY: manual movements post to the Egyptian bank only; account is %',
      acct.currency
      using errcode = '23514';
  end if;
  if p_kind not in ('deposit', 'expense') then
    raise exception 'BANK_MOVEMENT_KIND_INVALID: % is not deposit or expense', p_kind
      using errcode = '23514';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'BANK_MOVEMENT_AMOUNT_POSITIVE: amount must be greater than zero'
      using errcode = '23514';
  end if;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (
    coalesce(p_occurred_at, now())::date,
    coalesce(nullif(btrim(p_label), ''), 'حركة بنكية'),
    'manual',
    'EGP',
    p_actor
  )
  returning id into entry_id;

  if p_kind = 'deposit' then
    contra := app.system_account('3000');
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, acct.id, amount, 'إيداع بنكي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, contra, amount, 'إيداع بنكي');
  else
    contra := app.system_account('5400');
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, contra, amount, 'مصروف بنكي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, acct.id, amount, 'مصروف بنكي');
  end if;

  return entry_id;
end;
$$;

grant execute on function app.post_bank_movement(uuid, text, text, bigint, timestamptz, uuid)
  to service_role;

/* ── 5. Re-create the bulk upsert with the cap column ─────────────────────
 * The function is replaced, not altered, so `max_discount_minor` is carried on
 * import while every other column keeps its established behaviour. */

create or replace function app.upsert_coupons(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  insert into app.coupons (
    code, coupon_type, active, discount_funded_by, vendor_funding_percent,
    stackable, stack_priority, uses_count, discount_amount_minor,
    shipping_discount_minor, cashback_amount_minor, total_impact_minor,
    vendor_funded_minor, platform_funded_minor, budget_applied_minor,
    budget_cap_minor, budget_used_minor, max_discount_minor, last_used_at,
    source_created_at
  )
  select
    upper(btrim(r.code)),
    r.coupon_type,
    r.active,
    r.discount_funded_by,
    r.vendor_funding_percent,
    r.stackable,
    r.stack_priority,
    r.uses_count,
    r.discount_amount_minor,
    r.shipping_discount_minor,
    r.cashback_amount_minor,
    r.total_impact_minor,
    r.vendor_funded_minor,
    r.platform_funded_minor,
    r.budget_applied_minor,
    r.budget_cap_minor,
    r.budget_used_minor,
    r.max_discount_minor,
    r.last_used_at,
    coalesce(r.source_created_at, now())
  from jsonb_to_recordset(p_rows) as r(
    code                     text,
    coupon_type              app.coupon_type,
    active                   boolean,
    discount_funded_by       app.coupon_funding,
    vendor_funding_percent   numeric,
    stackable                boolean,
    stack_priority           integer,
    uses_count               integer,
    discount_amount_minor    bigint,
    shipping_discount_minor  bigint,
    cashback_amount_minor    bigint,
    total_impact_minor       bigint,
    vendor_funded_minor      bigint,
    platform_funded_minor    bigint,
    budget_applied_minor     bigint,
    budget_cap_minor         bigint,
    budget_used_minor        bigint,
    max_discount_minor       bigint,
    last_used_at             timestamptz,
    source_created_at        timestamptz
  )
  on conflict (upper(btrim(code))) do update set
    coupon_type            = excluded.coupon_type,
    active                 = excluded.active,
    discount_funded_by     = excluded.discount_funded_by,
    vendor_funding_percent = excluded.vendor_funding_percent,
    stackable              = excluded.stackable,
    stack_priority         = excluded.stack_priority,
    uses_count             = excluded.uses_count,
    discount_amount_minor  = excluded.discount_amount_minor,
    shipping_discount_minor = excluded.shipping_discount_minor,
    cashback_amount_minor  = excluded.cashback_amount_minor,
    total_impact_minor     = excluded.total_impact_minor,
    vendor_funded_minor    = excluded.vendor_funded_minor,
    platform_funded_minor  = excluded.platform_funded_minor,
    budget_applied_minor   = excluded.budget_applied_minor,
    budget_cap_minor       = excluded.budget_cap_minor,
    budget_used_minor      = excluded.budget_used_minor,
    max_discount_minor     = excluded.max_discount_minor,
    last_used_at           = excluded.last_used_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function app.upsert_coupons(jsonb) to service_role;

commit;
