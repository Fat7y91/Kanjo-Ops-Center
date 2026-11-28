begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Attendance business day must come from the full timestamptz.
 *
 * `app.operation_logs.delivered_at` is a `date`, not a `timestamptz`. The first
 * business-day migration coalesced it ahead of `occurred_at`, so a delivery at
 * 02:30 Cairo on 22 Nov stamped `delivered_at = 2026-11-22` and produced a
 * ghost `حضور يومي 2026-11-22` even though the operating day was 21 Nov.
 *
 * This migration makes every attendance decision read `occurred_at`, prunes
 * entries that no longer have an order or a manual present override on their
 * business day, then reconciles the correct days back in.
 *
 * Idempotent: `create or replace`, plus a prune that only deletes genuinely
 * unsupported entries.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Attendance base: operating day from the real timestamp ──────────── */

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
       and app.to_kanjo_business_day(o.occurred_at) = p_day
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
       and (p_exclude is null or o.id <> p_exclude)
       and app.to_kanjo_business_day(o.occurred_at) = p_day
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
       and app.to_kanjo_business_day(o.occurred_at) = p_day
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
           app.to_kanjo_business_day(o.occurred_at) as day
      from app.operation_logs o
     where o.courier_id is not null
     group by o.courier_id,
              app.to_kanjo_business_day(o.occurred_at)
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

/* ── 2. Order triggers use the same timestamp-only day ──────────────────── */

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
    app.to_kanjo_business_day(new.occurred_at)
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
  order_day date := app.to_kanjo_business_day(old.occurred_at);
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
    app.to_kanjo_business_day(old.occurred_at),
    old.id
  );
  return old;
end;
$$;

/* ── 3. Prune every unsupported attendance entry, then reconcile ────────── */

do $$
declare
  r record;
  v_courier uuid;
  v_day date;
begin
  for r in
    select distinct source_id
      from app.journal_entries
     where source_type = 'courier_attendance'
       and source_id ~ '^attendance:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$'
  loop
    v_courier := split_part(r.source_id, ':', 2)::uuid;
    v_day := split_part(r.source_id, ':', 3)::date;
    perform app.cleanup_orphan_attendance(v_courier, v_day, null);
  end loop;

  perform app.reconcile_courier_attendance_bases();
end;
$$;

commit;
