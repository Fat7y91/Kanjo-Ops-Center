begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Tiered contract commission.
 *
 * The contracting fee was one flat value (`contracting_base_fee`), so a rep
 * who closed at 60% of target earned exactly the same as one who closed at
 * 130%. The Founder's rule: pay by achievement band.
 *
 *   1. Add four fee columns, one per achievement tier.
 *   2. Backfill all four from the old flat value, so the migration changes no
 *      amount on its own. Finance edits the tiers afterwards; the database
 *      never invents a figure.
 *   3. Drop the old column only after the values are safe in the new ones.
 *   4. Add `app.achievement_percent()` and `app.contract_fee_tier()` so the
 *      band boundaries exist in exactly one place.
 *   5. Add `app.contract_fee_for(city, achievement)`, which resolves the same
 *      city override / global fallback pair as `commission_rates_for()` and
 *      then picks the band.
 *   6. Freeze the applied contract fee on the KPI snapshot, like the merchant
 *      and item rates, so editing a tier never rewrites history.
 *
 * Boundaries are half-open and gap-free:
 *   tier 1  [0, 80)
 *   tier 2  [80, 90)
 *   tier 3  [90, 100)
 *   tier 4  [100, ∞)
 *
 * Exactly 100% belongs to tier 4: target hit is the top band, and a half-open
 * ladder with no dead value is the only version that cannot silently pay 0.
 * A NULL achievement (unknown, or a target of zero) counts as tier 1 — the
 * conservative band, never an unearned bonus.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. The four tier columns ──────────────────────────────────────────── */

alter table app.commission_rates
  add column if not exists contract_fee_tier_1 numeric(12, 2),
  add column if not exists contract_fee_tier_2 numeric(12, 2),
  add column if not exists contract_fee_tier_3 numeric(12, 2),
  add column if not exists contract_fee_tier_4 numeric(12, 2);

comment on column app.commission_rates.contract_fee_tier_1 is
  'Contract fee when achievement is below 80% of target.';
comment on column app.commission_rates.contract_fee_tier_2 is
  'Contract fee when achievement is 80% up to (not including) 90%.';
comment on column app.commission_rates.contract_fee_tier_3 is
  'Contract fee when achievement is 90% up to (not including) 100%.';
comment on column app.commission_rates.contract_fee_tier_4 is
  'Contract fee when achievement reaches 100% or more. The top band includes exactly 100% so no achievement value is unpaid.';

/* ── 2. Preserve the current amount before the old column goes away ──────
 * Every deployment past 20261031000003 has `contracting_base_fee`. The guard
 * keeps the migration safe anyway, so it can also run against a database that
 * was restored from an older backup with a different sequence.
 * ───────────────────────────────────────────────────────────────────────── */
do $$
declare
  v_has_old boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'app'
      and table_name = 'commission_rates'
      and column_name = 'contracting_base_fee'
  ) into v_has_old;

  if v_has_old then
    execute $sql$
      update app.commission_rates
         set contract_fee_tier_1 = coalesce(contract_fee_tier_1, contracting_base_fee, 100),
             contract_fee_tier_2 = coalesce(contract_fee_tier_2, contracting_base_fee, 100),
             contract_fee_tier_3 = coalesce(contract_fee_tier_3, contracting_base_fee, 100),
             contract_fee_tier_4 = coalesce(contract_fee_tier_4, contracting_base_fee, 100)
    $sql$;
  end if;

  execute $sql$
    update app.commission_rates
       set contract_fee_tier_1 = coalesce(contract_fee_tier_1, 100),
           contract_fee_tier_2 = coalesce(contract_fee_tier_2, 100),
           contract_fee_tier_3 = coalesce(contract_fee_tier_3, 100),
           contract_fee_tier_4 = coalesce(contract_fee_tier_4, 100)
  $sql$;
end;
$$;

/* ── 3. Lock the shape: non-negative, present, defaulted ───────────────── */

alter table app.commission_rates
  alter column contract_fee_tier_1 set default 100,
  alter column contract_fee_tier_2 set default 100,
  alter column contract_fee_tier_3 set default 100,
  alter column contract_fee_tier_4 set default 100,
  alter column contract_fee_tier_1 set not null,
  alter column contract_fee_tier_2 set not null,
  alter column contract_fee_tier_3 set not null,
  alter column contract_fee_tier_4 set not null;

alter table app.commission_rates
  drop constraint if exists commission_rates_contract_fee_tier_1_non_negative,
  drop constraint if exists commission_rates_contract_fee_tier_2_non_negative,
  drop constraint if exists commission_rates_contract_fee_tier_3_non_negative,
  drop constraint if exists commission_rates_contract_fee_tier_4_non_negative,
  add constraint commission_rates_contract_fee_tier_1_non_negative
    check (contract_fee_tier_1 >= 0),
  add constraint commission_rates_contract_fee_tier_2_non_negative
    check (contract_fee_tier_2 >= 0),
  add constraint commission_rates_contract_fee_tier_3_non_negative
    check (contract_fee_tier_3 >= 0),
  add constraint commission_rates_contract_fee_tier_4_non_negative
    check (contract_fee_tier_4 >= 0);

/* ── 4. Retire the flat column ───────────────────────────────────────────
 * `app.commission_rates_for()` returns `app.commission_rates` as a composite,
 * so it follows the row type automatically: no function body mentions the
 * dropped column.
 * ───────────────────────────────────────────────────────────────────────── */
alter table app.commission_rates
  drop constraint if exists commission_rates_contracting_base_fee_non_negative;

alter table app.commission_rates
  drop column if exists contracting_base_fee;

/* ── 5. One definition of the band boundaries ──────────────────────────── */

create or replace function app.achievement_percent(
  p_actual numeric,
  p_target numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  /* Target 0 (or NULL) means the percentage is undefined: return NULL, which
   * the tier selector maps to the conservative band. */
  select case
           when p_target is null or p_target <= 0 then null::numeric
           else round((p_actual / p_target) * 100, 2)
         end;
$$;

comment on function app.achievement_percent(numeric, numeric) is
  'Achievement as (actual / target) * 100, rounded to two decimals. NULL when the target is zero or unknown.';

create or replace function app.contract_fee_tier(p_achievement_pct numeric)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
           when p_achievement_pct is null       then 1::smallint
           when p_achievement_pct < 80          then 1::smallint
           when p_achievement_pct < 90          then 2::smallint
           when p_achievement_pct < 100         then 3::smallint
           else 4::smallint
         end;
$$;

comment on function app.contract_fee_tier(numeric) is
  'Maps an achievement percentage to its band: 1 [0,80), 2 [80,90), 3 [90,100), 4 [100,∞). NULL is tier 1.';

/* ── 6. The fee for a city at a given achievement ────────────────────────
 * Same resolution rule as `commission_rates_for()`: the city override wins,
 * otherwise the NULL-city fallback. The two rows are never merged, so a city
 * override is a complete tier table.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.contract_fee_for(
  p_city_id text,
  p_achievement_pct numeric
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case app.contract_fee_tier(p_achievement_pct)
           when 1 then r.contract_fee_tier_1
           when 2 then r.contract_fee_tier_2
           when 3 then r.contract_fee_tier_3
           else        r.contract_fee_tier_4
         end
  from app.commission_rates r
  where r.city_id is not distinct from p_city_id
     or (p_city_id is not null and r.city_id is null)
  order by (r.city_id is not null) desc
  limit 1;
$$;

comment on function app.contract_fee_for(text, numeric) is
  'Contract fee for the active schedule of a city at the given achievement: city override first, else the NULL-city fallback.';

grant execute on function app.achievement_percent(numeric, numeric)
  to authenticated, service_role;
grant execute on function app.contract_fee_tier(numeric)
  to authenticated, service_role;
grant execute on function app.contract_fee_for(text, numeric)
  to authenticated, service_role;

/* ── 7. Freeze the applied contract fee on the snapshot ──────────────────
 * `avg_achievement_ratio` records the achievement that produced the payout;
 * the fee it selected belongs beside it, for the same reason the merchant and
 * item rates were added in 20261031000001: an edited tier must never rewrite a
 * historical slip. The column is nullable so rows written before this
 * migration keep the honest "calculated before tier history" record.
 * ───────────────────────────────────────────────────────────────────────── */
alter table app.kpi_snapshots
  add column if not exists applied_contract_fee numeric(12, 2);

comment on column app.kpi_snapshots.applied_contract_fee is
  'Tiered contract fee in force when this snapshot was calculated. Frozen with the row. NULL only for rows written before tiered contracting existed.';

alter table app.kpi_snapshots
  drop constraint if exists kpi_snapshots_applied_contract_fee_non_negative,
  add constraint kpi_snapshots_applied_contract_fee_non_negative
    check (applied_contract_fee is null or applied_contract_fee >= 0);

/* The function is replaced, not duplicated: the existing trigger resolves it
 * by name. Only the UPDATE freeze changes, plus the fee in the frozen set. The
 * INSERT contract is unchanged so existing writers keep working. */
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
     or new.applied_contract_fee     is distinct from old.applied_contract_fee
     or new.contracts_closed         is distinct from old.contracts_closed
     or new.avg_achievement_ratio    is distinct from old.avg_achievement_ratio then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: measured amounts, applied rates, the contract fee and outcomes cannot be modified after lock'
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
  'Requires applied merchant/item rates on insert; freezes amounts, applied rates, the contract fee, outcomes and locked_at; allows only pending -> paid on status.';

commit;
