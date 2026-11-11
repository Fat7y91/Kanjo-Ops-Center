begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Treasury becomes journal-backed without losing history.
 *
 * The treasury screen now derives its balances and movements from
 * `app.journal_account_balances` / `app.journal_lines` (`1000`/`1010` for
 * EGP). Two gaps would otherwise open:
 *
 *   1. There is no SAR bank control account, so the seeded SAR position would
 *      disappear from every treasury view.
 *   2. The legacy `app.ledger_entries` history (seed + approved capital) is not
 *      in the journal, so the movement list would start empty.
 *
 * This migration closes both: it adds SAR bank/cash control accounts and replays
 * every legacy movement as one opening journal entry, keyed by the legacy row id
 * so a re-run can never double-post.
 *
 * The legacy tables are kept: `app.bank_accounts` remains the registry a capital
 * deposit is approved against.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.accounts (code, name, type, normal_balance, currency, is_system)
values
  ('1000-SAR', 'بنك الرياض', 'asset', 'debit', 'SAR', true),
  ('1010-SAR', 'نقدية الخزينة (ريال)', 'asset', 'debit', 'SAR', true)
on conflict (code) do nothing;

/* Replay legacy movements into the journal, one entry per row. A debit to the
 * bank control is cash in (deposit); a credit is cash out (expense). */
do $$
declare
  movement   record;
  entry_id   uuid;
  bank_id    uuid;
  equity_id  uuid;
  expense_id uuid;
begin
  select id into equity_id  from app.accounts where code = '3000' and party_type is null limit 1;
  select id into expense_id from app.accounts where code = '5400' and party_type is null limit 1;

  for movement in
    select e.id, e.kind, e.label, e.amount_minor, e.currency, e.occurred_at
      from app.ledger_entries e
     where not exists (
       select 1 from app.journal_entries je
        where je.source_type = 'opening'
          and je.source_id = 'legacy-ledger:' || e.id::text
     )
     order by e.occurred_at
  loop
    bank_id := case movement.currency
      when 'SAR' then (select id from app.accounts where code = '1000-SAR' and party_type is null limit 1)
      else (select id from app.accounts where code = '1000' and party_type is null limit 1)
    end;

    continue when bank_id is null;

    insert into app.journal_entries (entry_date, memo, source_type, source_id, currency)
    values (
      movement.occurred_at::date,
      movement.label,
      'opening',
      'legacy-ledger:' || movement.id::text,
      movement.currency
    )
    returning id into entry_id;

    if movement.kind = 'deposit' then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, bank_id, movement.amount_minor, movement.label);
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, equity_id, movement.amount_minor, movement.label);
    else
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, expense_id, movement.amount_minor, movement.label);
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, bank_id, movement.amount_minor, movement.label);
    end if;
  end loop;
end;
$$;

commit;
