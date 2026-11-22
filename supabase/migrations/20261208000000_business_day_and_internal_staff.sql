begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Kanjo operating business day + internal delivery staff.
 *
 * 1. The operating day runs 14:00 → 14:00 Africa/Cairo. Every timestamp that
 *    decides courier daily pay, working days or P&L daily grouping resolves
 *    through `app.to_kanjo_business_day`, never the plain calendar date.
 *    A delivery at 02:30 on 20 Nov belongs to the 19 Nov operating day.
 *
 * 2. A courier can be marked internal (currently ZEMBAWY). Internal partners
 *    still carry their orders and merchant commissions, but the settlement and
 *    P&L surfaces can exclude their payable (165 base + tiered per-order fee).
 *
 * Idempotent: `create or replace`, `if not exists`, and the final reconcile
 * only inserts attendance entries that are missing.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Operating business day ──────────────────────────────────────────── */

create or replace function app.to_kanjo_business_day(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select ((p_ts at time zone 'Africa/Cairo') - interval '14 hours')::date;
$$;

comment on function app.to_kanjo_business_day(timestamptz) is
  'Kanjo operating day: Cairo wall clock shifted back 14 hours, so the day runs 14:00 → 14:00.';

/* ── 2. Internal delivery partner flag ──────────────────────────────────── */

alter table app.couriers
  add column if not exists is_internal_staff boolean not null default false;

comment on column app.couriers.is_internal_staff is
  'Internal delivery partner: orders and merchant commission stay in the books, courier payable can be excluded from settlement and P&L.';

update app.couriers
   set is_internal_staff = true
 where id = '90016c3b-df75-4a75-b5d2-c46fb71e375a'
    or upper(coalesce(display_name, '')) like '%ZEMBAWY%';

/* ── 3. Attendance base derives from the operating day ──────────────────── */

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

  if not exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier_id
       and coalesce(o.delivered_at, app.to_kanjo_business_day(o.occurred_at)) = p_day
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
  v_key text;
begin
  if p_courier is null or p_day is null then
    return;
  end if;

  if exists (
    select 1
      from app.operation_logs o
     where o.courier_id = p_courier
       and o.id <> p_exclude
       and coalesce(o.delivered_at, app.to_kanjo_business_day(o.occurred_at)) = p_day
  ) then
    return;
  end if;

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
       and coalesce(o.delivered_at, app.to_kanjo_business_day(o.occurred_at)) = p_day
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
    select o.courier_id,
           coalesce(o.delivered_at, app.to_kanjo_business_day(o.occurred_at)) as day
      from app.operation_logs o
     where o.courier_id is not null
     group by o.courier_id,
              coalesce(o.delivered_at, app.to_kanjo_business_day(o.occurred_at))
  loop
    perform app.post_courier_attendance_base(r.courier_id, r.day);
  end loop;

  return (
    select count(*)::integer
      from app.journal_entries
     where source_type = 'courier_attendance'
  );
end;
$$;

/* ── 4. Order triggers resolve the same operating day ───────────────────── */

create or replace function app.operation_post_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
begin
  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency, created_by
  ) values (
    new.occurred_at::date,
    'عملية ' || new.order_id,
    'operation',
    new.id::text,
    new.currency,
    new.logged_by
  )
  returning id into entry_id;

  perform app.insert_operation_journal_lines(new, entry_id);

  update app.operation_logs
     set journal_entry_id = entry_id
   where id = new.id;

  perform app.post_courier_attendance_base(
    new.courier_id,
    coalesce(new.delivered_at, app.to_kanjo_business_day(new.occurred_at))
  );

  return null;
end;
$$;

create or replace function app.operation_delete_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posting uuid := old.journal_entry_id;
  order_day date := coalesce(old.delivered_at, app.to_kanjo_business_day(old.occurred_at));
begin
  if exists (
    select 1
      from app.journal_entries je
      join app.journal_lines jl on jl.entry_id = je.id
      join app.accounts a on a.id = jl.account_id
     where je.source_type in ('merchant_settlement', 'courier_payout')
       and je.entry_date >= order_day
       and (
         (a.party_type = 'merchant' and a.party_id = old.merchant_id)
         or (old.courier_id is not null
             and a.party_type = 'courier' and a.party_id = old.courier_id::text)
       )
  ) then
    raise exception
      'ORDER_LOCKED_IN_SETTLEMENT: هذا الطلب ضمن تسوية نهائية مرحّلة ولا يمكن حذفه.'
      using errcode = '55000';
  end if;

  if posting is not null then
    perform set_config('app.hard_delete_orders', 'on', true);

    delete from app.transaction_receipts where entry_id = posting;
    delete from app.transaction_receipts
     where entry_id in (
       select id from app.journal_entries where reverses_entry_id = posting
     );
    delete from app.journal_entries where reverses_entry_id = posting;
    delete from app.journal_entries where id = posting;
  end if;

  return old;
end;
$$;

create or replace function app.operation_cleanup_attendance_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.cleanup_orphan_attendance(
    old.courier_id,
    coalesce(old.delivered_at, app.to_kanjo_business_day(old.occurred_at)),
    old.id
  );
  return old;
end;
$$;

/* ── 5. Reconcile existing attendance under the new day boundary ────────── */

do $$
begin
  perform app.reconcile_courier_attendance_bases();
end;
$$;

commit;
