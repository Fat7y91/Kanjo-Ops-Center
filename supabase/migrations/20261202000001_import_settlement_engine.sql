begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Import settlement engine: raw COD columns drive a balanced journal.
 *
 * The bulk orders export carries the real money terms of a COD order:
 * subtotal, discounts, shipping, tip, wallet, the cash actually collected and
 * the courier's fee. The legacy posting only knew `order_value × rate`, which
 * cannot represent a platform-funded discount or a courier remittance. For
 * settlement-driven rows this migration posts a dedicated, balanced COD entry
 * built from those raw amounts. Manual and legacy rows keep the old path.
 *
 * Documented assumptions (the export carries no funding flags):
 *   - Every customer discount (discount_amount, reward_discount_amount,
 *     shipping_discount) is platform-funded, so the merchant is paid subtotal.
 *   - `cod_collected_total` is the cash the courier holds; `amount_due` is
 *     recomputed as `expected_total − wallet_amount` and never trusted from a
 *     supplied `cod_amount_due_platform` column.
 *   - The courier remits `cod_collected − courier_fee − tip`; any gap between
 *     the collected cash and the expected total posts to suspense (`9999`) as a
 *     visible "فرق تحصيل" line, so the entry always balances.
 *   - All nets are signed and never zero-clamped.
 *
 * Idempotent: `add column if not exists`, `create or replace function`.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Raw settlement columns ─────────────────────────────────────────── */

alter table app.operation_logs
  add column if not exists settlement_driven     boolean  not null default false,
  add column if not exists discount_minor        bigint   not null default 0,
  add column if not exists reward_discount_minor bigint   not null default 0,
  add column if not exists shipping_discount_minor bigint not null default 0,
  add column if not exists tip_minor             bigint   not null default 0,
  add column if not exists wallet_amount_minor   bigint   not null default 0,
  add column if not exists expected_total_minor  bigint,
  add column if not exists amount_due_minor      bigint,
  add column if not exists cod_collected_minor   bigint,
  add column if not exists net_due_platform_minor bigint,
  add column if not exists delivered_at          date;

alter table app.operation_logs
  drop constraint if exists operation_logs_settlement_non_negative,
  add constraint operation_logs_settlement_non_negative check (
    discount_minor >= 0
    and reward_discount_minor >= 0
    and shipping_discount_minor >= 0
    and tip_minor >= 0
    and wallet_amount_minor >= 0
    and (cod_collected_minor is null or cod_collected_minor >= 0)
  );

comment on column app.operation_logs.settlement_driven is
  'True when the row was imported with raw COD columns and posts the settlement journal.';
comment on column app.operation_logs.net_due_platform_minor is
  'Signed platform position: cod_collected − subtotal − courier_fee. Positive = owed to platform. Never clamped.';
comment on column app.operation_logs.delivered_at is
  'Delivery date from the export when present; otherwise the order date.';

/* ── 2. Posting: settlement branch for raw COD rows ─────────────────────── */

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

  /* Settlement-driven terms (raw COD columns). */
  s_subtotal     bigint := coalesce(new.order_value_minor, 0);
  s_shipping     bigint := coalesce(new.delivery_fee_minor, 0);
  s_courier      bigint := coalesce(new.courier_cut_minor, 0);
  s_disc         bigint := coalesce(new.discount_minor, 0);
  s_reward       bigint := coalesce(new.reward_discount_minor, 0);
  s_shipdisc     bigint := coalesce(new.shipping_discount_minor, 0);
  s_tip          bigint := coalesce(new.tip_minor, 0);
  s_wallet       bigint := coalesce(new.wallet_amount_minor, 0);
  s_cod          bigint := coalesce(
                            new.cod_collected_minor,
                            new.amount_due_minor,
                            new.expected_total_minor,
                            0);
  s_payout       bigint;
  s_courier_cash bigint;
  s_disc_exp     bigint;
  s_residual     bigint;
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

  if new.settlement_driven and new.payment_method = 'COD' then
    /* Merchant proceeds: subtotal less the platform's commission. Discounts
     * are platform-funded by assumption, so they do not reduce this figure. */
    s_payout       := s_subtotal - m;
    /* Cash the courier must remit after keeping their fee and the tip. */
    s_courier_cash := s_cod - s_courier - s_tip;
    s_disc_exp     := s_disc + s_reward + s_shipdisc;

    /* Balances the entry even when a dirty export disagrees on the cash. */
    s_residual := (s_courier_cash + s_wallet + s_courier + s_disc_exp)
                  - (s_payout + m + s_shipping);

    merchant_acct := app.party_account('2000', 'merchant', new.merchant_id::text);
    courier_acct  := app.party_account('2100', 'courier', new.courier_id::text);

    if s_courier_cash > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, courier_acct, s_courier_cash, 'تحصيل COD لدى المندوب');
    elsif s_courier_cash < 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, courier_acct, -s_courier_cash, 'مستحق للمندوب');
    end if;

    if s_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('2400'), s_wallet, 'محفظة مطبقة');
    end if;
    if s_courier > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5100'), s_courier, 'ربح المندوب');
    end if;
    if s_disc_exp > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5000'), s_disc_exp, 'خصومات مدعومة من المنصة');
    end if;

    if s_payout > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, merchant_acct, s_payout, 'مستحق للتاجر');
    elsif s_payout < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, merchant_acct, -s_payout, 'مستحق على التاجر');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if s_shipping > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4100'), s_shipping, 'إيراد توصيل');
    end if;

    /* `s_residual` is debits − credits. A positive value means debits exceed
     * credits, so the suspense leg must be a credit; a negative value means
     * debits are short, so it must be a debit. */
    if s_residual > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('9999'), s_residual, 'فرق تحصيل COD');
    elsif s_residual < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('9999'), -s_residual, 'فرق تحصيل COD');
    end if;

  elsif new.payment_method = 'COD' then
    merchant_acct := app.party_account('1100', 'merchant', new.merchant_id::text);
    courier_acct  := app.party_account('2100', 'courier', new.courier_id::text);

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, merchant_acct, m, 'عمولة مستحقة');
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
    bank_acct      := app.system_account('1000');
    merchant_acct  := app.party_account('2000', 'merchant', new.merchant_id::text);
    courier_acct   := app.party_account('2100', 'courier', new.courier_id::text);

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

commit;
