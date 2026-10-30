begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Fix: phone-only signup fails because GoTrue writes email = ''.
 *
 * Diagnostics from the bootstrap route showed `owner_bypassrls: true` and the
 * `users_auth_mirror_*` policies present, which rules out row level security as
 * the cause of:
 *
 *   [unexpected_failure] Database error creating new user  (HTTP 500)
 *
 * The real blocker is a CHECK constraint. Supabase's `auth.users.email` is
 * nullable, but GoTrue stores an empty string rather than NULL for a
 * phone-only account. `app.handle_auth_user_upsert()` mirrored that value
 * verbatim, and `users_email_shape` only allows NULL or a well-formed address:
 *
 *   new row for relation "users" violates check constraint "users_email_shape"
 *
 * GoTrue cannot surface the underlying SQL error, so the constraint violation
 * appeared as an opaque 500. Reproduced on PostgreSQL 15 against the real
 * migrations: the same insert succeeds with a NULL email and fails with ''.
 *
 * Fix: normalize blank email to NULL at the mirror boundary. `email` is
 * optional, non-unique profile data that is never used for authentication, so
 * collapsing '' and '   ' to NULL is the correct representation.
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
    -- GoTrue sends '' for phone-only accounts; store that as NULL so the
    -- email-shape constraint is only ever applied to real addresses.
    nullif(btrim(coalesce(new.email, '')), '')
  )
  on conflict (id) do update
    set phone = coalesce(excluded.phone, app.users.phone),
        email = excluded.email;

  return new;
end;
$$;

-- Normalize any profile rows written before this fix, so a later re-mirror
-- cannot collide with a pre-existing blank-email row.
update app.users
   set email = null
 where email is not null
   and btrim(email) = '';

/* ─────────────────────────────────────────────────────────────────────────
 * Probe: report the email constraint and what the trigger now writes.
 *
 * GoTrue discards the database error behind "Database error creating new
 * user", so any trigger-side failure looks identical. The two facts that
 * distinguish this failure are the constraint definition and whether a blank
 * email is normalized before it reaches the constraint.
 * ───────────────────────────────────────────────────────────────────────── */
create or replace function app.bootstrap_probe()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email_shape_constraint', (
      select pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'app' and t.relname = 'users'
        and c.conname = 'users_email_shape'
    ),
    'empty_string_passes_constraint', (
      select case
        when nullif(btrim(''), '') is null then true
        else nullif(btrim(''), '') ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      end
    ),
    'blank_emails_remaining', (
      select count(*) from app.users
      where email is not null and btrim(email) = ''
    )
  );
$$;

comment on function app.bootstrap_probe() is
  'Read-only probe for the one-shot founder bootstrap route. Remove together with that route.';

grant execute on function app.bootstrap_probe() to service_role;

commit;
