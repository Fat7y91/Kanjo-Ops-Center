begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Order lifecycle and per-order commission controls.
 *
 * Three operational gaps are closed here:
 *
 *   1. Hard-deleting an order returned 500 because the BEFORE DELETE trigger
 *      removed the journal entry while the order row still referenced it
 *      (`operation_logs.journal_entry_id`). The FK is now deferrable, so the
 *      check runs at commit when both rows are gone. The trigger also removes
 *      the courier's 165 EGP attendance entry when the deleted order was the
 *      last delivered order on that Cairo day, and refuses to delete an order
 *      already covered by a posted settlement (409 at the API edge).
 *
 *   2. The posting logic is extracted to `insert_operation_journal_lines()` so
 *      a single order can be re-posted without duplicating the branch logic.
 *
 *   3. `edit_operation_commission()` rewrites the commission on one order only,
 *      re-posts that order's lines, and leaves every other order untouched.
 *      Changing a merchant's contract rate never reaches back: commission is
 *      frozen per order at insert time, so only an explicit per-order edit
 *      moves an old posting.
 *
 * Idempotent: `create or replace`; the two production corrections short-circuit
 * when the target already carries the requested values.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Defer the journal FK so a cascade can leave both rows gone ───────── */

alter table app.operation_logs
  drop constraint if exists operation_logs_journal_entry_id_fkey;

alter table app.operation_logs
  add constraint operation_logs_journal_entry_id_fkey
  foreign key (journal_entry_id) references app.journal_entries (id)
  deferrable initially deferred;

/* ── 2. Immutability windows ────────────────────────────────────────────── */

create or replace function app.journal_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and (
       coalesce(current_setting('app.cod_settlement_backfill', true), '') = 'on'
       or coalesce(current_setting('app.hard_delete_orders', true), '') = 'on'
       or coalesce(current_setting('app.edit_order_commission', true), '') = 'on'
     ) then
    return old;
  end if;

  raise exception
    'JOURNAL_IMMUTABLE: journal rows are append-only; post a reversing entry instead'
    using errcode = '55000';
end;
$$;

create or replace function app.operation_log_guard()
returns trigger
language plpgsql
as $$
begin
  /* The live database drifted and still carries an IMMUTABLE DELETE trigger
   * that runs this function. Deleting is governed by the dedicated delete
   * trigger and by `delete_orders`; the guard governs updates only. */
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.journal_entry_id is null
     and new.journal_entry_id is not null
     and (to_jsonb(old) - 'journal_entry_id') = (to_jsonb(new) - 'journal_entry_id') then
    return new;
  end if;

  /* The per-order commission editor may change only these columns, and only
   * while its transaction-scoped flag is set. */
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.edit_order_commission', true), '') = 'on'
     and (to_jsonb(old) - 'commission_percent' - 'commission_minor' - 'merchant_id')
       = (to_jsonb(new) - 'commission_percent' - 'commission_minor' - 'merchant_id') then
    return new;
  end if;

  raise exception
    'OPERATION_IMMUTABLE: operations are append-only; log a correcting order instead'
    using errcode = '55000';
end;
$$;

/* Remove the drifted delete guard; the dedicated delete trigger owns cleanup. */
drop trigger if exists operation_logs_immutable_delete on app.operation_logs;

/* ── 3. Extract the line builder from the posting trigger ───────────────── */

create or replace function app.insert_operation_journal_lines(
  p_op    app.operation_logs,
  p_entry uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_acct  uuid;
  courier_acct   uuid;
  bank_acct      uuid;
  m              bigint := p_op.commission_minor;
  d_fee          bigint := p_op.delivery_fee_minor;
  o_val          bigint := p_op.order_value_minor;
  c_coupon       bigint := p_op.coupon_discount_minor;
  cp_platform    bigint := p_op.coupon_platform_funded_minor;
  cv_vendor      bigint := p_op.coupon_vendor_funded_minor;
  w_wallet       bigint := p_op.wallet_discount_minor;
  k_cut          bigint := p_op.courier_cut_minor;
  cashback       bigint := p_op.coupon_cashback_minor;
  courier_pay    bigint;
  merchant_line  bigint;
  bank_line      bigint;
begin
  if p_op.settlement_driven and p_op.payment_method = 'COD' then
    perform app.insert_cod_settlement_lines(p_op, p_entry);

  elsif p_op.payment_method = 'COD' then
    merchant_acct := app.party_account('1100', 'merchant', p_op.merchant_id::text);
    courier_acct  := app.party_account('2100', 'courier', p_op.courier_id::text);

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, merchant_acct, m, 'عمولة مستحقة');
    end if;

    if cp_platform > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, app.system_account('5000'), cp_platform, 'خصم كوبون');
    end if;
    if w_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, app.system_account('5300'), w_wallet, 'استرداد محفظة');
    end if;
    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, app.system_account('5100'), k_cut, 'ربح المندوب');
    end if;

    courier_pay := cp_platform + w_wallet - d_fee + k_cut;
    if courier_pay > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, courier_acct, courier_pay, 'مستحق للمندوب');
    elsif courier_pay < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, courier_acct, -courier_pay, 'مستحق على المندوب');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if d_fee > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, app.system_account('4100'), d_fee, 'إيراد توصيل');
    end if;
  else
    bank_acct      := app.system_account('1000');
    merchant_acct  := app.party_account('2000', 'merchant', p_op.merchant_id::text);
    courier_acct   := app.party_account('2100', 'courier', p_op.courier_id::text);

    bank_line := o_val + d_fee - c_coupon - w_wallet;
    if bank_line > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, bank_acct, bank_line, 'تحصيل إلكتروني');
    elsif bank_line < 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, bank_acct, -bank_line, 'تحصيل إلكتروني');
    end if;

    if cp_platform > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, app.system_account('5000'), cp_platform, 'خصم كوبون');
    end if;
    if w_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, app.system_account('5300'), w_wallet, 'استرداد محفظة');
    end if;
    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, app.system_account('5100'), k_cut, 'ربح المندوب');
    end if;

    merchant_line := o_val - cv_vendor - m;
    if merchant_line > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, merchant_acct, merchant_line, 'مستحق للتاجر');
    elsif merchant_line < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (p_entry, merchant_acct, -merchant_line, 'مستحق على التاجر');
    end if;

    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, courier_acct, k_cut, 'مستحق للمندوب');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if d_fee > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (p_entry, app.system_account('4100'), d_fee, 'إيراد توصيل');
    end if;
  end if;

  if cashback > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (p_entry, app.system_account('5200'), cashback, 'كاش باك');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (p_entry, app.system_account('2400'), cashback, 'رصيد محفظة العميل');
  end if;
end;
$$;

create or replace function app.operation_post_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
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

  perform app.insert_operation_journal_lines(new, entry_id);

  update app.operation_logs
     set journal_entry_id = entry_id
   where id = new.id;

  perform app.post_courier_attendance_base(
    new.courier_id,
    coalesce(new.delivered_at, app.cairo_day(new.occurred_at))
  );

  return null;
end;
$$;

/* ── 4. Per-order commission editor ─────────────────────────────────────── */

create or replace function app.edit_operation_commission(
  p_identifier  text,
  p_rate        numeric,
  p_merchant_id text default null,
  p_actor       uuid   default null
)
returns table (
  operation_id       uuid,
  order_id           text,
  commission_percent numeric,
  commission_minor   bigint,
  merchant_id        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  op        app.operation_logs;
  v_rate    numeric(6, 2);
  v_minor   bigint;
  v_merchant text;
begin
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception
      'COMMISSION_RATE_INVALID: rate must be between 0 and 100'
      using errcode = '23514';
  end if;
  v_rate := round(p_rate, 2);

  select * into op
    from app.operation_logs o
   where o.id::text = p_identifier or o.order_id = p_identifier
   limit 1;

  if op.id is null then
    raise exception 'ORDER_NOT_FOUND: order % does not exist', p_identifier
      using errcode = 'P0002';
  end if;

  v_merchant := coalesce(p_merchant_id, op.merchant_id);
  v_minor    := round(op.order_value_minor * v_rate / 100)::bigint;

  if v_rate = op.commission_percent and v_merchant = op.merchant_id then
    return query
      select op.id, op.order_id, op.commission_percent, op.commission_minor, op.merchant_id;
    return;
  end if;

  perform set_config('app.edit_order_commission', 'on', true);

  update app.operation_logs
     set commission_percent = v_rate,
         commission_minor   = v_minor,
         merchant_id        = v_merchant
   where id = op.id;

  select * into op from app.operation_logs where id = op.id;

  if op.journal_entry_id is not null then
    /* Line rewrite, not a reversal: the order's single posting must show the
     * new rate. No other entry is touched. */
    delete from app.journal_lines where entry_id = op.journal_entry_id;
    perform app.insert_operation_journal_lines(op, op.journal_entry_id);
  end if;

  perform set_config('app.edit_order_commission', '', true);

  return query
    select op.id, op.order_id, op.commission_percent, op.commission_minor, op.merchant_id;
end;
$$;

grant execute on function app.edit_operation_commission(text, numeric, text, uuid)
  to service_role;

/* ── 5. Orphan attendance cleanup ───────────────────────────────────────── */

create or replace function app.cleanup_orphan_attendance(
  p_courier  uuid,
  p_day      date,
  p_exclude  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_courier is null or p_day is null then
    return;
  end if;

  /* Another delivered order still marks the day attended. */
  if exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier
       and o.id <> p_exclude
       and coalesce(o.delivered_at, app.cairo_day(o.occurred_at)) = p_day
  ) then
    return;
  end if;

  v_key := 'attendance:' || p_courier::text || ':' || p_day::text;

  perform set_config('app.hard_delete_orders', 'on', true);

  delete from app.transaction_receipts
   where entry_id in (
     select id from app.journal_entries
      where source_type = 'courier_attendance' and source_id = v_key
   );

  delete from app.journal_entries
   where source_type = 'courier_attendance' and source_id = v_key;
end;
$$;

/* ── 6. Order delete: cleanup posting and attendance, block settled orders ─ */

create or replace function app.operation_delete_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posting uuid := old.journal_entry_id;
  order_day date := coalesce(old.delivered_at, app.cairo_day(old.occurred_at));
begin
  /* An order already included in a posted settlement must not silently change
   * the books; the API turns this marker into a 409. */
  if exists (
    select 1
      from app.journal_entries je
      join app.journal_lines jl on jl.entry_id = je.id
      join app.accounts a on a.id = jl.account_id
     where je.source_type in ('merchant_settlement', 'courier_payout')
       and je.entry_date >= order_day
       and (
         (a.party_type = 'merchant' and a.party_id = old.merchant_id)
         or (old.courier_id is not null
             and a.party_type = 'courier' and a.party_id = old.courier_id::text)
       )
  ) then
    raise exception
      'ORDER_LOCKED_IN_SETTLEMENT: هذا الطلب ضمن تسوية نهائية مرحّلة ولا يمكن حذفه.'
      using errcode = '55000';
  end if;

  if posting is not null then
    perform set_config('app.hard_delete_orders', 'on', true);

    delete from app.transaction_receipts where entry_id = posting;
    delete from app.transaction_receipts
     where entry_id in (
       select id from app.journal_entries where reverses_entry_id = posting
     );
    delete from app.journal_entries where reverses_entry_id = posting;
    delete from app.journal_entries where id = posting;
  end if;

  return old;
end;
$$;

/* Attendance is reconciled after the row is gone: with a multi-row delete the
 * first row's trigger still sees its siblings, so only the last row to leave a
 * courier/day can decide the 165 EGP basis should disappear. */
create or replace function app.operation_cleanup_attendance_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.cleanup_orphan_attendance(
    old.courier_id,
    coalesce(old.delivered_at, app.cairo_day(old.occurred_at)),
    old.id
  );
  return old;
end;
$$;

drop trigger if exists operation_logs_cleanup_attendance on app.operation_logs;
create trigger operation_logs_cleanup_attendance
after delete on app.operation_logs
for each row execute function app.operation_cleanup_attendance_after_delete();

/* ── 7. Production corrections ──────────────────────────────────────────── */

do $$
begin
  if exists (select 1 from app.operation_logs where order_id = '149340') then
    /* The order was imported against an archived zero-rate duplicate; move it
     * to the active signed contract (15%) so the receivable lands on the
     * merchant the directory and clearinghouse show. */
    perform app.edit_operation_commission('149340', 15.00, 'KJ-XVRT4Q', null);
  end if;

  if exists (select 1 from app.operation_logs where order_id = '149428') then
    perform app.edit_operation_commission('149428', 12.00, null, null);
  end if;
end;
$$;

commit;
