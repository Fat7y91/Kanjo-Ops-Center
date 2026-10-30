begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Fix: the mirror trigger fails because GoTrue stores phone without '+'.
 *
 * Previous diagnostics cleared the first two suspects:
 *   - RLS:          owner_bypassrls = true, users_auth_mirror_* all present
 *   - email shape:  blank_emails_remaining = 0, '' now normalized to NULL
 *
 * Yet auth.admin.createUser still returned:
 *
 *   [unexpected_failure] Database error creating new user  (HTTP 500)
 *
 * The last CHECK constraint the mirror insert can violate is users_phone_e164:
 *
 *   CHECK (phone ~ '^\+[1-9][0-9]{7,14}$')
 *
 * Supabase's auth.users.phone holds the number WITHOUT the leading '+'
 * ('201040491882'), while the Admin API accepts it WITH the '+' ('+201040491882').
 * The trigger copied the stored value verbatim, so the stricter app constraint
 * rejected it. Reproduced on PostgreSQL 15:
 *
 *   insert into auth.users(phone) values ('201040491882')
 *   -> new row for relation "users" violates check constraint "users_phone_e164"
 *
 * Fix: canonicalize the phone at the mirror boundary, so app.users always holds
 * exactly one '+' followed by digits, regardless of how GoTrue stored it. E.164
 * with the '+' stays the app-level identity because the schema, provisioning
 * validation and profile lookups all already assume that form.
 * ───────────────────────────────────────────────────────────────────────── */

/*
 * Single source of truth for phone canonicalization. Immutable and pure so it
 * can be used in the trigger, the backfill and diagnostics.
 * Returns NULL when the input contains no digits at all.
 */
create or replace function app.normalize_phone(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') = '' then null
    else '+' || regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g')
  end;
$$;

comment on function app.normalize_phone(text) is
  'Canonical E.164 form for app.users.phone: one leading + then digits, whatever GoTrue stored in auth.users.phone.';

create or replace function app.handle_auth_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_phone text := app.normalize_phone(new.phone);
begin
  if normalized_phone is null then
    raise exception
      'AUTH_PHONE_REQUIRED: Kanjo login is phone + password; auth.users.phone must be set'
      using errcode = '23514';
  end if;

  if normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception
      'AUTH_PHONE_INVALID: % is not a valid E.164 number once normalized to %',
      coalesce(new.phone, ''), normalized_phone
      using errcode = '23514';
  end if;

  insert into app.users (id, phone, email)
  values (
    new.id,
    normalized_phone,
    -- GoTrue sends '' for phone-only accounts; store that as NULL so the
    -- email-shape constraint is only ever applied to real addresses.
    nullif(btrim(coalesce(new.email, '')), '')
  )
  on conflict (id) do update
    set phone = excluded.phone,
        email = excluded.email;

  return new;
end;
$$;

/*
 * Backfill: rewrite any profile rows whose phone is not already canonical.
 * Guarded so a pre-existing duplicate cannot abort the whole migration; such a
 * row is reported instead of silently blocking every future signup.
 */
do $$
declare
  stale integer;
begin
  select count(*) into stale
  from app.users
  where phone is distinct from app.normalize_phone(phone);

  if stale > 0 then
    begin
      update app.users
         set phone = app.normalize_phone(phone)
       where phone is distinct from app.normalize_phone(phone);
      raise notice 'normalized % app.users.phone value(s)', stale;
    exception
      when unique_violation then
        raise warning
          'Could not normalize % app.users.phone row(s): normalization would create a duplicate. Resolve manually.',
          stale;
    end;
  end if;
end;
$$;

/* ─────────────────────────────────────────────────────────────────────────
 * Probe: report both remaining failure surfaces plus the live auth phone form.
 *
 * The format GoTrue actually stored is the decisive fact, and it cannot be read
 * through PostgREST (auth is not an exposed schema). This SECURITY DEFINER
 * function reports only the *shape* of the newest auth phone, never the number.
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
    'phone_e164_constraint', (
      select pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'app' and t.relname = 'users'
        and c.conname = 'users_phone_e164'
    ),
    'blank_emails_remaining', (
      select count(*) from app.users
      where email is not null and btrim(email) = ''
    ),
    'non_canonical_phones_remaining', (
      select count(*) from app.users
      where phone is distinct from app.normalize_phone(phone)
    ),
    'normalize_sample', app.normalize_phone('201040491882'),
    'auth_phone_shape', (
      select case
        when u.phone is null then 'null'
        when u.phone like '+%' then 'plus_prefixed'
        else 'bare_digits'
      end
      from auth.users u
      order by u.created_at desc nulls last
      limit 1
    )
  );
$$;

comment on function app.bootstrap_probe() is
  'Read-only probe for the one-shot founder bootstrap route. Remove together with that route.';

grant execute on function app.bootstrap_probe() to service_role;

commit;
