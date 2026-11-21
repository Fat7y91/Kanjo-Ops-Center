# Kanjo V2.0

Enterprise operations platform for merchant onboarding, field operations, order
logging, clearing and payroll. Next.js App Router on Cloudflare Workers, with
Supabase/Postgres as the system of record.

## Navigation

The sidebar is grouped, collapsible and filtered by the same capability
catalogue that guards each route:

- **النظرة العامة** — pinned root dashboard (`/overview`).
- **التشغيل** — contracts sub-group (merchant applications, field operations,
  archived reports, contracts), data-entry sub-group (catalog, image review,
  taxonomy), sales sub-group (merchants, couriers, orders).
- **التسويق** — campaigns, campaign leads, coupons.
- **المالية** — agent KPIs, bank accounts, payroll, capital approvals,
  commission rates, clearinghouse.
- **الإدارة** — cities, system users, audit log, profile.

A group disappears when every route inside it is revoked. On desktop the rail
starts collapsed as an icon strip and expands on hover; the edge chevron pins
it open or closed. Below 1024px it becomes an off-canvas drawer. `/notifications` stays out of the sidebar and opens from the topbar
bell.

The overview presents a clickable summary strip (merchants, signed contracts,
orders, net collection, campaign conversions, catalog readiness) followed by
dense widgets. The orders module reports volume, platform profit, merchant
profit, courier profit and discounts, filterable by merchant, courier, city,
date and coupon.

## Development

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
```

Architecture and data-flow details live in `ARCHITECTURE.md`.
