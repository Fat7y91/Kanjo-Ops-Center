begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Restore the financial engine triggers.
 *
 * `ALTER TABLE ... DISABLE TRIGGER USER` switches off every non-internal
 * trigger on a table, not just the one named. A one-off cleanup script used it
 * to delete append-only test rows and committed without re-enabling, leaving
 * the whole ledger inert on the live database:
 *
 *   operation_logs : freeze_amounts, immutable_update, immutable_delete,
 *                    post_journal
 *   journal_entries: immutable_update, immutable_delete
 *   journal_lines  : balanced, immutable_update, immutable_delete
 *
 * The effect was silent data loss: operations saved successfully but never
 * froze amounts, never posted a journal entry, and never moved a party balance.
 * `enable trigger user` restores every user trigger (the exact scope
 * `disable trigger user` turned off) and is idempotent on already-enabled
 * triggers. `enable trigger all` is not usable here because it also targets
 * internal FK constraint triggers, which a non-superuser role may not touch.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.operation_logs enable trigger user;
alter table app.journal_entries enable trigger user;
alter table app.journal_lines enable trigger user;

/* Fail the migration loudly if any financial trigger is still disabled. This
 * turns a silent regression into a deployment error. */
do $$
declare
  disabled text;
begin
  select string_agg(format('%s.%s', c.relname, t.tgname), ', ' order by c.relname, t.tgname)
    into disabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal
     and n.nspname = 'app'
     and c.relname in ('operation_logs', 'journal_entries', 'journal_lines')
     and t.tgenabled = 'D';

  if disabled is not null then
    raise exception 'financial triggers still disabled after re-enable: %', disabled;
  end if;
end;
$$;

commit;
