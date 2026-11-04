begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Contract register.
 *
 * `/contracts` used to render a hard-coded array of four contracts and its
 * Edit / Sign / Cancel buttons had no handler: the screen showed a governance
 * workflow that did not exist. This table is the durable record the screen
 * reads and mutates.
 *
 * `merchant_id` is text with no foreign key for the same reason as
 * `app.visit_reports`: field-ops merchants are resolved from the operational
 * catalogue whose ids are not `app.merchants` uuids in every deployment.
 * `city_id` is a Firestore document id (see ARCHITECTURE §8.4) and carries no
 * FK by design.
 *
 * State ladder: draft → pending_signature → signed, with cancellation allowed
 * from any non-signed state. `signed` and `cancelled` are terminal, enforced by
 * a trigger, because an executed contract must never be reworded in place.
 *
 * Amounts are minor units in the contract currency, matching the ledger and
 * payroll tables. Re-runnable: `create table if not exists`, guarded
 * `add column if not exists`, indexes with `if not exists`, and every policy
 * and trigger is dropped before it is recreated.
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.contracts (
  id                uuid        primary key default gen_random_uuid(),
  reference         text        not null,
  merchant_id       text        not null,
  merchant_name     text        not null default '',
  city_id           text,
  value_minor       bigint      not null default 0,
  currency          char(3)     not null default 'EGP',
  status            text        not null default 'draft',
  signatory         text        not null default '',
  body              text        not null default '',
  drafted_by        uuid        references app.users (id) on delete set null,
  edited_by         uuid        references app.users (id) on delete set null,
  signed_by         uuid        references app.users (id) on delete set null,
  cancelled_by      uuid        references app.users (id) on delete set null,
  signed_at         timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contracts_reference_present check (length(btrim(reference)) > 0),
  constraint contracts_merchant_present check (length(btrim(merchant_id)) > 0),
  constraint contracts_value_non_negative check (value_minor >= 0),
  constraint contracts_currency_allowed check (currency in ('EGP', 'SAR')),
  constraint contracts_status_allowed
    check (status in ('draft', 'pending_signature', 'signed', 'cancelled')),
  constraint contracts_signed_shape
    check ((status = 'signed') = (signed_at is not null)),
  constraint contracts_cancelled_shape
    check ((status = 'cancelled') = (cancelled_at is not null))
);

/* Reconciliation: widen a table left by an earlier deployment. */
alter table app.contracts
  add column if not exists id           uuid default gen_random_uuid(),
  add column if not exists reference    text        not null default '',
  add column if not exists merchant_id  text        not null default '',
  add column if not exists merchant_name text       not null default '',
  add column if not exists city_id      text,
  add column if not exists value_minor  bigint      not null default 0,
  add column if not exists currency     char(3)     not null default 'EGP',
  add column if not exists status       text        not null default 'draft',
  add column if not exists signatory    text        not null default '',
  add column if not exists body         text        not null default '',
  add column if not exists drafted_by   uuid        references app.users (id) on delete set null,
  add column if not exists edited_by    uuid        references app.users (id) on delete set null,
  add column if not exists signed_by    uuid        references app.users (id) on delete set null,
  add column if not exists cancelled_by uuid        references app.users (id) on delete set null,
  add column if not exists signed_at    timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();

comment on table app.contracts is
  'Commercial contract register. Signed and cancelled contracts are terminal.';
comment on column app.contracts.value_minor is
  'Contract value in minor units (piastres/halalas) of the contract currency.';
comment on column app.contracts.city_id is
  'Firestore city document id. No FK by design: cross-database reference.';

create unique index if not exists contracts_reference_key
  on app.contracts (reference);

create index if not exists contracts_status_idx
  on app.contracts (status, created_at desc);

create index if not exists contracts_merchant_idx
  on app.contracts (merchant_id);

create index if not exists contracts_city_idx
  on app.contracts (city_id)
  where city_id is not null;

drop trigger if exists contracts_touch_updated_at on app.contracts;
create trigger contracts_touch_updated_at
before update on app.contracts
for each row execute function app.touch_updated_at();

/* A signed or cancelled contract is a closed record: no field may move, and no
 * second signature or cancellation may be applied. */
create or replace function app.contract_terminal_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('signed', 'cancelled') then
    raise exception
      'CONTRACT_TERMINAL: a % contract cannot be modified',
      old.status
      using errcode = '55000';
  end if;

  if new.status = 'signed' and new.signed_at is null then
    new.signed_at := now();
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_terminal_guard on app.contracts;
create trigger contracts_terminal_guard
before update on app.contracts
for each row execute function app.contract_terminal_guard();

/* ─────────────────────────────────────────────────────────────────────────
 * Row Level Security.
 *
 * Read: view_contracts or any drafting/editing capability, so a drafter can
 * see the register they are allowed to add to. Writes are per operation:
 *   insert → draft_contract / create_contracts
 *   update → edit_contract / edit_contracts (and cancel_contract is applied
 *            through the same update, gated by the policy below)
 *   signing is a normal update; the API additionally requires sign_contract,
 *            and the terminal trigger stops any further change.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.contracts enable row level security;
alter table app.contracts force row level security;

drop policy if exists contracts_read_capable on app.contracts;
create policy contracts_read_capable on app.contracts
  for select to authenticated
  using (
    app.has_permission('view_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('sign_contract') or
    app.has_permission('sign_contracts') or
    app.has_permission('cancel_contract') or
    app.has_permission('delete_contracts')
  );

drop policy if exists contracts_insert_capable on app.contracts;
create policy contracts_insert_capable on app.contracts
  for insert to authenticated
  with check (
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts')
  );

drop policy if exists contracts_update_capable on app.contracts;
create policy contracts_update_capable on app.contracts
  for update to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('sign_contract') or
    app.has_permission('sign_contracts') or
    app.has_permission('cancel_contract')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('sign_contract') or
    app.has_permission('sign_contracts') or
    app.has_permission('cancel_contract')
  );

grant select, insert, update on app.contracts to authenticated;
grant select, insert, update, delete on app.contracts to service_role;

commit;
