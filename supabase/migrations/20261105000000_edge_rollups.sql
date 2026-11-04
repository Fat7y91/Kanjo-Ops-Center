begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Pillar 3 — the remaining Edge CPU hot spots move into SQL.
 *
 * The merchant-state rollup proved the pattern: a pre-computed row set read in
 * one indexed round trip is cheaper than downloading a fact table and reducing
 * it in the Worker. This migration applies the same shape to the offenders
 * whose cost is dominated by per-row work in the Worker:
 *
 *   1. `app.payroll_contributions_rollup` — per-rep signed-contract earnings.
 *      `/payroll` used to read the whole `app.visit_reports` table once *per
 *      profile*, an O(profiles × reports) scan.
   *   2. `app.bi_merchant_rollup` — the `/overview` dataset's per-merchant
 *      newest visit and negotiated commission. The page used to download every
 *      report and reduce it per merchant in the Worker.
 *
 * Both are derived only from `app.visit_reports`, the durable fact table both
 * screens already read. Published-product counts stay in the Worker: the
 * catalog store is in-memory on this branch, so deriving them from
 * `app.catalog_products` would show zero for every merchant and silently blank
 * the overview's catalog health.
 *
 * All views are `security_invoker = true`, matching the other derived views in
 * this schema: the caller's RLS still applies to the underlying rows.
 *
 * Re-runnable: views are guarded with `drop ... if exists` (a column change
 * cannot be `replace`d) and grants are idempotent.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Payroll contributions ──────────────────────────────────────────────
 * Mirrors `contributionFor()`: a rep earns the merchant's contracted
 * commission on every `signed_contract` visit. The report stores the commission
 * frozen at signing time, which is exactly what the old in-memory loop summed.
 * A legacy row written before the amount was captured is recomputed from the
 * merchant's monthly value and agreed/target percentage. One row per rep.
 * ───────────────────────────────────────────────────────────────────────── */

drop view if exists app.payroll_contributions_rollup;
create view app.payroll_contributions_rollup
with (security_invoker = true)
as
select
  r.rep_id,
  coalesce(
    sum(
      case
        when r.commission_amount > 0 then r.commission_amount
        when m.id is not null and m.monthly_value_minor > 0
          then round(
            (m.monthly_value_minor / 100.0)
            * coalesce(m.agreed_commission, m.target_commission)
            / 100.0
          )
        else 0
      end
    ),
    0
  )::numeric(14, 2)                   as contribution,
  count(*)::integer                   as signed_visits
from app.visit_reports r
left join app.merchants m on m.id = r.merchant_id
where r.outcome = 'signed_contract'
group by r.rep_id;

comment on view app.payroll_contributions_rollup is
  'Per-rep signed-contract contribution for payroll. Replaces the per-profile full scan of app.visit_reports.';

/* ── 2. BI merchant facts ──────────────────────────────────────────────────
 * One row per merchant with the newest visit and the newest negotiated
 * commission. Keyed off `app.visit_reports` — the durable fact table the
 * overview already reads — so the result is complete even when `app.merchants`
 * has not been backfilled.
 *
 *   - `visited_at` / `rep_id` / `rep_name` — newest report by `created_at`,
 *     matching the overview's original ordering.
 *   - `negotiated_commission` — newest report that recorded an agreed rate.
 * ───────────────────────────────────────────────────────────────────────── */

drop view if exists app.bi_merchant_rollup;
create view app.bi_merchant_rollup
with (security_invoker = true)
as
with visit_agg as (
  select merchant_id, max(created_at) as visited_at
  from app.visit_reports
  group by merchant_id
),
latest_visit as (
  select distinct on (r.merchant_id)
    r.merchant_id,
    r.rep_id,
    r.rep_name
  from app.visit_reports r
  order by r.merchant_id, r.created_at desc
),
latest_negotiation as (
  select distinct on (r.merchant_id)
    r.merchant_id,
    r.agreed_commission
  from app.visit_reports r
  where r.agreed_commission is not null
  order by r.merchant_id, r.created_at desc
)
select
  v.merchant_id                    as id,
  v.visited_at,
  lv.rep_id,
  lv.rep_name,
  n.agreed_commission              as negotiated_commission
from visit_agg v
left join latest_visit       lv on lv.merchant_id = v.merchant_id
left join latest_negotiation n  on n.merchant_id  = v.merchant_id;

comment on view app.bi_merchant_rollup is
  'Per-merchant BI facts (newest visit, negotiated commission). Replaces the in-memory report reduction on the overview.';

/* ── 3. Agent KPI rank rollup ──────────────────────────────────────────────
 * The score and city rank for the live month, computed once. A rep is ranked
 * only against peers in their first city scope, matching `resolveKpiScope`.
 * ───────────────────────────────────────────────────────────────────────── */

drop view if exists app.agent_kpi_rank_rollup;
create view app.agent_kpi_rank_rollup
with (security_invoker = true)
as
with bounds as (
  select date_trunc('month', now()) as start_at
),
activations as (
  select m.first_entry_by as rep_id, count(*)::integer as activations
  from app.merchants m, bounds b
  where m.first_entry_by is not null
    and m.first_entry_at >= b.start_at
    and m.first_entry_at < b.start_at + interval '1 month'
  group by m.first_entry_by
),
items as (
  select p.created_by as rep_id, count(*)::integer as items_added
  from app.catalog_products p, bounds b
  where p.created_by is not null
    and p.created_at >= b.start_at
    and p.created_at < b.start_at + interval '1 month'
  group by p.created_by
),
contracts as (
  select
    m.contracted_by_team_id as team_id,
    count(*)::integer       as contracts_closed,
    coalesce(
      avg(
        case
          when m.target_margin is not null and m.target_margin > 0
            then m.agreed_margin / m.target_margin * 100
        end
      ),
      0
    )                       as margin_ratio
  from app.merchants m, bounds b
  where m.contracted_by_team_id is not null
    and m.contract_state in ('final_contract', 'signed_contract')
    and m.updated_at >= b.start_at
    and m.updated_at < b.start_at + interval '1 month'
  group by m.contracted_by_team_id
),
rep_scores as (
  select
    u.id                            as rep_id,
    u.full_name                     as rep_name,
    u.team_id,
    coalesce(a.activations, 0)      as activations,
    coalesce(i.items_added, 0)      as items_added,
    coalesce(c.contracts_closed, 0) as contracts_closed,
    coalesce(c.margin_ratio, 0)     as margin_ratio,
    least(100, greatest(0,
      least(35, greatest(0, coalesce(a.activations, 0) * 12))
      + least(20, greatest(0, coalesce(i.items_added, 0)))
      + least(35, greatest(0, coalesce(c.contracts_closed, 0) * 12))
      + least(10, greatest(0, coalesce(c.margin_ratio, 0)))
    ))                              as score
  from app.users u
  left join activations a on a.rep_id  = u.id
  left join items       i on i.rep_id  = u.id
  left join contracts   c on c.team_id = u.team_id
  where u.active
    and u.title = 'مندوب ميداني'
    and u.clearance_level <= 2
    and exists (
      select 1 from app.user_permissions up
      where up.user_id = u.id
        and up.permission_key = 'start_end_visit'
    )
),
primary_scope as (
  select distinct on (s.user_id)
    s.user_id,
    s.city_id
  from app.user_city_scope s
  order by s.user_id, s.granted_at, s.city_id
),
ranked as (
  select
    r.rep_id,
    r.rep_name,
    ps.city_id,
    r.score,
    rank() over (
      partition by ps.city_id
      order by r.score desc, r.rep_name asc
    )                            as position,
    count(*) over (partition by ps.city_id) as total
  from rep_scores r
  join primary_scope ps on ps.user_id = r.rep_id
)
select * from ranked;

comment on view app.agent_kpi_rank_rollup is
  'Live-month KPI score and city rank per rep. Replaces the O(agents²) peer scoring loop.';

/* ── 4. Access ─────────────────────────────────────────────────────────────
 * The service-role client bypasses RLS; these grants keep the views readable
 * by an authenticated operator too, in line with the other derived views.
 * ───────────────────────────────────────────────────────────────────────── */

grant select on app.payroll_contributions_rollup to authenticated, service_role;
grant select on app.bi_merchant_rollup           to authenticated, service_role;
grant select on app.agent_kpi_rank_rollup        to authenticated, service_role;

commit;
