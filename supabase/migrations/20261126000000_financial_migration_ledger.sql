begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Historical SAR bank statement.
 *
 * The legacy workbook records founder capital in SAR and company expenses in
 * SAR. The existing treasury tables are retained: `app.capital_deposits` keeps
 * its founder workflow and ledger triggers, and the migration-facing columns
 * are additive. `amount_sar` is generated from the canonical `amount_minor`
 * (bigint halalas), so the two can never disagree by a rounding step.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Capital deposits: migration-facing shape ────────────────────────── */

alter table app.capital_deposits
  add column if not exists shareholder_id uuid
    generated always as (founder_id) stored,
  add column if not exists amount_sar numeric(12,2)
    generated always as (round(amount_minor::numeric / 100, 2)::numeric(12,2)) stored,
  add column if not exists deposit_date date not null default current_date,
  add column if not exists reference_number text not null default '***',
  add column if not exists reason text not null default '';

comment on column app.capital_deposits.shareholder_id is
  'Legacy-facing alias of founder_id. Generated so both names always resolve to the same shareholder.';
comment on column app.capital_deposits.amount_sar is
  'Exact SAR amount, generated from amount_minor. Never write this column directly.';
comment on column app.capital_deposits.deposit_date is
  'Bank value date for the statement. Defaults to the creation date for app-entered deposits.';
comment on column app.capital_deposits.reference_number is
  'Bank reference. A missing or blank reference is stored as ***.';
comment on column app.capital_deposits.reason is
  'Human-readable deposit reason, for example a monthly founder contribution.';

create index if not exists capital_deposits_sar_statement_idx
  on app.capital_deposits (deposit_date, created_at)
  where currency = 'SAR';

create or replace function app.capital_deposit_migration_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deposit_date is null then
    new.deposit_date := coalesce(new.created_at::date, current_date);
  end if;

  if new.reference_number is null or btrim(new.reference_number) = '' then
    new.reference_number := '***';
  else
    new.reference_number := btrim(new.reference_number);
  end if;

  new.reason := coalesce(btrim(new.reason), '');
  return new;
end;
$$;

drop trigger if exists capital_deposits_migration_fields on app.capital_deposits;
create trigger capital_deposits_migration_fields
before insert or update on app.capital_deposits
for each row execute function app.capital_deposit_migration_fields();

/* ── 2. Dynamic expense categories ──────────────────────────────────────── */

create table if not exists app.expense_categories (
  id          uuid        primary key default gen_random_uuid(),
  name_ar     text        not null,
  name_en     text,
  active      boolean     not null default true,
  created_by  uuid        references app.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint expense_categories_name_not_blank check (btrim(name_ar) <> '')
);

create unique index if not exists expense_categories_name_key
  on app.expense_categories (lower(btrim(name_ar)));

comment on table app.expense_categories is
  'Accountant-maintained expense taxonomy. New categories are added from the finance desk.';

drop trigger if exists expense_categories_touch on app.expense_categories;
create trigger expense_categories_touch
before update on app.expense_categories
for each row execute function app.touch_updated_at();

/* ── 3. Expenses ────────────────────────────────────────────────────────── */

create table if not exists app.expenses (
  id               uuid          primary key default gen_random_uuid(),
  category_id      uuid          not null references app.expense_categories (id) on delete restrict,
  amount_sar       numeric(12,2) not null,
  expense_date     date          not null,
  details          text          not null default '',
  reference_number text          not null default '***',
  created_by       uuid          references app.users (id) on delete set null,
  created_at       timestamptz   not null default now(),
  constraint expenses_amount_positive check (amount_sar > 0),
  constraint expenses_reference_not_blank check (btrim(reference_number) <> '')
);

create index if not exists expenses_date_idx
  on app.expenses (expense_date, created_at);
create index if not exists expenses_category_idx
  on app.expenses (category_id, expense_date);

comment on table app.expenses is
  'SAR expenses recorded against the dynamic category tree. Amounts are exact numeric(12,2).';

/* ── 4. Chronological SAR statement ─────────────────────────────────────── */

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
  'Chronological SAR bank statement. Credits are capital deposits; debits are expenses; balance_sar is the running total. RLS on the source tables still applies.';

/* ── 5. Row Level Security ──────────────────────────────────────────────── */

alter table app.expense_categories enable row level security;
alter table app.expense_categories force row level security;
alter table app.expenses enable row level security;
alter table app.expenses force row level security;

drop policy if exists expense_categories_read_finance on app.expense_categories;
create policy expense_categories_read_finance
on app.expense_categories for select to authenticated
using (
  app.has_permission('view_financials')
  or app.has_permission('view_finance')
  or app.has_permission('manage_expenses')
);

drop policy if exists expense_categories_write_finance on app.expense_categories;
create policy expense_categories_write_finance
on app.expense_categories for insert to authenticated
with check (app.has_permission('manage_expenses'));

drop policy if exists expense_categories_update_finance on app.expense_categories;
create policy expense_categories_update_finance
on app.expense_categories for update to authenticated
using (app.has_permission('manage_expenses'))
with check (app.has_permission('manage_expenses'));

drop policy if exists expense_categories_delete_finance on app.expense_categories;
create policy expense_categories_delete_finance
on app.expense_categories for delete to authenticated
using (app.has_permission('manage_expenses'));

drop policy if exists expenses_read_finance on app.expenses;
create policy expenses_read_finance
on app.expenses for select to authenticated
using (
  app.has_permission('view_financials')
  or app.has_permission('view_finance')
  or app.has_permission('manage_expenses')
);

drop policy if exists expenses_write_finance on app.expenses;
create policy expenses_write_finance
on app.expenses for insert to authenticated
with check (app.has_permission('manage_expenses'));

drop policy if exists expenses_update_finance on app.expenses;
create policy expenses_update_finance
on app.expenses for update to authenticated
using (app.has_permission('manage_expenses'))
with check (app.has_permission('manage_expenses'));

drop policy if exists expenses_delete_finance on app.expenses;
create policy expenses_delete_finance
on app.expenses for delete to authenticated
using (app.has_permission('manage_expenses'));

drop policy if exists capital_deposits_read_finance on app.capital_deposits;
create policy capital_deposits_read_finance
on app.capital_deposits for select to authenticated
using (
  app.has_permission('view_financials')
  or app.has_permission('view_finance')
  or app.can_manage_treasury()
);

drop policy if exists capital_deposits_write_finance on app.capital_deposits;
create policy capital_deposits_write_finance
on app.capital_deposits for insert to authenticated
with check (
  app.has_permission('record_deposits')
  or app.has_permission('manage_accounts')
);

drop policy if exists capital_deposits_update_finance on app.capital_deposits;
create policy capital_deposits_update_finance
on app.capital_deposits for update to authenticated
using (app.can_manage_treasury())
with check (app.can_manage_treasury());

/* ── 6. Privileges ───────────────────────────────────────────────────────── */

grant select, insert, update, delete on app.expense_categories, app.expenses
  to service_role;
grant select on app.expense_categories, app.expenses
  to authenticated;
grant insert, update, delete on app.expense_categories, app.expenses
  to authenticated;
grant select on app.bank_statement_sar to authenticated, service_role;

commit;
