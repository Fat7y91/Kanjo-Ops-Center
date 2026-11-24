begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Keep the real delivery clock on an operation.
 *
 * The bulk CSV import used to truncate `delivered_at` to a date, so an order
 * delivered at 20:14 Cairo was stored as midnight UTC (02:00 Cairo) and the
 * 14:00→14:00 operating-day cutoff moved it to the previous business day. The
 * column was also typed `date`, which made the exact minute impossible to keep.
 *
 * This migration:
 *   1. retypes `delivered_at` to `timestamptz`;
 *   2. lets the immutability guard accept a *timestamp-only* heal when the
 *      transaction-local flag `app.heal_operation_timestamp` is on;
 *   3. adds `app.heal_operation_timestamps(jsonb)` so a re-import can correct
 *      the delivery/operating instants of orders already posted without
 *      touching any frozen money term;
 *   4. reconciles the attendance base of the affected courier days.
 *
 * Idempotent: the retype is guarded, the rest is `create or replace`.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. delivered_at: date → timestamptz ────────────────────────────────── */

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'app'
       and table_name = 'operation_logs'
       and column_name = 'delivered_at'
       and data_type = 'date'
  ) then
    alter table app.operation_logs
      alter column delivered_at type timestamptz
      using (delivered_at::timestamp at time zone 'Africa/Cairo');
  end if;
end;
$$;

/* ── 2. Guard: allow a timestamp-only heal under an explicit flag ───────── */

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

  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.heal_operation_timestamp', true), 'off') = 'on'
     and (to_jsonb(old) - 'occurred_at' - 'delivered_at')
         = (to_jsonb(new) - 'occurred_at' - 'delivered_at') then
    return new;
  end if;

  raise exception
    'OPERATION_IMMUTABLE: operations are append-only; log a correcting order instead'
    using errcode = '55000';
end;
$$;

/* ── 3. Heal timestamps for already-posted orders ───────────────────────── */

create or replace function app.heal_operation_timestamps(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r              record;
  v_row          record;
  v_occurred     timestamptz;
  v_delivered    timestamptz;
  v_old_day      date;
  v_new_day      date;
  v_healed       integer := 0;
begin
  if p_rows is null then
    return 0;
  end if;

  for r in
    select (e->>'order_id') as order_id,
           nullif(e->>'occurred_at', '')::timestamptz as occurred_at,
           nullif(e->>'delivered_at', '')::timestamptz as delivered_at
      from jsonb_array_elements(p_rows) as e
  loop
    if r.order_id is null then
      continue;
    end if;
    if r.occurred_at is null and r.delivered_at is null then
      continue;
    end if;

    select id, courier_id, occurred_at, delivered_at,
           app.to_kanjo_business_day(occurred_at) as old_day
      into v_row
      from app.operation_logs
     where order_id = r.order_id;

    if not found then
      continue;
    end if;

    v_occurred := coalesce(r.occurred_at, v_row.occurred_at);
    v_delivered := coalesce(r.delivered_at, v_row.delivered_at);

    if v_occurred = v_row.occurred_at
       and v_delivered is not distinct from v_row.delivered_at then
      continue;
    end if;

    v_old_day := v_row.old_day;
    v_new_day := app.to_kanjo_business_day(v_occurred);

    perform set_config('app.heal_operation_timestamp', 'on', true);

    update app.operation_logs
       set occurred_at = v_occurred,
           delivered_at = v_delivered
     where id = v_row.id;

    perform set_config('app.heal_operation_timestamp', 'off', true);

    v_healed := v_healed + 1;

    if v_row.courier_id is not null and v_new_day <> v_old_day then
      perform app.cleanup_orphan_attendance(v_row.courier_id, v_old_day, null);
      perform app.sync_courier_attendance_journal(v_row.courier_id, v_new_day);
    end if;
  end loop;

  return v_healed;
end;
$$;

revoke all on function app.heal_operation_timestamps(jsonb) from public;
grant execute on function app.heal_operation_timestamps(jsonb) to service_role;

commit;
