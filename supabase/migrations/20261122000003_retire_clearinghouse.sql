begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Retire the clearinghouse subledger.
 *
 * `app.financial_ledgers` was a per-party payable/receivable subledger. The
 * double-entry journal is now the single source of truth, so the subledger is
 * migrated into `opening` journal entries and then removed:
 *
 *   - every party with a non-zero net balance becomes one opening entry that
 *     states exactly what Kanjo owed or was owed on cut-over;
 *   - the routing/guard triggers and the table itself are dropped.
 *
 * History on this deployment is empty (0 operation logs, 0 ledger rows), so the
 * backfill is a no-op guard, but the statements are written to be correct on a
 * populated database too.
 *
 * Idempotent: the backfill is skipped when the table is already gone, and every
 * drop is guarded.
 * ───────────────────────────────────────────────────────────────────────── */

do $$
declare
  party record;
  entry_id uuid;
  account_id uuid;
  amount bigint;
begin
  if to_regclass('app.financial_ledgers') is null then
    return;
  end if;

  for party in
    select
      entity_type,
      coalesce(merchant_id::text, courier_id::text) as party_id,
      currency,
      sum(amount_minor)::bigint as net_minor
    from app.financial_ledgers
    group by entity_type, coalesce(merchant_id::text, courier_id::text), currency
    having sum(amount_minor) <> 0
  loop
    amount := party.net_minor;

    insert into app.journal_entries (
      entry_date, memo, source_type, source_id, currency
    ) values (
      current_date,
      'رصيد افتتاحي من دفتر المقاصة السابق',
      'opening',
      'clearinghouse:' || party.entity_type || ':' || party.party_id,
      party.currency
    )
    returning id into entry_id;

    /* Positive = Kanjo owed the party (payable under 2100/2000);
     * negative = the party owed Kanjo (receivable under 1100/1200). */
    if party.entity_type = 'merchant' then
      account_id := app.party_account('2000', 'merchant', party.party_id);
    else
      account_id := app.party_account('2100', 'courier', party.party_id);
    end if;

    if amount > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, account_id, amount, 'رصيد افتتاحي');
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      select entry_id, app.system_account('9999'), amount, 'رصيد افتتاحي'
      where amount > 0;
    else
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, account_id, -amount, 'رصيد افتتاحي');
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      select entry_id, app.system_account('9999'), -amount, 'رصيد افتتاحي';
    end if;
  end loop;
end;
$$;

/* Drop the old subledger: triggers, guard function, table, and its enums. */
drop trigger if exists financial_ledgers_guard_update on app.financial_ledgers;
drop trigger if exists financial_ledgers_guard_delete on app.financial_ledgers;

drop policy if exists financial_ledgers_read_capable on app.financial_ledgers;
drop policy if exists financial_ledgers_settle_capable on app.financial_ledgers;

drop table if exists app.financial_ledgers;

drop function if exists app.clearing_ledger_guard();

drop type if exists app.clearing_ledger_status;
drop type if exists app.clearing_entity_type;

/* The clearinghouse receipt routing now lives on `app.transaction_receipts`,
 * attached to the journal entry that replaced the ledger row. */

commit;
