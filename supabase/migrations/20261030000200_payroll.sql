begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Payroll, commissions and the monthly payslip.
 *
 * The engine that computes a slip lives in `src/lib/payroll/engine.ts`; this
 * schema is its durable mirror. Amounts are minor units for the same reason as
 * the ledger: money must never be rounded by a float.
 *
 * Commission is tiered: `app.payroll_commission_tiers` rows are cumulative
 * bands per profile, so a profile can change its bands without touching code.
 * ───────────────────────────────────────────────────────────────────────── */

create table app.payroll_profiles (
  user_id              uuid        primary key references app.users (id) on delete cascade,
  base_salary_minor    bigint      not null default 0,
  transport_minor      bigint      not null default 0,
  data_entry_rate_minor bigint     not null default 0,
  data_entry_count     integer     not null default 0,
  incentive_multiplier numeric(6, 3) not null default 1,
  currency             char(3)     not null default 'EGP',
  active               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint payroll_profiles_nonnegative check (
    base_salary_minor >= 0 and
    transport_minor >= 0 and
    data_entry_rate_minor >= 0 and
    data_entry_count >= 0
  ),
  constraint payroll_profiles_multiplier check (incentive_multiplier between 0 and 10),
  constraint payroll_profiles_currency_allowed check (currency in ('EGP', 'SAR'))
);

comment on table app.payroll_profiles is
  'Fixed monthly terms per operator. Variable commission is derived from the tier table.';

create trigger payroll_profiles_touch_updated_at
before update on app.payroll_profiles
for each row execute function app.touch_updated_at();

create table app.payroll_commission_tiers (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references app.payroll_profiles (user_id) on delete cascade,
  /** Upper bound of the cumulative band, in minor units. */
  threshold_minor bigint    not null,
  /** Commission rate applied to the slice inside this band. */
  rate          numeric(6, 5) not null,
  constraint payroll_tiers_threshold_positive check (threshold_minor > 0),
  constraint payroll_tiers_rate_range check (rate >= 0 and rate <= 1),
  constraint payroll_tiers_unique_band unique (user_id, threshold_minor)
);

create index payroll_tiers_user_idx
  on app.payroll_commission_tiers (user_id, threshold_minor);

comment on table app.payroll_commission_tiers is
  'Cumulative contracting-commission bands. Sorted by threshold; the slice above each band earns that band rate.';

/* Optional link from a payslip line to the KPI it was earned on. */
create table app.payroll_kpi_links (
  user_id        uuid        not null references app.payroll_profiles (user_id) on delete cascade,
  kpi_key        text        not null,
  weight         numeric(6, 3) not null default 1,
  created_at     timestamptz not null default now(),
  primary key (user_id, kpi_key),
  constraint payroll_kpi_weight_range check (weight >= 0 and weight <= 10),
  constraint payroll_kpi_key_present check (length(btrim(kpi_key)) > 0)
);

comment on table app.payroll_kpi_links is
  'Links an operator payslip to KPI keys, so an incentive can be tied to a measured outcome.';

create table app.payroll_runs (
  id             uuid        primary key default gen_random_uuid(),
  period_start   date        not null,
  period_end     date        not null,
  currency       char(3)     not null,
  status         text        not null default 'draft',
  approved_by    uuid        references app.users (id) on delete set null,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint payroll_runs_status_allowed check (status in ('draft', 'approved', 'paid')),
  constraint payroll_runs_period_order check (period_end >= period_start),
  constraint payroll_runs_currency_allowed check (currency in ('EGP', 'SAR'))
);

create table app.payroll_lines (
  id            uuid        primary key default gen_random_uuid(),
  run_id        uuid        not null references app.payroll_runs (id) on delete cascade,
  user_id       uuid        not null references app.payroll_profiles (user_id) on delete restrict,
  item_type     text        not null,
  amount_minor  bigint      not null,
  note          text        not null default '',
  constraint payroll_lines_type_allowed check (
    item_type in (
      'base_salary', 'transport', 'commission', 'data_entry', 'incentive', 'deduction'
    )
  ),
  constraint payroll_lines_amount_nonnegative check (amount_minor >= 0)
);

create index payroll_lines_run_idx on app.payroll_lines (run_id);
create index payroll_lines_user_idx on app.payroll_lines (user_id);

comment on table app.payroll_lines is
  'One line per component of a payslip. Net is the signed sum, never a stored total.';

create function app.payroll_line_sign(p_item_type text)
returns integer
language sql
immutable
as $$
  select case p_item_type when 'deduction' then -1 else 1 end;
$$;

create view app.payroll_run_totals
with (security_invoker = true)
as
select
  l.run_id,
  l.user_id,
  sum(l.amount_minor * app.payroll_line_sign(l.item_type))
    filter (where app.payroll_line_sign(l.item_type) > 0) as gross_minor,
  sum(l.amount_minor)
    filter (where app.payroll_line_sign(l.item_type) < 0) as deductions_minor,
  sum(l.amount_minor * app.payroll_line_sign(l.item_type)) as net_minor
from app.payroll_lines l
group by l.run_id, l.user_id;

/* ─────────────────────────────────────────────────────────────────────────
 * Row Level Security: viewing requires view_payroll, editing manage_payroll.
 * ───────────────────────────────────────────────────────────────────────── */
alter table app.payroll_profiles          enable row level security;
alter table app.payroll_commission_tiers  enable row level security;
alter table app.payroll_kpi_links         enable row level security;
alter table app.payroll_runs              enable row level security;
alter table app.payroll_lines             enable row level security;

alter table app.payroll_profiles          force row level security;
alter table app.payroll_commission_tiers  force row level security;
alter table app.payroll_kpi_links         force row level security;
alter table app.payroll_runs              force row level security;
alter table app.payroll_lines             force row level security;

create policy payroll_profiles_read on app.payroll_profiles
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('view_payroll'));

create policy payroll_profiles_write on app.payroll_profiles
  for all to authenticated
  using (app.has_permission('manage_payroll'))
  with check (app.has_permission('manage_payroll'));

create policy payroll_tiers_read on app.payroll_commission_tiers
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('view_payroll'));

create policy payroll_tiers_write on app.payroll_commission_tiers
  for all to authenticated
  using (app.has_permission('manage_payroll'))
  with check (app.has_permission('manage_payroll'));

create policy payroll_kpi_links_read on app.payroll_kpi_links
  for select to authenticated
  using (app.has_permission('view_payroll'));

create policy payroll_kpi_links_write on app.payroll_kpi_links
  for all to authenticated
  using (app.has_permission('manage_payroll'))
  with check (app.has_permission('manage_payroll'));

create policy payroll_runs_read on app.payroll_runs
  for select to authenticated
  using (app.has_permission('view_payroll'));

create policy payroll_runs_write on app.payroll_runs
  for all to authenticated
  using (app.has_permission('manage_payroll'))
  with check (app.has_permission('manage_payroll'));

create policy payroll_lines_read on app.payroll_lines
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('view_payroll'));

create policy payroll_lines_write on app.payroll_lines
  for all to authenticated
  using (app.has_permission('manage_payroll'))
  with check (app.has_permission('manage_payroll'));

commit;
