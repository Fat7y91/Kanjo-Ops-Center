begin;

/* ─────────────────────────────────────────────────────────────────────────
 * City-bound field teams and the contracting phase.
 *
 * Teams were a free-text global label (`app.users.team`, e.g. "فريق فوكس"), so
 * a rep in Cairo could be grouped with a rep in Giza and nothing tied the group
 * to a city. Contracting is a two-rep team activity, so the team has to be a
 * real, city-owned entity that a contract can point at.
 *
 * This migration:
 *   1. introduces `app.field_teams`, owned by exactly one city;
 *   2. replaces the free-text team on operators with `team_id`;
 *   3. records the margin target/agreement and the team that closed a contract;
 *   4. adds the contracting base fee to the city rate schedule;
 *   5. extends the KPI snapshot with contracting outcome columns.
 *
 * `city_id` stays `text` with no foreign key: cities live in Firestore
 * (ARCHITECTURE §8.4). A UUID column would make every existing city id
 * (`city-cairo`, …) invalid the moment the FK was enforced.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. City-owned teams ───────────────────────────────────────────────── */

create table if not exists app.field_teams (
  id         uuid        primary key default gen_random_uuid(),
  city_id    text        not null,
  name       varchar(120) not null,
  created_at timestamptz not null default now(),
  constraint field_teams_city_present check (length(btrim(city_id)) > 0),
  constraint field_teams_name_present check (length(btrim(name)) > 0)
);

comment on table app.field_teams is
  'Dynamic field team owned by one city. Contracting is executed by these teams, not by a global label.';
comment on column app.field_teams.city_id is
  'Firestore city document id. No FK by design: cross-database reference.';

create unique index if not exists field_teams_city_name_key
  on app.field_teams (city_id, lower(btrim(name)));

create index if not exists field_teams_city_idx on app.field_teams (city_id);

/* ── 2. Operators belong to a team, not a text label ───────────────────── */

alter table app.users
  add column if not exists team_id uuid references app.field_teams (id) on delete set null;

comment on column app.users.team_id is
  'City-bound team the operator belongs to. Replaces the free-text `team` label.';
comment on column app.users.team is
  'DEPRECATED: legacy free-text label. Superseded by team_id; kept only until existing rows are migrated.';

create index if not exists users_team_id_idx on app.users (team_id);

/* ── 3. Contracting margins and team attribution ───────────────────────── */

alter table app.merchants
  add column if not exists target_margin numeric(6, 2),
  add column if not exists agreed_margin numeric(6, 2),
  /* RESTRICT, not SET NULL: a closed contract is financial history. Deleting
   * the team must not silently erase who closed it. The manager has to move
   * the contract to another team first, which is an explicit, auditable act. */
  add column if not exists contracted_by_team_id uuid
    references app.field_teams (id) on delete restrict;

alter table app.merchants
  drop constraint if exists merchants_target_margin_range,
  drop constraint if exists merchants_agreed_margin_range,
  add constraint merchants_target_margin_range
    check (target_margin is null or (target_margin >= 0 and target_margin <= 100)),
  add constraint merchants_agreed_margin_range
    check (agreed_margin is null or (agreed_margin >= 0 and agreed_margin <= 100));

comment on column app.merchants.target_margin is
  'Negotiation margin the team is aiming for, in percent.';
comment on column app.merchants.agreed_margin is
  'Margin actually agreed with the merchant, in percent.';
comment on column app.merchants.contracted_by_team_id is
  'Team that closed the contract. Both reps on the team share the commission; the split is a payout concern, not a schema one. RESTRICT on delete: attribution is history.';

create index if not exists merchants_contracted_by_team_idx
  on app.merchants (contracted_by_team_id);

/* ── 4. Contracting fee joins the per-city schedule ────────────────────── */

alter table app.commission_rates
  add column if not exists contracting_base_fee numeric(12, 2) not null default 100;

alter table app.commission_rates
  drop constraint if exists commission_rates_contracting_base_fee_non_negative,
  add constraint commission_rates_contracting_base_fee_non_negative
    check (contracting_base_fee >= 0);

comment on column app.commission_rates.contracting_base_fee is
  'Base fee for a closed contract, before the margin is applied. City-overridable like the other rates.';

/* `commission_rates_for()` returns `app.commission_rates` as a composite, so it
 * picks the new column up automatically. Re-declared only to keep the source of
 * truth in one place. */

/* ── 5. Contracting outcome on the KPI snapshot ────────────────────────── */

alter table app.kpi_snapshots
  add column if not exists contracts_closed integer not null default 0,
  add column if not exists avg_achievement_ratio numeric(8, 2) not null default 0;

alter table app.kpi_snapshots
  drop constraint if exists kpi_snapshots_contracts_closed_non_negative,
  drop constraint if exists kpi_snapshots_avg_achievement_ratio_non_negative,
  add constraint kpi_snapshots_contracts_closed_non_negative
    check (contracts_closed >= 0),
  add constraint kpi_snapshots_avg_achievement_ratio_non_negative
    check (avg_achievement_ratio >= 0);

comment on column app.kpi_snapshots.contracts_closed is
  'Contracts the rep''s team closed in the month. Credited to both paired reps.';
comment on column app.kpi_snapshots.avg_achievement_ratio is
  'Average agreed/target margin across closed contracts, in percent. 0 when no contract closed.';

/* ── 6. Immutability guard, extended ─────────────────────────────────────
 * The new snapshot columns are measured outcomes, so they join the frozen set.
 * The trigger already fires on insert and update; replacing the function is
 * enough. The insert contract is unchanged: applied rates are mandatory.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.kpi_snapshots_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.applied_merchant_rate is null or new.applied_item_rate is null then
      raise exception
        'KPI_SNAPSHOT_RATES_REQUIRED: snapshots must record the merchant and item rates applied'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.rep_id                    is distinct from old.rep_id
     or new.month_year               is distinct from old.month_year
     or new.new_merchants_activated  is distinct from old.new_merchants_activated
     or new.items_added              is distinct from old.items_added
     or new.calculated_salary        is distinct from old.calculated_salary
     or new.applied_merchant_rate    is distinct from old.applied_merchant_rate
     or new.applied_item_rate        is distinct from old.applied_item_rate
     or new.contracts_closed         is distinct from old.contracts_closed
     or new.avg_achievement_ratio    is distinct from old.avg_achievement_ratio then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: measured amounts, applied rates and outcomes cannot be modified after lock'
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

comment on function app.kpi_snapshots_guard() is
  'Requires applied rates on insert; freezes amounts, applied rates, outcomes and locked_at; allows only pending -> paid on status.';

/* ── 7. Who may manage a city's teams ────────────────────────────────────
 * A City Manager (level 2) owns teams for their cities only; the executive
 * tier owns every city. SECURITY DEFINER so the policy can read the scope
 * table without depending on the caller's own RLS visibility.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.can_manage_city(p_city_id text)
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
      and (
        u.clearance_level >= 3
        or (
          u.clearance_level = 2
          and exists (
            select 1
            from app.user_city_scope s
            where s.user_id = u.id
              and s.city_id = p_city_id
          )
        )
      )
  );
$$;

comment on function app.can_manage_city(text) is
  'True when the caller is an executive, or a level-2 manager scoped to the given city.';

grant execute on function app.can_manage_city(text) to authenticated, service_role;

alter table app.field_teams enable row level security;
alter table app.field_teams force  row level security;

drop policy if exists field_teams_read_active on app.field_teams;
create policy field_teams_read_active on app.field_teams
  for select to authenticated
  using (app.is_active_user());

drop policy if exists field_teams_insert_city_manager on app.field_teams;
create policy field_teams_insert_city_manager on app.field_teams
  for insert to authenticated
  with check (app.can_manage_city(city_id));

drop policy if exists field_teams_update_city_manager on app.field_teams;
create policy field_teams_update_city_manager on app.field_teams
  for update to authenticated
  using (app.can_manage_city(city_id))
  with check (app.can_manage_city(city_id));

drop policy if exists field_teams_delete_city_manager on app.field_teams;
create policy field_teams_delete_city_manager on app.field_teams
  for delete to authenticated
  using (app.can_manage_city(city_id));

grant select, insert, update, delete on app.field_teams to authenticated;
grant select, insert, update, delete on app.field_teams to service_role;

commit;
