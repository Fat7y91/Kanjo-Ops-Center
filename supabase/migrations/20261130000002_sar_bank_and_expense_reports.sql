begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Saudi bank workflow: direct deposits and the expense report projection.
 *
 * The SAR ledger used to be read-only because its balance came from the
 * imported capital-deposit and expense tables. This adds a first-class deposit
 * table for day-to-day bank deposits, folds it into `bank_statement_sar`, and
 * exposes one currency-neutral expense view so the reports page can group EGP
 * journal expenses and SAR expenses by the same analytical category.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Direct Saudi deposits ────────────────────────────────────────────── */

create table if not exists app.sar_bank_deposits (
  id               uuid          primary key default gen_random_uuid(),
  account_id       uuid          not null references app.accounts (id) on delete restrict,
  amount_sar       numeric(12,2) not null,
  deposit_date     date          not null default current_date,
  reference_number text          not null default '***',
  reason           text          not null default '',
  created_by       uuid          references app.users (id) on delete set null,
  created_at       timestamptz   not null default now(),
  constraint sar_bank_deposits_amount_positive check (amount_sar > 0),
  constraint sar_bank_deposits_reference_not_blank check (btrim(reference_number) <> '')
);

create index if not exists sar_bank_deposits_date_idx
  on app.sar_bank_deposits (deposit_date, created_at);

comment on table app.sar_bank_deposits is
  'Direct deposits into the Saudi bank account. Separate from capital_deposits, which stay founder-owned and approval-gated.';

alter table app.sar_bank_deposits enable row level security;
alter table app.sar_bank_deposits force row level security;

drop policy if exists sar_bank_deposits_read_finance on app.sar_bank_deposits;
create policy sar_bank_deposits_read_finance
on app.sar_bank_deposits for select to authenticated
using (
  app.has_permission('view_financials')
  or app.has_permission('view_finance')
  or app.has_permission('manage_expenses')
  or app.can_manage_treasury()
);

drop policy if exists sar_bank_deposits_write_finance on app.sar_bank_deposits;
create policy sar_bank_deposits_write_finance
on app.sar_bank_deposits for insert to authenticated
with check (
  app.has_permission('operate_sar_bank')
  and (
    app.has_permission('record_deposits')
    or app.has_permission('manage_accounts')
    or app.can_manage_treasury()
  )
);

grant select on app.sar_bank_deposits to authenticated;
grant select, insert on app.sar_bank_deposits to service_role;

/* ── 2. Fold direct deposits into the SAR statement ──────────────────────── */

create or replace view app.bank_statement_sar
with (security_invoker = true)
as
with movements as (
  select
    'capital_deposit'::text as entry_type,
    d.id,
    d.deposit_date as entry_date,
    d.created_at as recorded_at,
    d.shareholder_id,
    u.full_name as shareholder_name,
    coalesce(nullif(btrim(d.reason), ''), 'إيداع رأسمالي') as description,
    d.reference_number,
    d.amount_sar as credit_sar,
    0::numeric(12,2) as debit_sar
  from app.capital_deposits d
  left join app.users u on u.id = d.shareholder_id
  where d.currency = 'SAR'
    and d.status <> 'rejected'

  union all

  select
    'expense'::text as entry_type,
    e.id,
    e.expense_date as entry_date,
    e.created_at as recorded_at,
    null::uuid as shareholder_id,
    null::text as shareholder_name,
    concat_ws(' — ', c.name_ar, nullif(btrim(e.details), '')) as description,
    e.reference_number,
    0::numeric(12,2) as credit_sar,
    e.amount_sar as debit_sar
  from app.expenses e
  join app.expense_categories c on c.id = e.category_id

  union all

  select
    'sar_deposit'::text as entry_type,
    d.id,
    d.deposit_date as entry_date,
    d.created_at as recorded_at,
    null::uuid as shareholder_id,
    null::text as shareholder_name,
    coalesce(nullif(btrim(d.reason), ''), 'إيداع بنكي'),
    d.reference_number,
    d.amount_sar as credit_sar,
    0::numeric(12,2) as debit_sar
  from app.sar_bank_deposits d
)
select
  entry_type,
  id,
  entry_date,
  recorded_at,
  shareholder_id,
  shareholder_name,
  description,
  reference_number,
  credit_sar,
  debit_sar,
  sum(credit_sar - debit_sar) over (
    order by entry_date, recorded_at, entry_type, id
    rows between unbounded preceding and current row
  ) as balance_sar
from movements
order by entry_date, recorded_at, entry_type, id;

comment on view app.bank_statement_sar is
  'Chronological SAR bank statement. Credits are deposits; debits are expenses; balance_sar is the running total. RLS on the source tables still applies.';

grant select on app.bank_statement_sar to authenticated, service_role;

/* ── 3. Expense report projection (both currencies, one category tree) ───── */

create or replace view app.expense_report_lines
with (security_invoker = true)
as
select
  'EGP'::text as currency,
  e.id as movement_id,
  e.expense_category_id as category_id,
  c.name_ar as category_name,
  (sum(l.debit_minor)::numeric / 100)::numeric(14,2) as amount,
  e.entry_date as occurred_on,
  e.memo as description,
  e.created_by,
  e.created_at
from app.journal_entries e
join app.journal_lines l on l.entry_id = e.id and l.debit_minor > 0
join app.accounts a on a.id = l.account_id and a.type = 'expense'
join app.expense_categories c on c.id = e.expense_category_id
where e.expense_category_id is not null
group by e.id, c.name_ar, e.entry_date, e.memo, e.created_by, e.created_at

union all

select
  'SAR'::text as currency,
  x.id as movement_id,
  x.category_id,
  c.name_ar as category_name,
  x.amount_sar as amount,
  x.expense_date as occurred_on,
  x.details as description,
  x.created_by,
  x.created_at
from app.expenses x
join app.expense_categories c on c.id = x.category_id;

comment on view app.expense_report_lines is
  'Currency-neutral expense lines for reporting. EGP comes from categorized journal entries, SAR from the expense table.';

grant select on app.expense_report_lines to authenticated, service_role;

commit;
