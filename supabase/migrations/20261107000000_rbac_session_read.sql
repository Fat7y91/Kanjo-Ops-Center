begin;

/* ─────────────────────────────────────────────────────────────────────────
 * One read per session resolution.
 *
 * Every page render resolved its session with six queries: three for the
 * operator profile (`users` + `user_permissions` + `user_city_scope`) and three
 * more to rebuild the entire permission graph, join it in the Worker and reduce
 * it to a single revision number. On an Edge Worker billed per CPU millisecond
 * that is the largest fixed cost a page pays before it does any work of its own
 * (see docs/CPU_1102_AUDIT.md §RC-4).
 *
 * This migration moves both jobs into SQL:
 *
 *   - `app.rbac_revision()` — the revision as one scalar, instead of a graph
 *     rebuild whose only consumer is a comparison against a cookie;
 *   - `app.rbac_session(uuid)` — profile, capability keys, city scope and the
 *     revision as one jsonb document, so a render costs a single round trip.
 *
 * Both are read-only and both stay callable while the schema lags: a deployment
 * whose code runs ahead of this file falls back to the old queries, because the
 * repository treats a missing function exactly like a missing table.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Revision as a scalar ─────────────────────────────────────────────────
 * Semantics are deliberately unchanged: the newest mutation timestamp across
 * profiles, grants and city scope, floored to whole seconds — the value the
 * TypeScript side computed with `Date.parse()` before. A session cookie is
 * stale when its `rev` is below this number.
 *
 * `security definer` so the read is not subject to RLS recursion on the tables
 * the policies themselves consult; `search_path = ''` pins every reference to
 * an explicit schema.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.rbac_revision()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce(
      (select max(floor(extract(epoch from u.updated_at)))::bigint
         from app.users u),
      0
    ),
    coalesce(
      (select max(floor(extract(epoch from g.granted_at)))::bigint
         from app.user_permissions g),
      0
    ),
    coalesce(
      (select max(floor(extract(epoch from s.granted_at)))::bigint
         from app.user_city_scope s),
      0
    )
  );
$$;

comment on function app.rbac_revision() is
  'Newest authorization mutation (unix seconds) across profiles, grants and city scope. A session whose rev is lower is stale.';

grant execute on function app.rbac_revision() to authenticated, service_role;

/* ── Session snapshot in one document ─────────────────────────────────────
 * Returns `null` when the id has no profile row, so "no such operator" stays
 * distinguishable from "operator with no grants".
 *
 * `team_name` comes from the same left join the PostgREST projection made; a
 * profile without a team keeps a null embed. Capability keys are ordered here
 * so the session a page receives does not depend on heap order.
 *
 * Service role only. With `security definer` the default PUBLIC grant would
 * let any caller read another operator's grants by guessing a uuid, so the
 * PUBLIC grant is revoked explicitly rather than relied upon to be absent.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.rbac_session(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'name', u.full_name,
      'email', u.email,
      'title', u.title,
      'team', u.team,
      'teamId', u.team_id,
      'teamName', (
        select t.name
          from app.field_teams t
         where t.id = u.team_id
      ),
      'clearanceLevel', u.clearance_level,
      'globalScope', u.global_scope,
      'active', u.active,
      'updatedAt', u.updated_at
    ),
    'permissions', coalesce(
      (
        select jsonb_agg(g.permission_key order by g.permission_key)
          from app.user_permissions g
         where g.user_id = u.id
      ),
      '[]'::jsonb
    ),
    'cities', coalesce(
      (
        select jsonb_agg(s.city_id order by s.city_id)
          from app.user_city_scope s
         where s.user_id = u.id
      ),
      '[]'::jsonb
    ),
    'revision', app.rbac_revision()
  )
  from app.users u
  where u.id = p_user_id;
$$;

comment on function app.rbac_session(uuid) is
  'Profile, capability keys, city scope and the global revision for one operator in a single read. Service role only: the payload is another operator''s authorization data when called with their id.';

revoke all on function app.rbac_session(uuid) from public;
grant execute on function app.rbac_session(uuid) to service_role;

commit;
