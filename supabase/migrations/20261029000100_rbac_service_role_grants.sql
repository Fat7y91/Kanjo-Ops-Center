begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Service-role privileges for the `app` schema.
 *
 * The RBAC foundation migration granted access to `authenticated` only. The
 * provisioning service (§7.6) writes through the service-role client, which is
 * a different role: it bypasses RLS but still needs table privileges. Without
 * these grants `POST /api/admin/users/provision` fails with a permission
 * denied error on the first profile update.
 *
 * service_role is a server-only role; the key never reaches the browser.
 * RLS stays forced for every other role, so these grants do not widen client
 * access.
 * ───────────────────────────────────────────────────────────────────────── */

grant usage on schema app to service_role;

grant select, insert, update, delete on app.users,
  app.user_permissions, app.user_city_scope to service_role;

grant select on app.permissions to service_role;
grant insert, update, delete on app.permissions to service_role;

commit;
