begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Operations logging: coupons, wallet discounts, and journal posting.
 *
 * The employee enters only what they can see: order value, delivery fee,
 * payment type, an optional coupon, and an optional manual wallet discount.
 * Everything financial is resolved server-side and frozen onto the append-only
 * operation row, then posted as a balanced journal entry:
 *
 *   M = commission (order value × merchant rate, or contract amount)
 *   D = delivery fee
 *   C = coupon discount actually granted at checkout (computed per order)
 *     Cp = platform-funded share of C
 *     Cv = vendor-funded share of C   (Cp + Cv = C)
 *   W = manual wallet discount (platform-funded)
 *   K = courier fixed profit
 *
 * COD:
 *   Dr Merchant Receivable   M
 *   Dr Coupon Expense        Cp
 *   Dr Wallet Redemption Exp W
 *   Dr Courier Expense       K
 *   Cr Courier Payable       Cp + W − D + K
 *   Cr Commission Revenue    M
 *   Cr Delivery Revenue      D
 *
 * ONLINE:
 *   Dr Bank                  O + D − C − W
 *   Dr Coupon Expense        Cp
 *   Dr Wallet Redemption Exp W
 *   Dr Courier Expense       K
 *   Cr Merchant Payable      O − Cv − M
 *   Cr Courier Payable       K
 *   Cr Commission Revenue    M
 *   Cr Delivery Revenue      D
 *
 * Cashback coupons do not reduce checkout cash. They accrue a customer wallet
 * liability instead: Dr Cashback Expense / Cr Customer Wallet Liability.
 *
 * Idempotent: guarded `add column if not exists`, drop-then-create triggers.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. New frozen columns ──────────────────────────────────────────────── */

alter table app.operation_logs
  add column if not exists coupon_id                  uuid references app.coupons (id) on delete restrict,
  add column if not exists coupon_code                text   not null default '',
  add column if not exists coupon_discount_minor      bigint not null default 0,
  add column if not exists coupon_shipping_minor      bigint not null default 0,
  add column if not exists coupon_cashback_minor      bigint not null default 0,
  add column if not exists coupon_platform_funded_minor bigint not null default 0,
  add column if not exists coupon_vendor_funded_minor   bigint not null default 0,
  add column if not exists wallet_discount_minor      bigint not null default 0,
  add column if not exists wallet_discount_reason     text   not null default '',
  add column if not exists wallet_discount_ref        text   not null default '',
  add column if not exists journal_entry_id           uuid references app.journal_entries (id);

alter table app.operation_logs
  drop constraint if exists operation_logs_coupon_amounts_non_negative,
  add constraint operation_logs_coupon_amounts_non_negative check (
    coupon_discount_minor >= 0 and
    coupon_shipping_minor >= 0 and
    coupon_cashback_minor >= 0 and
    coupon_platform_funded_minor >= 0 and
    coupon_vendor_funded_minor >= 0 and
    wallet_discount_minor >= 0
  );

comment on column app.operation_logs.coupon_discount_minor is
  'Coupon discount granted at checkout, computed per order. Reduces cash collected.';
comment on column app.operation_logs.coupon_platform_funded_minor is
  'Platform share of the coupon discount (Coupon Expense).';
comment on column app.operation_logs.coupon_vendor_funded_minor is
  'Vendor share of the coupon discount, absorbed by the merchant.';
comment on column app.operation_logs.wallet_discount_minor is
  'Manual wallet balance used as cash. Platform-funded; Kanjo owes the courier.';
comment on column app.operation_logs.journal_entry_id is
  'The journal entry posted for this operation. Set once, immutable like the rest of the row.';

/* ── 2. Coupon pricing + freeze ────────────────────────────────────────────
 * Extends the existing freeze trigger: merchant rate, courier fixed profit and
 * the coupon/wallet split are all resolved here, before the row exists. */

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
  base_minor     bigint;
  shipping_part  bigint;
  total_coupon   bigint;
  max_discount   bigint;
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

  /* Coupon pricing. A percentage coupon stores basis points in
   * `discount_amount_minor`, so the discount must be computed from this
   * order's value, never read as a fixed amount. */
  new.coupon_discount_minor          := 0;
  new.coupon_shipping_minor          := 0;
  new.coupon_cashback_minor          := 0;
  new.coupon_platform_funded_minor   := 0;
  new.coupon_vendor_funded_minor     := 0;

  if new.coupon_id is not null then
    select coupon_type, active, vendor_funding_percent,
           discount_amount_minor, shipping_discount_minor, cashback_amount_minor
      into c_type, c_active, c_vendor_pct, c_amount, c_shipping, c_cashback
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

    /* Free shipping discounts the delivery fee itself, and is always
     * platform-funded: the fee belongs to the courier/platform. */
    shipping_part := case
      when c_type = 'free_shipping' then new.delivery_fee_minor
      else c_shipping
    end;

    total_coupon := base_minor + shipping_part;
    max_discount := new.order_value_minor + new.delivery_fee_minor;
    if total_coupon > max_discount then
      total_coupon := max_discount;
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

comment on function app.operation_freeze_amounts() is
  'Resolves and freezes commission, courier profit, coupon split and wallet on an operation.';

/* ── 3. Journal posting (replaces the clearinghouse routing) ────────────── */

create or replace function app.operation_post_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id       uuid;
  merchant_acct  uuid;
  courier_acct   uuid;
  bank_acct      uuid;
  m              bigint := new.commission_minor;
  d_fee          bigint := new.delivery_fee_minor;
  o_val          bigint := new.order_value_minor;
  c_coupon       bigint := new.coupon_discount_minor;
  cp_platform    bigint := new.coupon_platform_funded_minor;
  cv_vendor      bigint := new.coupon_vendor_funded_minor;
  w_wallet       bigint := new.wallet_discount_minor;
  k_cut          bigint := new.courier_cut_minor;
  cashback       bigint := new.coupon_cashback_minor;
  courier_pay    bigint;
  merchant_line  bigint;
  bank_line      bigint;
begin
  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency, created_by
  ) values (
    new.occurred_at::date,
    'عملية ' || new.order_id,
    'operation',
    new.id::text,
    new.currency,
    new.logged_by
  )
  returning id into entry_id;

  if new.payment_method = 'COD' then
    /* Courier settles cash with merchant and customer directly; Kanjo records
     * its commission receivable, the discount expenses, the courier profit and
     * the net it owes the courier. */
    merchant_acct := app.party_account('1100', 'merchant', new.merchant_id);
    courier_acct  := app.party_account('2100', 'courier', new.courier_id);

    insert into app.journal_lines (entry_id, account_id, debit_minor, memo) values
      (entry_id, merchant_acct, m, 'عمولة مستحقة');

    if cp_platform > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5000'), cp_platform, 'خصم كوبون');
    end if;
    if w_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5300'), w_wallet, 'استرداد محفظة');
    end if;
    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5100'), k_cut, 'ربح المندوب');
    end if;

    courier_pay := cp_platform + w_wallet - d_fee + k_cut;
    if courier_pay > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, courier_acct, courier_pay, 'مستحق للمندوب');
    elsif courier_pay < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, courier_acct, -courier_pay, 'مستحق على المندوب');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if d_fee > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4100'), d_fee, 'إيراد توصيل');
    end if;
  else
    /* ONLINE: Kanjo already received the customer's money. The bank nets the
     * discounts; the merchant is owed the order minus vendor funding and
     * commission; the courier is owed the fixed profit. */
    bank_acct      := app.system_account('1000');
    merchant_acct  := app.party_account('2000', 'merchant', new.merchant_id);
    courier_acct   := app.party_account('2100', 'courier', new.courier_id);

    bank_line := o_val + d_fee - c_coupon - w_wallet;
    if bank_line > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, bank_acct, bank_line, 'تحصيل إلكتروني');
    elsif bank_line < 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, bank_acct, -bank_line, 'تحصيل إلكتروني');
    end if;

    if cp_platform > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5000'), cp_platform, 'خصم كوبون');
    end if;
    if w_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5300'), w_wallet, 'استرداد محفظة');
    end if;
    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5100'), k_cut, 'ربح المندوب');
    end if;

    merchant_line := o_val - cv_vendor - m;
    if merchant_line > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, merchant_acct, merchant_line, 'مستحق للتاجر');
    elsif merchant_line < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, merchant_acct, -merchant_line, 'مستحق على التاجر');
    end if;

    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, courier_acct, k_cut, 'مستحق للمندوب');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if d_fee > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4100'), d_fee, 'إيراد توصيل');
    end if;
  end if;

  /* Cashback never touches checkout cash; it becomes a customer wallet credit. */
  if cashback > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, app.system_account('5200'), cashback, 'كاش باك');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, app.system_account('2400'), cashback, 'رصيد محفظة العميل');
  end if;

  update app.operation_logs
     set journal_entry_id = entry_id
   where id = new.id;

  return null;
end;
$$;

comment on function app.operation_post_journal() is
  'Posts the balanced double-entry journal for a logged operation (COD and ONLINE).';

/* Replace the old clearinghouse routing trigger with the journal poster. */
drop trigger if exists operation_logs_route_ledgers on app.operation_logs;
drop function if exists app.operation_route_ledgers();

drop trigger if exists operation_logs_post_journal on app.operation_logs;
create trigger operation_logs_post_journal
after insert on app.operation_logs
for each row execute function app.operation_post_journal();

/* The journal_entry_id is written by the poster; the immutability guard would
 * otherwise reject that single, deliberate update. Allow it exactly once. */
create or replace function app.operation_log_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.journal_entry_id is null
     and new.journal_entry_id is not null
     and (to_jsonb(old) - 'journal_entry_id') = (to_jsonb(new) - 'journal_entry_id') then
    return new;
  end if;

  raise exception
    'OPERATION_IMMUTABLE: operations are append-only; log a correcting order instead'
    using errcode = '55000';
end;
$$;

commit;
