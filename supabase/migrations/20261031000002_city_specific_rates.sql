begin;

/* ─────────────────────────────────────────────────────────────────────────
 * City-specific commission rates.
 *
 * Rates are not global: activating a merchant in a new city can pay a higher
 * fee than one in an established city. The schedule therefore becomes one row
 * per city, with a single NULL-city row as the fallback used when a city has no
 * override.
 *
 *   1. The singleton trigger is removed — it exists to enforce exactly one row
 *      and is now the opposite of the requirement.
 *   2. `city_id` is added as plain `text`, with no foreign key: cities live in
 *      Firestore, per the cross-database rule in ARCHITECTURE §8.4.
 *   3. Uniqueness is enforced by two partial indexes, because a plain UNIQUE
 *      allows any number of NULLs. One index guarantees a single row per city,
 *      the other guarantees a single global default.
 *
 * The pre-existing row has no city and becomes the global default, so the
 * fallback is present immediately after this migration.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Drop the singleton guard ───────────────────────────────────────── */

drop trigger if exists commission_rates_single_row on app.commission_rates;
drop function if exists app.commission_rates_singleton();

/* ── 2. Per-city schedule ──────────────────────────────────────────────── */

alter table app.commission_rates
  add column if not exists city_id text;

comment on column app.commission_rates.city_id is
  'Firestore city document id. NULL is the global fallback used by cities with no override. No FK by design: cross-database reference.';

alter table app.commission_rates
  drop constraint if exists commission_rates_city_present;

alter table app.commission_rates
  add constraint commission_rates_city_present
    check (city_id is null or length(btrim(city_id)) > 0);

/* ── 3. Exactly one configuration per city ─────────────────────────────── */

create unique index if not exists commission_rates_city_key
  on app.commission_rates (city_id)
  where city_id is not null;

/* `UNIQUE` alone would permit unlimited NULL rows, so the global fallback is
 * pinned by a partial unique index over a constant expression: every row that
 * matches the predicate has the same key, and only one can exist. */
create unique index if not exists commission_rates_global_key
  on app.commission_rates ((city_id is null))
  where city_id is null;

/* ── 4. Fallback semantics are resolved in the application ───────────────
 * Lookup rule: the city's row when present, otherwise the NULL-city row. Two
 * rows are never merged, so an override is a complete configuration rather
 * than a partial one. A helper keeps that rule in one place for SQL readers.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.commission_rates_for(p_city_id text)
returns app.commission_rates
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from app.commission_rates r
  where r.city_id is not distinct from p_city_id
     or (p_city_id is not null and r.city_id is null)
  /* A city override must beat the fallback. Without this ORDER BY the choice
   * between the two matching rows would be left to the planner. */
  order by (r.city_id is not null) desc
  limit 1;
$$;

comment on function app.commission_rates_for(text) is
  'Resolves the active schedule for a city: the city override when present, otherwise the NULL-city fallback.';

grant execute on function app.commission_rates_for(text) to authenticated, service_role;

/* ── RLS for multiple rows ───────────────────────────────────────────────
 * The previous policies were written for a table that could only ever hold one
 * row: active operators read it, L4 updated it. Adding a city override is now a
 * normal operation, so L4 also needs insert and delete. Reps still cannot write.
 * ───────────────────────────────────────────────────────────────────────── */

drop policy if exists commission_rates_insert_l4 on app.commission_rates;
create policy commission_rates_insert_l4 on app.commission_rates
  for insert to authenticated
  with check (app.has_min_clearance(4));

drop policy if exists commission_rates_delete_l4 on app.commission_rates;
create policy commission_rates_delete_l4 on app.commission_rates
  for delete to authenticated
  using (app.has_min_clearance(4));

grant insert, delete on app.commission_rates to authenticated;

commit;
