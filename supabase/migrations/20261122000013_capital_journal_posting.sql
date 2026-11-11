begin;

/* ─────────────────────────────────────────────────────────────────────────
 * A capital approval credits the journal, not only the legacy ledger.
 *
 * The treasury screen reads `1000`/`1000-SAR` from the journal. Approval used to
 * write only `app.ledger_entries`, so an approved founder deposit would never
 * move the bank balance the operator sees — the same disconnect the settlement
 * path had.
 *
 * This replaces the decide function so an approval writes the journal entry in
 * the same transaction. It keeps the legacy row and `ledger_entry_id` for the
 * audit trail, and reuses the bridge's source key (`legacy-ledger:<id>`) so the
 * one-off backfill can never double-post this deposit.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.capital_deposit_decide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id        uuid;
  journal_id      uuid;
  account_currency char(3);
  founder_name    text;
  bank_id         uuid;
  equity_id       uuid;
  journal_label   text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception
        'CAPITAL_DEPOSIT_PENDING_ONLY: a deposit is created pending and decided afterwards'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    if row(new.amount_minor, new.currency, new.founder_id, new.receipt_path)
       is distinct from
       row(old.amount_minor, old.currency, old.founder_id, old.receipt_path) then
      raise exception
        'CAPITAL_DEPOSIT_IMMUTABLE: amount, currency, founder and receipt cannot change after creation'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception
      'CAPITAL_DEPOSIT_DECIDED: a decided deposit cannot change again'
      using errcode = '23514';
  end if;

  if new.decided_by = old.founder_id then
    raise exception
      'CAPITAL_DEPOSIT_SELF_REVIEW: a founder cannot approve their own capital deposit'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.users where id = new.decided_by and active
  ) then
    raise exception
      'CAPITAL_DEPOSIT_REVIEWER_INVALID: the reviewer must be an active operator'
      using errcode = '23514';
  end if;

  if new.status = 'rejected' then
    if new.decided_by is null then
      raise exception
        'CAPITAL_DEPOSIT_REVIEWER_REQUIRED: a rejection must name the reviewer'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'approved' then
    if new.account_id is null then
      raise exception
        'CAPITAL_DEPOSIT_ACCOUNT_REQUIRED: approve against a treasury account'
        using errcode = '23514';
    end if;

    select currency into account_currency
      from app.bank_accounts where id = new.account_id;
    if account_currency is null then
      raise exception
        'CAPITAL_DEPOSIT_ACCOUNT_MISSING: the target account does not exist'
        using errcode = '23503';
    end if;
    if account_currency <> new.currency then
      raise exception
        'CAPITAL_DEPOSIT_CURRENCY_MISMATCH: deposit currency % must equal account currency %',
        new.currency, account_currency
        using errcode = '23514';
    end if;

    select full_name into founder_name from app.users where id = new.founder_id;
    journal_label := format(
      'إيداع رأسمالي — %s',
      coalesce(nullif(btrim(founder_name), ''), 'مؤسس')
    );

    /* Legacy row first, so the approval keeps its audit reference. The journal
     * source_id mirrors the bridge key, which makes the backfill idempotent. */
    insert into app.ledger_entries (
      account_id, kind, label, amount_minor, currency, occurred_at, recorded_by
    ) values (
      new.account_id,
      'deposit',
      journal_label,
      new.amount_minor,
      new.currency,
      now(),
      new.decided_by
    )
    returning id into entry_id;

    new.ledger_entry_id := entry_id;

    if not exists (
      select 1 from app.journal_entries
       where source_type = 'opening'
         and source_id = 'legacy-ledger:' || entry_id::text
    ) then
      bank_id := case new.currency
        when 'SAR' then (select id from app.accounts where code = '1000-SAR' and party_type is null limit 1)
        else (select id from app.accounts where code = '1000' and party_type is null limit 1)
      end;
      select id into equity_id from app.accounts where code = '3000' and party_type is null limit 1;

      if bank_id is not null and equity_id is not null then
        insert into app.journal_entries (entry_date, memo, source_type, source_id, currency)
        values (current_date, journal_label, 'opening', 'legacy-ledger:' || entry_id::text, new.currency)
        returning id into journal_id;

        insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
        values (journal_id, bank_id, new.amount_minor, journal_label);
        insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
        values (journal_id, equity_id, new.amount_minor, journal_label);
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

commit;
