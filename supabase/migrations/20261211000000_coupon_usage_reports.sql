-- Coupon Usage Report import.
--
-- The dashboard CSV is a report of every code that was applied, including
-- cancelled and undelivered orders, so it is stored separately from the coupon
-- rules and from the delivered-order financial journal. Codes are unique and a
-- re-import replaces the snapshot for that code.

create table if not exists app.coupon_usage_reports (
  code text primary key,
  coupon_type text not null default '',
  discount_funded_by text not null default '',
  uses_count integer not null default 0 check (uses_count >= 0),
  discount_amount_minor bigint not null default 0,
  shipping_discount_minor bigint not null default 0,
  cashback_amount_minor bigint not null default 0,
  total_impact_minor bigint not null default 0,
  platform_funded_minor bigint not null default 0,
  vendor_funded_minor bigint not null default 0,
  last_used_at timestamptz,
  source_file text,
  imported_at timestamptz not null default now()
);

create index if not exists coupon_usage_reports_total_impact_idx
  on app.coupon_usage_reports (total_impact_minor desc);

comment on table app.coupon_usage_reports is
  'Imported coupon usage snapshot. Includes all applied orders, including cancelled and undelivered.';
comment on column app.coupon_usage_reports.total_impact_minor is
  'Sum of order, shipping and cashback discounts in minor units, sorted descending in the dashboard.';

grant select, insert, update, delete on app.coupon_usage_reports to service_role;
