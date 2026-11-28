begin;

/* ─────────────────────────────────────────────────────────────────────────
 * The operator directory in one read.
 *
 * `listUsers()` answers "who exists, and what may each of them do". It used to
 * cost three round trips (profiles, grants, city scope) plus a Worker-side join
 * of the three result sets — including a `.filter(isPermission)` pass per user
 * and a `localeCompare` sort — before a single row reached the admin matrix,
 * the assignable-manager picker or the governor invariant check.
 *
 * The join is SQL's job. This function returns the same documents
 * `app.rbac_session(uuid)` already returns for one operator, aggregated into one
 * jsonb array, so the Worker receives the answer instead of assembling it.
 *
 * Document shape is deliberately identical to `rbac_session`'s: one TypeScript
 * mapper (`toOperator` in `documents.ts`) reads both, and a field added to one
 * path cannot silently diverge from the other.
 *
 * `security definer` so the read is not subject to RLS recursion on the tables
 * the policies themselves consult; `search_path = ''` pins every reference to an
 * explicit schema. Service role only: the payload is every operator's grant set.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.rbac_user_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(directory.document order by directory.sort_name), '[]'::jsonb)
  from (
    select
      u.full_name as sort_name,
      jsonb_build_object(
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
        )
      ) as document
      from app.users u
  ) directory;
$$;

comment on function app.rbac_user_directory() is
  'Every operator profile with their capability keys and city scope, aggregated into one jsonb array. Service role only: the payload is the whole roster''s authorization data.';

revoke all on function app.rbac_user_directory() from public;
grant execute on function app.rbac_user_directory() to service_role;

commit;
