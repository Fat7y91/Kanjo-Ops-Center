begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Field operations catalogue: cities, tasks, follow-ups, transfer requests
 * and edit requests.
 *
 * These five objects were the last process-local domain. On Cloudflare a
 * Worker isolate is not a database: a city created in one request vanished on
 * the next, and two workers disagreed about the same task. Every screen that
 * reads them (cities, field-ops board, merchant profile) has been migrated to
 * an async store, and this migration is the SQL contract behind it.
 *
 * Ids stay `text`. The V1 catalogue and the TS stores mint ids like
 * `city-cairo` / `task-<random>`; turning them into UUIDs would invalidate the
 * city scope rows that reference them (`app.user_city_scope.city_id` is text by
 * design, §8.4). City managers are NOT stored here: they are already
 * `app.user_city_scope` grants, so one source of truth is enough.
 *
 * Re-runnable: `create table if not exists`, guarded `add column if not
 * exists`, `drop ... if exists` before every trigger, `if not exists` indexes.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Cities ─────────────────────────────────────────────────────────── */

create table if not exists app.cities (
  id              text        primary key,
  name            text        not null,
  country         text        not null default '',
  governorate     text        not null default '',
  population      integer     not null default 0,
  stage           text        not null default 'preparation',
  competitors     jsonb       not null default '[]'::jsonb,
  strategic_notes text        not null default '',
  zone            jsonb       not null default '[]'::jsonb,
  created_by      text        not null default '',
  created_by_name text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table app.cities
  add column if not exists id              text,
  add column if not exists name            text,
  add column if not exists country         text        not null default '',
  add column if not exists governorate     text        not null default '',
  add column if not exists population      integer     not null default 0,
  add column if not exists stage           text        not null default 'preparation',
  add column if not exists competitors     jsonb       not null default '[]'::jsonb,
  add column if not exists strategic_notes text        not null default '',
  add column if not exists zone            jsonb       not null default '[]'::jsonb,
  add column if not exists created_by      text        not null default '',
  add column if not exists created_by_name text        not null default '',
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

comment on table app.cities is
  'City catalogue. `zone` is the editable vertex list; the GeoJSON boundary is derived in TypeScript from it.';
comment on column app.cities.id is
  'Firestore-era city id (`city-cairo`). Kept text so app.user_city_scope rows stay valid without a rewrite.';

alter table app.cities
  drop constraint if exists cities_name_present,
  add constraint cities_name_present check (length(btrim(name)) > 0);

alter table app.cities
  drop constraint if exists cities_stage_allowed,
  add constraint cities_stage_allowed
    check (stage in ('preparation', 'contracting', 'data_entry', 'live_operations'));

alter table app.cities
  drop constraint if exists cities_population_non_negative,
  add constraint cities_population_non_negative check (population >= 0);

create unique index if not exists cities_name_key on app.cities (lower(btrim(name)));

drop trigger if exists cities_touch on app.cities;
create trigger cities_touch
before update on app.cities
for each row execute function app.touch_updated_at();

/* ── 2. Field tasks ────────────────────────────────────────────────────── */

create table if not exists app.field_tasks (
  id                        text        primary key,
  merchant_id               text        not null,
  merchant_name             text        not null default '',
  team                      text        not null default '',
  city_id                   text        not null default '',
  visit_date                date        not null,
  target_commission         numeric(6, 2) not null default 0,
  strategic_notes           text        not null default '',
  instructions              text        not null default '',
  status                    text        not null default 'scheduled',
  follow_up_kind            text,
  follow_up_contact_number  text,
  created_by                text        not null default '',
  created_by_name           text        not null default '',
  created_at                timestamptz not null default now()
);

alter table app.field_tasks
  add column if not exists id                       text,
  add column if not exists merchant_id              text,
  add column if not exists merchant_name            text        not null default '',
  add column if not exists team                     text        not null default '',
  add column if not exists city_id                  text        not null default '',
  add column if not exists visit_date               date,
  add column if not exists target_commission        numeric(6, 2) not null default 0,
  add column if not exists strategic_notes          text        not null default '',
  add column if not exists instructions             text        not null default '',
  add column if not exists status                   text        not null default 'scheduled',
  add column if not exists follow_up_kind           text,
  add column if not exists follow_up_contact_number text,
  add column if not exists created_by               text        not null default '',
  add column if not exists created_by_name          text        not null default '',
  add column if not exists created_at               timestamptz not null default now();

comment on table app.field_tasks is
  'Scheduled merchant visits. `merchant_id` is text with no FK, for the same cross-catalogue reason as visit_reports.';

alter table app.field_tasks
  drop constraint if exists field_tasks_status_allowed,
  add constraint field_tasks_status_allowed
    check (status in ('scheduled', 'completed'));

alter table app.field_tasks
  drop constraint if exists field_tasks_follow_up_kind_allowed,
  add constraint field_tasks_follow_up_kind_allowed
    check (follow_up_kind is null or follow_up_kind in ('visit', 'call', 'whatsapp'));

alter table app.field_tasks
  drop constraint if exists field_tasks_commission_range,
  add constraint field_tasks_commission_range
    check (target_commission >= 0 and target_commission <= 100);

create index if not exists field_tasks_team_date_idx
  on app.field_tasks (team, visit_date);

create index if not exists field_tasks_merchant_idx
  on app.field_tasks (merchant_id);

create index if not exists field_tasks_city_idx
  on app.field_tasks (city_id);

/* ── 3. Follow-up tasks ────────────────────────────────────────────────── */

create table if not exists app.follow_up_tasks (
  id                   text        primary key,
  merchant_id          text        not null,
  merchant_name        text        not null default '',
  team                 text        not null default '',
  city_id              text        not null default '',
  visit_date           date        not null,
  due_at               timestamptz not null,
  kind                 text        not null default 'visit',
  note                 text        not null default '',
  contact_number       text,
  status               text        not null default 'scheduled',
  created_by           text        not null default '',
  created_by_name      text        not null default '',
  created_at           timestamptz not null default now(),
  source_report_id     text
);

alter table app.follow_up_tasks
  add column if not exists id               text,
  add column if not exists merchant_id      text,
  add column if not exists merchant_name    text        not null default '',
  add column if not exists team             text        not null default '',
  add column if not exists city_id          text        not null default '',
  add column if not exists visit_date       date,
  add column if not exists due_at           timestamptz,
  add column if not exists kind             text        not null default 'visit',
  add column if not exists note             text        not null default '',
  add column if not exists contact_number   text,
  add column if not exists status           text        not null default 'scheduled',
  add column if not exists created_by       text        not null default '',
  add column if not exists created_by_name  text        not null default '',
  add column if not exists created_at       timestamptz not null default now(),
  add column if not exists source_report_id text;

alter table app.follow_up_tasks
  drop constraint if exists follow_up_tasks_status_allowed,
  add constraint follow_up_tasks_status_allowed
    check (status in ('scheduled', 'completed'));

alter table app.follow_up_tasks
  drop constraint if exists follow_up_tasks_kind_allowed,
  add constraint follow_up_tasks_kind_allowed
    check (kind in ('visit', 'call', 'whatsapp'));

create index if not exists follow_up_tasks_merchant_idx
  on app.follow_up_tasks (merchant_id, due_at desc);

create index if not exists follow_up_tasks_open_idx
  on app.follow_up_tasks (status, due_at);

/* ── 4. Transfer requests ──────────────────────────────────────────────── */

create table if not exists app.transfer_requests (
  id                text        primary key,
  merchant_id       text        not null,
  merchant_name     text        not null default '',
  from_team         text        not null default '',
  to_team           text        not null default '',
  requested_by      text        not null default '',
  requested_by_name text        not null default '',
  justification     text        not null default '',
  status            text        not null default 'pending',
  created_at        timestamptz not null default now(),
  reviewed_by       text,
  reviewed_by_name  text,
  reviewed_at       timestamptz,
  review_note       text        not null default ''
);

alter table app.transfer_requests
  add column if not exists id                text,
  add column if not exists merchant_id       text,
  add column if not exists merchant_name     text        not null default '',
  add column if not exists from_team         text        not null default '',
  add column if not exists to_team           text        not null default '',
  add column if not exists requested_by      text        not null default '',
  add column if not exists requested_by_name text        not null default '',
  add column if not exists justification     text        not null default '',
  add column if not exists status            text        not null default 'pending',
  add column if not exists created_at        timestamptz not null default now(),
  add column if not exists reviewed_by       text,
  add column if not exists reviewed_by_name  text,
  add column if not exists reviewed_at       timestamptz,
  add column if not exists review_note       text        not null default '';

alter table app.transfer_requests
  drop constraint if exists transfer_requests_status_allowed,
  add constraint transfer_requests_status_allowed
    check (status in ('pending', 'approved', 'rejected'));

alter table app.transfer_requests
  drop constraint if exists transfer_requests_decision_shape,
  add constraint transfer_requests_decision_shape
    check ((status = 'pending') = (reviewed_at is null));

/* One open request per (merchant, requester): a double-tap must not create a
 * second pending row the manager then has to reject twice. */
create unique index if not exists transfer_requests_one_pending_key
  on app.transfer_requests (merchant_id, requested_by)
  where status = 'pending';

create index if not exists transfer_requests_merchant_idx
  on app.transfer_requests (merchant_id, created_at desc);

create index if not exists transfer_requests_status_idx
  on app.transfer_requests (status, created_at desc);

/* ── 5. Edit requests ──────────────────────────────────────────────────── */

create table if not exists app.edit_requests (
  id                text        primary key,
  merchant_id       text        not null,
  merchant_name     text        not null default '',
  requested_by      text        not null default '',
  requested_by_name text        not null default '',
  reason            text        not null default '',
  status            text        not null default 'pending',
  created_at        timestamptz not null default now(),
  reviewed_by       text,
  reviewed_by_name  text,
  reviewed_at       timestamptz,
  review_note       text        not null default ''
);

alter table app.edit_requests
  add column if not exists id                text,
  add column if not exists merchant_id       text,
  add column if not exists merchant_name     text        not null default '',
  add column if not exists requested_by      text        not null default '',
  add column if not exists requested_by_name text        not null default '',
  add column if not exists reason            text        not null default '',
  add column if not exists status            text        not null default 'pending',
  add column if not exists created_at        timestamptz not null default now(),
  add column if not exists reviewed_by       text,
  add column if not exists reviewed_by_name  text,
  add column if not exists reviewed_at       timestamptz,
  add column if not exists review_note       text        not null default '';

alter table app.edit_requests
  drop constraint if exists edit_requests_status_allowed,
  add constraint edit_requests_status_allowed
    check (status in ('pending', 'approved', 'rejected'));

alter table app.edit_requests
  drop constraint if exists edit_requests_decision_shape,
  add constraint edit_requests_decision_shape
    check ((status = 'pending') = (reviewed_at is null));

create unique index if not exists edit_requests_one_pending_key
  on app.edit_requests (merchant_id, requested_by)
  where status = 'pending';

create index if not exists edit_requests_merchant_idx
  on app.edit_requests (merchant_id, created_at desc);

create index if not exists edit_requests_status_idx
  on app.edit_requests (status, created_at desc);

/* ── 6. Access ─────────────────────────────────────────────────────────── */

alter table app.cities            enable row level security;
alter table app.field_tasks        enable row level security;
alter table app.follow_up_tasks    enable row level security;
alter table app.transfer_requests  enable row level security;
alter table app.edit_requests      enable row level security;

/* Cities: viewable by anyone who can open the cities module or work a task;
 * mutable by the city-management capabilities. Conditioning on city scope
 * itself is a Tier 3 decision, so RLS only checks the capability. */
drop policy if exists cities_read_capable on app.cities;
create policy cities_read_capable on app.cities
  for select to authenticated
  using (
    app.has_permission('view_cities') or
    app.has_permission('manage_cities') or
    app.has_permission('add_city') or
    app.has_permission('view_field_ops') or
    app.has_permission('start_end_visit')
  );

drop policy if exists cities_write_capable on app.cities;
create policy cities_write_capable on app.cities
  for all to authenticated
  using (
    app.has_permission('manage_cities') or
    app.has_permission('add_city')
  )
  with check (
    app.has_permission('manage_cities') or
    app.has_permission('add_city')
  );

drop policy if exists field_tasks_read_capable on app.field_tasks;
create policy field_tasks_read_capable on app.field_tasks
  for select to authenticated
  using (
    app.has_permission('view_field_ops') or
    app.has_permission('start_end_visit') or
    app.has_permission('assign_tasks')
  );

drop policy if exists field_tasks_write_capable on app.field_tasks;
create policy field_tasks_write_capable on app.field_tasks
  for all to authenticated
  using (app.has_permission('assign_tasks') or app.has_permission('start_end_visit'))
  with check (app.has_permission('assign_tasks') or app.has_permission('start_end_visit'));

drop policy if exists follow_up_tasks_read_capable on app.follow_up_tasks;
create policy follow_up_tasks_read_capable on app.follow_up_tasks
  for select to authenticated
  using (
    app.has_permission('view_field_ops') or
    app.has_permission('start_end_visit') or
    app.has_permission('assign_tasks')
  );

drop policy if exists follow_up_tasks_write_capable on app.follow_up_tasks;
create policy follow_up_tasks_write_capable on app.follow_up_tasks
  for all to authenticated
  using (app.has_permission('start_end_visit') or app.has_permission('assign_tasks'))
  with check (app.has_permission('start_end_visit') or app.has_permission('assign_tasks'));

drop policy if exists transfer_requests_read_capable on app.transfer_requests;
create policy transfer_requests_read_capable on app.transfer_requests
  for select to authenticated
  using (
    app.has_permission('view_field_ops') or
    app.has_permission('request_ownership_transfer') or
    app.has_permission('approve_ownership_transfer')
  );

drop policy if exists transfer_requests_write_capable on app.transfer_requests;
create policy transfer_requests_write_capable on app.transfer_requests
  for all to authenticated
  using (
    app.has_permission('request_ownership_transfer') or
    app.has_permission('approve_ownership_transfer')
  )
  with check (
    app.has_permission('request_ownership_transfer') or
    app.has_permission('approve_ownership_transfer')
  );

drop policy if exists edit_requests_read_capable on app.edit_requests;
create policy edit_requests_read_capable on app.edit_requests
  for select to authenticated
  using (
    app.has_permission('view_field_ops') or
    app.has_permission('view_all_teams_visits') or
    app.has_permission('approve_report_edits')
  );

drop policy if exists edit_requests_write_capable on app.edit_requests;
create policy edit_requests_write_capable on app.edit_requests
  for all to authenticated
  using (
    app.has_permission('view_all_teams_visits') or
    app.has_permission('approve_report_edits')
  )
  with check (
    app.has_permission('view_all_teams_visits') or
    app.has_permission('approve_report_edits')
  );

grant select, insert, update, delete on app.cities           to service_role;
grant select, insert, update, delete on app.field_tasks      to service_role;
grant select, insert, update, delete on app.follow_up_tasks  to service_role;
grant select, insert, update, delete on app.transfer_requests to service_role;
grant select, insert, update, delete on app.edit_requests    to service_role;

grant select, insert, update on app.cities            to authenticated;
grant select, insert, update on app.field_tasks       to authenticated;
grant select, insert, update on app.follow_up_tasks   to authenticated;
grant select, insert, update on app.transfer_requests to authenticated;
grant select, insert, update on app.edit_requests     to authenticated;

commit;
