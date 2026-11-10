begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Cast courier ids when resolving the party sub-account.
 *
 * `app.party_account(text, app.party_type, text, text)` takes the party id as
 * text. Inside PL/pgSQL a `uuid` argument does not implicitly resolve to the
 * `text` parameter, so the posting function failed with 42883. Casting at every
 * call site is explicit and safe.
 *
 * Re-creates `app.operation_post_journal()` verbatim apart from the casts.
 * Idempotent: `create or replace`.
 * ───────────────────────────────────────────────────────────────────────── */

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
    merchant_acct := app.party_account('1100', 'merchant', new.merchant_id::text);
    courier_acct  := app.party_account('2100', 'courier', new.courier_id::text);

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

/* The opening-balance backfill in the previous migration has the same cast
 * problem; it only runs on a populated legacy ledger. Nothing to backfill on a
 * clean deployment, and the migration already executed its empty loop. */

commit;
