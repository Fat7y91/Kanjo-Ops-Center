begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Bank movements post to the journal.
 *
 * The treasury screen now reads its balances and history from the journal, so
 * a "deposit" or "expense" recorded there must reach the same book. This adds a
 * single posting function and the one expense contra account it needs:
 *
 *   deposit : Dr <bank/cash>   Cr 3000 equity   (capital in)
 *   expense : Dr 5400 operating Cr <bank/cash>
 *
 * The bank/cash account is an asset control account, so a debit is money in and
 * a credit is money out. Every entry balances to zero and is append-only, like
 * every other journal entry.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.accounts (code, name, type, normal_balance, currency, is_system)
values ('5400', 'مصروفات تشغيلية', 'expense', 'debit', 'EGP', true)
on conflict (code) do nothing;

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
    acct.currency,
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

commit;
