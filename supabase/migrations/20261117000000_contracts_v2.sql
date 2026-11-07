begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Contract register V2: data-driven clauses, commission lines, frozen serials,
 * and rendered-document storage.
 *
 * `app.contracts.body` stays the free-form source text an operator types, but a
 * contract now also owns ordered clause rows and per-category commission lines
 * so the document is rendered from structured data rather than one blob. Serial
 * numbers continue the frozen V1 baseline (93 issued names → #1001-#1093), so
 * the next generated serial is #1094 and never collides with an issued number.
 *
 * Re-runnable: `create table if not exists`, guarded `add column if not exists`,
 * sequences/indexes with `if not exists`, and every policy/trigger is dropped
 * before it is recreated.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Clause library + per-contract clauses ──────────────────────────────── */

create table if not exists app.contract_clauses (
  id             uuid        primary key default gen_random_uuid(),
  contract_id    uuid        references app.contracts (id) on delete cascade,
  scope          text        not null default 'contract',
  vendor_type_id text,
  merchant_id    text,
  ordinal        integer     not null default 0,
  title_ar       text        not null default '',
  body_ar        text        not null default '',
  active         boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint contract_clauses_scope_allowed
    check (scope in ('contract', 'vendor_type', 'merchant')),
  constraint contract_clauses_ordinal_non_negative check (ordinal >= 0)
);

/* A template clause has no contract; a contract clause must have one. */
alter table app.contract_clauses
  add column if not exists contract_id    uuid        references app.contracts (id) on delete cascade,
  add column if not exists scope          text        not null default 'contract',
  add column if not exists vendor_type_id text,
  add column if not exists merchant_id    text,
  add column if not exists ordinal        integer     not null default 0,
  add column if not exists title_ar       text        not null default '',
  add column if not exists body_ar        text        not null default '',
  add column if not exists active         boolean     not null default true,
  add column if not exists created_at     timestamptz not null default now(),
  add column if not exists updated_at     timestamptz not null default now();

comment on table app.contract_clauses is
  'Ordered contract clauses: library templates (scope vendor_type/merchant) and per-contract snapshots.';
comment on column app.contract_clauses.scope is
  'contract = belongs to one contract; vendor_type/merchant = reusable template.';

create index if not exists contract_clauses_contract_idx
  on app.contract_clauses (contract_id, ordinal)
  where contract_id is not null;

create index if not exists contract_clauses_scope_idx
  on app.contract_clauses (scope, vendor_type_id, merchant_id, ordinal)
  where contract_id is null;

drop trigger if exists contract_clauses_touch_updated_at on app.contract_clauses;
create trigger contract_clauses_touch_updated_at
before update on app.contract_clauses
for each row execute function app.touch_updated_at();

/* ── Commission lines ───────────────────────────────────────────────────── */

create table if not exists app.contract_commission_lines (
  id              uuid        primary key default gen_random_uuid(),
  contract_id     uuid        not null references app.contracts (id) on delete cascade,
  category_name   text        not null,
  commission_rate numeric(6,3) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint contract_commission_rate_non_negative check (commission_rate >= 0),
  constraint contract_commission_rate_reasonable check (commission_rate <= 100)
);

alter table app.contract_commission_lines
  add column if not exists contract_id     uuid        references app.contracts (id) on delete cascade,
  add column if not exists category_name   text        not null default '',
  add column if not exists commission_rate numeric(6,3) not null default 0,
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

comment on table app.contract_commission_lines is
  'Per-category commission rate lines rendered into the contract document.';

create index if not exists contract_commission_lines_contract_idx
  on app.contract_commission_lines (contract_id, category_name);

drop trigger if exists contract_commission_lines_touch_updated_at on app.contract_commission_lines;
create trigger contract_commission_lines_touch_updated_at
before update on app.contract_commission_lines
for each row execute function app.touch_updated_at();

/* ── Contract V2 columns: serial + rendered-document fingerprints ───────── */

/* The first issued serial was #1001; 93 frozen baseline names occupy
 * #1001-#1093. The sequence starts at 1094 so a new contract never reuses a
 * number already printed on a V1 contract. */
create sequence if not exists app.contract_serial_seq start with 1094;

alter table app.contracts
  add column if not exists serial_number bigint,
  add column if not exists storage_path  text,
  add column if not exists sha256        text;

/* Backfill any pre-existing rows deterministically by age so they get a stable,
 * non-colliding serial; new rows always draw from the sequence default. */
with ordered as (
  select id,
         row_number() over (order by created_at, id) as rn
  from app.contracts
  where serial_number is null
)
update app.contracts c
set serial_number = (select coalesce(max(serial_number), 1000) from app.contracts) + ordered.rn
from ordered
where c.id = ordered.id;

alter table app.contracts
  alter column serial_number set default nextval('app.contract_serial_seq');

comment on column app.contracts.serial_number is
  'Printed contract serial. Continues the frozen V1 baseline (#1001-#1093); new rows start at #1094.';
comment on column app.contracts.storage_path is
  'Storage object path of the rendered PDF, e.g. contracts/<id>.pdf.';
comment on column app.contracts.sha256 is
  'SHA-256 of the rendered PDF bytes, for integrity checks and cache keys.';

create unique index if not exists contracts_serial_key
  on app.contracts (serial_number)
  where serial_number is not null;

create index if not exists contracts_serial_idx
  on app.contracts (serial_number desc);

/* ── Row Level Security ─────────────────────────────────────────────────── */

alter table app.contract_clauses enable row level security;
alter table app.contract_clauses force row level security;
alter table app.contract_commission_lines enable row level security;
alter table app.contract_commission_lines force row level security;

drop policy if exists contract_clauses_read on app.contract_clauses;
create policy contract_clauses_read on app.contract_clauses
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

drop policy if exists contract_clauses_write on app.contract_clauses;
create policy contract_clauses_write on app.contract_clauses
  for all to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts')
  );

drop policy if exists contract_commission_lines_read on app.contract_commission_lines;
create policy contract_commission_lines_read on app.contract_commission_lines
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

drop policy if exists contract_commission_lines_write on app.contract_commission_lines;
create policy contract_commission_lines_write on app.contract_commission_lines
  for all to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts')
  );

grant select, insert, update, delete on app.contract_clauses to authenticated;
grant select, insert, update, delete on app.contract_commission_lines to authenticated;
grant select, insert, update, delete on app.contract_clauses to service_role;
grant select, insert, update, delete on app.contract_commission_lines to service_role;
grant usage, select on sequence app.contract_serial_seq to authenticated, service_role;

/* ── Rendered PDF storage bucket ────────────────────────────────────────── */

/* Supabase-only: a stock PostgreSQL has no `storage` schema, so guard it. */
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('contract-documents', 'contract-documents', false, 10485760,
        array['application/pdf'])
    on conflict (id) do update
      set public             = excluded.public,
          file_size_limit    = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

commit;
