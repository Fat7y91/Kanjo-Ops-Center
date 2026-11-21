begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Partial clearinghouse settlement.
 *
 * The full settlement (`app.post_settlement`) zeroes a party account. Finance
 * sometimes releases only part of what is owed — a merchant settles 20k of a
 * 22k balance and the remainder stays open. This function adds that as a new,
 * explicitly bounded operation rather than loosening the full one:
 *
 *   - the caller supplies the amount to settle;
 *   - it must be strictly greater than zero;
 *   - it must not exceed the outstanding balance (a stale screen cannot
 *     overpay, because the balance is recomputed here from the journal);
 *   - the entry posts against the EGP bank and the party account exactly like a
 *     full settlement, just for the requested amount.
 *
 * A full settlement remains one call to `post_settlement`; a partial one is
 * always distinguishable in the voucher by the entry memo.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.post_partial_settlement(
  p_account_id   uuid,
  p_amount_minor bigint,
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
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'SETTLEMENT_AMOUNT_POSITIVE: amount must be greater than zero'
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

  /* The amount may not exceed the outstanding balance. Compared against the
   * absolute value because the sign tells the direction, not the size. */
  if p_amount_minor > abs(bal) then
    raise exception
      'SETTLEMENT_AMOUNT_EXCEEDS_BALANCE: amount % is greater than the outstanding balance %',
      p_amount_minor, abs(bal)
      using errcode = '23514';
  end if;

  bank_id := app.system_account('1000');
  source  := case acct.party_type
    when 'courier' then 'courier_payout'::app.journal_source
    else 'merchant_settlement'::app.journal_source
  end;
  label := 'تسوية جزئية ' || acct.name;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (current_date, label, source, 'EGP', p_actor)
  returning id into entry_id;

  if bal < 0 then
    /* Credit balance: Kanjo owes the party. Debit the payable, credit bank. */
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, 'سداد جزئي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, bank_id, p_amount_minor, 'سداد جزئي من البنك');
  else
    /* Debit balance: the party owes Kanjo. Debit bank, credit the receivable. */
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, bank_id, p_amount_minor, 'تحصيل جزئي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, 'تحصيل جزئي من الطرف');
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

comment on function app.post_partial_settlement(uuid, bigint, uuid, text, text, text, integer) is
  'Settles part of a party ledger account, bounded by its outstanding balance, optionally attaching a receipt.';

grant execute on function app.post_partial_settlement(uuid, bigint, uuid, text, text, text, integer)
  to service_role;

commit;
