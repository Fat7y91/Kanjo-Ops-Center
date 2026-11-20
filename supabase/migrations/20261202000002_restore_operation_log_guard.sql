begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Restore the operation immutability guard.
 *
 * The live database drifted from `20261122000002`: `app.operation_log_guard()`
 * was replaced with an unconditional "any UPDATE is forbidden" body. The
 * posting trigger writes `journal_entry_id` back onto the row it just inserted,
 * so that body rejects every operation and no order can be posted at all.
 *
 * This restores the intended rule: an operator can never edit a posted order,
 * but the poster may fill the single `journal_entry_id` exactly once. Rows that
 * already carry a posting, and any other column change, are still rejected.
 *
 * Idempotent: `create or replace function`.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.operation_log_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.journal_entry_id is null
     and new.journal_entry_id is not null
     and (to_jsonb(old) - 'journal_entry_id') = (to_jsonb(new) - 'journal_entry_id') then
    return new;
  end if;

  raise exception
    'OPERATION_IMMUTABLE: operations are append-only; log a correcting order instead'
    using errcode = '55000';
end;
$$;

commit;
