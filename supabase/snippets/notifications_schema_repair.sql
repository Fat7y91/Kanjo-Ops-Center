-- ============================================================================
-- Notifications schema repair — idempotent
-- ============================================================================
--
-- Run this in the Supabase SQL editor after creating `app.notifications` and
-- `app.notification_reads` by hand, or when the inbox renders no rows.
--
-- The application reads `app.*` through the service-role client and projects
-- `*`, so any subset of the columns below renders. This snippet brings a
-- hand-made table up to the canonical shape (the one
-- `20261112000000_legacy_gap_resolutions.sql` creates) and reloads the
-- PostgREST schema cache, which is what a `PGRST205` ("table not found in the
-- schema cache") response is asking for.
--
-- Nothing here deletes rows: every statement is guarded or additive.
-- ============================================================================


-- ── Step 1. Diagnose ────────────────────────────────────────────────────────
-- Expect exactly two rows, both with schema_name = 'app'. A row pointing at
-- `public` means the table was created in the wrong schema: move its rows into
-- the repaired table from step 2.

select table_schema as schema_name,
       table_name,
       (select count(*)
          from information_schema.columns c
         where c.table_schema = t.table_schema
           and c.table_name = t.table_name) as column_count
  from information_schema.tables t
 where table_name in ('notifications', 'notification_reads')
   and table_schema in ('app', 'public')
 order by table_schema, table_name;


-- ── Step 2. Canonical inbox table ───────────────────────────────────────────

create table if not exists app.notifications (
  id          uuid        primary key default gen_random_uuid(),
  legacy_id   text,
  user_id     uuid        references app.users (id) on delete cascade,
  title       text        not null default '',
  body        text        not null default '',
  icon        text        not null default '',
  color       text        not null default '',
  kind        text        not null default 'system',
  task_id     text,
  link        text        not null default '',
  is_read     boolean     not null default false,
  read_at     timestamptz,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table app.notifications
  add column if not exists legacy_id   text,
  add column if not exists user_id     uuid references app.users (id) on delete cascade,
  add column if not exists title       text        not null default '',
  add column if not exists body        text        not null default '',
  add column if not exists icon        text        not null default '',
  add column if not exists color       text        not null default '',
  add column if not exists kind        text        not null default 'system',
  add column if not exists task_id     text,
  add column if not exists link        text        not null default '',
  add column if not exists is_read     boolean     not null default false,
  add column if not exists read_at     timestamptz,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists created_at  timestamptz not null default now();

-- `occurred_at` is the inbox ordering key; backfill it for hand-made rows that
-- only recorded `created_at`.
update app.notifications
   set occurred_at = created_at
 where occurred_at is null;

create index if not exists notifications_inbox_idx
  on app.notifications (user_id, occurred_at desc);

create index if not exists notifications_unread_idx
  on app.notifications (user_id, is_read)
  where is_read = false;


-- ── Step 3. Per-viewer read state for broadcasts ────────────────────────────

create table if not exists app.notification_reads (
  notification_id uuid        not null references app.notifications (id) on delete cascade,
  user_id         uuid        not null references app.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);


-- ── Step 4. Access ──────────────────────────────────────────────────────────
-- The application server holds the service-role key, so these grants are what
-- actually let it read and write. The `authenticated` policies keep the same
-- shape as the migration, so a client-side read never widens beyond
-- "own or public".

alter table app.notifications enable row level security;
alter table app.notification_reads enable row level security;

drop policy if exists notifications_read_self on app.notifications;
create policy notifications_read_self on app.notifications
  for select to authenticated
  using (user_id = auth.uid() or (user_id is null and app.is_active_user()));

drop policy if exists notifications_update_self on app.notifications;
create policy notifications_update_self on app.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notification_reads_self on app.notification_reads;
create policy notification_reads_self on app.notification_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on app.notifications to authenticated;
grant select, insert, update on app.notification_reads to authenticated;
grant select, insert, update, delete on app.notifications to service_role;
grant select, insert, update, delete on app.notification_reads to service_role;


-- ── Step 5. Reload the PostgREST schema cache ───────────────────────────────
-- Without this, `app.notifications` created in the SQL editor can keep
-- answering PGRST205 ("could not find the table in the schema cache") until the
-- project is paused or restarted.

notify pgrst, 'reload schema';


-- ── Step 6. Optional: one broadcast so the bell has something to show ───────
-- Delete this block if the inbox should start empty.

insert into app.notifications (user_id, title, body, kind, link)
select null,
       'صندوق الإشعارات جاهز',
       'ستظهر هنا التنبيهات الموجهة إليك وإعلانات الإدارة العامة.',
       'system',
       '/notifications'
 where not exists (select 1 from app.notifications);

