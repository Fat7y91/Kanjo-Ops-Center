begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Hard delete for order rows, replacing the tombstone pattern.
 *
 * A hidden row still owns its `order_id`, so a corrected CSV could never be
 * re-imported. The PO requires a true delete. The order's journal posting is
 * removed in the same transaction, otherwise the ledger would keep a balance
 * for an order that no longer exists.
 * ───────────────────────────────────────────────────────────────────────── */

/* The delete guard is dropped, the update guard stays: history is still
 * append-only except for the explicit hard-delete path below. */
drop trigger if exists operation_logs_immutable_delete on app.operation_logs;

/* The server repository deletes with the service role. */
grant delete on app.operation_logs to service_role;

/* Journal rows remain immutable for every ordinary caller. The operation
 * delete trigger opens a transaction-scoped window before removing its own
 * posting, so a direct journal delete is still refused. */
create or replace function app.journal_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.hard_delete_orders', true), '') = 'on' then
    return old;
  end if;

  raise exception
    'JOURNAL_IMMUTABLE: journal rows are append-only; post a reversing entry instead'
    using errcode = '55000';
end;
$$;

/* Attached to the operation row so the posting disappears with the order. The
 * flag is transaction-local; journal delete guards accept the cascade only for
 * this statement. Reversal children are removed first because that FK is
 * `on delete restrict`. */
create or replace function app.operation_delete_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posting uuid := old.journal_entry_id;
begin
  if posting is null then
    return old;
  end if;

  perform set_config('app.hard_delete_orders', 'on', true);

  delete from app.transaction_receipts where entry_id = posting;
  delete from app.transaction_receipts
   where entry_id in (
     select id from app.journal_entries where reverses_entry_id = posting
   );
  delete from app.journal_entries where reverses_entry_id = posting;
  delete from app.journal_entries where id = posting;

  return old;
end;
$$;

drop trigger if exists operation_logs_delete_journal on app.operation_logs;
create trigger operation_logs_delete_journal
before delete on app.operation_logs
for each row execute function app.operation_delete_journal_entry();

/* Convert soft-deleted rows into real deletes before retiring the tombstone
 * table, so orders hidden under the old pattern do not reappear. */
delete from app.operation_logs
 where id in (select operation_id from app.operation_log_deletions);

/* The permission now means a permanent delete, not a hidden row. */
update app.permissions
   set label       = 'حذف الطلبات',
       description = 'حذف الطلبات المحددة نهائياً من سجل الطلبات ومقاصتها.'
 where key = 'delete_orders';

/* The tombstone table and its grants are no longer part of the model. */
drop table if exists app.operation_log_deletions;

commit;
