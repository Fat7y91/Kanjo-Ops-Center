begin;

/* ───────────────────────────────────────────────────────────────────────────
 * Add the login phone to the two RBAC documents.
 *
 * The operator cards show the mobile number as the primary login credential;
 * before this migration both `rbac_session` and `rbac_user_directory` only
 * carried the email, so admin-migrated accounts rendered a long V1 id.
 *
 * `create or replace` keeps the jsonb return type, so existing callers keep
 * working and a deployment whose code runs ahead of this migration degrades to
 * an empty phone (`toOperator` falls back to email).
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
      'phone', u.phone,
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
  'Profile (including the login phone), capability keys, city scope and the global revision for one operator in a single read. Service role only: the payload is another operator''s authorization data when called with their id.';

revoke all on function app.rbac_session(uuid) from public;
grant execute on function app.rbac_session(uuid) to service_role;

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
          'phone', u.phone,
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
  'Every operator profile (including the login phone) with their capability keys and city scope, aggregated into one jsonb array. Service role only: the payload is the whole roster''s authorization data.';

revoke all on function app.rbac_user_directory() from public;
grant execute on function app.rbac_user_directory() to service_role;

commit;
