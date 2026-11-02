begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Pillar 2 — operations logger and clearinghouse ledger.
 *
 * Every fulfilled order produces one `app.operation_logs` row. That row is the
 * immutable record of what happened, and it routes money to a separate
 * `app.financial_ledgers` table, which is *not* the treasury ledger:
 *
 *   treasury (`app.ledger_entries`)  cash the company actually holds.
 *   clearinghouse (`app.financial_ledgers`)  what the company owes to, or is
 *                                            owed by, merchants and couriers.
 *
 * The clearinghouse balance is signed, from Kanjo's point of view:
 *
 *   amount_minor > 0  Kanjo owes the party (payable).
 *   amount_minor < 0  the party owes Kanjo (receivable).
 *
 * Routing rules, exactly:
 *
 *   COD     merchant  -(commission)                 commission stays with Kanjo
 *           courier   -(delivery_fee - courier_cut) cash the courier collected
 *                                                    above his own cut
 *   ONLINE  merchant  +(order_value - commission)   Kanjo collected, owes them
 *           courier   +(courier_cut)                Kanjo owes the courier
 *
 * Commission and courier cut are frozen in a BEFORE INSERT trigger, so a later
 * edit to a merchant's rate can never rewrite an order that was already logged.
 * The AFTER INSERT trigger writes both ledger rows in the same transaction;
 * a retry cannot double-route because `operation_id` is unique per entity.
 *
 * Re-runnable: tables are created only when absent, every policy/trigger is
 * dropped before it is recreated, and the permission seed is an upsert.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Enums ─────────────────────────────────────────────────────────────── */

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'app' and t.typname = 'payment_method'
  ) then
    create type app.payment_method as enum ('COD', 'ONLINE');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'app' and t.typname = 'clearing_entity_type'
  ) then
    create type app.clearing_entity_type as enum ('merchant', 'courier');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'app' and t.typname = 'clearing_ledger_status'
  ) then
    create type app.clearing_ledger_status as enum ('pending', 'cleared');
  end if;
end;
$$;

/* ── 1. Couriers ─────────────────────────────────────────────────────────
 * A courier is an operator (clearance 1, title "المندوب") that also carries a
 * delivery roster row. Keeping the roster separate from `app.users` means the
 * identity table stays about authorization, and a courier can stop delivering
 * without losing their login.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.couriers (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null unique references app.users (id) on delete cascade,
  display_name        text        not null default '',
  courier_cut_percent numeric(6, 2) not null default 0
                      check (courier_cut_percent >= 0 and courier_cut_percent <= 100),
  active              boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table app.couriers
  add column if not exists id                  uuid        default gen_random_uuid(),
  add column if not exists user_id             uuid        references app.users (id) on delete cascade,
  add column if not exists display_name        text        not null default '',
  add column if not exists courier_cut_percent numeric(6, 2) not null default 0,
  add column if not exists active              boolean     not null default true,
  add column if not exists created_at          timestamptz not null default now(),
  add column if not exists updated_at          timestamptz not null default now();

comment on table app.couriers is
  'Delivery roster layered on app.users. The cut percent is the default share of the delivery fee the courier keeps.';
comment on column app.couriers.courier_cut_percent is
  'Default courier share of the delivery fee. Frozen onto every order at insert time.';

create unique index if not exists couriers_user_key on app.couriers (user_id);
create index if not exists couriers_active_idx on app.couriers (active);

/* ── 2. Operation log ────────────────────────────────────────────────────
 * The row is appended once and never edited. `order_id` is unique, so replaying
 * the same delivery cannot create a second set of payables.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.operation_logs (
  id                  uuid               primary key default gen_random_uuid(),
  order_id            text               not null,
  merchant_id         text               not null references app.merchants (id) on delete restrict,
  courier_id          uuid               not null references app.couriers (id) on delete restrict,
  payment_method      app.payment_method not null,
  currency            char(3)            not null default 'EGP',
  order_value_minor   bigint             not null,
  delivery_fee_minor  bigint             not null default 0,
  commission_percent  numeric(6, 2)      not null default 0,
  commission_minor    bigint             not null default 0,
  courier_cut_percent numeric(6, 2)      not null default 0,
  courier_cut_minor   bigint             not null default 0,
  note                text               not null default '',
  occurred_at         timestamptz        not null default now(),
  logged_by           uuid               references app.users (id) on delete set null,
  created_at          timestamptz        not null default now(),
  constraint operation_logs_order_present check (length(btrim(order_id)) > 0),
  constraint operation_logs_value_positive check (order_value_minor > 0),
  constraint operation_logs_delivery_non_negative check (delivery_fee_minor >= 0),
  constraint operation_logs_commission_range check (
    commission_percent >= 0 and commission_percent <= 100
  ),
  constraint operation_logs_cut_range check (
    courier_cut_percent >= 0 and courier_cut_percent <= 100
  ),
  constraint operation_logs_amounts_non_negative check (
    commission_minor >= 0 and courier_cut_minor >= 0
  ),
  constraint operation_logs_currency_allowed check (currency in ('EGP', 'SAR'))
);

alter table app.operation_logs
  add column if not exists id                  uuid               default gen_random_uuid(),
  add column if not exists order_id            text,
  add column if not exists merchant_id         text               references app.merchants (id) on delete restrict,
  add column if not exists courier_id          uuid               references app.couriers (id) on delete restrict,
  add column if not exists payment_method      app.payment_method,
  add column if not exists currency            char(3)            not null default 'EGP',
  add column if not exists order_value_minor   bigint,
  add column if not exists delivery_fee_minor  bigint             not null default 0,
  add column if not exists commission_percent  numeric(6, 2)      not null default 0,
  add column if not exists commission_minor    bigint             not null default 0,
  add column if not exists courier_cut_percent numeric(6, 2)      not null default 0,
  add column if not exists courier_cut_minor   bigint             not null default 0,
  add column if not exists note                text               not null default '',
  add column if not exists occurred_at         timestamptz        not null default now(),
  add column if not exists logged_by           uuid               references app.users (id) on delete set null,
  add column if not exists created_at          timestamptz        not null default now();

comment on table app.operation_logs is
  'Append-only record of a fulfilled order. Money terms are frozen at insert time.';
comment on column app.operation_logs.commission_minor is
  'Frozen commission in minor units. Resolved from the merchant rate when the caller does not supply a percent.';
comment on column app.operation_logs.courier_cut_minor is
  'Frozen courier share in minor units. Resolved from the courier default when the caller does not supply an amount.';

create unique index if not exists operation_logs_order_key
  on app.operation_logs (order_id);

create index if not exists operation_logs_merchant_idx
  on app.operation_logs (merchant_id, occurred_at desc);

create index if not exists operation_logs_courier_idx
  on app.operation_logs (courier_id, occurred_at desc);

/* ── 3. Freeze money terms before the row exists ─────────────────────────
 * Commission is derived from the merchant contract the moment the order is
 * logged: `agreed_commission` (locked at signing) wins, otherwise the target
 * rate. The courier cut falls back to the roster default. A caller-supplied
 * amount wins for the cut, which is how an ad-hoc delivery bonus is entered.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.operation_freeze_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_rate numeric(6, 2);
  courier_rate  numeric(6, 2);
begin
  select coalesce(agreed_commission, target_commission)
    into merchant_rate
    from app.merchants
   where id = new.merchant_id;

  if merchant_rate is null then
    raise exception
      'OPERATION_MERCHANT_MISSING: merchant % does not exist', new.merchant_id
      using errcode = '23503';
  end if;

  /* The merchant rate is captured even when the caller passes a percent: the
   * contract, not the form, decides what the order pays. */
  new.commission_percent := coalesce(merchant_rate, 0);
  new.commission_minor := round(new.order_value_minor * new.commission_percent / 100)::bigint;

  if new.courier_cut_minor is null or new.courier_cut_minor = 0 then
    select courier_cut_percent into courier_rate
      from app.couriers
     where id = new.courier_id;
    new.courier_cut_percent := coalesce(courier_rate, 0);
    new.courier_cut_minor :=
      round(new.delivery_fee_minor * new.courier_cut_percent / 100)::bigint;
  end if;

  return new;
end;
$$;

comment on function app.operation_freeze_amounts() is
  'Resolves the merchant commission and courier cut, then freezes both onto the operation row.';

drop trigger if exists operation_logs_freeze_amounts on app.operation_logs;
create trigger operation_logs_freeze_amounts
before insert on app.operation_logs
for each row execute function app.operation_freeze_amounts();

/* ── 4. Clearinghouse ledger ─────────────────────────────────────────────
 * Signed amount: positive = Kanjo owes the party, negative = the party owes
 * Kanjo. Settling never changes the amount; it only stamps the decision, so a
 * cleared row stays a faithful record of what was owed.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.financial_ledgers (
  id           uuid                      primary key default gen_random_uuid(),
  operation_id uuid                      not null references app.operation_logs (id) on delete restrict,
  entity_type  app.clearing_entity_type  not null,
  merchant_id  text                      references app.merchants (id) on delete restrict,
  courier_id   uuid                      references app.couriers (id) on delete restrict,
  amount_minor bigint                    not null,
  currency     char(3)                   not null default 'EGP',
  status       app.clearing_ledger_status not null default 'pending',
  receipt_url  text,
  cleared_by   uuid                      references app.users (id) on delete set null,
  cleared_at   timestamptz,
  created_at   timestamptz               not null default now(),
  constraint financial_ledgers_party_shape check (
    (entity_type = 'merchant' and merchant_id is not null and courier_id is null) or
    (entity_type = 'courier' and courier_id is not null and merchant_id is null)
  ),
  constraint financial_ledgers_cleared_shape check (
    (status = 'pending') = (cleared_at is null)
  ),
  constraint financial_ledgers_currency_allowed check (currency in ('EGP', 'SAR'))
);

alter table app.financial_ledgers
  add column if not exists id           uuid                       default gen_random_uuid(),
  add column if not exists operation_id uuid                       references app.operation_logs (id) on delete restrict,
  add column if not exists entity_type  app.clearing_entity_type,
  add column if not exists merchant_id  text                       references app.merchants (id) on delete restrict,
  add column if not exists courier_id   uuid                       references app.couriers (id) on delete restrict,
  add column if not exists amount_minor bigint,
  add column if not exists currency     char(3)                    not null default 'EGP',
  add column if not exists status       app.clearing_ledger_status not null default 'pending',
  add column if not exists receipt_url  text,
  add column if not exists cleared_by   uuid                       references app.users (id) on delete set null,
  add column if not exists cleared_at   timestamptz,
  add column if not exists created_at   timestamptz                not null default now();

comment on table app.financial_ledgers is
  'Clearinghouse movement per operation and party. Positive = Kanjo owes them; negative = they owe Kanjo.';
comment on column app.financial_ledgers.amount_minor is
  'Signed minor units. The sign is the direction of the debt, never part of the amount.';

/* Exactly one ledger row per party per operation: the routing trigger can be
 * re-run and still cannot double a payable. */
create unique index if not exists financial_ledgers_operation_party_key
  on app.financial_ledgers (operation_id, entity_type);

create index if not exists financial_ledgers_party_idx
  on app.financial_ledgers (entity_type, status, created_at desc);

create index if not exists financial_ledgers_merchant_idx
  on app.financial_ledgers (merchant_id, status);

create index if not exists financial_ledgers_courier_idx
  on app.financial_ledgers (courier_id, status);

/* ── 5. Route the two ledger rows in the same transaction ──────────────── */

create or replace function app.operation_route_ledgers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_amount bigint;
  courier_amount  bigint;
begin
  if new.payment_method = 'COD' then
    /* Cash was collected by the courier: the merchant's commission and the
     * excess delivery cash are both owed *to Kanjo*. */
    merchant_amount := -new.commission_minor;
    courier_amount  := -(new.delivery_fee_minor - new.courier_cut_minor);
  else
    /* Online money already reached Kanjo: the merchant is owed the order net of
     * commission, and the courier is owed his cut. */
    merchant_amount := new.order_value_minor - new.commission_minor;
    courier_amount  := new.courier_cut_minor;
  end if;

  insert into app.financial_ledgers (
    operation_id, entity_type, merchant_id, courier_id, amount_minor, currency
  ) values (
    new.id, 'merchant', new.merchant_id, null, merchant_amount, new.currency
  )
  on conflict (operation_id, entity_type) do nothing;

  insert into app.financial_ledgers (
    operation_id, entity_type, merchant_id, courier_id, amount_minor, currency
  ) values (
    new.id, 'courier', null, new.courier_id, courier_amount, new.currency
  )
  on conflict (operation_id, entity_type) do nothing;

  return null;
end;
$$;

comment on function app.operation_route_ledgers() is
  'Writes the merchant and courier clearinghouse rows for a logged operation. COD creates receivables; ONLINE creates payables.';

drop trigger if exists operation_logs_route_ledgers on app.operation_logs;
create trigger operation_logs_route_ledgers
after insert on app.operation_logs
for each row execute function app.operation_route_ledgers();

/* ── 6. Immutability ─────────────────────────────────────────────────────
 * An operation is history: no UPDATE, no DELETE. A clearinghouse row may move
 * from pending to cleared exactly once; money terms are frozen forever.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.operation_log_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'OPERATION_IMMUTABLE: operations are append-only; log a correcting order instead'
    using errcode = '55000';
end;
$$;

drop trigger if exists operation_logs_immutable_update on app.operation_logs;
create trigger operation_logs_immutable_update
before update on app.operation_logs
for each row execute function app.operation_log_guard();

drop trigger if exists operation_logs_immutable_delete on app.operation_logs;
create trigger operation_logs_immutable_delete
before delete on app.operation_logs
for each row execute function app.operation_log_guard();

create or replace function app.clearing_ledger_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'CLEARING_LEDGER_IMMUTABLE: clearinghouse rows cannot be deleted'
      using errcode = '55000';
  end if;

  if row(new.operation_id, new.entity_type, new.merchant_id, new.courier_id,
         new.amount_minor, new.currency)
     is distinct from
     row(old.operation_id, old.entity_type, old.merchant_id, old.courier_id,
         old.amount_minor, old.currency) then
    raise exception
      'CLEARING_LEDGER_IMMUTABLE: money terms cannot change after routing'
      using errcode = '55000';
  end if;

  if old.status = 'cleared' then
    raise exception
      'CLEARING_LEDGER_CLEARED: a settled row cannot change again'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status and new.status <> 'cleared' then
    raise exception
      'CLEARING_LEDGER_STATUS: pending rows can only move to cleared'
      using errcode = '23514';
  end if;

  if new.status = 'cleared' and new.cleared_at is null then
    new.cleared_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists financial_ledgers_guard_update on app.financial_ledgers;
create trigger financial_ledgers_guard_update
before update on app.financial_ledgers
for each row execute function app.clearing_ledger_guard();

drop trigger if exists financial_ledgers_guard_delete on app.financial_ledgers;
create trigger financial_ledgers_guard_delete
before delete on app.financial_ledgers
for each row execute function app.clearing_ledger_guard();

/* ── 7. Row Level Security ───────────────────────────────────────────────
 * Logging is a field capability; reading the book is a finance capability;
 * settling is a distinct decision, so an operator that may log an order cannot
 * also release its money. Small teams hold several of these at once; the split
 * exists so authority can be delegated without collapsing the two duties.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.couriers           enable row level security;
alter table app.operation_logs     enable row level security;
alter table app.financial_ledgers  enable row level security;

alter table app.couriers           force row level security;
alter table app.operation_logs     force row level security;
alter table app.financial_ledgers  force row level security;

drop policy if exists couriers_read_active on app.couriers;
create policy couriers_read_active on app.couriers
  for select to authenticated
  using (app.is_active_user());

drop policy if exists couriers_write_capable on app.couriers;
create policy couriers_write_capable on app.couriers
  for insert to authenticated
  with check (
    app.has_permission('log_operations') or
    app.has_permission('manage_system_users')
  );

drop policy if exists couriers_update_capable on app.couriers;
create policy couriers_update_capable on app.couriers
  for update to authenticated
  using (
    app.has_permission('log_operations') or
    app.has_permission('manage_system_users')
  )
  with check (
    app.has_permission('log_operations') or
    app.has_permission('manage_system_users')
  );

drop policy if exists operation_logs_read_capable on app.operation_logs;
create policy operation_logs_read_capable on app.operation_logs
  for select to authenticated
  using (
    app.has_permission('log_operations') or
    app.has_permission('view_clearinghouse') or
    app.has_permission('settle_clearinghouse')
  );

drop policy if exists operation_logs_insert_capable on app.operation_logs;
create policy operation_logs_insert_capable on app.operation_logs
  for insert to authenticated
  with check (app.has_permission('log_operations'));

drop policy if exists financial_ledgers_read_capable on app.financial_ledgers;
create policy financial_ledgers_read_capable on app.financial_ledgers
  for select to authenticated
  using (
    app.has_permission('view_clearinghouse') or
    app.has_permission('settle_clearinghouse')
  );

drop policy if exists financial_ledgers_settle_capable on app.financial_ledgers;
create policy financial_ledgers_settle_capable on app.financial_ledgers
  for update to authenticated
  using (app.has_permission('settle_clearinghouse'))
  with check (app.has_permission('settle_clearinghouse'));

grant select, insert, update on app.couriers to authenticated;
grant select, insert on app.operation_logs to authenticated;
grant select, update on app.financial_ledgers to authenticated;
grant select, insert, update, delete on app.couriers,
  app.operation_logs, app.financial_ledgers to service_role;

/* ── 8. Permission catalogue: three new keys ─────────────────────────────
 * `seed-users.ts` is the TypeScript source of truth; this block is the SQL
 * mirror, so a grant can be written against the foreign key.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('log_operations',    'تسجيل العمليات',   'تسجيل الطلبات المنفذة وطريقة التحصيل وحصة المندوب.', 'المقاصة والعمليات', 50),
  ('view_clearinghouse','عرض المقاصة',      'الاطلاع على المستحقات والمديونيات للتجار والمناديب.', 'المقاصة والعمليات', 51),
  ('settle_clearinghouse','تسوية المقاصة',  'اعتماد سداد أو تحصيل بند في المقاصة وإغلاقه.',        'المقاصة والعمليات', 52)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* Level 3 (executives, global scope) and Level 4 (supreme) receive the new
 * keys. Re-granting an existing key is a no-op. */
insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
 cross join (values
   ('log_operations'),
   ('view_clearinghouse'),
   ('settle_clearinghouse')
 ) as p(key)
 where u.active
   and u.clearance_level >= 3
on conflict (user_id, permission_key) do nothing;

/* Authorization changed, so open sessions must refetch. */
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3;

commit;
