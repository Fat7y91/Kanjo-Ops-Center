begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Discount coupons.
 *
 * Mirrors the columns of the dashboard CSV export one-for-one so a bulk upload
 * is a faithful import, not a lossy reshape. Two deliberate changes:
 *
 *   1. Money columns are integer minor units. The export carries currency
 *      units; the importer multiplies by 100 and rounds once.
 *   2. `budget_remaining` is a generated column. It is carried by the CSV for
 *      reporting, but storing it independently would let it drift from
 *      `cap − used`, so it is computed and ignored on input.
 *
 * The ledger never reads a coupon's historical totals to price an order. It
 * reads the *rules* (`type`, `discount_amount`, funding split) and computes the
 * discount for that specific order value, which is the only way a percentage
 * coupon can be correct.
 *
 * Idempotent: guarded enum, `if not exists`, drop-then-create for the funding
 * guard trigger.
 * ───────────────────────────────────────────────────────────────────────── */

do $$
begin
  if not exists (select 1 from pg_type where typname = 'coupon_type') then
    create type app.coupon_type as enum (
      'free_shipping',
      'welcome_coupon',
      'cashback',
      'percentage_discount',
      'fixed_amount'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'coupon_funding') then
    create type app.coupon_funding as enum ('platform', 'vendor', 'split');
  end if;
end;
$$;

create table if not exists app.coupons (
  id                       uuid        primary key default gen_random_uuid(),
  code                     text        not null,
  coupon_type              app.coupon_type not null default 'fixed_amount',
  active                   boolean     not null default true,

  discount_funded_by       app.coupon_funding not null default 'platform',
  vendor_funding_percent   numeric(5, 2) not null default 0,

  stackable                boolean     not null default false,
  stack_priority           integer     not null default 0,

  /* Customer-facing value. For `percentage_discount`, `discount_amount_minor`
   * holds the rate in basis points (e.g. 15% = 1500). */
  discount_amount_minor    bigint      not null default 0,
  shipping_discount_minor  bigint      not null default 0,
  cashback_amount_minor    bigint      not null default 0,
  total_impact_minor       bigint      not null default 0,

  /* Funding split as exported. Informational: the live split is recomputed per
   * order from `vendor_funding_percent`. */
  vendor_funded_minor      bigint      not null default 0,
  platform_funded_minor    bigint      not null default 0,

  budget_applied_minor     bigint      not null default 0,
  budget_cap_minor         bigint,
  budget_used_minor        bigint      not null default 0,
  budget_remaining_minor   bigint generated always as (
                             case when budget_cap_minor is null then null
                                  else budget_cap_minor - budget_used_minor end
                           ) stored,

  uses_count               integer     not null default 0,
  last_used_at             timestamptz,
  source_created_at        timestamptz not null default now(),

  imported_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint coupons_code_present check (length(btrim(code)) > 0),
  constraint coupons_vendor_percent_range check (vendor_funding_percent between 0 and 100),
  constraint coupons_amounts_non_negative check (
    discount_amount_minor >= 0 and
    shipping_discount_minor >= 0 and
    cashback_amount_minor >= 0 and
    budget_applied_minor >= 0 and
    budget_used_minor >= 0 and
    (budget_cap_minor is null or budget_cap_minor >= 0)
  ),
  constraint coupons_uses_non_negative check (uses_count >= 0)
);

create unique index if not exists coupons_code_key
  on app.coupons (upper(btrim(code)));

create index if not exists coupons_active_idx on app.coupons (active);
create index if not exists coupons_type_idx on app.coupons (coupon_type);

comment on table app.coupons is
  'Discount rules imported from the dashboard CSV. Priced per order at logging time.';
comment on column app.coupons.discount_amount_minor is
  'Fixed discount in minor units, or the rate in basis points for percentage_discount.';
comment on column app.coupons.vendor_funding_percent is
  'Share of the discount the merchant absorbs. The remainder is platform-funded.';
comment on column app.coupons.budget_remaining_minor is
  'Generated: cap − used. Carried by the CSV for reporting and recomputed here.';

/* Free-shipping coupons are always platform-funded: the delivery fee belongs to
 * the courier/platform, so a merchant cannot be asked to absorb it. The guard
 * fires on insert and update so an import cannot violate the rule silently. */
create or replace function app.coupon_enforce_funding()
returns trigger
language plpgsql
as $$
begin
  if new.coupon_type = 'free_shipping' and new.discount_funded_by <> 'platform' then
    raise exception
      'COUPON_FREE_SHIPPING_PLATFORM: free_shipping coupons must be platform-funded'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coupons_enforce_funding on app.coupons;
create trigger coupons_enforce_funding
before insert or update on app.coupons
for each row execute function app.coupon_enforce_funding();

/* ── RLS ────────────────────────────────────────────────────────────────── */

alter table app.coupons enable row level security;
alter table app.coupons force row level security;

drop policy if exists coupons_read_capable on app.coupons;
create policy coupons_read_capable on app.coupons
  for select to authenticated
  using (
    app.has_permission('view_coupons') or
    app.has_permission('log_operations')
  );

drop policy if exists coupons_insert_capable on app.coupons;
create policy coupons_insert_capable on app.coupons
  for insert to authenticated
  with check (app.has_permission('manage_coupons'));

drop policy if exists coupons_update_capable on app.coupons;
create policy coupons_update_capable on app.coupons
  for update to authenticated
  using (app.has_permission('manage_coupons'))
  with check (app.has_permission('manage_coupons'));

drop policy if exists coupons_delete_capable on app.coupons;
create policy coupons_delete_capable on app.coupons
  for delete to authenticated
  using (app.has_permission('manage_coupons'));

/* ── Capability catalogue ───────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('view_coupons',           'عرض الكوبونات',            'فتح دليل كوبونات الخصم وقيمها وقواعد تمويلها.', 'المقاصة والعمليات', 107),
  ('manage_coupons',         'إدارة الكوبونات',          'إضافة كوبونات الخصم وتعديلها ورفع ملف CSV.',    'المقاصة والعمليات', 108),
  ('view_journal',           'عرض دفتر اليومية',         'الاطلاع على القيود المحاسبية والحسابات والأرصدة.', 'المالية',          109),
  ('post_journal_entries',   'تسجيل قيود اليومية',       'تسجيل قيود محاسبية يدوية متوازنة.',                'المالية',          110)
on conflict (key) do update
   set label = excluded.label,
       description = excluded.description,
       group_key = excluded.group_key,
       sort_order = excluded.sort_order;

insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
 cross join (values
   ('view_coupons'),
   ('manage_coupons'),
   ('view_journal'),
   ('post_journal_entries')
 ) as p(key)
 where u.clearance_level = 4
on conflict (user_id, permission_key) do nothing;

update app.users set auth_revision = auth_revision + 1 where clearance_level = 4;

commit;
