begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Privileges for the financial engine objects.
 *
 * RLS policies decide *which rows* a role may see; they do not grant the base
 * privilege to touch the object at all. Without these grants the service-role
 * client returned "permission denied for view journal_account_balances" and the
 * clearinghouse would render empty against a live database.
 *
 * Reads: journal/accounts/receipts are visible to the same roles the RLS
 * policies allow. The service role (server repositories) reads everything.
 * Writes: journal rows are posted only by SECURITY DEFINER functions, so no
 * direct INSERT grant is given except the explicit manual-posting capability.
 * ───────────────────────────────────────────────────────────────────────── */

grant usage on schema app to authenticated, service_role;

/* ── Chart of accounts + journal reads ──────────────────────────────────── */
grant select on app.accounts,
              app.journal_entries,
              app.journal_lines,
              app.transaction_receipts
  to authenticated, service_role;

grant select on app.journal_account_balances to authenticated, service_role;

/* ── Manual journal posting capability ──────────────────────────────────── */
grant insert on app.journal_entries, app.journal_lines
  to authenticated;
grant insert on app.journal_entries, app.journal_lines
  to service_role;

grant insert on app.transaction_receipts to authenticated, service_role;

/* ── Operations + coupons writes used by the server repositories ────────── */
grant select, insert, update on app.operation_logs to service_role;
grant select, insert, update, delete on app.coupons to service_role;
grant select, insert, update, delete on app.couriers to service_role;

/* ── Functions callable over PostgREST ──────────────────────────────────── */
grant execute on function app.post_settlement(uuid, uuid, text, text, text, integer)
  to service_role;
grant execute on function app.party_account(text, app.party_type, text, text)
  to service_role;
grant execute on function app.system_account(text)
  to service_role;

commit;
