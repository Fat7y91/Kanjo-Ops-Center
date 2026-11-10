begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Clearinghouse settlement as a journal entry.
 *
 * The clearinghouse shows each merchant/courier ledger account whose derived
 * balance is non-zero: a credit balance is a payable (Kanjo owes the party), a
 * debit balance is a receivable (the party owes Kanjo). Settling an account
 * posts a balanced entry that moves exactly the outstanding balance against the
 * bank, and never mutates history:
 *
 *   payable    (credit balance = −balance_minor):
 *       Dr party account   |balance|
 *       Cr Bank            |balance|
 *
 *   receivable (debit balance = +balance_minor):
 *       Dr Bank            balance
 *       Cr party account   balance
 *
 * A receipt may be attached in the same transaction, so it is visible wherever
 * the settlement entry is. Idempotency does not apply: settlements are manual
 * and repeated, so `source_id` is left null on purpose.
 *
 * SECURITY DEFINER because it posts journal rows that RLS otherwise only lets
 * `post_journal_entries` holders write. Callable by the service role.
 * ───────────────────────────────────────────────────────────────────────── */

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
  acct            app.accounts;
  bal             bigint;
  bank_id         uuid;
  entry_id        uuid;
  source          app.journal_source;
  label           text;
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

  select coalesce(sum(debit_minor), 0) - coalesce(sum(credit_minor), 0)
    into bal
    from app.journal_lines
   where account_id = p_account_id;

  if bal = 0 then
    raise exception 'SETTLEMENT_ZERO_BALANCE: account % has nothing outstanding', p_account_id
      using errcode = '23514';
  end if;

  bank_id := app.system_account('1000');
  source  := case acct.party_type
    when 'courier' then 'courier_payout'::app.journal_source
    else 'merchant_settlement'::app.journal_source
  end;
  label := 'تسوية ' || acct.name;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (current_date, label, source, acct.currency, p_actor)
  returning id into entry_id;

  if bal < 0 then
    /* Credit balance: Kanjo owes the party. Debit the payable, credit bank. */
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, -bal, 'سداد مستحق');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, bank_id, -bal, 'سداد من البنك');
  else
    /* Debit balance: the party owes Kanjo. Debit bank, credit the receivable. */
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
  'Settles a party ledger account by posting a balanced journal entry against the bank, optionally attaching a receipt.';

commit;
