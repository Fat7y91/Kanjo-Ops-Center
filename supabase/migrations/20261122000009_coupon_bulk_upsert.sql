begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Bulk coupon upsert.
 *
 * The unique index is functional (`upper(btrim(code))`), so a PostgREST
 * `.upsert({ onConflict: "code" })` cannot name it as a conflict target. This
 * function inserts a jsonb rowset and conflicts on the *same expression index*,
 * so a re-import updates the existing coupon instead of failing.
 *
 * Called by the service role in bounded chunks. SECURITY DEFINER because the
 * write policy is keyed on `manage_coupons`, which the service role does not
 * carry as a grant; authorization is enforced in the API route.
 *
 * `code` is normalised here; `source_created_at` is preserved on update (it is
 * omitted from the update set) so a re-import never rewrites the original
 * creation date.
 * ───────────────────────────────────────────────────────────────────────── */

create or replace function app.upsert_coupons(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  insert into app.coupons (
    code, coupon_type, active, discount_funded_by, vendor_funding_percent,
    stackable, stack_priority, uses_count, discount_amount_minor,
    shipping_discount_minor, cashback_amount_minor, total_impact_minor,
    vendor_funded_minor, platform_funded_minor, budget_applied_minor,
    budget_cap_minor, budget_used_minor, last_used_at, source_created_at
  )
  select
    upper(btrim(r.code)),
    r.coupon_type,
    r.active,
    r.discount_funded_by,
    r.vendor_funding_percent,
    r.stackable,
    r.stack_priority,
    r.uses_count,
    r.discount_amount_minor,
    r.shipping_discount_minor,
    r.cashback_amount_minor,
    r.total_impact_minor,
    r.vendor_funded_minor,
    r.platform_funded_minor,
    r.budget_applied_minor,
    r.budget_cap_minor,
    r.budget_used_minor,
    r.last_used_at,
    coalesce(r.source_created_at, now())
  from jsonb_to_recordset(p_rows) as r(
    code                     text,
    coupon_type              app.coupon_type,
    active                   boolean,
    discount_funded_by       app.coupon_funding,
    vendor_funding_percent   numeric,
    stackable                boolean,
    stack_priority           integer,
    uses_count               integer,
    discount_amount_minor    bigint,
    shipping_discount_minor  bigint,
    cashback_amount_minor    bigint,
    total_impact_minor       bigint,
    vendor_funded_minor      bigint,
    platform_funded_minor    bigint,
    budget_applied_minor     bigint,
    budget_cap_minor         bigint,
    budget_used_minor        bigint,
    last_used_at             timestamptz,
    source_created_at        timestamptz
  )
  on conflict (upper(btrim(code))) do update set
    coupon_type            = excluded.coupon_type,
    active                 = excluded.active,
    discount_funded_by     = excluded.discount_funded_by,
    vendor_funding_percent = excluded.vendor_funding_percent,
    stackable              = excluded.stackable,
    stack_priority         = excluded.stack_priority,
    uses_count             = excluded.uses_count,
    discount_amount_minor  = excluded.discount_amount_minor,
    shipping_discount_minor = excluded.shipping_discount_minor,
    cashback_amount_minor  = excluded.cashback_amount_minor,
    total_impact_minor     = excluded.total_impact_minor,
    vendor_funded_minor    = excluded.vendor_funded_minor,
    platform_funded_minor  = excluded.platform_funded_minor,
    budget_applied_minor   = excluded.budget_applied_minor,
    budget_cap_minor       = excluded.budget_cap_minor,
    budget_used_minor      = excluded.budget_used_minor,
    last_used_at           = excluded.last_used_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function app.upsert_coupons(jsonb) is
  'Upserts a jsonb rowset of coupons, conflicting on the case-insensitive code index.';

grant execute on function app.upsert_coupons(jsonb) to service_role;

commit;
