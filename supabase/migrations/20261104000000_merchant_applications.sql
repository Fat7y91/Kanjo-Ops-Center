begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Pillar 2c — inbound merchant applications.
 *
 * `https://joinus.kanjo.com.eg` is a static landing page for new merchants.
 * It has no session and no service key, so the only thing it can do is post a
 * form to `POST /api/public/merchants/apply`. This table is the intake record
 * for those submissions; the Ops Center is the CRM that reviews them
 * (`/merchants/applications`, gated by `manage_merchant_applications`).
 *
 * Shape notes:
 *
 *   - `phone_number` holds digits only, already normalized to the 20 country
 *     code by the API (see `src/lib/field-ops/whatsapp.ts`). Storing the raw
 *     string would make the "have we already called this number?" lookup in
 *     the review queue unreliable.
 *   - There is no foreign key to `app.merchants`: an application is not a
 *     merchant yet. Promotion to a merchant is a reviewed action inside the
 *     CRM, not a side effect of the public form.
 *   - `status` is the review lifecycle, not a merchant contract state. The
 *     applicant cannot set it — the public policy forces `pending` and the
 *     guard trigger keeps the submitted answers immutable afterwards.
 *
 * Re-runnable: `create table if not exists`, guarded `add column if not
 * exists`, and every policy/trigger is dropped before it is recreated.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.merchant_applications (
  id             uuid        primary key default gen_random_uuid(),
  store_name     text        not null,
  contact_person text        not null,
  phone_number   text        not null,
  business_type  text        not null,
  status         text        not null default 'pending',
  created_at     timestamptz not null default now(),
  constraint merchant_applications_store_name_present
    check (length(btrim(store_name)) between 2 and 160),
  constraint merchant_applications_contact_present
    check (length(btrim(contact_person)) between 2 and 120),
  /* International digits only: "201012345678". A local "01012345678" or a
   * decorative "+20 101 234 5678" is rejected so every row is dialable. */
  constraint merchant_applications_phone_dialable
    check (phone_number ~ '^[0-9]{8,15}$'),
  constraint merchant_applications_business_type_present
    check (length(btrim(business_type)) between 2 and 120),
  constraint merchant_applications_status_allowed
    check (status in ('pending', 'contacted', 'approved', 'rejected'))
);

/* Reconciliation: a deployment that created the table from an earlier draft
 * keeps its rows and gains the columns it is missing. */
alter table app.merchant_applications
  add column if not exists store_name     text,
  add column if not exists contact_person text,
  add column if not exists phone_number   text,
  add column if not exists business_type  text,
  add column if not exists status         text not null default 'pending',
  add column if not exists created_at     timestamptz not null default now();

comment on table app.merchant_applications is
  'Inbound merchant applications from the public landing page. Reviewed in the Ops Center; not merchants until an operator promotes them.';
comment on column app.merchant_applications.phone_number is
  'Digits only, normalized to the international form by the public API. Used to spot repeat applications from the same contact.';
comment on column app.merchant_applications.status is
  'Review lifecycle: pending, contacted, approved, rejected. Set by an operator, never by the applicant.';

create index if not exists merchant_applications_created_idx
  on app.merchant_applications (created_at desc);

create index if not exists merchant_applications_status_idx
  on app.merchant_applications (status, created_at desc);

create index if not exists merchant_applications_phone_idx
  on app.merchant_applications (phone_number);

/* ── Submitted answers are evidence ──────────────────────────────────────
 * The review queue exists to decide on what the applicant actually sent. An
 * update may move `status`; rewriting the store name or the phone number
 * would silently change the record a decision was made on, and a delete would
 * remove the paper trail entirely. Delete stays available to service_role for
 * a lawful erasure request, never to an operator.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.merchant_application_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_name     is distinct from old.store_name
  or new.contact_person is distinct from old.contact_person
  or new.phone_number   is distinct from old.phone_number
  or new.business_type  is distinct from old.business_type
  or new.created_at     is distinct from old.created_at then
    raise exception
      'MERCHANT_APPLICATION_IMMUTABLE: يمكن تغيير حالة الطلب فقط، لا بيانات مقدّم الطلب.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists merchant_applications_guard_update on app.merchant_applications;
create trigger merchant_applications_guard_update
before update on app.merchant_applications
for each row execute function app.merchant_application_guard();

/* ── Row Level Security ──────────────────────────────────────────────────
 * The landing page posts unauthenticated, so `anon` gets insert and nothing
 * else: it can create an application, it can never read one back (not even
 * its own — that would turn the form into a lookup service for the customer
 * book). Reviewing and status changes are an operator capability.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.merchant_applications enable row level security;
alter table app.merchant_applications force  row level security;

drop policy if exists merchant_applications_public_insert on app.merchant_applications;
create policy merchant_applications_public_insert on app.merchant_applications
  for insert to anon
  with check (
    status = 'pending'
    and length(btrim(store_name)) between 2 and 160
    and length(btrim(contact_person)) between 2 and 120
    and phone_number ~ '^[0-9]{8,15}$'
    and length(btrim(business_type)) between 2 and 120
  );

drop policy if exists merchant_applications_read_capable on app.merchant_applications;
create policy merchant_applications_read_capable on app.merchant_applications
  for select to authenticated
  using (
    app.is_active_user() and
    app.has_permission('manage_merchant_applications')
  );

drop policy if exists merchant_applications_update_capable on app.merchant_applications;
create policy merchant_applications_update_capable on app.merchant_applications
  for update to authenticated
  using (
    app.is_active_user() and
    app.has_permission('manage_merchant_applications')
  )
  with check (
    status in ('pending', 'contacted', 'approved', 'rejected')
  );

-- The `app` schema was opened to `authenticated` and `service_role` only; the
-- public form needs its own usage grant before the insert policy can apply.
grant usage on schema app to anon;
grant insert on app.merchant_applications to anon;

grant select, update on app.merchant_applications to authenticated;
grant select, insert, update, delete on app.merchant_applications to service_role;

/* ── Capability ──────────────────────────────────────────────────────────
 * New module, new key. `sort_order` 97 appends to the catalogue, so the
 * generated `src/lib/rbac/data/permissions.ts` keeps mirroring
 * `order by sort_order, key` exactly.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('manage_merchant_applications', 'إدارة طلبات انضمام التجار', 'مراجعة طلبات التجار الواردة من صفحة الانضمام العامة وتحديث حالتها.', 'طلبات التجار', 97)
on conflict (key) do update
   set label       = excluded.label,
       description = excluded.description,
       group_key   = excluded.group_key,
       sort_order  = excluded.sort_order;

/* One-time backfill. City operators (L3) and the executive tier (L4) are the
 * people who receive inbound merchants today; `20261030000700` set the same
 * precedent for the five treasury keys. New accounts get the grant from
 * provisioning, and L4 keeps its "whole catalogue" invariant because the key
 * is now part of the catalogue.
 */
insert into app.user_permissions (user_id, permission_key)
select u.id, 'manage_merchant_applications'
  from app.users u
 where u.active
   and u.clearance_level in (3, 4)
on conflict (user_id, permission_key) do nothing;

-- Authorization changed, so an open session must refetch instead of keeping
-- the token minted from the pre-migration grant set.
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level in (3, 4);

/* Refuse to commit a half-applied deployment: a policy that gates on a key
 * the catalogue does not hold would silently lock the review queue for
 * everybody, which is exactly the failure mode this migration adds a surface
 * to. */
do $$
begin
  if not exists (
    select 1 from app.permissions where key = 'manage_merchant_applications'
  ) then
    raise exception 'manage_merchant_applications missing from app.permissions';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'app'
       and tablename  = 'merchant_applications'
       and policyname = 'merchant_applications_public_insert'
  ) then
    raise exception 'the public insert policy on app.merchant_applications was not created';
  end if;
end;
$$;

commit;
