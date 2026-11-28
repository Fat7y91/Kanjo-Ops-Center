begin;

/* Executive manual bonus / adjustment posting.
 *
 * Balances stay derived from the journal. A credit to a party is an expense
 * (bonus) and a credit to their payable account; a debit is a recovery credited
 * to operational income. The party account is the existing merchant/courier
 * sub-account, so the statement, clearinghouse and settlement totals all move
 * together in one balanced entry. */

insert into app.accounts (code, name, type, normal_balance, currency, is_system) values
  ('5110', 'مصروف مكافآت وحوافز المناديب', 'expense', 'debit', 'EGP', true),
  ('5210', 'مصروف تسويات ومكافآت التجار', 'expense', 'debit', 'EGP', true),
  ('4900', 'إيرادات وتسويات تشغيلية أخرى', 'revenue', 'credit', 'EGP', true)
on conflict (code) do nothing;

create or replace function app.post_manual_adjustment(
  p_account_id   uuid,
  p_direction    text,
  p_amount_minor bigint,
  p_entry_date   date,
  p_reason       text,
  p_actor        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct      app.accounts;
  contra_id uuid;
  entry_id  uuid;
  reason    text;
  label     text;
begin
  reason := btrim(coalesce(p_reason, ''));

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'ADJUSTMENT_AMOUNT_INVALID: amount must be positive'
      using errcode = '23514';
  end if;
  if reason = '' then
    raise exception 'ADJUSTMENT_REASON_REQUIRED: explanation is required'
      using errcode = '23514';
  end if;
  if p_direction not in ('credit', 'debit') then
    raise exception 'ADJUSTMENT_DIRECTION_INVALID: %', p_direction
      using errcode = '23514';
  end if;

  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'ADJUSTMENT_ACCOUNT_MISSING: account % does not exist', p_account_id
      using errcode = '23503';
  end if;
  if acct.party_type is null then
    raise exception 'ADJUSTMENT_NOT_A_PARTY: account % is a control account', p_account_id
      using errcode = '23514';
  end if;
  if acct.party_type not in ('merchant', 'courier') then
    raise exception 'ADJUSTMENT_PARTY_TYPE_UNSUPPORTED: %', acct.party_type
      using errcode = '23514';
  end if;

  label := 'مكافأة / تسوية: ' || reason;

  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency, created_by
  ) values (
    coalesce(p_entry_date, current_date),
    label,
    'manual_adjustment',
    null,
    acct.currency,
    p_actor
  )
  returning id into entry_id;

  if p_direction = 'credit' then
    contra_id := app.system_account(
      case acct.party_type when 'courier' then '5110' else '5210' end
    );
    if contra_id is null then
      raise exception 'ADJUSTMENT_EXPENSE_ACCOUNT_MISSING'
        using errcode = '23503';
    end if;

    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, contra_id, p_amount_minor, label);
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, label);
  else
    contra_id := app.system_account('4900');
    if contra_id is null then
      raise exception 'ADJUSTMENT_INCOME_ACCOUNT_MISSING'
        using errcode = '23503';
    end if;

    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, label);
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, contra_id, p_amount_minor, label);
  end if;

  return entry_id;
end;
$$;

comment on function app.post_manual_adjustment(uuid, text, bigint, date, text, uuid) is
  'Posts a balanced manual bonus (credit) or deduction (debit) against an existing merchant/courier ledger account.';

revoke all on function app.post_manual_adjustment(uuid, text, bigint, date, text, uuid) from public;
grant execute on function app.post_manual_adjustment(uuid, text, bigint, date, text, uuid)
  to authenticated, service_role;

commit;
