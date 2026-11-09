begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Contract terms editing, finalised-contract force edit, and section overrides.
 *
 * The draft editor edits structured terms: ordered clauses, per-category
 * commission lines, and narrative/section overrides (preamble, copies note,
 * party panels, summary). The clause and commission tables already exist in
 * `20261117000000_contracts_v2.sql`; this migration adds the narrative override
 * store plus the capability that unlocks editing a finalised contract.
 *
 * Editing terms never rewrites `app.contracts`, so the terminal guard on that
 * table stays intact. The force-edit rule (a finalised contract's terms may only
 * be touched with `edit_finalized_contracts`) is enforced in the application
 * layer; SQL only needs to authorize the override table and ship the key.
 *
 * Idempotent: upsert the permission, grant with `on conflict do nothing`, and
 * `create table if not exists` / `drop policy if exists` before `create policy`.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. New capability: edit a finalised (signed/cancelled) contract ────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('edit_finalized_contracts', 'تحرير العقود المنتهية',
   'تجاوز قفل العقود الموقّعة أو الملغاة وتحرير مسودتها بالكامل.', 'العقود', 36)
on conflict (key) do update
   set label       = excluded.label,
       description = excluded.description,
       group_key   = excluded.group_key,
       sort_order  = excluded.sort_order;

/* Level 4 is the executive tier that holds the whole catalogue. Grant explicitly
 * so the founder/owner can force-edit without a follow-up manual grant. */
insert into app.user_permissions (user_id, permission_key)
select u.id, 'edit_finalized_contracts'
  from app.users u
 where u.clearance_level = 4
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where clearance_level = 4;

/* ── 2. Narrative section overrides ─────────────────────────────────────── */

create table if not exists app.contract_section_overrides (
  id          uuid        primary key default gen_random_uuid(),
  contract_id uuid        not null references app.contracts (id) on delete cascade,
  section_key text        not null,
  content     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint contract_section_overrides_key_allowed
    check (section_key in (
      'preamble', 'copies_note', 'first_party', 'second_party', 'summary',
      'commission_base'
    )),
  constraint contract_section_overrides_unique
    unique (contract_id, section_key)
);

comment on table app.contract_section_overrides is
  'Per-contract overrides for narrative sections (preamble, notes, party panels, summary).';
comment on column app.contract_section_overrides.content is
  'Section payload: { text } for prose, { rows: [{label,value}] } for party panels.';

create index if not exists contract_section_overrides_contract_idx
  on app.contract_section_overrides (contract_id);

drop trigger if exists contract_section_overrides_touch_updated_at
  on app.contract_section_overrides;
create trigger contract_section_overrides_touch_updated_at
before update on app.contract_section_overrides
for each row execute function app.touch_updated_at();

alter table app.contract_section_overrides enable row level security;
alter table app.contract_section_overrides force row level security;

drop policy if exists contract_section_overrides_read on app.contract_section_overrides;
create policy contract_section_overrides_read on app.contract_section_overrides
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
    app.has_permission('delete_contracts') or
    app.has_permission('edit_finalized_contracts')
  );

drop policy if exists contract_section_overrides_write on app.contract_section_overrides;
create policy contract_section_overrides_write on app.contract_section_overrides
  for all to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_finalized_contracts')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_finalized_contracts')
  );

grant select, insert, update, delete on app.contract_section_overrides to authenticated;
grant select, insert, update, delete on app.contract_section_overrides to service_role;

/* Clause/commission writes on a finalised contract are authorized here too, so
 * the force-edit capability also covers those tables (the app layer still
 * decides *when* the capability is required). */
drop policy if exists contract_clauses_write on app.contract_clauses;
create policy contract_clauses_write on app.contract_clauses
  for all to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_finalized_contracts')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_finalized_contracts')
  );

drop policy if exists contract_commission_lines_write on app.contract_commission_lines;
create policy contract_commission_lines_write on app.contract_commission_lines
  for all to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_finalized_contracts')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_finalized_contracts')
  );

commit;
