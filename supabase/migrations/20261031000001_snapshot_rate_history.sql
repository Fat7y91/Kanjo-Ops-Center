begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Snapshot rate history.
 *
 * `app.kpi_snapshots` froze the amount (`calculated_salary`) but not the fee
 * schedule that produced it. Once `app.commission_rates` is edited, an older
 * slip can no longer be reconciled: the reader has the total but not the
 * inputs. Accounting requires the inputs.
 *
 * This migration adds the two rates that produced each snapshot and extends the
 * immutability guard to cover them:
 *
 *   - new rows must supply both rates (the writer copies the live schedule);
 *   - once a row exists, both rates are frozen like the amounts they produced.
 *
 * Pre-existing rows stay NULL rather than being backfilled. Their true rate is
 * unrecoverable — the writer read the live schedule and kept no history — and
 * inventing a number would put false evidence into the ledger. NULL here means
 * "calculated before rate history existed", which is the honest record.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.kpi_snapshots
  add column if not exists applied_merchant_rate numeric(12, 2),
  add column if not exists applied_item_rate     numeric(12, 2);

comment on column app.kpi_snapshots.applied_merchant_rate is
  'Merchant activation fee in force when this snapshot was calculated. Frozen with the row. NULL only for rows written before rate history existed.';
comment on column app.kpi_snapshots.applied_item_rate is
  'Per-photo / per-item fee in force when this snapshot was calculated. Frozen with the row. NULL only for rows written before rate history existed.';

alter table app.kpi_snapshots
  drop constraint if exists kpi_snapshots_applied_merchant_rate_non_negative,
  drop constraint if exists kpi_snapshots_applied_item_rate_non_negative,
  add constraint kpi_snapshots_applied_merchant_rate_non_negative
    check (applied_merchant_rate is null or applied_merchant_rate >= 0),
  add constraint kpi_snapshots_applied_item_rate_non_negative
    check (applied_item_rate is null or applied_item_rate >= 0);

/* ── Guard, extended ─────────────────────────────────────────────────────
 * The function is replaced, not duplicated: the existing trigger resolves it by
 * name, so the new body takes effect immediately.
 *
 * INSERT: the applied rates are mandatory, so a snapshot can never be written
 * without the schedule that produced it again.
 * UPDATE: the rates join the measured amounts that can never change after lock.
 * The rest of the contract is unchanged: `locked_at` is fixed and a paid
 * snapshot cannot be reopened.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.kpi_snapshots_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.applied_merchant_rate is null or new.applied_item_rate is null then
      raise exception
        'KPI_SNAPSHOT_RATES_REQUIRED: snapshots must record the merchant and item rates applied'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.rep_id                   is distinct from old.rep_id
     or new.month_year              is distinct from old.month_year
     or new.new_merchants_activated is distinct from old.new_merchants_activated
     or new.items_added             is distinct from old.items_added
     or new.calculated_salary       is distinct from old.calculated_salary
     or new.applied_merchant_rate   is distinct from old.applied_merchant_rate
     or new.applied_item_rate       is distinct from old.applied_item_rate then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: measured amounts and applied rates cannot be modified after lock'
      using errcode = '23514';
  end if;

  if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: locked_at cannot be changed once the snapshot is locked'
      using errcode = '23514';
  end if;

  if old.status = 'paid' and new.status is distinct from 'paid' then
    raise exception
      'KPI_SNAPSHOT_STATUS_REGRESSION: a paid snapshot cannot be reopened'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.kpi_snapshots_guard() is
  'Requires applied rates on insert; freezes amounts, applied rates and locked_at; allows only pending -> paid on status.';

drop trigger if exists kpi_snapshots_guard on app.kpi_snapshots;
create trigger kpi_snapshots_guard
before insert or update on app.kpi_snapshots
for each row execute function app.kpi_snapshots_guard();

commit;
