begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Enterprise KPI Vault.
 *
 * V2 computes KPI in memory from field-ops/catalog stores, and attributes
 * catalog work to a *team* because products carry no author. This migration
 * lays the database foundation the vault needs:
 *
 *   1. Per-record attribution (`app.merchants.first_entry_by`,
 *      `app.catalog_products.created_by`) instead of the team proxy.
 *   2. Editable commission rates, so fees are data rather than constants.
 *   3. Immutable, RLS-governed monthly snapshots for payroll.
 *
 * Merchants and products currently exist only in the in-memory stores, so the
 * mirror tables are created here. They are additive: no existing table is
 * altered except by `add column if not exists`, and no application code reads
 * them yet. `city_id` deliberately carries no foreign key (cities live in
 * Firestore), matching the cross-database rule in ARCHITECTURE §8.4.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Clearance helper ─────────────────────────────────────────────────────
 * The existing `app.has_permission()` answers capability questions. The vault
 * policies need a rank question instead ("is the caller at least L3?").
 * SECURITY DEFINER, for the same reason as the other RBAC helpers: reading
 * app.users from a policy on app.users-family tables must not recurse.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.has_min_clearance(p_level integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.users u
    where u.id = auth.uid()
      and u.active
      and u.clearance_level >= p_level
  );
$$;

comment on function app.has_min_clearance(integer) is
  'True when the caller is an active operator at or above the given clearance rank.';

grant execute on function app.has_min_clearance(integer) to authenticated, service_role;

/* ── 1. Granular attribution ───────────────────────────────────────────── */

create table if not exists app.merchants (
  id                  text        primary key,
  name                text        not null,
  normalized_name     text        not null default '',
  vendor_type_id      integer,
  vendor_type         text        not null default '',
  team                text,
  city_id             text        not null,
  target_commission   numeric(6, 2) not null default 0
                      check (target_commission >= 0 and target_commission <= 100),
  monthly_value_minor bigint      not null default 0 check (monthly_value_minor >= 0),
  strategic_notes     text        not null default '',
  contract_state      text        not null default 'no_agreement'
                      check (contract_state in (
                        'no_agreement', 'provisional',
                        'final_contract', 'signed_contract'
                      )),
  agreed_commission   numeric(6, 2)
                      check (agreed_commission is null
                             or (agreed_commission >= 0 and agreed_commission <= 100)),
  edit_unlocked       boolean     not null default false,
  last_visit_at       timestamptz,
  first_entry_by      uuid        references app.users (id) on delete set null,
  first_entry_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint merchants_city_present check (length(btrim(city_id)) > 0),
  /* Attribution is a pair: an author without a timestamp, or the reverse, is
   * meaningless and would make the activation audit ambiguous. */
  constraint merchants_first_entry_paired
    check ((first_entry_by is null) = (first_entry_at is null))
);

comment on table app.merchants is
  'SQL mirror of the field-ops merchant record, plus first-touch attribution.';
comment on column app.merchants.city_id is
  'Firestore city document id. No FK by design: cross-database reference.';
comment on column app.merchants.first_entry_by is
  'Operator who first registered the merchant. Replaces the team-level KPI proxy.';
comment on column app.merchants.monthly_value_minor is
  'Monthly value in minor units, never a float.';

/* Defensive: if the table already existed from an earlier draft, the
 * attribution columns still have to be present. */
alter table app.merchants
  add column if not exists first_entry_by uuid references app.users (id) on delete set null,
  add column if not exists first_entry_at timestamptz;

drop trigger if exists merchants_touch_updated_at on app.merchants;
create trigger merchants_touch_updated_at
before update on app.merchants
for each row execute function app.touch_updated_at();

create index if not exists merchants_city_idx on app.merchants (city_id);
create index if not exists merchants_first_entry_idx on app.merchants (first_entry_by);

create table if not exists app.catalog_products (
  id               text        primary key,
  merchant_id      text        not null references app.merchants (id) on delete cascade,
  name             text        not null,
  description      text        not null default '',
  sku              text,
  barcode          text,
  image_data_url   text,
  price_minor      bigint      not null default 0 check (price_minor >= 0),
  state            text        not null default 'draft',
  created_by       uuid        references app.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table app.catalog_products is
  'SQL mirror of the catalog product record, with per-product authorship.';
comment on column app.catalog_products.created_by is
  'Operator who created the product. Makes photo/entry credit per-rep, not per-team.';
comment on column app.catalog_products.price_minor is
  'Price in minor units, never a float.';

alter table app.catalog_products
  add column if not exists created_by uuid references app.users (id) on delete set null;

drop trigger if exists catalog_products_touch_updated_at on app.catalog_products;
create trigger catalog_products_touch_updated_at
before update on app.catalog_products
for each row execute function app.touch_updated_at();

create index if not exists catalog_products_merchant_idx
  on app.catalog_products (merchant_id);
create index if not exists catalog_products_created_by_idx
  on app.catalog_products (created_by);

/* ── RLS on the mirrors: operators read, service role writes ────────────── */

alter table app.merchants          enable row level security;
alter table app.catalog_products   enable row level security;
alter table app.merchants          force  row level security;
alter table app.catalog_products   force  row level security;

drop policy if exists merchants_read_active on app.merchants;
create policy merchants_read_active on app.merchants
  for select to authenticated
  using (app.is_active_user());

drop policy if exists catalog_products_read_active on app.catalog_products;
create policy catalog_products_read_active on app.catalog_products
  for select to authenticated
  using (app.is_active_user());

grant select on app.merchants, app.catalog_products to authenticated;
grant select, insert, update, delete on app.merchants, app.catalog_products
  to service_role;

/* ── 2. Dynamic commission rates ─────────────────────────────────────────
 * Previously the activation fee and per-photo fee were implicit constants.
 * Making them rows means Finance can change a rate without a deploy while
 * every historical snapshot keeps the amount it was calculated with.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.commission_rates (
  id                      uuid        primary key default gen_random_uuid(),
  merchant_activation_fee numeric(12, 2) not null default 50
                          check (merchant_activation_fee >= 0),
  photo_item_fee          numeric(12, 2) not null default 1
                          check (photo_item_fee >= 0),
  updated_by              uuid        references app.users (id) on delete set null,
  updated_at              timestamptz not null default now()
);

comment on table app.commission_rates is
  'Editable KPI fee schedule. Snapshots copy the applied figures, so edits here never rewrite history.';

create or replace function app.commission_rates_singleton()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from app.commission_rates) then
    raise exception
      'COMMISSION_RATES_SINGLETON: only one rates row may exist; update it instead'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists commission_rates_single_row on app.commission_rates;
create trigger commission_rates_single_row
before insert on app.commission_rates
for each row execute function app.commission_rates_singleton();

/* Seed the default row only when the schedule is absent. A conditional insert
 * is required because the singleton trigger fires BEFORE INSERT, so an
 * `on conflict do nothing` would still be rejected on a re-run. */
do $$
begin
  if not exists (select 1 from app.commission_rates) then
    insert into app.commission_rates (merchant_activation_fee, photo_item_fee)
    values (50, 1);
  end if;
end;
$$;

drop trigger if exists commission_rates_touch_updated_at on app.commission_rates;
create trigger commission_rates_touch_updated_at
before update on app.commission_rates
for each row execute function app.touch_updated_at();

alter table app.commission_rates enable row level security;
alter table app.commission_rates force  row level security;

drop policy if exists commission_rates_read_active on app.commission_rates;
create policy commission_rates_read_active on app.commission_rates
  for select to authenticated
  using (app.is_active_user());

drop policy if exists commission_rates_write_l4 on app.commission_rates;
create policy commission_rates_write_l4 on app.commission_rates
  for update to authenticated
  using (app.has_min_clearance(4))
  with check (app.has_min_clearance(4));

grant select, update on app.commission_rates to authenticated;
grant select, insert, update, delete on app.commission_rates to service_role;

/* ── 3. Immutable KPI snapshots ────────────────────────────────────────── */

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'app' and t.typname = 'kpi_snapshot_status') then
    create type app.kpi_snapshot_status as enum ('pending', 'paid');
  end if;
end;
$$;

create table if not exists app.kpi_snapshots (
  id                       uuid        primary key default gen_random_uuid(),
  rep_id                   uuid        not null references app.users (id) on delete restrict,
  month_year               date        not null,
  new_merchants_activated  integer     not null default 0
                           check (new_merchants_activated >= 0),
  items_added              integer     not null default 0
                           check (items_added >= 0),
  calculated_salary        numeric(14, 2) not null default 0
                           check (calculated_salary >= 0),
  status                   app.kpi_snapshot_status not null default 'pending',
  locked_at                timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  constraint kpi_snapshots_month_first_day
    check (month_year = date_trunc('month', month_year)::date),
  constraint kpi_snapshots_rep_month_unique unique (rep_id, month_year)
);

comment on table app.kpi_snapshots is
  'Monthly KPI vault. Financial history: figures are immutable, only status may move pending -> paid.';
comment on column app.kpi_snapshots.locked_at is
  'Set when the snapshot row is written; the immutable-amount trigger refuses any later change.';
comment on column app.kpi_snapshots.calculated_salary is
  'Amount in major units with 2 decimals, frozen from the rates in force that month.';

/* The vault is immutable by construction, not by convention. A direct UPDATE
 * outside the allowed path is rejected even for the service role, so paid
 * history cannot be rewritten by a buggy caller. */
create or replace function app.kpi_snapshots_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rep_id                  is distinct from old.rep_id
     or new.month_year             is distinct from old.month_year
     or new.new_merchants_activated is distinct from old.new_merchants_activated
     or new.items_added            is distinct from old.items_added
     or new.calculated_salary      is distinct from old.calculated_salary then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: measured amounts cannot be modified after lock'
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

drop trigger if exists kpi_snapshots_guard on app.kpi_snapshots;
create trigger kpi_snapshots_guard
before update on app.kpi_snapshots
for each row execute function app.kpi_snapshots_guard();

create index if not exists kpi_snapshots_rep_idx
  on app.kpi_snapshots (rep_id, month_year desc);
create index if not exists kpi_snapshots_month_idx
  on app.kpi_snapshots (month_year);

alter table app.kpi_snapshots enable row level security;
alter table app.kpi_snapshots force  row level security;

/* Reps read only their own slips; the executive tier reads the whole book. */
drop policy if exists kpi_snapshots_read_self_or_exec on app.kpi_snapshots;
create policy kpi_snapshots_read_self_or_exec on app.kpi_snapshots
  for select to authenticated
  using (rep_id = auth.uid() or app.has_min_clearance(3));

/* Marking a slip paid is a System Admin action only. */
drop policy if exists kpi_snapshots_update_l4 on app.kpi_snapshots;
create policy kpi_snapshots_update_l4 on app.kpi_snapshots
  for update to authenticated
  using (app.has_min_clearance(4))
  with check (app.has_min_clearance(4));

/* Column-level grant: even L4 may only touch `status`. The guard trigger
 * enforces the same rule for every role that bypasses RLS. */
grant select on app.kpi_snapshots to authenticated;
grant update (status) on app.kpi_snapshots to authenticated;
grant select, insert, update, delete on app.kpi_snapshots to service_role;

commit;
