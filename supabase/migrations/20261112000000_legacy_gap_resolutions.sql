begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Legacy-gap resolutions (V1 → V2 migration directives).
 *
 * The product owner approved eight architectural resolutions for the gaps
 * recorded in `docs/V1_TO_V2_MIGRATION_GAP_ANALYSIS.md`. This migration lands
 * the database half; the matching repositories, routes, screens and the ETL
 * changes ship in the same change set.
 *
 *   2. `kpi_snapshots.legacy_metrics` — the V1 payroll snapshot metrics
 *      (products, vendors, photos, active seconds) that had no V2 column.
 *   3. Audit log, notifications and archived reports tables.
 *   6. `egypt_post` payout shape (enum value added in the previous migration).
 *   7. `catalog_products.qa_metadata` — V1 image QA / lock provenance.
 *   8. `marketing_leads` — campaign / Spinwheel leads, which `marketing_entries`
 *      (ad spend) could never hold.
 *
 * Ids that arrive from Firestore keep a `legacy_id` text column off to the side
 * with a partial unique index, so the ETL can re-run without duplicating a row
 * while the primary key stays a real UUID.
 *
 * Re-runnable: `create table if not exists`, guarded `add column if not
 * exists`, `drop ... if exists` before every trigger/constraint, `if not
 * exists` indexes, `on conflict` permission seeds.
 * ───────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Legacy KPI metrics on the immutable snapshot
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.kpi_snapshots
  add column if not exists legacy_metrics jsonb not null default '{}'::jsonb;

comment on column app.kpi_snapshots.legacy_metrics is
  'V1 payroll-snapshot metrics that have no dedicated column: products, vendors, photos, activeSeconds, imageEditSeconds and rep_kpis time tracking. Preserved verbatim for accounting; intentionally outside the immutability guard so a later targeted backfill can fill rows written before this migration.';

/* ─────────────────────────────────────────────────────────────────────────
 * 3a. Audit log (the V1 "Black Box")
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  legacy_id     text,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid        references app.users (id) on delete set null,
  actor_name    text        not null default '',
  actor_role    text        not null default '',
  action_type   text        not null default '',
  target_entity text        not null default '',
  target_id     text        not null default '',
  target_name   text        not null default '',
  entity_kind   text        not null default '',
  description   text        not null default '',
  collection    text        not null default '',
  source        text        not null default 'migration',
  previous_data jsonb,
  new_data      jsonb,
  changes       jsonb,
  created_at    timestamptz not null default now()
);

alter table app.audit_logs
  add column if not exists legacy_id     text,
  add column if not exists occurred_at   timestamptz not null default now(),
  add column if not exists actor_id      uuid references app.users (id) on delete set null,
  add column if not exists actor_name    text        not null default '',
  add column if not exists actor_role    text        not null default '',
  add column if not exists action_type   text        not null default '',
  add column if not exists target_entity text        not null default '',
  add column if not exists target_id     text        not null default '',
  add column if not exists target_name   text        not null default '',
  add column if not exists entity_kind   text        not null default '',
  add column if not exists description   text        not null default '',
  add column if not exists collection    text        not null default '',
  add column if not exists source        text        not null default 'migration',
  add column if not exists previous_data jsonb,
  add column if not exists new_data      jsonb,
  add column if not exists changes       jsonb,
  add column if not exists created_at    timestamptz not null default now();

comment on table app.audit_logs is
  'Append-only Black Box: who changed what, before and after. Distinct from app.operation_logs, which records courier orders.';
comment on column app.audit_logs.legacy_id is
  'Firestore document id, so the V1 history import is idempotent.';

create unique index if not exists audit_logs_legacy_key
  on app.audit_logs (legacy_id)
  where legacy_id is not null;

create index if not exists audit_logs_occurred_idx
  on app.audit_logs (occurred_at desc);

create index if not exists audit_logs_actor_idx
  on app.audit_logs (actor_id, occurred_at desc);

create index if not exists audit_logs_entity_idx
  on app.audit_logs (collection, target_id);

/* A log entry is evidence: it may be inserted, never rewritten. */
create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'AUDIT_LOG_IMMUTABLE: audit entries are append-only; record a correcting entry instead'
    using errcode = '55000';
end;
$$;

drop trigger if exists audit_logs_immutable on app.audit_logs;
create trigger audit_logs_immutable
before update on app.audit_logs
for each row execute function app.audit_log_immutable();

alter table app.audit_logs enable row level security;
alter table app.audit_logs force row level security;

drop policy if exists audit_logs_read_capable on app.audit_logs;
create policy audit_logs_read_capable on app.audit_logs
  for select to authenticated
  using (app.has_permission('view_audit_logs'));

grant select on app.audit_logs to authenticated;
grant select, insert, update, delete on app.audit_logs to service_role;

/* ─────────────────────────────────────────────────────────────────────────
 * 3b. Notifications
 * ───────────────────────────────────────────────────────────────────────── */

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
  created_at  timestamptz not null default now(),
  constraint notifications_read_shape check ((is_read) = (read_at is not null))
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

comment on table app.notifications is
  'Operator inbox. `user_id` NULL is a broadcast to every active operator; a row with a user_id is that operator''s own notification.';

create unique index if not exists notifications_legacy_key
  on app.notifications (legacy_id)
  where legacy_id is not null;

create index if not exists notifications_inbox_idx
  on app.notifications (user_id, occurred_at desc);

create index if not exists notifications_unread_idx
  on app.notifications (user_id, is_read)
  where is_read = false;

alter table app.notifications enable row level security;
alter table app.notifications force row level security;

drop policy if exists notifications_read_self on app.notifications;
create policy notifications_read_self on app.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and app.is_active_user())
  );

drop policy if exists notifications_update_self on app.notifications;
create policy notifications_update_self on app.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on app.notifications to authenticated;
grant select, insert, update, delete on app.notifications to service_role;

/* Per-viewer read state for broadcasts.
 *
 * `app.notifications.is_read` on the row only makes sense for a targeted
 * notification. A broadcast (user_id IS NULL) reaches everyone, so "read" must
 * be tracked per viewer or one operator dismissing it would clear it for the
 * whole company. One row here means that operator has seen/acknowledged it. */
create table if not exists app.notification_reads (
  notification_id uuid        not null references app.notifications (id) on delete cascade,
  user_id         uuid        not null references app.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table app.notification_reads enable row level security;
alter table app.notification_reads force row level security;

drop policy if exists notification_reads_self on app.notification_reads;
create policy notification_reads_self on app.notification_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on app.notification_reads to authenticated;
grant select, insert, update, delete on app.notification_reads to service_role;

/* ─────────────────────────────────────────────────────────────────────────
 * 3c. Archived visit reports
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.archived_reports (
  id               uuid        primary key default gen_random_uuid(),
  legacy_id        text,
  task_id          text,
  merchant_id      text        not null default '',
  task_name        text        not null default '',
  report           jsonb       not null default '{}'::jsonb,
  archived_by      uuid        references app.users (id) on delete set null,
  archived_by_name text        not null default '',
  reason           text        not null default '',
  occurred_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

alter table app.archived_reports
  add column if not exists legacy_id        text,
  add column if not exists task_id          text,
  add column if not exists merchant_id      text        not null default '',
  add column if not exists task_name        text        not null default '',
  add column if not exists report           jsonb       not null default '{}'::jsonb,
  add column if not exists archived_by      uuid references app.users (id) on delete set null,
  add column if not exists archived_by_name text        not null default '',
  add column if not exists reason           text        not null default '',
  add column if not exists occurred_at      timestamptz not null default now(),
  add column if not exists created_at       timestamptz not null default now();

comment on table app.archived_reports is
  'Visit reports pulled out of the live task timeline, with the reason and author preserved. Restoring deletes the archive row only; the canonical visit_reports history is untouched.';

create unique index if not exists archived_reports_legacy_key
  on app.archived_reports (legacy_id)
  where legacy_id is not null;

create index if not exists archived_reports_occurred_idx
  on app.archived_reports (occurred_at desc);

create index if not exists archived_reports_task_idx
  on app.archived_reports (task_id);

alter table app.archived_reports enable row level security;
alter table app.archived_reports force row level security;

drop policy if exists archived_reports_read_capable on app.archived_reports;
create policy archived_reports_read_capable on app.archived_reports
  for select to authenticated
  using (app.has_permission('view_archived_reports'));

drop policy if exists archived_reports_insert_capable on app.archived_reports;
create policy archived_reports_insert_capable on app.archived_reports
  for insert to authenticated
  with check (app.has_permission('manage_archived_reports'));

drop policy if exists archived_reports_delete_capable on app.archived_reports;
create policy archived_reports_delete_capable on app.archived_reports
  for delete to authenticated
  using (app.has_permission('manage_archived_reports'));

grant select, insert, delete on app.archived_reports to authenticated;
grant select, insert, update, delete on app.archived_reports to service_role;

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Egypt Post payout shape
 *
 * The enum value is added by `20261111000000_payout_egypt_post_enum.sql`. This
 * file widens the per-method shape guard. `egypt_post` carries a national id
 * (the Egypt Post payout contract) and nothing from the bank/wallet/instapay
 * families.
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.user_payout_methods
  add column if not exists post_national_id text;

comment on column app.user_payout_methods.post_national_id is
  'Egypt Post national id (14 digits). Only populated when method = egypt_post.';

alter table app.user_payout_methods
  drop constraint if exists user_payout_methods_shape,
  add constraint user_payout_methods_shape check (
    case method::text
      when 'bank_account' then
        length(btrim(coalesce(bank_name, ''))) > 0
        and length(btrim(coalesce(account_holder, ''))) > 0
        and length(btrim(coalesce(account_number, ''))) > 0
        and iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'
        and wallet_provider is null and wallet_phone is null
        and instapay_type is null and instapay_value is null
        and post_national_id is null
      when 'e_wallet' then
        length(btrim(coalesce(wallet_provider, ''))) > 0
        and wallet_phone ~ '^01[0125][0-9]{8}$'
        and bank_name is null and account_holder is null
        and account_number is null and iban is null
        and instapay_type is null and instapay_value is null
        and post_national_id is null
      when 'instapay' then
        instapay_type in ('ipa', 'phone')
        and length(btrim(coalesce(instapay_value, ''))) > 0
        and bank_name is null and account_holder is null
        and account_number is null and iban is null
        and wallet_provider is null and wallet_phone is null
        and post_national_id is null
      when 'egypt_post' then
        post_national_id ~ '^[0-9]{14}$'
        and bank_name is null and account_holder is null
        and account_number is null and iban is null
        and wallet_provider is null and wallet_phone is null
        and instapay_type is null and instapay_value is null
    end
  );

/* The decision-reset trigger fingerprints the detail columns; the national id
 * is a detail, so an edit must invalidate the approval like any other. */
create or replace function app.payout_methods_reset_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status <> 'pending' and auth.uid() = old.user_id then
      raise exception
        'PAYOUT_SELF_REVIEW: an operator cannot review their own payout method'
        using errcode = '42501';
    end if;
    if old.status <> 'pending' and new.status = 'pending' then
      raise exception
        'PAYOUT_DECISION_IMMUTABLE: a reviewed method cannot return to pending'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if row(
    new.method, new.bank_name, new.account_holder, new.account_number,
    new.iban, new.wallet_provider, new.wallet_phone, new.instapay_type,
    new.instapay_value, new.post_national_id
  ) is distinct from row(
    old.method, old.bank_name, old.account_holder, old.account_number,
    old.iban, old.wallet_provider, old.wallet_phone, old.instapay_type,
    old.instapay_value, old.post_national_id
  ) then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Catalog image QA provenance
 * ───────────────────────────────────────────────────────────────────────── */

alter table app.catalog_products
  add column if not exists qa_metadata jsonb not null default '{}'::jsonb;

comment on column app.catalog_products.qa_metadata is
  'V1 image provenance: image_locked_by/_at, image_uploaded_by/_at, edit_type, edited_by/_at, upload history and delete-request state. Preserved verbatim; the review_note column stays the human-facing note.';

/* ─────────────────────────────────────────────────────────────────────────
 * 8. Marketing / campaign leads
 * ───────────────────────────────────────────────────────────────────────── */

create table if not exists app.marketing_leads (
  id            uuid        primary key default gen_random_uuid(),
  legacy_id     text,
  campaign_id   uuid        references app.marketing_campaigns (id) on delete set null,
  city_id       text,
  phone_number  text        not null,
  promo_code    text        not null default '',
  user_guess    text        not null default '',
  prize_details text        not null default '',
  source        text        not null default 'spinwheel',
  status        text        not null default 'new',
  notes         text        not null default '',
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint marketing_leads_phone_dialable
    check (phone_number ~ '^[0-9]{8,15}$'),
  constraint marketing_leads_source_allowed
    check (source in ('spinwheel', 'landing', 'referral', 'import')),
  constraint marketing_leads_status_allowed
    check (status in ('new', 'contacted', 'qualified', 'converted', 'rejected'))
);

alter table app.marketing_leads
  add column if not exists legacy_id     text,
  add column if not exists campaign_id   uuid references app.marketing_campaigns (id) on delete set null,
  add column if not exists city_id       text,
  add column if not exists phone_number  text        not null,
  add column if not exists promo_code    text        not null default '',
  add column if not exists user_guess    text        not null default '',
  add column if not exists prize_details text        not null default '',
  add column if not exists source        text        not null default 'spinwheel',
  add column if not exists status        text        not null default 'new',
  add column if not exists notes         text        not null default '',
  add column if not exists occurred_at   timestamptz not null default now(),
  add column if not exists created_at    timestamptz not null default now();

comment on table app.marketing_leads is
  'Inbound campaign leads (Spinwheel, landing page, referrals). Separate from app.marketing_entries, which records ad spend.';
comment on column app.marketing_leads.phone_number is
  'Digits only, international form. Used to spot repeat entries from one contestant.';

create unique index if not exists marketing_leads_legacy_key
  on app.marketing_leads (legacy_id)
  where legacy_id is not null;

create index if not exists marketing_leads_occurred_idx
  on app.marketing_leads (occurred_at desc);

create index if not exists marketing_leads_status_idx
  on app.marketing_leads (status, occurred_at desc);

create index if not exists marketing_leads_phone_idx
  on app.marketing_leads (phone_number);

create index if not exists marketing_leads_campaign_idx
  on app.marketing_leads (campaign_id);

alter table app.marketing_leads enable row level security;
alter table app.marketing_leads force row level security;

drop policy if exists marketing_leads_read_capable on app.marketing_leads;
create policy marketing_leads_read_capable on app.marketing_leads
  for select to authenticated
  using (
    app.has_permission('view_marketing_leads')
    or app.has_permission('view_campaigns')
  );

drop policy if exists marketing_leads_write_capable on app.marketing_leads;
create policy marketing_leads_write_capable on app.marketing_leads
  for all to authenticated
  using (app.has_permission('manage_marketing_leads'))
  with check (app.has_permission('manage_marketing_leads'));

grant select, insert, update on app.marketing_leads to authenticated;
grant select, insert, update, delete on app.marketing_leads to service_role;

/* ─────────────────────────────────────────────────────────────────────────
 * Capability catalogue — new modules
 *
 * `sort_order` continues at 98. The wire-format bit index is the position in
 * `src/lib/rbac/data/permissions.ts`, so those entries are appended (never
 * reordered) to keep existing session masks valid until the next revision bump.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('view_audit_logs', 'عرض سجل التدقيق', 'الاطلاع على سجل التغييرات (الصندوق الأسود) لمن ولماذا عدّل أي سجل.', 'الحوكمة', 98),
  ('view_notifications', 'عرض الإشعارات', 'فتح صندوق إشعارات المشغّل وقراءة التنبيهات الموجهة إليه.', 'مساحة العمل', 99),
  ('view_archived_reports', 'عرض التقارير المؤرشفة', 'الاطلاع على تقارير الزيارات التي أُزيلت من مسار المهمة مع سبب الأرشفة.', 'العمليات الميدانية', 100),
  ('manage_archived_reports', 'إدارة التقارير المؤرشفة', 'أرشفة تقرير زيارة أو استعادته إلى مسار المهمة.', 'العمليات الميدانية', 101),
  ('view_marketing_leads', 'عرض عملاء الحملات', 'الاطلاع على العملاء المحتملين الواردين من الحملات وصفحة الانضمام.', 'التسويق', 102),
  ('manage_marketing_leads', 'إدارة عملاء الحملات', 'تحديث حالة العميل المحتمل وربطه بحملة وتسجيل الملاحظات.', 'التسويق', 103)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* Backfill: the inbound lead queue is a marketing surface (existing marketing
 * operators) and the audit log is a governance surface (finance/treasury and
 * the executive tier). Re-granting an existing key is a no-op. */
insert into app.user_permissions (user_id, permission_key)
select u.id, 'view_notifications'
  from app.users u
 where u.active
on conflict (user_id, permission_key) do nothing;

insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
  cross join (
    values ('view_audit_logs'), ('view_archived_reports'),
           ('manage_archived_reports'), ('view_marketing_leads'),
           ('manage_marketing_leads')
  ) as p(key)
 where u.active
   and u.clearance_level >= 3
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where active;

/* Refuse to commit a half-applied deployment: a policy that gates on a key the
 * catalogue does not hold would silently lock a whole screen for everybody. */
do $$
declare
  missing text;
begin
  select string_agg(required.key, ', ')
    into missing
    from (
      values ('view_audit_logs'), ('view_notifications'),
             ('view_archived_reports'), ('manage_archived_reports'),
             ('view_marketing_leads'), ('manage_marketing_leads')
    ) as required(key)
   where not exists (
     select 1 from app.permissions p where p.key = required.key
   );

  if missing is not null then
    raise exception 'RBAC_SEED_DRIFT: missing capability keys: %', missing
      using errcode = '23514';
  end if;
end;
$$;

commit;
