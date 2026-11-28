begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Re-runnable against a database that already carries the V1 deployment.
 *
 * `supabase db push` replays this file, so no statement may assume the object
 * is absent. Tables use `if not exists` and are then widened column by column,
 * indexes use `if not exists`, functions and views are replaced, and every
 * policy and trigger is dropped before it is recreated. A fresh project and a
 * production project that already owns some of these relations converge on the
 * same schema.
 * ───────────────────────────────────────────────────────────────────────── */

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is
  'Kanjo V2 Financial/ERP schema. Supabase (PostgreSQL) is the system of record for identity, RBAC, contracts, wallets, ledgers and commissions.';

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Permission catalogue
 * Mirrors src/lib/rbac/permissions.ts. No roles: grants are explicit keys.
 * ───────────────────────────────────────────────────────────────────────── */
create table if not exists app.permissions (
  key           text        primary key,
  label         text        not null,
  description   text        not null default '',
  group_key     text        not null,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  constraint permissions_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

/* Reconciliation: a pre-existing table from the V1 deployment is
 * widened to this contract instead of being skipped wholesale. */
alter table app.permissions
  add column if not exists key         text,
  add column if not exists label       text        not null,
  add column if not exists description text        not null default '',
  add column if not exists group_key   text        not null,
  add column if not exists sort_order  integer     not null default 0,
  add column if not exists created_at  timestamptz not null default now();

comment on table app.permissions is
  'Capability catalogue. The only source of authorization truth; job titles never gate access.';

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Operator profile
 * Credentials live in Supabase auth.users (phone + password). This table
 * holds profile + authorization state only. Phone is the login identity.
 * ───────────────────────────────────────────────────────────────────────── */
create table if not exists app.users (
  id               uuid        primary key references auth.users (id) on delete cascade,
  phone            text        not null,
  email            text,
  full_name        text        not null default '',
  title            text        not null default '',
  team             text        not null default '',
  clearance_level  smallint    not null default 1,
  global_scope     boolean     generated always as (clearance_level >= 3) stored,
  active           boolean     not null default true,
  auth_revision    integer     not null default 1,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint users_clearance_range check (clearance_level between 1 and 4),
  constraint users_phone_e164 check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint users_email_shape check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

/* Reconciliation: a pre-existing table from the V1 deployment is
 * widened to this contract instead of being skipped wholesale. */
alter table app.users
  add column if not exists id              uuid references auth.users (id) on delete cascade,
  add column if not exists phone           text        not null,
  add column if not exists email           text,
  add column if not exists full_name       text        not null default '',
  add column if not exists title           text        not null default '',
  add column if not exists team            text        not null default '',
  add column if not exists clearance_level smallint    not null default 1,
  add column if not exists global_scope    boolean     generated always as (clearance_level >= 3) stored,
  add column if not exists active          boolean     not null default true,
  add column if not exists auth_revision   integer     not null default 1,
  add column if not exists last_login_at   timestamptz,
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

/* Adoption: `add column if not exists` cannot turn a plain boolean into a
 * generated column. A V1 profile table that already carries `global_scope` as
 * writable data would therefore silently stop deriving it from
 * clearance_level, and `isGlobalActor()` treats that flag as access granted —
 * so a demoted operator would keep the scope of their old rank. Fail here
 * instead of shipping an authorization invariant that does not hold. */
do $$
declare
  is_generated boolean;
begin
  select a.attgenerated <> ''
    into is_generated
    from pg_attribute a
   where a.attrelid = 'app.users'::regclass
     and a.attname = 'global_scope'
     and not a.attisdropped;

  if is_generated is false then
    raise exception
      'RBAC_SCHEMA_DRIFT: app.users.global_scope exists but is not a generated '
      'column, so it would drift from clearance_level. Drop the column and '
      'replay this migration, or convert it manually.'
      using errcode = '428C9';
  end if;
end;
$$;

comment on column app.users.phone is
  'E.164 login identity. Unique. Mirrors auth.users.phone.';
comment on column app.users.email is
  'Optional profile data. Never used for authentication, therefore not unique.';
comment on column app.users.global_scope is
  'Derived from clearance_level >= 3; cannot drift from the clearance level.';
comment on column app.users.full_name is
  'Defaults to empty on auth signup; the onboarding flow must set it. A profile is usable for authorization without a name, because name is presentation-only.';
comment on column app.users.auth_revision is
  'Incremented on any authorization change. Sessions with a lower revision are stale.';

create unique index if not exists users_phone_key on app.users (phone);

/* Adoption gate. `add column if not exists` cannot invent a key, and every
 * foreign key and `on conflict` upsert below binds to one of these three. The
 * check runs before the first foreign key is attached, so drift is reported by
 * name instead of surfacing as "no unique constraint matching given keys for
 * referenced table" from whichever statement happens to run first. A table that
 * does not exist yet is skipped: it is created below with its key in place. */
do $$
declare
  drift text;
begin
  select string_agg(format('app.%s (%s)', req.tbl, req.cols), ', ' order by req.tbl)
    into drift
  from (values
    ('permissions',      'key'),
    ('users',            'id'),
    ('user_permissions', 'user_id, permission_key')
  ) as req(tbl, cols)
  where to_regclass(format('app.%s', req.tbl)) is not null
    and not exists (
    select 1
      from pg_index i
      join pg_class c     on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'app'
       and c.relname = req.tbl
       and (i.indisprimary or i.indisunique)
       and (
         select array_agg(a.attname::text order by k.ord)
           from generate_series(1, i.indnkeyatts) as k(ord)
           join pg_attribute a
             on a.attrelid = c.oid and a.attnum = i.indkey[k.ord - 1]
       ) = string_to_array(replace(req.cols, ' ', ''), ',')
  );

  if drift is not null then
    raise exception
      'RBAC_SCHEMA_DRIFT: % carries no primary or unique key. The table already '
      'exists from the V1 deployment, so the RBAC foreign keys and grant upserts '
      'cannot bind to it. Add the key, or drop the empty table and replay.',
      drift
      using errcode = '42830';
  end if;
end;
$$;

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Explicit capability grants
 * ───────────────────────────────────────────────────────────────────────── */
create table if not exists app.user_permissions (
  user_id        uuid        not null references app.users (id) on delete cascade,
  permission_key text        not null references app.permissions (key) on delete restrict,
  granted_by     uuid        references app.users (id) on delete set null,
  granted_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);

/* Reconciliation: a pre-existing table from the V1 deployment is
 * widened to this contract instead of being skipped wholesale. */
alter table app.user_permissions
  add column if not exists user_id        uuid        not null references app.users (id) on delete cascade,
  add column if not exists permission_key text        not null references app.permissions (key) on delete restrict,
  add column if not exists granted_by     uuid        references app.users (id) on delete set null,
  add column if not exists granted_at     timestamptz not null default now();

create index if not exists user_permissions_permission_idx
  on app.user_permissions (permission_key);

/* ─────────────────────────────────────────────────────────────────────────
 * 4. City scope
 * city_id is a Firebase document id. There is deliberately NO foreign key:
 * cities live in Firestore (Operations), so referential integrity across the
 * two databases is enforced by the Tier 3 service, not by PostgreSQL.
 * ───────────────────────────────────────────────────────────────────────── */
create table if not exists app.user_city_scope (
  user_id    uuid        not null references app.users (id) on delete cascade,
  city_id    text        not null,
  granted_by uuid        references app.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, city_id),
  constraint user_city_scope_city_present check (length(btrim(city_id)) > 0)
);

/* Reconciliation: a pre-existing table from the V1 deployment is
 * widened to this contract instead of being skipped wholesale. */
alter table app.user_city_scope
  add column if not exists user_id    uuid        not null references app.users (id) on delete cascade,
  add column if not exists city_id    text        not null,
  add column if not exists granted_by uuid        references app.users (id) on delete set null,
  add column if not exists granted_at timestamptz not null default now();

comment on column app.user_city_scope.city_id is
  'Firestore city document id. No FK by design: cross-database reference.';

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Updated-at maintenance
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on app.users;
create trigger users_touch_updated_at
before update on app.users
for each row execute function app.touch_updated_at();

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Invariant: an active operator must always retain manage_permissions
 * Mirrors assertActiveGovernor() in src/lib/rbac/users.ts: the rule only
 * blocks *removing* the last governor, never ordinary profile edits, so the
 * very first operator can still be bootstrapped.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.assert_governor_remaining(affected_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app.users u
    join app.user_permissions p on p.user_id = u.id
    where u.id = affected_user
      and u.active
      and p.permission_key = 'manage_permissions'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from app.users u
    join app.user_permissions p on p.user_id = u.id
    where u.active
      and p.permission_key = 'manage_permissions'
  ) then
    raise exception
      'RBAC_INVARIANT: at least one active operator must retain manage_permissions'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function app.user_permissions_governor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
begin
  if tg_op = 'INSERT' then
    return null; -- granting can never remove a governor
  end if;

  if old.permission_key = 'manage_permissions' then
    affected := old.user_id;
  end if;

  if affected is not null then
    perform app.assert_governor_remaining(affected);
  end if;

  return null;
end;
$$;

create or replace function app.users_governor_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  was_governor boolean;
begin
  was_governor := old.active and exists (
    select 1 from app.user_permissions p
    where p.user_id = old.id
      and p.permission_key = 'manage_permissions'
  );

  if not was_governor then
    return null;
  end if;

  if tg_op = 'UPDATE' and new.active then
    return null; -- still active, governorship unchanged
  end if;

  perform app.assert_governor_remaining(old.id);
  return null;
end;
$$;

drop trigger if exists user_permissions_governor_guard on app.user_permissions;
create constraint trigger user_permissions_governor_guard
after insert or update or delete on app.user_permissions
deferrable initially deferred
for each row execute function app.user_permissions_governor_guard();

drop trigger if exists users_governor_guard on app.users;
create constraint trigger users_governor_guard
after update or delete on app.users
deferrable initially deferred
for each row execute function app.users_governor_guard();

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Profile provisioning from Supabase Auth
 * auth.users is authoritative for credentials. This trigger mirrors the
 * phone/email into the profile row so the app never joins the auth schema.
 * SECURITY DEFINER is required: the auth schema is not writable by clients.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.handle_auth_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null or btrim(new.phone) = '' then
    raise exception
      'AUTH_PHONE_REQUIRED: Kanjo login is phone + password; auth.users.phone must be set'
      using errcode = '23514';
  end if;

  insert into app.users (id, phone, email)
  values (
    new.id,
    coalesce(new.phone, ''),
    new.email
  )
  on conflict (id) do update
    set phone = coalesce(excluded.phone, app.users.phone),
        email = excluded.email;
  return new;
end;
$$;

drop trigger if exists auth_user_upsert_profile on auth.users;
create trigger auth_user_upsert_profile
after insert or update of phone, email on auth.users
for each row execute function app.handle_auth_user_upsert();

/* ─────────────────────────────────────────────────────────────────────────
 * 8. RLS helpers
 * SECURITY DEFINER so a policy on app.users can call a function that reads
 * app.users without recursing into its own RLS.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.user_permissions p
    join app.users u on u.id = p.user_id
    where p.user_id = auth.uid()
      and p.permission_key = p_key
      and u.active
  );
$$;

create or replace function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.users u
    where u.id = auth.uid() and u.active
  );
$$;

/* ─────────────────────────────────────────────────────────────────────────
 * 9. Row Level Security
 * ───────────────────────────────────────────────────────────────────────── */
alter table app.users            enable row level security;
alter table app.user_permissions enable row level security;
alter table app.user_city_scope  enable row level security;
alter table app.permissions      enable row level security;

alter table app.users            force row level security;
alter table app.user_permissions force row level security;
alter table app.user_city_scope  force row level security;
alter table app.permissions      force row level security;

-- Catalogue: readable by any active operator, writable by service role only.
drop policy if exists permissions_read_active on app.permissions;
create policy permissions_read_active on app.permissions
  for select to authenticated
  using (app.is_active_user());

-- Profile: read your own row, or anyone's with manage_permissions.
drop policy if exists users_read_self_or_governor on app.users;
create policy users_read_self_or_governor on app.users
  for select to authenticated
  using (id = auth.uid() or app.has_permission('manage_permissions'));

-- Profile mutation is governor-only. Self-service edits go through a
-- dedicated RPC so a user can never change clearance_level or active.
drop policy if exists users_write_governor on app.users;
create policy users_write_governor on app.users
  for update to authenticated
  using (app.has_permission('manage_permissions'))
  with check (app.has_permission('manage_permissions'));

drop policy if exists users_insert_governor on app.users;
create policy users_insert_governor on app.users
  for insert to authenticated
  with check (app.has_permission('manage_permissions'));

drop policy if exists users_delete_governor on app.users;
create policy users_delete_governor on app.users
  for delete to authenticated
  using (app.has_permission('manage_permissions'));

-- Grants: a user may read their own capability set (needed to build a
-- session); managing grants requires manage_permissions.
drop policy if exists user_permissions_read_self_or_governor on app.user_permissions;
create policy user_permissions_read_self_or_governor on app.user_permissions
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('manage_permissions'));

drop policy if exists user_permissions_write_governor on app.user_permissions;
create policy user_permissions_write_governor on app.user_permissions
  for all to authenticated
  using (app.has_permission('manage_permissions'))
  with check (app.has_permission('manage_permissions'));

-- City scope: same shape as grants.
drop policy if exists user_city_scope_read_self_or_governor on app.user_city_scope;
create policy user_city_scope_read_self_or_governor on app.user_city_scope
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('manage_permissions'));

drop policy if exists user_city_scope_write_governor on app.user_city_scope;
create policy user_city_scope_write_governor on app.user_city_scope
  for all to authenticated
  using (app.has_permission('manage_permissions'))
  with check (app.has_permission('manage_permissions'));

grant usage on schema app to authenticated;
grant select on app.permissions to authenticated;
grant select, insert, update, delete on app.users,
  app.user_permissions, app.user_city_scope to authenticated;

commit;
