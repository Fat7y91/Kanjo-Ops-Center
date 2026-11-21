begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Fix: the auth mirror trigger is blocked by FORCE ROW LEVEL SECURITY.
 *
 * `app.users` uses `force row level security` so that even the table owner is
 * subject to policies. `app.handle_auth_user_upsert()` is SECURITY DEFINER, but
 * a SECURITY DEFINER function only escapes RLS when its owner has BYPASSRLS.
 * When the migration was run by an owner without that attribute, the trigger's
 * INSERT into app.users is rejected:
 *
 *   new row violates row-level security policy for table "users"
 *
 * GoTrue cannot see the underlying SQL error, so every admin `createUser` fails
 * with the opaque pair:
 *
 *   [unexpected_failure] Database error creating new user  (http 500)
 *
 * The fix grants the trigger's owner explicit policies. `on conflict (id) do
 * update` also requires SELECT and UPDATE on the conflicting row, so all three
 * commands are covered. This is scoped to the owner role only, so access for
 * `authenticated` is unchanged.
 *
 * Idempotent: policies are dropped and recreated, and the owner role is read
 * from the catalogue rather than hard-coded, so this survives a migration run
 * under a different role.
 * ───────────────────────────────────────────────────────────────────────── */

do $$
declare
  owner_role text;
begin
  select pg_get_userbyid(p.proowner)
    into owner_role
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app'
    and p.proname = 'handle_auth_user_upsert';

  if owner_role is null then
    raise exception
      'Fix migration aborted: app.handle_auth_user_upsert() not found. Apply 20261029000000_rbac_foundation.sql first.';
  end if;

  execute 'drop policy if exists users_auth_mirror_insert on app.users';
  execute 'drop policy if exists users_auth_mirror_select on app.users';
  execute 'drop policy if exists users_auth_mirror_update on app.users';

  execute format(
    'create policy users_auth_mirror_insert on app.users for insert to %I with check (true)',
    owner_role
  );
  execute format(
    'create policy users_auth_mirror_select on app.users for select to %I using (true)',
    owner_role
  );
  execute format(
    'create policy users_auth_mirror_update on app.users for update to %I using (true) with check (true)',
    owner_role
  );

  raise notice 'auth mirror policies created for role %', owner_role;
end;
$$;

/* ─────────────────────────────────────────────────────────────────────────
 * Diagnostics for the bootstrap route.
 *
 * The Admin API never returns the SQL error behind "Database error creating
 * new user", so the temporary bootstrap endpoint reads this instead. It reports
 * the trigger owner, whether that owner bypasses RLS, whether the table forces
 * RLS, and the current policy list — the four facts needed to explain a mirror
 * failure without database log access.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.bootstrap_diagnostics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trigger_owner', (
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname = 'handle_auth_user_upsert'
    ),
    'owner_bypassrls', (
      select r.rolbypassrls
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
      where n.nspname = 'app' and p.proname = 'handle_auth_user_upsert'
    ),
    'users_force_rls', (
      select c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname = 'users'
    ),
    'users_policies', (
      select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'app' and tablename = 'users'
    )
  );
$$;

comment on function app.bootstrap_diagnostics() is
  'Read-only setup diagnostics for the one-shot founder bootstrap route. Remove together with that route.';

grant execute on function app.bootstrap_diagnostics() to service_role;

commit;
