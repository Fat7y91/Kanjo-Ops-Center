begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Treasury access tiers.
 *
 * Until now a single `view_accounts` grant exposed the whole book: every bank
 * account, every movement, the derived balance and the expense history. That is
 * correct for Founders, System Admins and the Head of Accounts, but wrong for a
 * City Manager, whose only reason to open the module is depositing cash into
 * the Egyptian accounts they cover.
 *
 * Two changes:
 *   1. A new `record_deposits` capability opens the module for deposit entry.
 *   2. Row Level Security distinguishes the two audiences at the database, not
 *      just in React. A deposit-only caller can read the Egyptian accounts they
 *      may fund and their own deposits, and can insert deposits only. The
 *      Saudi account and every expense row stay invisible.
 *
 * This migration also grants the four earlier migrations' tables to
 * `authenticated`. Those migrations created policies but no table privileges,
 * so no client role could reach them at all; RLS never even ran.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order)
values (
  'record_deposits',
  'تسجيل الإيداعات',
  'تسجيل إيداعات الحسابات البنكية المصرية فقط، دون الاطلاع على الأرصدة أو المصروفات.',
  'المالية',
  41
)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* ─────────────────────────────────────────────────────────────────────────
 * Capability helpers. Wrapped in functions so every policy reads the same rule
 * and a future tier change touches one place.
 * ───────────────────────────────────────────────────────────────────────── */

/* Full book access: the accountant audience. */
create or replace function app.can_read_ledger()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('view_accounts')
      or app.has_permission('manage_accounts');
$$;

/* Deposit-only access: the city manager audience. */
create or replace function app.can_record_deposits()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('record_deposits');
$$;

comment on function app.can_read_ledger() is
  'True for viewers who may read the full treasury book, balances and expenses included.';
comment on function app.can_record_deposits() is
  'True for deposit-only viewers. Narrow: Egyptian accounts, deposits, no balances.';

/* ─────────────────────────────────────────────────────────────────────────
 * Bank accounts. A deposit-only viewer sees Egyptian accounts only; the Saudi
 * account is funded centrally and is never a city manager's to touch.
 * ───────────────────────────────────────────────────────────────────────── */

drop policy if exists bank_accounts_read_capable on app.bank_accounts;

create policy bank_accounts_read_capable on app.bank_accounts
  for select to authenticated
  using (
    app.can_read_ledger()
    or (app.can_record_deposits() and country_code = 'EG')
  );

/* ─────────────────────────────────────────────────────────────────────────
 * Ledger. Read mirrors the account rule and, for deposit-only viewers, is
 * further narrowed to deposit rows: an expense row is never a city manager's
 * business even on an account they fund.
 *
 * Insert is split into two policies so a deposit-only caller can only ever
 * write `deposit`, and only against an Egyptian account.
 * ───────────────────────────────────────────────────────────────────────── */

drop policy if exists ledger_entries_read_capable on app.ledger_entries;

create policy ledger_entries_read_capable on app.ledger_entries
  for select to authenticated
  using (
    app.can_read_ledger()
    or (
      app.can_record_deposits()
      and kind = 'deposit'
      and exists (
        select 1 from app.bank_accounts a
        where a.id = account_id and a.country_code = 'EG'
      )
    )
  );

drop policy if exists ledger_entries_insert_capable on app.ledger_entries;

create policy ledger_entries_insert_capable on app.ledger_entries
  for insert to authenticated
  with check (app.has_permission('manage_accounts'));

create policy ledger_entries_insert_deposits on app.ledger_entries
  for insert to authenticated
  with check (
    app.can_record_deposits()
    and kind = 'deposit'
    and exists (
      select 1 from app.bank_accounts a
      where a.id = account_id and a.country_code = 'EG'
    )
  );

/* ─────────────────────────────────────────────────────────────────────────
 * Table privileges.
 *
 * RLS decides which rows a role sees; the GRANT decides whether the role may
 * issue the statement at all. The four treasury/marketing/payroll migrations
 * wrote policies but no grants, so no client role could read those tables and
 * RLS was never consulted. These grants make the policies live.
 *
 * Only the statements the policies cover are granted: the immutable tables get
 * SELECT and INSERT and nothing else, matching the append-only triggers.
 * ───────────────────────────────────────────────────────────────────────── */

grant select, insert, update on app.bank_accounts to authenticated;
grant select, insert on app.ledger_entries to authenticated;

grant select, insert, update, delete on app.payroll_profiles to authenticated;
grant select, insert, update, delete on app.payroll_commission_tiers to authenticated;
grant select, insert, update, delete on app.payroll_kpi_links to authenticated;
grant select, insert, update, delete on app.payroll_runs to authenticated;
grant select, insert, update, delete on app.payroll_lines to authenticated;
grant select on app.payroll_run_totals to authenticated;

/* Settings use a `for all` policy, so the grant must cover every verb the
 * policy already authorizes. Entries are append-only: SELECT and INSERT only. */
grant select, insert, update, delete on app.marketing_platform_settings
  to authenticated;
grant select, insert on app.marketing_entries to authenticated;

grant select on app.account_balances to authenticated;
grant select on app.marketing_platform_settings_public to authenticated;

/* service_role mirrors every grant so server-side jobs keep full access. */
grant select, insert, update, delete on app.bank_accounts,
  app.ledger_entries,
  app.payroll_profiles,
  app.payroll_commission_tiers,
  app.payroll_kpi_links,
  app.payroll_runs,
  app.payroll_lines,
  app.marketing_platform_settings,
  app.marketing_entries to service_role;
grant select on app.payroll_run_totals,
  app.account_balances,
  app.marketing_platform_settings_public to service_role;

/* The derived views run with the caller's rights (`security_invoker`), so the
 * reader needs to see the underlying rows too. Those grants are above. */

commit;
