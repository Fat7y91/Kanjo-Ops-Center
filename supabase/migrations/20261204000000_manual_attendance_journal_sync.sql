begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Manual attendance is a paid courier-day.
 *
 * Auto-attendance (any delivered order on the Cairo day) already posts the
 * fixed 165 EGP base through `post_courier_attendance_base`. A manager can also
 * mark a zero-order day present; that day must post the exact same double-entry
 * or Settlement, the executive KPIs, the courier profile and P&L disagree.
 *
 * The two write paths below keep the override row and its journal entry in one
 * transaction, keyed by `attendance:<courier>:<day>` so an order imported later
 * for the same day cannot double-post.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.post_courier_attendance_base(
  p_courier_id uuid,
  p_day        date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id     uuid;
  courier_acct uuid;
  source_key   text;
begin
  if p_courier_id is null or p_day is null then
    return null;
  end if;

  source_key := 'attendance:' || p_courier_id::text || ':' || p_day::text;

  /* Attended when a delivered order exists OR a manager marked the day present. */
  if not exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier_id
       and coalesce(o.delivered_at, app.cairo_day(o.occurred_at)) = p_day
  ) and not exists (
    select 1
      from app.courier_attendance a
     where a.courier_id = p_courier_id
       and a.attendance_date = p_day
       and a.status = 'present'
  ) then
    return null;
  end if;

  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency
  ) values (
    p_day,
    'حضور يومي ' || p_day::text,
    'courier_attendance',
    source_key,
    'EGP'
  )
  on conflict (source_type, source_id) where (source_id is not null)
  do nothing
  returning id into entry_id;

  /* Already posted for this courier/day. */
  if entry_id is null then
    return null;
  end if;

  courier_acct := app.party_account('2100', 'courier', p_courier_id::text);

  insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
  values (entry_id, app.system_account('5100'), 16500, 'أجر الحضور اليومي');

  insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
  values (entry_id, courier_acct, 16500, 'الحضور اليومي');

  return entry_id;
end;
$$;

/* A manual present day survives deleting the last delivered order of that day. */
create or replace function app.cleanup_orphan_attendance(
  p_courier  uuid,
  p_day      date,
  p_exclude  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_courier is null or p_day is null then
    return;
  end if;

  /* Another delivered order still marks the day attended. */
  if exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier
       and o.id <> p_exclude
       and coalesce(o.delivered_at, app.cairo_day(o.occurred_at)) = p_day
  ) then
    return;
  end if;

  /* A manager marked the day present by hand. */
  if exists (
    select 1
      from app.courier_attendance a
     where a.courier_id = p_courier
       and a.attendance_date = p_day
       and a.status = 'present'
  ) then
    return;
  end if;

  v_key := 'attendance:' || p_courier::text || ':' || p_day::text;

  perform set_config('app.hard_delete_orders', 'on', true);

  delete from app.transaction_receipts
   where entry_id in (
     select id from app.journal_entries
      where source_type = 'courier_attendance' and source_id = v_key
   );

  delete from app.journal_entries
   where source_type = 'courier_attendance' and source_id = v_key;
end;
$$;

/* Re-derive one day's entry from both attendance sources. */
create or replace function app.sync_courier_attendance_journal(
  p_courier_id uuid,
  p_day        date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key       text;
  v_delivered boolean;
  v_present   boolean;
begin
  if p_courier_id is null or p_day is null then
    return null;
  end if;

  v_key := 'attendance:' || p_courier_id::text || ':' || p_day::text;

  select exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier_id
       and coalesce(o.delivered_at, app.cairo_day(o.occurred_at)) = p_day
  ) into v_delivered;

  select exists (
    select 1
      from app.courier_attendance a
     where a.courier_id = p_courier_id
       and a.attendance_date = p_day
       and a.status = 'present'
  ) into v_present;

  if v_delivered or v_present then
    return app.post_courier_attendance_base(p_courier_id, p_day);
  end if;

  perform set_config('app.hard_delete_orders', 'on', true);

  delete from app.transaction_receipts
   where entry_id in (
     select id from app.journal_entries
      where source_type = 'courier_attendance' and source_id = v_key
   );

  delete from app.journal_entries
   where source_type = 'courier_attendance' and source_id = v_key;

  return null;
end;
$$;

/* One transaction for the override row and the journal it implies. */
create or replace function app.save_courier_attendance(
  p_courier_id uuid,
  p_day        date,
  p_status     text,
  p_note       text,
  p_created_by uuid
)
returns app.courier_attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row app.courier_attendance;
begin
  insert into app.courier_attendance (
    courier_id, attendance_date, status, note, created_by
  ) values (
    p_courier_id, p_day, p_status, coalesce(p_note, ''), p_created_by
  )
  on conflict (courier_id, attendance_date) do update
    set status = excluded.status,
        note = excluded.note,
        created_by = excluded.created_by
  returning * into v_row;

  perform app.sync_courier_attendance_journal(p_courier_id, p_day);

  return v_row;
end;
$$;

create or replace function app.delete_courier_attendance(
  p_courier_id uuid,
  p_day        date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app.courier_attendance
   where courier_id = p_courier_id
     and attendance_date = p_day;

  perform app.sync_courier_attendance_journal(p_courier_id, p_day);
end;
$$;

grant execute on function app.post_courier_attendance_base(uuid, date)
  to service_role, authenticated;
grant execute on function app.sync_courier_attendance_journal(uuid, date)
  to service_role;
grant execute on function app.save_courier_attendance(uuid, date, text, text, uuid)
  to service_role;
grant execute on function app.delete_courier_attendance(uuid, date)
  to service_role;

/* Backfill every existing manual present day that predates this migration. */
do $$
declare
  r record;
begin
  for r in
    select courier_id, attendance_date
      from app.courier_attendance
     where status = 'present'
  loop
    perform app.post_courier_attendance_base(r.courier_id, r.attendance_date);
  end loop;
end;
$$;

commit;
