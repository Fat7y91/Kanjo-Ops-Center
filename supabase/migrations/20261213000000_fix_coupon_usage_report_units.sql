-- Correct the imported coupon usage snapshot from the 100x double conversion.
--
-- The first importer converted EGP to minor units in the parser AND again in
-- the repository, so every stored amount was 100x too large. The parser now
-- keeps EGP and the repository performs the single conversion; this migration
-- rescales the rows already imported with the old pipeline.
--
-- Rows imported after the fix already hold correct minor units. This script is
-- intentionally one-shot: the migration ledger prevents a second application.

update app.coupon_usage_reports
set
  discount_amount_minor = round(discount_amount_minor / 100.0)::bigint,
  shipping_discount_minor = round(shipping_discount_minor / 100.0)::bigint,
  cashback_amount_minor = round(cashback_amount_minor / 100.0)::bigint,
  total_impact_minor = round(total_impact_minor / 100.0)::bigint,
  platform_funded_minor = round(platform_funded_minor / 100.0)::bigint,
  vendor_funded_minor = round(vendor_funded_minor / 100.0)::bigint;
