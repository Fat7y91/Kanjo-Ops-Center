begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Treasury gate for the profile/capital surfaces.
 *
 * `20261102000001_user_profiles_and_capital.sql` gated payout and capital
 * decisions on `manage_accounts`. That key belongs to the legacy catalogue:
 * `20261101000000_seed_l4_new_permissions.sql` replaced the Level 4 grants with
 * the 49-key catalogue, which has no `manage_accounts`, so the policy could
 * only ever be satisfied by a stale grant. The surfaces would have looked
 * correct in code and been impossible to use through RLS.
 *
 * The replacement mirrors `resolveTreasuryAccess()` in
 * `src/lib/accounts/access.ts`: "full book" is `view_bank_balances` or
 * `add_bank_account`. A deposit-only operator (`record_bank_transaction`) must
 * not decide capital or review payout destinations — that is precisely the tier
 * split the treasury refactor introduced.
 * ───────────────────────────────────────────────────────────────────────── */

/* Full-book authority, in one place so both table families read the same rule. */
create or replace function app.can_manage_treasury()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('view_bank_balances')
      or app.has_permission('add_bank_account');
$$;

comment on function app.can_manage_treasury() is
  'True for the full treasury audience: sees balances and may record expenses. Mirrors resolveTreasuryAccess().full.';

/* ── Payout methods ────────────────────────────────────────────────────── */

drop policy if exists user_payout_methods_read on app.user_payout_methods;
create policy user_payout_methods_read on app.user_payout_methods
  for select to authenticated
  using (user_id = auth.uid() or app.can_manage_treasury());

drop policy if exists user_payout_methods_update on app.user_payout_methods;
create policy user_payout_methods_update on app.user_payout_methods
  for update to authenticated
  using (user_id = auth.uid() or app.can_manage_treasury())
  with check (user_id = auth.uid() or app.can_manage_treasury());

/* ── Founder capital ───────────────────────────────────────────────────── */

drop policy if exists capital_deposits_read on app.capital_deposits;
create policy capital_deposits_read on app.capital_deposits
  for select to authenticated
  using (founder_id = auth.uid() or app.can_manage_treasury());

/* The self-review ban stays in the trigger: a policy cannot compare the row's
 * founder against the acting operator across the UPDATE target row. */
drop policy if exists capital_deposits_decide_finance on app.capital_deposits;
create policy capital_deposits_decide_finance on app.capital_deposits
  for update to authenticated
  using (app.can_manage_treasury())
  with check (app.can_manage_treasury());

commit;
