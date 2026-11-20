begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Grant the courier attendance override table to the API roles.
 *
 * The original attendance migration granted `authenticated` (row-level access
 * for the browser session) but the server repositories run as `service_role`,
 * which bypasses RLS yet still needs table privileges. Without this grant every
 * roster read that folds attendance failed with `42501 permission denied`,
 * taking the couriers page down. Grant the same four verbs the roster uses.
 *
 * Idempotent: `grant` is a no-op when the privilege already exists.
 * ───────────────────────────────────────────────────────────────────────── */

grant select, insert, update, delete
  on app.courier_attendance
  to service_role;

commit;
