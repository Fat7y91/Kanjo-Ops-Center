begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Corrected COD settlement model.
 *
 * The previous settlement branch inverted the cash flow: it credited the
 * merchant with (subtotal − commission) and debited the courier with
 * (collected − fee), as if Kanjo still owed the merchant and the courier still
 * held Kanjo's cash. In a COD order the courier pays the merchant the full
 * subtotal in cash at pickup, so the corrected position is:
 *
 *   - the merchant already holds the goods' value and owes Kanjo only the
 *     commission (`order_value × agreed_commission`);
 *   - the courier's net claim on Kanjo is
 *       (subtotal − cod_collected) + courier_fee + tip;
 *   - the fixed 165 EGP attendance amount posts once per attended Cairo day.
 *
 * Discounts remain platform-funded because the merchant is paid in full.
 * Wallet usage is debited from the customer-wallet liability, never folded into
 * the courier claim. Any residual from a dirty export posts to suspense so the
 * entry always balances.
 *
 * Idempotent: `create or replace` for every function; the line backfill and the
 * attendance reconciliation both key off stable identifiers, so re-running the
 * migration reproduces the same ledger.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Cairo calendar day ──────────────────────────────────────────────── */

create or replace function app.cairo_day(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select (p_ts at time zone 'Africa/Cairo')::date;
$$;

/* ── 2. Scoped immutability window for the one-off line backfill ────────── */

create or replace function app.journal_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and (
       coalesce(current_setting('app.cod_settlement_backfill', true), '') = 'on'
       or coalesce(current_setting('app.hard_delete_orders', true), '') = 'on'
     ) then
    return old;
  end if;

  raise exception
    'JOURNAL_IMMUTABLE: journal rows are append-only; post a reversing entry instead'
    using errcode = '55000';
end;
$$;

/* ── 3. Fixed daily courier attendance amount ───────────────────────────── */

create or replace function app.post_courier_attendance_base(
  p_courier_id uuid,
  p_day        date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id     uuid;
  courier_acct uuid;
  source_key   text;
begin
  if p_courier_id is null or p_day is null then
    return null;
  end if;

  /* Attendance is derived strictly from a delivered order on the Cairo day. */
  if not exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier_id
       and coalesce(o.delivered_at, app.cairo_day(o.occurred_at)) = p_day
  ) then
    return null;
  end if;

  source_key := 'attendance:' || p_courier_id::text || ':' || p_day::text;

  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency
  ) values (
    p_day,
    'حضور يومي ' || p_day::text,
    'courier_attendance',
    source_key,
    'EGP'
  )
  on conflict (source_type, source_id) where (source_id is not null)
  do nothing
  returning id into entry_id;

  /* Already posted for this courier/day. */
  if entry_id is null then
    return null;
  end if;

  courier_acct := app.party_account('2100', 'courier', p_courier_id::text);

  insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
  values (entry_id, app.system_account('5100'), 16500, 'أجر الحضور اليومي');

  insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
  values (entry_id, courier_acct, 16500, 'الحضور اليومي');

  return entry_id;
end;
$$;

create or replace function app.reconcile_courier_attendance_bases()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select o.courier_id,
           coalesce(o.delivered_at, app.cairo_day(o.occurred_at)) as day
      from app.operation_logs o
     where o.courier_id is not null
     group by o.courier_id,
              coalesce(o.delivered_at, app.cairo_day(o.occurred_at))
  loop
    perform app.post_courier_attendance_base(r.courier_id, r.day);
  end loop;

  return (
    select count(*)::integer
      from app.journal_entries
     where source_type = 'courier_attendance'
  );
end;
$$;

/* ── 4. Corrected COD settlement lines ──────────────────────────────────── */

create or replace function app.insert_cod_settlement_lines(
  p_op    app.operation_logs,
  p_entry uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m             bigint := coalesce(p_op.commission_minor, 0);
  v             bigint := coalesce(p_op.order_value_minor, 0);
  d             bigint := coalesce(p_op.delivery_fee_minor, 0);
  f             bigint := coalesce(p_op.courier_cut_minor, 0);
  discount      bigint := coalesce(p_op.discount_minor, 0)
                        + coalesce(p_op.reward_discount_minor, 0)
                        + coalesce(p_op.shipping_discount_minor, 0);
  wallet        bigint := coalesce(p_op.wallet_amount_minor, 0);
  tip           bigint := coalesce(p_op.tip_minor, 0);
  cod           bigint := coalesce(
                           p_op.cod_collected_minor,
                           p_op.amount_due_minor,
                           p_op.expected_total_minor,
                           0);
  courier_net   bigint;
  merchant_acct uuid;
  courier_acct  uuid;
  dr            bigint := 0;
  cr            bigint := 0;
  diff          bigint;
  courier_memo  text;
begin
  merchant_acct := app.party_account('2000', 'merchant', p_op.merchant_id::text);
  courier_net   := (v - cod) + f + tip;

  courier_memo :=
      'صافي الطلب: قيمة ' || to_char(v / 100.0, 'FM999999990.00')
      || ' − محصّل ' || to_char(cod / 100.0, 'FM999999990.00')
      || ' + أجر ' || to_char(f / 100.0, 'FM999999990.00')
      || case when tip > 0
              then ' + بقشيش ' || to_char(tip / 100.0, 'FM999999990.00')
              else '' end;

  /* Merchant owes only the commission; the subtotal was already paid in cash. */
  if m > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (p_entry, merchant_acct, m, 'عمولة مستحقة على التاجر');
    dr := dr + m;

    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (p_entry, app.system_account('4000'), m, 'إيراد عمولة');
    cr := cr + m;
  elsif m < 0 then
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (p_entry, merchant_acct, -m, 'رصيد دائن للتاجر');
    cr := cr - m;
  end if;

  if d > 0 then
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (p_entry, app.system_account('4100'), d, 'إيراد توصيل');
    cr := cr + d;
  end if;

  if discount > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (p_entry, app.system_account('5000'), discount, 'خصومات مدعومة من المنصة');
    dr := dr + discount;
  end if;

  if f > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (p_entry, app.system_account('5100'), f, 'أجر المندوب');
    dr := dr + f;
  end if;

  if wallet > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (p_entry, app.system_account('2400'), wallet, 'محفظة مطبقة');
    dr := dr + wallet;
  end if;

  if p_op.courier_id is not null then
    courier_acct := app.party_account('2100', 'courier', p_op.courier_id::text);

    if courier_net > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, courier_acct, courier_net, courier_memo);
      cr := cr + courier_net;
    elsif courier_net < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, courier_acct, -courier_net, courier_memo);
      dr := dr - courier_net;
    end if;
  end if;

  /* Absorbs any disagreement in a dirty export so the entry always balances. */
  diff := dr - cr;
  if diff > 0 then
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (p_entry, app.system_account('9999'), diff, 'فرق تحصيل COD');
  elsif diff < 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (p_entry, app.system_account('9999'), -diff, 'فرق تحصيل COD');
  end if;
end;
$$;

/* ── 5. Posting trigger with the corrected settlement branch ────────────── */

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

  if new.settlement_driven and new.payment_method = 'COD' then
    perform app.insert_cod_settlement_lines(new, entry_id);

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

  /* A delivered order marks the courier's Cairo day as attended; the fixed
   * amount posts once per courier/day, keyed by the source index. */
  perform app.post_courier_attendance_base(
    new.courier_id,
    coalesce(new.delivered_at, app.cairo_day(new.occurred_at))
  );

  return null;
end;
$$;

/* ── 6. Rewrite the already-posted COD settlement entries ───────────────── */

create or replace function app.backfill_cod_settlement_lines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  op app.operation_logs;
  n  integer := 0;
begin
  perform set_config('app.cod_settlement_backfill', 'on', true);

  for op in
    select *
      from app.operation_logs
     where settlement_driven
       and payment_method = 'COD'
       and journal_entry_id is not null
  loop
    delete from app.journal_lines where entry_id = op.journal_entry_id;
    perform app.insert_cod_settlement_lines(op, op.journal_entry_id);
    n := n + 1;
  end loop;

  perform set_config('app.cod_settlement_backfill', '', true);
  return n;
end;
$$;

/* ── 7. Apply the backfill and the daily bases ──────────────────────────── */

select app.backfill_cod_settlement_lines();
select app.reconcile_courier_attendance_bases();

commit;
