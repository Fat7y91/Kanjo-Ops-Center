# Kanjo V2.0 — Database Schema

Source of truth: `supabase/migrations/*.sql` (33 migrations, applied in filename
order). Everything below describes the **final** shape after all migrations, not
the incremental state. It is written so a V1 → V2 data migration can be authored
without re-reading the SQL.

- Schema: everything lives in `app`.
- Engine: PostgreSQL (Supabase). `auth.users` is managed by Supabase Auth.
- Money: stored as integer minor units (`*_minor`, `bigint`) except a handful of
  legacy percentage/fee columns (`numeric`) called out per table.
- Currency: `char(3)`, only `EGP` and `SAR`.
- City ids: `text`, **no foreign key**. Cities live in Firestore; referential
  integrity for `city_id` is a Tier 3 (business) responsibility.
- Rep / merchant ids on operations tables are sometimes `text` with no FK
  (`app.visit_reports`, `app.contracts`, `app.merchant_state_overrides`) because
  the V1 field-ops catalogue used non-UUID ids.
- Timestamps: `timestamptz`, `default now()`. `updated_at` is maintained by the
  `app.touch_updated_at()` trigger.

---

## 1. Enumerated types

| Type | Values | Used by |
|---|---|---|
| `app.kpi_snapshot_status` | `pending`, `paid` | `kpi_snapshots.status` |
| `app.bank_info_status` | `pending`, `approved`, `rejected` | `users.bank_info_status`, `user_payout_methods.status` |
| `app.payout_method_kind` | `bank_account`, `e_wallet`, `instapay` | `user_payout_methods.method` |
| `app.capital_deposit_status` | `pending`, `approved`, `rejected` | `capital_deposits.status` |
| `app.payment_method` | `COD`, `ONLINE` | `operation_logs.payment_method` |
| `app.clearing_entity_type` | `merchant`, `courier` | `financial_ledgers.entity_type` |
| `app.clearing_ledger_status` | `pending`, `cleared` | `financial_ledgers.status` |

Domain state ladders implemented as `text` + `check` (not enum types):

- Merchant / contract agreement state: `no_agreement`, `provisional`,
  `final_contract`, `signed_contract`.
- Contract lifecycle: `draft`, `pending_signature`, `signed`, `cancelled`.
- Catalog product state: `pending_review`, `completed`, `published`.
- Marketing campaign status: `active`, `paused`, `closed`.
- Marketing platform: `meta`, `tiktok`, `google`, `snapchat`, `offline`.
- Marketing channel: `instagram`, `tiktok`, `google`, `referral`, `field`.
- Payroll run status: `draft`, `approved`, `paid`.
- Payroll line item: `base_salary`, `transport`, `commission`, `data_entry`,
  `incentive`, `deduction`.
- Merchant application status: `pending`, `contacted`, `approved`, `rejected`.
- Visit report source: `task`, `unplanned`, `offline`, `override`.

---

## 2. Identity & RBAC

### `app.permissions`
Capability catalogue. Every permission key used by `app.has_permission()` and the
TS `Permission` union must exist here.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `key` | `text` | no | — | PK, `^[a-z][a-z0-9_]*$` |
| `label` | `text` | no | — | Display name |
| `description` | `text` | no | `''` | |
| `group_key` | `text` | no | — | UI grouping |
| `sort_order` | `integer` | no | `0` | |
| `created_at` | `timestamptz` | no | `now()` | |

### `app.users`
Operator profile mirrored from `auth.users`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | — | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `phone` | `text` | no | — | Unique, E.164 `^\+[1-9][0-9]{7,14}$` |
| `email` | `text` | yes | — | Shape-checked when present |
| `full_name` | `text` | no | `''` | |
| `title` | `text` | no | `''` | |
| `team` | `text` | no | `''` | DEPRECATED legacy label; use `team_id` |
| `team_id` | `uuid` | yes | — | FK → `app.field_teams(id)` ON DELETE SET NULL |
| `clearance_level` | `smallint` | no | `1` | 1–4 |
| `global_scope` | `boolean` | no | generated | `generated always as (clearance_level >= 3) stored` |
| `active` | `boolean` | no | `true` | |
| `auth_revision` | `integer` | no | `1` | Bumped on auth-affecting changes |
| `last_login_at` | `timestamptz` | yes | — | |
| `avatar_url` | `text` | yes | — | `https://`, ≤2048; `data:` rejected |
| `bank_info_status` | `app.bank_info_status` | no | `pending` | Mirror of payout decision; never set by operator |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | touch trigger |

### `app.user_permissions`
| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `uuid` | no | PK part, FK → `users` CASCADE |
| `permission_key` | `text` | no | PK part, FK → `permissions(key)` RESTRICT |
| `granted_by` | `uuid` | yes | FK → `users` SET NULL |
| `granted_at` | `timestamptz` | no | `now()` |

Invariant: at least one active user must retain `manage_system_users`
(`app.assert_governor_remaining`, enforced by triggers on `users` and
`user_permissions`).

### `app.user_city_scope`
| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `uuid` | no | PK part, FK → `users` CASCADE |
| `city_id` | `text` | no | PK part; Firestore id, no FK |
| `granted_by` | `uuid` | yes | FK → `users` SET NULL |
| `granted_at` | `timestamptz` | no | `now()` |

### `app.field_teams`
City-owned team. Contracting is executed by teams, not a global label.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK `gen_random_uuid()` |
| `city_id` | `text` | no | Firestore id, no FK |
| `name` | `varchar(120)` | no | Unique per `(city_id, lower(name))` |
| `created_at` | `timestamptz` | no | `now()` |

---

## 3. Treasury — accounts & ledger

### `app.bank_accounts`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `bank_name` | `text` | no | Non-empty |
| `account_name` | `text` | no | |
| `account_number` | `text` | no | Non-empty |
| `iban` | `text` | no | Unique; `^[A-Z]{2}[0-9A-Z]{13,32}$` |
| `country_code` | `char(2)` | no | `EG` or `SA` |
| `currency` | `char(3)` | no | `EGP`/`SAR`, must match country |
| `city_id` | `text` | yes | Firestore id, no FK |
| `active` | `boolean` | no | `true` |
| `created_by` | `uuid` | yes | FK → `users` SET NULL |
| `created_at` | `timestamptz` | no | `now()` |

### `app.ledger_entries`
Append-only. UPDATE and DELETE are rejected by `app.ledger_reject_mutation()`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `account_id` | `uuid` | no | FK → `bank_accounts` RESTRICT |
| `kind` | `text` | no | `deposit` \| `expense` |
| `label` | `text` | no | Non-empty |
| `amount_minor` | `bigint` | no | `> 0` |
| `currency` | `char(3)` | no | Must match account |
| `occurred_at` | `timestamptz` | no | Business date |
| `recorded_by` | `uuid` | yes | FK → `users` SET NULL |
| `recorded_at` | `timestamptz` | no | `now()` |

Balance = `sum(deposit) - sum(expense)` via `app.account_balance(uuid)`.

---

## 4. Payroll

### `app.payroll_profiles`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `user_id` | `uuid` | no | — | PK, FK → `users` CASCADE |
| `base_salary_minor` | `bigint` | no | `0` | ≥0 |
| `transport_minor` | `bigint` | no | `0` | ≥0 |
| `data_entry_rate_minor` | `bigint` | no | `0` | ≥0 |
| `data_entry_count` | `integer` | no | `0` | ≥0 |
| `incentive_multiplier` | `numeric(6,3)` | no | `1` | 0–10 |
| `currency` | `char(3)` | no | `'EGP'` | `EGP`/`SAR` |
| `active` | `boolean` | no | `true` | |
| `created_at` / `updated_at` | `timestamptz` | no | `now()` | |

### `app.payroll_commission_tiers`
Cumulative bands.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `user_id` | `uuid` | no | FK → `payroll_profiles` CASCADE |
| `threshold_minor` | `bigint` | no | `> 0`; unique per user |
| `rate` | `numeric(6,5)` | no | 0–1, applied to slice in band |

### `app.payroll_kpi_links`
| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `uuid` | no | PK part, FK → `payroll_profiles` CASCADE |
| `kpi_key` | `text` | no | PK part, non-empty |
| `weight` | `numeric(6,3)` | no | 0–10, default 1 |
| `created_at` | `timestamptz` | no | `now()` |

### `app.payroll_runs`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `period_start` / `period_end` | `date` | no | `end >= start` |
| `currency` | `char(3)` | no | `EGP`/`SAR` |
| `status` | `text` | no | `draft` \| `approved` \| `paid` |
| `approved_by` | `uuid` | yes | FK → `users` SET NULL |
| `approved_at` | `timestamptz` | yes | |
| `created_at` | `timestamptz` | no | `now()` |

### `app.payroll_lines`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `run_id` | `uuid` | no | FK → `payroll_runs` CASCADE |
| `user_id` | `uuid` | no | FK → `payroll_profiles` RESTRICT |
| `item_type` | `text` | no | See enum list §1 |
| `amount_minor` | `bigint` | no | ≥0 |
| `note` | `text` | no | `''` |

---

## 5. Marketing

### `app.marketing_platform_settings`
| Column | Type | Null | Notes |
|---|---|---|---|
| `platform` | `text` | no | PK; one of the 5 platforms |
| `enabled` | `boolean` | no | `false` |
| `api_key_ciphertext` | `text` | yes | AES-GCM sealed server-side |
| `webhook_url` | `text` | no | `''` or `https?://` |
| `updated_at` | `timestamptz` | no | touch trigger |
| `updated_by` | `uuid` | yes | FK → `users` SET NULL |

### `app.marketing_campaigns`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `name` | `text` | no | Non-empty |
| `platform` / `channel` | `text` | no | See §1 |
| `city_id` | `text` | yes | Firestore id, no FK |
| `budget_minor` | `bigint` | no | ≥0 |
| `target_leads` / `target_conversions` | `bigint` | no | ≥0 |
| `starts_on` / `ends_on` | `date` | no | `ends_on >= starts_on` |
| `status` | `text` | no | `active` \| `paused` \| `closed` |
| `created_by` | `uuid` | yes | FK → `users` SET NULL |
| `created_at` | `timestamptz` | no | `now()` |
| `closed_at` | `timestamptz` | yes | `(status = 'closed') = (closed_at is not null)` |

A `closed` campaign is frozen: `app.marketing_campaign_terminal()` blocks updates,
`app.marketing_entry_guard()` blocks new entries.

### `app.marketing_entries`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `platform` / `channel` | `text` | no | |
| `campaign` | `text` | no | Free-text label (legacy) |
| `campaign_id` | `uuid` | yes | FK → `marketing_campaigns` RESTRICT |
| `spend_minor` | `bigint` | no | ≥0 |
| `impressions` / `clicks` / `conversions` / `leads` | `bigint` | no | ≥0; `clicks ≤ impressions`, `conversions ≤ clicks`, `leads ≤ clicks` |
| `note` | `text` | no | `''` |
| `occurred_at` | `timestamptz` | no | |
| `city_id` | `text` | yes | Firestore id |
| `recorded_by` | `uuid` | yes | FK → `users` SET NULL |
| `recorded_at` | `timestamptz` | no | `now()` |

`app.marketing_reject_mutation()` blocks UPDATE/DELETE on `marketing_entries`
(append-only spend record).

---

## 6. Merchant & catalog

### `app.merchants`
Intentionally `text` PK: merchant ids originate in the V1 Firestore catalogue.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK |
| `name` | `text` | no | |
| `normalized_name` | `text` | no | `''`; unique when non-empty |
| `vendor_type_id` | `integer` | yes | Taxonomy numeric id |
| `vendor_type` | `text` | no | `''` |
| `team` | `text` | yes | Free-text team label |
| `city_id` | `text` | no | Non-empty, Firestore id |
| `target_commission` | `numeric(6,2)` | no | 0–100 (%) |
| `monthly_value_minor` | `bigint` | no | ≥0 |
| `strategic_notes` | `text` | no | `''` |
| `contract_state` | `text` | no | `no_agreement` \| `provisional` \| `final_contract` \| `signed_contract` |
| `agreed_commission` | `numeric(6,2)` | yes | 0–100 |
| `commission_amount` | `numeric(14,2)` | no | EGP, ≥0; earned at signature |
| `target_margin` / `agreed_margin` | `numeric(6,2)` | yes | 0–100 |
| `contracted_by_team_id` | `uuid` | yes | FK → `field_teams` RESTRICT |
| `edit_unlocked` | `boolean` | no | `false` |
| `documents` | `jsonb` | no | `[]`, array of MerchantDocument |
| `contact` | `jsonb` | yes | Latest CRM contact block |
| `opinions` | `jsonb` | no | `[]`, weighted rep opinions |
| `contact_updated_at` | `timestamptz` | yes | |
| `last_visit_at` | `timestamptz` | yes | |
| `first_entry_by` | `uuid` | yes | FK → `users` SET NULL |
| `first_entry_at` | `timestamptz` | yes | Paired with `first_entry_by` |
| `created_at` / `updated_at` | `timestamptz` | no | |

### `app.catalog_products`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK |
| `merchant_id` | `text` | no | FK → `merchants` CASCADE |
| `name` | `text` | no | Unique per merchant |
| `description` | `text` | no | `''` |
| `sku` / `barcode` | `text` | yes | Unique when present |
| `image_data_url` | `text` | yes | |
| `price_minor` | `bigint` | no | ≥0 |
| `state` | `text` | no | `pending_review` \| `completed` \| `published` |
| `vendor_type_id` | `integer` | yes | Taxonomy id |
| `category_key` | `text` | yes | Taxonomy key |
| `product_type` | `text` | no | `simple` \| `variable` |
| `attributes` | `jsonb` | no | `[]`, `{variantId, optionIds}` |
| `review_note` | `text` | no | `''` |
| `entered_by_name` | `text` | yes | |
| `client_product_id` | `text` | yes | Offline draft id; unique when present |
| `normalized_name` | `text` | no | `''` |
| `created_by` | `uuid` | yes | FK → `users` SET NULL |
| `created_at` / `updated_at` | `timestamptz` | no | |

### `app.merchant_v1_profiles`
One-to-one V1 parity fields.

| Column | Type | Null | Notes |
|---|---|---|---|
| `merchant_id` | `text` | no | PK |
| `actual_address` | `text` | no | `''` |
| `facebook_url` / `instagram_url` | `text` | no | `''` |
| `drive_folder_url` | `text` | no | `''` |
| `app_published` / `vip_menu` | `boolean` | no | `false` |
| `updated_by` | `uuid` | yes | FK → `users` SET NULL |
| `updated_at` | `timestamptz` | no | |

### `app.merchant_applications`
Public self-service merchant applications.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `store_name` | `text` | no | 2–160 chars |
| `contact_person` | `text` | no | 2–120 chars |
| `phone_number` | `text` | no | Digits only, 8–15 |
| `business_type` | `text` | no | 2–120 chars |
| `status` | `text` | no | `pending` \| `contacted` \| `approved` \| `rejected` |
| `created_at` | `timestamptz` | no | `now()` |

---

## 7. Commission schedule

### `app.commission_rates`
One row per city, plus exactly one global fallback (`city_id IS NULL`).
`contracting_base_fee` was retired in favour of the four tier columns.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `city_id` | `text` | yes | `NULL` = global fallback; unique when not null |
| `merchant_activation_fee` | `numeric(12,2)` | no | ≥0, default 50 |
| `photo_item_fee` | `numeric(12,2)` | no | ≥0, default 1 |
| `contract_fee_tier_1` | `numeric(12,2)` | no | achievement `< 80%`, default 100 |
| `contract_fee_tier_2` | `numeric(12,2)` | no | `[80%, 90%)` |
| `contract_fee_tier_3` | `numeric(12,2)` | no | `[90%, 100%)` |
| `contract_fee_tier_4` | `numeric(12,2)` | no | `>= 100%` |
| `updated_by` | `uuid` | yes | FK → `users` SET NULL |
| `updated_at` | `timestamptz` | no | touch trigger |

Lookup: `app.commission_rates_for(city_id)` returns the city row, else the
NULL-city row. `app.contract_fee_for(city_id, achievement)` selects the tier.

---

## 8. KPI snapshots

### `app.kpi_snapshots`
Immutable monthly slip. `app.kpi_snapshots_guard()` freezes all financial
columns after INSERT; status may move `pending → paid` only.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `rep_id` | `uuid` | no | FK → `users` RESTRICT |
| `month_year` | `date` | no | Must be first of month; unique per rep |
| `new_merchants_activated` | `integer` | no | ≥0 |
| `items_added` | `integer` | no | ≥0 |
| `contracts_closed` | `integer` | no | ≥0 |
| `avg_achievement_ratio` | `numeric(8,2)` | no | ≥0 |
| `calculated_salary` | `numeric(14,2)` | no | ≥0 |
| `applied_merchant_rate` | `numeric(12,2)` | yes | Frozen rate at calculation |
| `applied_item_rate` | `numeric(12,2)` | yes | Frozen rate |
| `applied_contract_fee` | `numeric(12,2)` | yes | Frozen tier fee |
| `status` | `app.kpi_snapshot_status` | no | `pending` \| `paid` |
| `locked_at` | `timestamptz` | no | `now()` |
| `created_at` | `timestamptz` | no | `now()` |

---

## 9. Operations & clearinghouse

### `app.couriers`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `user_id` | `uuid` | no | Unique, FK → `users` CASCADE |
| `display_name` | `text` | no | `''` |
| `courier_cut_percent` | `numeric(6,2)` | no | 0–100 |
| `active` | `boolean` | no | `true` |
| `created_at` / `updated_at` | `timestamptz` | no | |

### `app.operation_logs`
Append-only; amounts are frozen by `app.operation_freeze_amounts()`, and
`app.operation_route_ledgers()` creates the merchant/courier clearing rows.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `order_id` | `text` | no | Unique |
| `merchant_id` | `text` | no | FK → `merchants` RESTRICT |
| `courier_id` | `uuid` | no | FK → `couriers` RESTRICT |
| `payment_method` | `app.payment_method` | no | `COD` \| `ONLINE` |
| `currency` | `char(3)` | no | `EGP` |
| `order_value_minor` | `bigint` | no | `> 0` |
| `delivery_fee_minor` | `bigint` | no | ≥0 |
| `commission_percent` | `numeric(6,2)` | no | 0–100 |
| `commission_minor` | `bigint` | no | ≥0 (computed) |
| `courier_cut_percent` | `numeric(6,2)` | no | 0–100 |
| `courier_cut_minor` | `bigint` | no | ≥0 (computed) |
| `note` | `text` | no | `''` |
| `occurred_at` | `timestamptz` | no | `now()` |
| `logged_by` | `uuid` | yes | FK → `users` SET NULL |
| `created_at` | `timestamptz` | no | `now()` |

### `app.financial_ledgers`
One row per party per operation; `app.clearing_ledger_guard()` enforces the
clearing transition.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `operation_id` | `uuid` | no | FK → `operation_logs` RESTRICT |
| `entity_type` | `app.clearing_entity_type` | no | `merchant` \| `courier` |
| `merchant_id` | `text` | yes | FK → `merchants` RESTRICT; set iff merchant |
| `courier_id` | `uuid` | yes | FK → `couriers` RESTRICT; set iff courier |
| `amount_minor` | `bigint` | no | |
| `currency` | `char(3)` | no | `EGP` |
| `status` | `app.clearing_ledger_status` | no | `pending` \| `cleared` |
| `receipt_url` | `text` | yes | |
| `cleared_by` | `uuid` | yes | FK → `users` SET NULL |
| `cleared_at` | `timestamptz` | yes | `(status='pending') = (cleared_at is null)` |
| `created_at` | `timestamptz` | no | `now()` |

---

## 10. Field operations

### `app.visit_reports`
Append-only visit fact record (no delete). `merchant_id`, `rep_id` are `text`
with **no FK** (V1 catalogue ids). `logged_by` is a nullable UUID FK.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `merchant_id` | `text` | no | Non-empty, no FK |
| `merchant_name` | `text` | no | `''` |
| `task_id` | `text` | yes | |
| `rep_id` | `text` | no | Non-empty, no FK |
| `rep_name` | `text` | no | `''` |
| `team` | `text` | no | `''` |
| `outcome` | `text` | no | Agreement state ladder |
| `previous_state` | `text` | no | Agreement state ladder |
| `notes` | `text` | no | `''` |
| `commission_amount` | `numeric(14,2)` | no | ≥0 |
| `agreed_commission` | `numeric(6,2)` | yes | 0–100 |
| `created_at` | `timestamptz` | no | `now()` |
| `started_at` / `ended_at` | `timestamptz` | yes | |
| `duration_seconds` | `integer` | yes | ≥0 |
| `start_location` / `end_location` | `jsonb` | yes | Geo point |
| `contact` | `jsonb` | yes | |
| `opinions` | `jsonb` | no | `[]` |
| `follow_up_at` | `timestamptz` | yes | |
| `follow_up_task_id` | `text` | yes | |
| `follow_up_contact_number` | `text` | yes | |
| `source` | `text` | no | `task` \| `unplanned` \| `offline` \| `override` |
| `client_visit_id` | `text` | yes | Idempotency key; unique when present |
| `logged_by` | `uuid` | yes | FK → `users` SET NULL |

### `app.merchant_state_overrides`
Append-only manager decision. `merchant_id` text, no FK.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `merchant_id` | `text` | no | No FK |
| `merchant_name` | `text` | no | `''` |
| `from_state` / `to_state` | `text` | no | Agreement ladder |
| `actor_id` | `text` | no | No FK (seeded actors use `u-*`) |
| `actor_name` | `text` | no | `''` |
| `note` | `text` | no | `''` |
| `created_at` | `timestamptz` | no | `now()` |
| `logged_by` | `uuid` | yes | FK → `users` SET NULL |

### `app.cities`
City catalogue (new in `20261110000000_field_ops_catalogue.sql`). `id` is text
(Firestore-era `city-cairo`) so existing `app.user_city_scope` rows stay valid.
City managers are **not** a column here — they are `app.user_city_scope` grants.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK, non-empty |
| `name` | `text` | no | Non-empty; unique on `lower(btrim(name))` |
| `country` / `governorate` | `text` | no | `''` |
| `population` | `integer` | no | ≥0 |
| `stage` | `text` | no | `preparation` \| `contracting` \| `data_entry` \| `live_operations` |
| `competitors` | `jsonb` | no | `[]` |
| `strategic_notes` | `text` | no | `''` |
| `zone` | `jsonb` | no | Editable vertex list; boundary derived in TS |
| `created_by` / `created_by_name` | `text` | no | `''` |
| `created_at` / `updated_at` | `timestamptz` | no | `now()`; `updated_at` touched by trigger |

### `app.field_tasks`
Scheduled merchant visits. `merchant_id` / `city_id` are text with no FK, for the
same cross-catalogue reason as `visit_reports`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK (`task-xxxxxxxx`) |
| `merchant_id` | `text` | no | No FK |
| `merchant_name` | `text` | no | `''` |
| `team` | `text` | no | `''` |
| `city_id` | `text` | no | `''` |
| `visit_date` | `date` | no | |
| `target_commission` | `numeric(6,2)` | no | 0–100 |
| `strategic_notes` / `instructions` | `text` | no | `''` |
| `status` | `text` | no | `scheduled` \| `completed` |
| `follow_up_kind` | `text` | yes | `visit` \| `call` \| `whatsapp` |
| `follow_up_contact_number` | `text` | yes | |
| `created_by` / `created_by_name` | `text` | no | `''` |
| `created_at` | `timestamptz` | no | `now()` |

Indexes: `(team, visit_date)`, `(merchant_id)`, `(city_id)`.

### `app.follow_up_tasks`
Scheduled follow-up per merchant, created from a visit report. `merchant_id` text,
no FK.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK (`followup-xxxxxxxx`) |
| `merchant_id` | `text` | no | No FK |
| `merchant_name` | `text` | no | `''` |
| `team` / `city_id` | `text` | no | `''` |
| `visit_date` | `date` | no | |
| `due_at` | `timestamptz` | no | |
| `kind` | `text` | no | `visit` \| `call` \| `whatsapp` |
| `note` / `contact_number` | `text` | no / yes | `note` default `''` |
| `status` | `text` | no | `scheduled` \| `completed` |
| `created_by` / `created_by_name` | `text` | no | `''` |
| `created_at` | `timestamptz` | no | `now()` |
| `source_report_id` | `text` | yes | Originating report id |

Indexes: `(merchant_id, due_at desc)`, `(status, due_at)`.

### `app.transfer_requests`
Merchant ownership-transfer request; append-only decision record.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK (`transfer-xxxxxxxx`) |
| `merchant_id` | `text` | no | No FK |
| `merchant_name` | `text` | no | `''` |
| `from_team` / `to_team` | `text` | no | `''` |
| `requested_by` / `requested_by_name` | `text` | no | `''` |
| `justification` | `text` | no | `''` |
| `status` | `text` | no | `pending` \| `approved` \| `rejected` |
| `created_at` | `timestamptz` | no | `now()` |
| `reviewed_by` / `reviewed_by_name` | `text` | yes | |
| `reviewed_at` | `timestamptz` | yes | Set iff status ≠ `pending` |
| `review_note` | `text` | no | `''` |

Unique partial index: one `pending` row per `(merchant_id, requested_by)`.
Indexes: `(merchant_id, created_at desc)`, `(status, created_at desc)`.

### `app.edit_requests`
Report-edit unlock request; append-only decision record.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `text` | no | PK (`edit-xxxxxxxx`) |
| `merchant_id` | `text` | no | No FK |
| `merchant_name` | `text` | no | `''` |
| `requested_by` / `requested_by_name` | `text` | no | `''` |
| `reason` | `text` | no | `''` |
| `status` | `text` | no | `pending` \| `approved` \| `rejected` |
| `created_at` | `timestamptz` | no | `now()` |
| `reviewed_by` / `reviewed_by_name` | `text` | yes | |
| `reviewed_at` | `timestamptz` | yes | Set iff status ≠ `pending` |
| `review_note` | `text` | no | `''` |

Unique partial index: one `pending` row per `(merchant_id, requested_by)`.
Indexes: `(merchant_id, created_at desc)`, `(status, created_at desc)`.

---

## 11. Contracts (new in `20261109000000_contracts.sql`)

### `app.contracts`
Commercial contract register. `merchant_id` / `city_id` are text with no FK, for
the same cross-database reason as `visit_reports`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `reference` | `text` | no | `''` | Unique, non-empty |
| `merchant_id` | `text` | no | `''` | Non-empty, no FK |
| `merchant_name` | `text` | no | `''` | Denormalised display copy |
| `city_id` | `text` | yes | — | Firestore id, no FK |
| `value_minor` | `bigint` | no | `0` | ≥0 |
| `currency` | `char(3)` | no | `'EGP'` | `EGP` \| `SAR` |
| `status` | `text` | no | `'draft'` | `draft` \| `pending_signature` \| `signed` \| `cancelled` |
| `signatory` | `text` | no | `''` | |
| `body` | `text` | no | `''` | Contract text |
| `drafted_by` | `uuid` | yes | — | FK → `users` SET NULL |
| `edited_by` | `uuid` | yes | — | FK → `users` SET NULL |
| `signed_by` | `uuid` | yes | — | FK → `users` SET NULL |
| `cancelled_by` | `uuid` | yes | — | FK → `users` SET NULL |
| `signed_at` | `timestamptz` | yes | — | `(status='signed') = (signed_at is not null)` |
| `cancelled_at` | `timestamptz` | yes | — | `(status='cancelled') = (cancelled_at is not null)` |
| `created_at` / `updated_at` | `timestamptz` | no | `now()` | touch trigger |

Lifecycle: `draft → pending_signature → signed | cancelled`. Signed and cancelled
are terminal; `app.contract_terminal_guard()` raises `CONTRACT_TERMINAL` (55000)
on any further update. The guard also stamps `signed_at` / `cancelled_at` when
the status is set without an explicit timestamp.

Structural rule: a contract row is only a record of intent. Financial posting
happens in `kpi_snapshots` / `ledger_entries`, never by editing a terminal
contract.

---

## 12. Founder capital

### `app.capital_deposits`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `founder_id` | `uuid` | no | FK → `users` RESTRICT |
| `account_id` | `uuid` | yes | FK → `bank_accounts` RESTRICT; required once approved |
| `amount_minor` | `bigint` | no | `> 0` |
| `currency` | `char(3)` | no | `EGP`/`SAR` |
| `receipt_path` | `text` | yes | Storage object path |
| `note` | `text` | no | `''` |
| `status` | `app.capital_deposit_status` | no | `pending` |
| `decided_by` | `uuid` | yes | FK → `users` SET NULL |
| `decided_at` | `timestamptz` | yes | `(status='pending') = (decided_at is null)` |
| `ledger_entry_id` | `uuid` | yes | FK → `ledger_entries` RESTRICT; unique; required once approved |
| `created_at` | `timestamptz` | no | `now()` |

Approval (`app.capital_deposit_decide()`) creates the matching `ledger_entries`
deposit; `app.capital_deposit_no_delete()` blocks deletion of a decided row.

### `app.user_payout_methods`
| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `user_id` | `uuid` | no | Unique, FK → `users` CASCADE |
| `method` | `app.payout_method_kind` | no | |
| `bank_name` / `account_holder` / `account_number` / `iban` | `text` | yes | Bank only |
| `wallet_provider` / `wallet_phone` | `text` | yes | Wallet only; phone `^01[0125][0-9]{8}$` |
| `instapay_type` / `instapay_value` | `text` | yes | Instapay only; type `ipa` \| `phone` |
| `status` | `app.bank_info_status` | no | `pending` |
| `reviewed_by` | `uuid` | yes | FK → `users` SET NULL |
| `reviewed_at` | `timestamptz` | yes | `(status='pending') = (reviewed_at is null)` |
| `created_at` / `updated_at` | `timestamptz` | no | |

Method-specific shape constraint (`user_payout_methods_shape`) guarantees only the
columns of the chosen method are populated. Editing details resets the row to
`pending` (`app.payout_methods_reset_decision()`); an operator cannot review their
own row (`PAYOUT_SELF_REVIEW`).

---

## 13. Views

All views are `security_invoker = true` and granted to `authenticated` +
`service_role`.

### `app.payroll_contributions_rollup`
Per-rep signed-contract contribution and signed-visit count. Reads
`visit_reports` (outcome `signed_contract`) left-joined to `merchants` for the
fallback commission when `commission_amount = 0`.
Columns: `rep_id`, `contribution numeric(14,2)`, `signed_visits integer`.

### `app.bi_merchant_rollup`
One row per merchant: `id`, `visited_at`, `rep_id`, `rep_name`,
`negotiated_commission` (newest report with a non-null agreed commission).

### `app.agent_kpi_rank_rollup`
Live-month score and city rank per field rep. Scope: `users` where
`title = 'مندوب ميداني'`, `clearance_level <= 2`, has `start_end_visit`, joined
to the rep's first city scope. Columns: `rep_id`, `rep_name`, `city_id`, `score`,
`position`, `total`. Score formula documented inside the migration.

### `app.merchant_state_rollup`
Per-merchant resolved agreement state = newest of stored `merchants.contract_state`,
latest `visit_reports.outcome`, latest `merchant_state_overrides.to_state`.
Also carries visit count, total duration, last visit, last outcome, stored state.
Columns: `merchant_id`, `current_state`, `current_state_at`, `current_state_source`,
`current_state_actor`, `visit_count`, `total_duration_seconds`, `last_visit_at`,
`last_outcome`, `last_outcome_at`, `last_rep_name`, `stored_state`, `stored_state_at`.

---

## 14. Functions & triggers

| Function | Kind | Purpose |
|---|---|---|
| `app.touch_updated_at()` | trigger fn | Set `updated_at = now()` on UPDATE |
| `app.has_permission(text)` | sql | `SECURITY DEFINER` capability check for RLS |
| `app.has_min_clearance(integer)` | sql | Clearance gate for RLS |
| `app.is_active_user()` | sql | Active operator check |
| `app.can_read_ledger()` / `can_record_deposits()` / `can_manage_treasury()` | sql | Treasury RLS gates |
| `app.can_manage_city(text)` | sql | City-manager RLS gate |
| `app.account_balance(uuid)` | sql | `deposits - expenses` |
| `app.ledger_enforce_account_currency()` | trigger fn | Ledger currency = account currency |
| `app.ledger_reject_mutation()` | trigger fn | Ledger append-only |
| `app.assert_governor_remaining(uuid)` | trigger fn | Guardian of `manage_system_users` |
| `app.user_permissions_governor_guard()` / `users_governor_guard()` | trigger fn | Invariant enforcement |
| `app.handle_auth_user_upsert()` | trigger fn | Mirror `auth.users` → `app.users` |
| `app.normalize_phone(text)` | sql | E.164 normalisation |
| `app.bootstrap_diagnostics()` / `bootstrap_probe()` | sql | Ops diagnostics |
| `app.payroll_line_sign(text)` | sql | Sign of a payroll item |
| `app.marketing_reject_mutation()` | trigger fn | Marketing entries append-only |
| `app.marketing_entry_guard()` / `marketing_campaign_terminal()` | trigger fn | Closed-campaign freeze |
| `app.commission_rates_singleton()` | (dropped) | Retired with per-city rates |
| `app.commission_rates_for(text)` | sql | City rate row with NULL fallback |
| `app.achievement_percent(numeric, numeric)` | sql | Achievement % (target 0 → null) |
| `app.contract_fee_tier(numeric)` | sql | Tier 1–4 selection |
| `app.contract_fee_for(text, numeric)` | sql | Tier fee for city + achievement |
| `app.kpi_snapshots_guard()` | trigger fn | Freeze financial slip after INSERT |
| `app.visit_report_guard()` | trigger fn | Visit invariants |
| `app.merchant_state_override_guard()` | trigger fn | State transition guard |
| `app.merchant_application_guard()` | trigger fn | Application status ladder |
| `app.payout_methods_reset_decision()` | trigger fn | Detail edit → pending |
| `app.sync_bank_info_status()` | trigger fn | Mirror status to `users` |
| `app.capital_deposit_decide()` / `capital_deposit_no_delete()` | trigger fn | Capital approval + immutability |
| `app.operation_freeze_amounts()` / `operation_route_ledgers()` / `operation_log_guard()` | trigger fn | Order math + clearing fan-out |
| `app.clearing_ledger_guard()` | trigger fn | Pending → cleared only |
| `app.rbac_revision()` | sql | Newest auth mutation (unix seconds) |
| `app.rbac_session(uuid)` | sql | Session payload: user, permissions, cities, revision (service role only) |
| `app.rbac_user_directory()` | sql | Full operator directory (service role only) |
| `app.contract_terminal_guard()` | trigger fn | Freeze signed/cancelled contracts |

---

## 15. Row Level Security

RLS is enabled on every `app` table. `service_role` bypasses RLS and is used by
the server-side Supabase client; `authenticated` policies gate the portal.

Summary of the model:

- **Identity/RBAC**: reads scoped to the operator; writes gated by
  `manage_system_users` / `manage_permissions` style capabilities, with the
  governor invariant enforced at the trigger level.
- **Treasury**: read gated by `app.can_read_ledger()`; deposits by
  `app.can_record_deposits()`; capital decisions by `app.can_manage_treasury()`.
  Ledger is append-only for every role.
- **Merchants / catalog / visits / contracts**: read scoped by capability and
  city; writes gated per capability. Contracts follow the exact capability set
  `view_contracts`, `draft_contract`, `create_contracts`, `edit_contract`,
  `edit_contracts`, `sign_contract`, `sign_contracts`, `cancel_contract`,
  `delete_contracts`.
- **Marketing**: spend entries append-only; campaign lifecycle gated by marketing
  capabilities; closed campaigns frozen.
- **Field operations**: `cities` readable by any city/field-ops capability and
  writable by `manage_cities` / `add_city`; tasks/follow-ups by
  `view_field_ops` / `start_end_visit` / `assign_tasks`; transfer requests by
  `request_ownership_transfer` / `approve_ownership_transfer`; edit requests by
  `view_all_teams_visits` / `approve_report_edits`. City-level scoping is a Tier
  3 decision, so RLS checks the capability only.
- **KPI / payroll**: snapshots immutable after insert; payroll reads are
  self-scoped or treasury-scoped.
- **Operations**: clearing transitions follow `pending → cleared`; amounts are
  frozen at insert.

Exact policies live in each migration; they are the only authority if this table
and the SQL ever disagree.

---

## 16. Index summary

Unique: `users(phone)`, `bank_accounts(iban)`, `payroll_tiers(user_id,
threshold_minor)`, `kpi_snapshots(rep_id, month_year)`, `field_teams(city_id,
lower(name))`, `commission_rates(city_id) [partial]`, `commission_rates((city_id
is null)) [partial]`, `merchants(normalized_name) [partial]`,
`catalog_products(merchant_id, name)`, `catalog_products(sku) [partial]`,
`catalog_products(barcode) [partial]`, `catalog_products(client_product_id)
[partial]`, `user_payout_methods(user_id)`, `capital_deposits(ledger_entry_id)
[partial]`, `couriers(user_id)`, `operation_logs(order_id)`,
`financial_ledgers(operation_id, entity_type, merchant_id/courier_id)`,
`visit_reports(client_visit_id) [partial]`, `contracts(reference)`,
`cities(lower(btrim(name)))`, `transfer_requests(merchant_id, requested_by)
[partial, status='pending']`, `edit_requests(merchant_id, requested_by)
[partial, status='pending']`.

Lookup indexes exist on all foreign keys and on the columns used by the rollup
views (`visit_reports(merchant_id, coalesce(ended_at, started_at, created_at)
desc)`, `marketing_entries(campaign_id, occurred_at desc)`, etc.).

---

## 17. Migration order

Apply in filename order. Every migration is re-runnable (`if not exists`,
guarded `add column`, `drop ... if exists` before `create`).

```
20261029000000  rbac_foundation
20261029000100  rbac_service_role_grants
20261029000200  seed_permissions
20261029000300  fix_auth_mirror_rls
20261029000400  fix_auth_mirror_email
20261029000500  fix_auth_mirror_phone
20261030000100  accounts_ledger
20261030000200  payroll
20261030000300  marketing
20261030000400  seed_treasury
20261030000500  treasury_access
20261030000600  marketing_campaigns
20261030000700  permission_catalogue_sync
20261030000800  l4_full_permission_backfill
20261031000000  enterprise_kpi_vault
20261031000001  snapshot_rate_history
20261031000002  city_specific_rates
20261031000003  city_teams_and_contracting
20261101000000  seed_l4_new_permissions
20261102000000  tiered_contract_commissions
20261102000001  user_profiles_and_capital
20261102000002  capital_treasury_gate
20261102000003  operations_clearinghouse
20261102000004  fix_l4_missing_grants
20261102000005  visit_reports
20261102000006  merchant_v1_parity
20261103000000  merchant_state_rollup
20261104000000  merchant_applications
20261105000000  edge_rollups
20261106000000  merchant_catalog_ssot
20261107000000  rbac_session_read
20261108000000  rbac_user_directory
20261109000000  contracts
20261110000000  field_ops_catalogue
```

---

## 18. V1 → V2 migration notes

Points a data migration prompt must honour:

1. **Money**: V1 values in currency units become `*_minor` by multiplying by 100
   and rounding. `app.merchants.commission_amount` and the fee columns are the
   exceptions: they stay `numeric` in currency units.
2. **Merchant ids stay text.** Do not mint UUIDs for `merchants.id` — visits,
   overrides, contracts and operations reference the same text ids.
3. **City ids stay text.** `app.cities.id` keeps the V1/Firestore id
   (`city-cairo`) so `app.user_city_scope`, `app.merchants.city_id` and the
   text columns on tasks/contracts remain valid without a rewrite. Create the
   city rows first; city managers are `user_city_scope` grants, not a column.
4. **Rep ids on `visit_reports` / `merchant_state_overrides` are text.** Only
   `logged_by` is a UUID FK; map a V1 user id to `auth.users.id` when possible,
   otherwise leave it null and keep the text `rep_id`.
5. **Contract state is a ladder.** Normalise V1 statuses into
   `no_agreement → provisional → final_contract → signed_contract`; anything
   unknown maps to `no_agreement`.
6. **Contract register** (`app.contracts`) is new in V2: only V1 records that had
   an actual signed document need importing, as `signed` with `signed_at` set.
   `reference` must be unique.
7. **Ledger is immutable.** Import opening balances as one `deposit` row per
   account; never insert historical rows then try to edit them.
8. **KPI snapshots are frozen.** Recalculate V2 slips; do not copy V1 salary
   numbers into the frozen columns without recomputing the applied rates.
9. **Payout methods**: exactly one row per user; a migrated destination starts at
   `pending` and requires review (`bank_info_status` mirrors it).
10. **Permissions**: seed `app.permissions` from the V1 capability list first,
    then grant. A grant referencing a missing key fails the FK.
