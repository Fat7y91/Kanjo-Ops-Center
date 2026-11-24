begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Manual attendance overrides must win over delivered orders.
 *
 * A day with a delivered order auto-posts the 165 EGP attendance base. When a
 * manager marks that same day غياب / بعذر, the override has to suppress the
 * base even though an `operation_logs` row still exists for the business day.
 * Previously the posting function only looked at orders, so changing a day from
 * present to absent left the 165 EGP journal entry behind and the courier kept
 * the working-day credit.
 *
 * Precedence for one (courier, day):
 *   1. manual `present`  → post / keep the 165 EGP base
 *   2. manual `absent`   → never post; delete any existing base
 *   3. manual `excused`  → never post; delete any existing base
 *   4. no manual row     → post only when a delivered order exists
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
  entry_id        uuid;
  courier_acct    uuid;
  source_key      text;
  v_manual_status text;
begin
  if p_courier_id is null or p_day is null then
    return null;
  end if;

  source_key := 'attendance:' || p_courier_id::text || ':' || p_day::text;

  select a.status
    into v_manual_status
    from app.courier_attendance a
   where a.courier_id = p_courier_id
     and a.attendance_date = p_day
   limit 1;

  if v_manual_status is not null then
    if v_manual_status <> 'present' then
      return null;
    end if;
  elsif not exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier_id
       and app.to_kanjo_business_day(o.occurred_at) = p_day
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
  v_key           text;
  v_manual_status text;
begin
  if p_courier is null or p_day is null then
    return;
  end if;

  select a.status
    into v_manual_status
    from app.courier_attendance a
   where a.courier_id = p_courier
     and a.attendance_date = p_day
   limit 1;

  if v_manual_status = 'present' then
    return;
  end if;

  if v_manual_status is null and exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier
       and (p_exclude is null or o.id <> p_exclude)
       and app.to_kanjo_business_day(o.occurred_at) = p_day
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
  v_key           text;
  v_manual_status text;
begin
  if p_courier_id is null or p_day is null then
    return null;
  end if;

  v_key := 'attendance:' || p_courier_id::text || ':' || p_day::text;

  select a.status
    into v_manual_status
    from app.courier_attendance a
   where a.courier_id = p_courier_id
     and a.attendance_date = p_day
   limit 1;

  if v_manual_status = 'present' then
    return app.post_courier_attendance_base(p_courier_id, p_day);
  end if;

  if v_manual_status is null and exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier_id
       and app.to_kanjo_business_day(o.occurred_at) = p_day
  ) then
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

create or replace function app.reconcile_courier_attendance_bases()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select courier_id, day
      from (
        select o.courier_id,
               app.to_kanjo_business_day(o.occurred_at) as day
          from app.operation_logs o
         where o.courier_id is not null
        union
        select a.courier_id,
               a.attendance_date as day
          from app.courier_attendance a
      ) days
     group by courier_id, day
  loop
    perform app.sync_courier_attendance_journal(r.courier_id, r.day);
  end loop;

  return (
    select count(*)::integer
      from app.journal_entries
     where source_type = 'courier_attendance'
  );
end;
$$;

grant execute on function app.post_courier_attendance_base(uuid, date)
  to service_role, authenticated;
grant execute on function app.sync_courier_attendance_journal(uuid, date)
  to service_role;
grant execute on function app.reconcile_courier_attendance_bases()
  to service_role, authenticated;

/* Reconcile every courier day so absent/excused overrides prune their base. */
do $$
begin
  perform app.reconcile_courier_attendance_bases();
end;
$$;

commit;
