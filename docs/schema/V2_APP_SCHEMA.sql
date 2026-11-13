--
-- PostgreSQL database dump
--
--
-- Kanjo V2.0 — final app schema (DDL only, no user data, no migration history)
--
-- Regenerated 2026-11-13 by replaying supabase/migrations/*.sql in filename
-- order on PostgreSQL 15, then reconciling live-only columns from the deployed
-- app schema. `app.schema_migrations` is intentionally excluded.
--
-- ETL notes — insert into the base tables only; never write derived state:
--   * Money is integer minor units (`*_minor`, bigint). Percentages stay numeric.
--   * Account balances are derived from app.journal_account_balances; no balance
--     column is maintained. Do not insert balances.
--   * journal_entries / journal_lines are append-only and must balance at commit
--     (deferred trigger `journal_lines_balanced`). Platform triggers normally
--     post journals for operations, settlements, payments and capital.
--
-- Triggers external loaders must plan around:
--   * app.operation_logs
--       operation_logs_immutable_update  -> app.operation_log_guard
--       operation_logs_freeze_amounts    -> app.operation_freeze_amounts
--       operation_logs_post_journal      -> app.operation_post_journal (AFTER INSERT)
--       operation_logs_delete_journal    -> app.operation_delete_journal_entry (BEFORE DELETE)
--   * app.journal_entries / app.journal_lines
--       *_immutable_update / *_immutable_delete -> app.journal_reject_mutation
--       journal_lines_balanced -> app.journal_entry_balanced (DEFERRED)
--   * app.ledger_entries
--       ledger_entries_immutable_update / _delete -> app.ledger_reject_mutation
--   * app.audit_logs
--       audit_logs_immutable -> app.audit_log_immutable
--   * app.capital_deposits
--       capital_deposits_no_delete -> app.capital_deposit_no_delete
--   * app.marketing_entries
--       marketing_entries_immutable_update / _delete -> app.marketing_reject_mutation
--   * app.visit_reports
--       visit_reports_guard_update / _guard_delete -> app.visit_report_guard
--   * app.contracts / app.merchant_state_overrides / app.merchant_applications
--       terminal/guard triggers reject illegal state transitions.
--

\restrict newqOnwqVu5eB258qBjM6GRDAocfd9PpjDbOTmoVdSAIkUNl5vvp0V5TxIv190L

-- Dumped from database version 15.19 (Debian 15.19-0+deb12u1)
-- Dumped by pg_dump version 15.19 (Debian 15.19-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: SCHEMA app; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA app IS 'Kanjo V2 Financial/ERP schema. Supabase (PostgreSQL) is the system of record for identity, RBAC, contracts, wallets, ledgers and commissions.';


--
-- Name: account_type; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.account_type AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
);


--
-- Name: bank_info_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.bank_info_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: capital_deposit_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.capital_deposit_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: coupon_funding; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.coupon_funding AS ENUM (
    'platform',
    'vendor',
    'split'
);


--
-- Name: coupon_type; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.coupon_type AS ENUM (
    'free_shipping',
    'welcome_coupon',
    'cashback',
    'percentage_discount',
    'fixed_amount'
);


--
-- Name: journal_source; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.journal_source AS ENUM (
    'operation',
    'merchant_settlement',
    'courier_payout',
    'coupon_budget',
    'capital',
    'manual',
    'opening',
    'reversal',
    'fx_transfer'
);


--
-- Name: journal_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.journal_status AS ENUM (
    'posted',
    'reversed'
);


--
-- Name: kpi_snapshot_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.kpi_snapshot_status AS ENUM (
    'pending',
    'paid'
);


--
-- Name: normal_balance; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.normal_balance AS ENUM (
    'debit',
    'credit'
);


--
-- Name: party_type; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.party_type AS ENUM (
    'merchant',
    'courier',
    'bank',
    'customer'
);


--
-- Name: payment_method; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.payment_method AS ENUM (
    'COD',
    'ONLINE'
);


--
-- Name: payout_method_kind; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.payout_method_kind AS ENUM (
    'bank_account',
    'e_wallet',
    'instapay',
    'egypt_post'
);


--
-- Name: account_balance(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.account_balance(p_account_id uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(sum(
    case kind when 'deposit' then amount_minor else -amount_minor end
  ), 0)::bigint
  from app.ledger_entries
  where account_id = p_account_id;
$$;


--
-- Name: achievement_percent(numeric, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.achievement_percent(p_actual numeric, p_target numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  /* Target 0 (or NULL) means the percentage is undefined: return NULL, which
   * the tier selector maps to the conservative band. */
  select case
           when p_target is null or p_target <= 0 then null::numeric
           else round((p_actual / p_target) * 100, 2)
         end;
$$;


--
-- Name: FUNCTION achievement_percent(p_actual numeric, p_target numeric); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.achievement_percent(p_actual numeric, p_target numeric) IS 'Achievement as (actual / target) * 100, rounded to two decimals. NULL when the target is zero or unknown.';


--
-- Name: assert_governor_remaining(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.assert_governor_remaining(affected_user uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if exists (
    select 1
    from app.users u
    join app.user_permissions p on p.user_id = u.id
    where u.id = affected_user
      and u.active
      and p.permission_key = 'manage_system_users'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from app.users u
    join app.user_permissions p on p.user_id = u.id
    where u.active
      and p.permission_key = 'manage_system_users'
  ) then
    raise exception
      'RBAC_INVARIANT: at least one active operator must retain manage_system_users'
      using errcode = '23514';
  end if;
end;
$$;


--
-- Name: audit_log_immutable(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.audit_log_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception
    'AUDIT_LOG_IMMUTABLE: audit entries are append-only; record a correcting entry instead'
    using errcode = '55000';
end;
$$;


--
-- Name: bootstrap_diagnostics(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.bootstrap_diagnostics() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'trigger_owner', (
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname = 'handle_auth_user_upsert'
    ),
    'owner_bypassrls', (
      select r.rolbypassrls
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
      where n.nspname = 'app' and p.proname = 'handle_auth_user_upsert'
    ),
    'users_force_rls', (
      select c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname = 'users'
    ),
    'users_policies', (
      select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'app' and tablename = 'users'
    )
  );
$$;


--
-- Name: FUNCTION bootstrap_diagnostics(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.bootstrap_diagnostics() IS 'Read-only setup diagnostics for the one-shot founder bootstrap route. Remove together with that route.';


--
-- Name: bootstrap_probe(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.bootstrap_probe() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'email_shape_constraint', (
      select pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'app' and t.relname = 'users'
        and c.conname = 'users_email_shape'
    ),
    'phone_e164_constraint', (
      select pg_get_constraintdef(c.oid)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'app' and t.relname = 'users'
        and c.conname = 'users_phone_e164'
    ),
    'blank_emails_remaining', (
      select count(*) from app.users
      where email is not null and btrim(email) = ''
    ),
    'non_canonical_phones_remaining', (
      select count(*) from app.users
      where phone is distinct from app.normalize_phone(phone)
    ),
    'normalize_sample', app.normalize_phone('201040491882'),
    'auth_phone_shape', (
      select case
        when u.phone is null then 'null'
        when u.phone like '+%' then 'plus_prefixed'
        else 'bare_digits'
      end
      from auth.users u
      order by u.created_at desc nulls last
      limit 1
    )
  );
$$;


--
-- Name: FUNCTION bootstrap_probe(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.bootstrap_probe() IS 'Read-only probe for the one-shot founder bootstrap route. Remove together with that route.';


--
-- Name: can_manage_city(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_manage_city(p_city_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from app.users u
    where u.id = auth.uid()
      and u.active
      and (
        u.clearance_level >= 3
        or (
          u.clearance_level = 2
          and exists (
            select 1
            from app.user_city_scope s
            where s.user_id = u.id
              and s.city_id = p_city_id
          )
        )
      )
  );
$$;


--
-- Name: FUNCTION can_manage_city(p_city_id text); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.can_manage_city(p_city_id text) IS 'True when the caller is an executive, or a level-2 manager scoped to the given city.';


--
-- Name: can_manage_treasury(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_manage_treasury() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select app.has_permission('view_bank_balances')
      or app.has_permission('add_bank_account');
$$;


--
-- Name: FUNCTION can_manage_treasury(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.can_manage_treasury() IS 'True for the full treasury audience: sees balances and may record expenses. Mirrors resolveTreasuryAccess().full.';


--
-- Name: can_read_ledger(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_read_ledger() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select app.has_permission('view_accounts')
      or app.has_permission('manage_accounts');
$$;


--
-- Name: FUNCTION can_read_ledger(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.can_read_ledger() IS 'True for viewers who may read the full treasury book, balances and expenses included.';


--
-- Name: can_record_deposits(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_record_deposits() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select app.has_permission('record_deposits');
$$;


--
-- Name: FUNCTION can_record_deposits(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.can_record_deposits() IS 'True for deposit-only viewers. Narrow: Egyptian accounts, deposits, no balances.';


--
-- Name: capital_deposit_decide(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.capital_deposit_decide() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  entry_id        uuid;
  journal_id      uuid;
  account_currency char(3);
  founder_name    text;
  bank_id         uuid;
  equity_id       uuid;
  journal_label   text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception
        'CAPITAL_DEPOSIT_PENDING_ONLY: a deposit is created pending and decided afterwards'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    if row(new.amount_minor, new.currency, new.founder_id, new.receipt_path)
       is distinct from
       row(old.amount_minor, old.currency, old.founder_id, old.receipt_path) then
      raise exception
        'CAPITAL_DEPOSIT_IMMUTABLE: amount, currency, founder and receipt cannot change after creation'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception
      'CAPITAL_DEPOSIT_DECIDED: a decided deposit cannot change again'
      using errcode = '23514';
  end if;

  if new.decided_by = old.founder_id then
    raise exception
      'CAPITAL_DEPOSIT_SELF_REVIEW: a founder cannot approve their own capital deposit'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.users where id = new.decided_by and active
  ) then
    raise exception
      'CAPITAL_DEPOSIT_REVIEWER_INVALID: the reviewer must be an active operator'
      using errcode = '23514';
  end if;

  if new.status = 'rejected' then
    if new.decided_by is null then
      raise exception
        'CAPITAL_DEPOSIT_REVIEWER_REQUIRED: a rejection must name the reviewer'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'approved' then
    if new.account_id is null then
      raise exception
        'CAPITAL_DEPOSIT_ACCOUNT_REQUIRED: approve against a treasury account'
        using errcode = '23514';
    end if;

    select currency into account_currency
      from app.bank_accounts where id = new.account_id;
    if account_currency is null then
      raise exception
        'CAPITAL_DEPOSIT_ACCOUNT_MISSING: the target account does not exist'
        using errcode = '23503';
    end if;
    if account_currency <> new.currency then
      raise exception
        'CAPITAL_DEPOSIT_CURRENCY_MISMATCH: deposit currency % must equal account currency %',
        new.currency, account_currency
        using errcode = '23514';
    end if;

    select full_name into founder_name from app.users where id = new.founder_id;
    journal_label := format(
      'إيداع رأسمالي — %s',
      coalesce(nullif(btrim(founder_name), ''), 'مؤسس')
    );

    /* Legacy row first, so the approval keeps its audit reference. The journal
     * source_id mirrors the bridge key, which makes the backfill idempotent. */
    insert into app.ledger_entries (
      account_id, kind, label, amount_minor, currency, occurred_at, recorded_by
    ) values (
      new.account_id,
      'deposit',
      journal_label,
      new.amount_minor,
      new.currency,
      now(),
      new.decided_by
    )
    returning id into entry_id;

    new.ledger_entry_id := entry_id;

    if not exists (
      select 1 from app.journal_entries
       where source_type = 'opening'
         and source_id = 'legacy-ledger:' || entry_id::text
    ) then
      bank_id := case new.currency
        when 'SAR' then (select id from app.accounts where code = '1000-SAR' and party_type is null limit 1)
        else (select id from app.accounts where code = '1000' and party_type is null limit 1)
      end;
      select id into equity_id from app.accounts where code = '3000' and party_type is null limit 1;

      if bank_id is not null and equity_id is not null then
        insert into app.journal_entries (entry_date, memo, source_type, source_id, currency)
        values (current_date, journal_label, 'opening', 'legacy-ledger:' || entry_id::text, new.currency)
        returning id into journal_id;

        insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
        values (journal_id, bank_id, new.amount_minor, journal_label);
        insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
        values (journal_id, equity_id, new.amount_minor, journal_label);
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;


--
-- Name: capital_deposit_no_delete(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.capital_deposit_no_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if old.status <> 'pending' then
    raise exception
      'CAPITAL_DEPOSIT_IMMUTABLE: a decided deposit cannot be deleted'
      using errcode = '55000';
  end if;
  return old;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: commission_rates; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.commission_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_activation_fee numeric(12,2) DEFAULT 50 NOT NULL,
    photo_item_fee numeric(12,2) DEFAULT 1 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    city_id text,
    contract_fee_tier_1 numeric(12,2) DEFAULT 100 NOT NULL,
    contract_fee_tier_2 numeric(12,2) DEFAULT 100 NOT NULL,
    contract_fee_tier_3 numeric(12,2) DEFAULT 100 NOT NULL,
    contract_fee_tier_4 numeric(12,2) DEFAULT 100 NOT NULL,
    CONSTRAINT commission_rates_city_present CHECK (((city_id IS NULL) OR (length(btrim(city_id)) > 0))),
    CONSTRAINT commission_rates_contract_fee_tier_1_non_negative CHECK ((contract_fee_tier_1 >= (0)::numeric)),
    CONSTRAINT commission_rates_contract_fee_tier_2_non_negative CHECK ((contract_fee_tier_2 >= (0)::numeric)),
    CONSTRAINT commission_rates_contract_fee_tier_3_non_negative CHECK ((contract_fee_tier_3 >= (0)::numeric)),
    CONSTRAINT commission_rates_contract_fee_tier_4_non_negative CHECK ((contract_fee_tier_4 >= (0)::numeric)),
    CONSTRAINT commission_rates_merchant_activation_fee_check CHECK ((merchant_activation_fee >= (0)::numeric)),
    CONSTRAINT commission_rates_photo_item_fee_check CHECK ((photo_item_fee >= (0)::numeric))
);

ALTER TABLE ONLY app.commission_rates FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE commission_rates; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.commission_rates IS 'Editable KPI fee schedule. Snapshots copy the applied figures, so edits here never rewrite history.';


--
-- Name: COLUMN commission_rates.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.commission_rates.city_id IS 'Firestore city document id. NULL is the global fallback used by cities with no override. No FK by design: cross-database reference.';


--
-- Name: COLUMN commission_rates.contract_fee_tier_1; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.commission_rates.contract_fee_tier_1 IS 'Contract fee when achievement is below 80% of target.';


--
-- Name: COLUMN commission_rates.contract_fee_tier_2; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.commission_rates.contract_fee_tier_2 IS 'Contract fee when achievement is 80% up to (not including) 90%.';


--
-- Name: COLUMN commission_rates.contract_fee_tier_3; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.commission_rates.contract_fee_tier_3 IS 'Contract fee when achievement is 90% up to (not including) 100%.';


--
-- Name: COLUMN commission_rates.contract_fee_tier_4; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.commission_rates.contract_fee_tier_4 IS 'Contract fee when achievement reaches 100% or more. The top band includes exactly 100% so no achievement value is unpaid.';


--
-- Name: commission_rates_for(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.commission_rates_for(p_city_id text) RETURNS app.commission_rates
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select r.*
  from app.commission_rates r
  where r.city_id is not distinct from p_city_id
     or (p_city_id is not null and r.city_id is null)
  /* A city override must beat the fallback. Without this ORDER BY the choice
   * between the two matching rows would be left to the planner. */
  order by (r.city_id is not null) desc
  limit 1;
$$;


--
-- Name: FUNCTION commission_rates_for(p_city_id text); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.commission_rates_for(p_city_id text) IS 'Resolves the active schedule for a city: the city override when present, otherwise the NULL-city fallback.';


--
-- Name: contract_fee_for(text, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.contract_fee_for(p_city_id text, p_achievement_pct numeric) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case app.contract_fee_tier(p_achievement_pct)
           when 1 then r.contract_fee_tier_1
           when 2 then r.contract_fee_tier_2
           when 3 then r.contract_fee_tier_3
           else        r.contract_fee_tier_4
         end
  from app.commission_rates r
  where r.city_id is not distinct from p_city_id
     or (p_city_id is not null and r.city_id is null)
  order by (r.city_id is not null) desc
  limit 1;
$$;


--
-- Name: FUNCTION contract_fee_for(p_city_id text, p_achievement_pct numeric); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.contract_fee_for(p_city_id text, p_achievement_pct numeric) IS 'Contract fee for the active schedule of a city at the given achievement: city override first, else the NULL-city fallback.';


--
-- Name: contract_fee_tier(numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.contract_fee_tier(p_achievement_pct numeric) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case
           when p_achievement_pct is null       then 1::smallint
           when p_achievement_pct < 80          then 1::smallint
           when p_achievement_pct < 90          then 2::smallint
           when p_achievement_pct < 100         then 3::smallint
           else 4::smallint
         end;
$$;


--
-- Name: FUNCTION contract_fee_tier(p_achievement_pct numeric); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.contract_fee_tier(p_achievement_pct numeric) IS 'Maps an achievement percentage to its band: 1 [0,80), 2 [80,90), 3 [90,100), 4 [100,∞). NULL is tier 1.';


--
-- Name: contract_terminal_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.contract_terminal_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status in ('signed', 'cancelled') then
    raise exception
      'CONTRACT_TERMINAL: a % contract cannot be modified',
      old.status
      using errcode = '55000';
  end if;

  if new.status = 'signed' and new.signed_at is null then
    new.signed_at := now();
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;


--
-- Name: coupon_enforce_funding(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.coupon_enforce_funding() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: handle_auth_user_upsert(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.handle_auth_user_upsert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  normalized_phone text := app.normalize_phone(new.phone);
begin
  if normalized_phone is null then
    raise exception
      'AUTH_PHONE_REQUIRED: Kanjo login is phone + password; auth.users.phone must be set'
      using errcode = '23514';
  end if;

  if normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception
      'AUTH_PHONE_INVALID: % is not a valid E.164 number once normalized to %',
      coalesce(new.phone, ''), normalized_phone
      using errcode = '23514';
  end if;

  insert into app.users (id, phone, email)
  values (
    new.id,
    normalized_phone,
    -- GoTrue sends '' for phone-only accounts; store that as NULL so the
    -- email-shape constraint is only ever applied to real addresses.
    nullif(btrim(coalesce(new.email, '')), '')
  )
  on conflict (id) do update
    set phone = excluded.phone,
        email = excluded.email;

  return new;
end;
$_$;


--
-- Name: has_min_clearance(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.has_min_clearance(p_level integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from app.users u
    where u.id = auth.uid()
      and u.active
      and u.clearance_level >= p_level
  );
$$;


--
-- Name: FUNCTION has_min_clearance(p_level integer); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.has_min_clearance(p_level integer) IS 'True when the caller is an active operator at or above the given clearance rank.';


--
-- Name: has_permission(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.has_permission(p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from app.user_permissions p
    join app.users u on u.id = p.user_id
    where p.user_id = auth.uid()
      and p.permission_key = p_key
      and u.active
  );
$$;


--
-- Name: is_active_user(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from app.users u
    where u.id = auth.uid() and u.active
  );
$$;


--
-- Name: journal_entry_balanced(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.journal_entry_balanced() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  target_entry uuid;
  total_debit  bigint;
  total_credit bigint;
begin
  target_entry := case when tg_op = 'DELETE' then old.entry_id else new.entry_id end;

  select coalesce(sum(debit_minor), 0), coalesce(sum(credit_minor), 0)
    into total_debit, total_credit
    from app.journal_lines
   where entry_id = target_entry;

  /* An emptied entry (cascade during a rollback) carries no money to balance. */
  if total_debit = 0 and total_credit = 0 then
    return null;
  end if;

  if total_debit <> total_credit then
    raise exception
      'JOURNAL_UNBALANCED: entry % has debit % and credit %',
      target_entry, total_debit, total_credit
      using errcode = '23514';
  end if;

  return null;
end;
$$;


--
-- Name: journal_reject_mutation(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.journal_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.hard_delete_orders', true), '') = 'on' then
    return old;
  end if;

  raise exception
    'JOURNAL_IMMUTABLE: journal rows are append-only; post a reversing entry instead'
    using errcode = '55000';
end;
$$;


--
-- Name: kpi_snapshots_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.kpi_snapshots_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.applied_merchant_rate is null or new.applied_item_rate is null then
      raise exception
        'KPI_SNAPSHOT_RATES_REQUIRED: snapshots must record the merchant and item rates applied'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.rep_id                    is distinct from old.rep_id
     or new.month_year               is distinct from old.month_year
     or new.new_merchants_activated  is distinct from old.new_merchants_activated
     or new.items_added              is distinct from old.items_added
     or new.calculated_salary        is distinct from old.calculated_salary
     or new.applied_merchant_rate    is distinct from old.applied_merchant_rate
     or new.applied_item_rate        is distinct from old.applied_item_rate
     or new.applied_contract_fee     is distinct from old.applied_contract_fee
     or new.contracts_closed         is distinct from old.contracts_closed
     or new.avg_achievement_ratio    is distinct from old.avg_achievement_ratio then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: measured amounts, applied rates, the contract fee and outcomes cannot be modified after lock'
      using errcode = '23514';
  end if;

  if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
    raise exception
      'KPI_SNAPSHOT_IMMUTABLE: locked_at cannot be changed once the snapshot is locked'
      using errcode = '23514';
  end if;

  if old.status = 'paid' and new.status is distinct from 'paid' then
    raise exception
      'KPI_SNAPSHOT_STATUS_REGRESSION: a paid snapshot cannot be reopened'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION kpi_snapshots_guard(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.kpi_snapshots_guard() IS 'Requires applied merchant/item rates on insert; freezes amounts, applied rates, the contract fee, outcomes and locked_at; allows only pending -> paid on status.';


--
-- Name: ledger_enforce_account_currency(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.ledger_enforce_account_currency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  account_currency char(3);
begin
  select currency into account_currency
  from app.bank_accounts
  where id = new.account_id;

  if account_currency is null then
    raise exception 'LEDGER_ACCOUNT_MISSING: ledger entry references a missing account'
      using errcode = '23503';
  end if;

  if new.currency is distinct from account_currency then
    raise exception
      'LEDGER_CURRENCY_MISMATCH: entry currency % must equal account currency %',
      new.currency, account_currency
      using errcode = '23514';
  end if;

  return new;
end;
$$;


--
-- Name: ledger_reject_mutation(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.ledger_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception
    'LEDGER_IMMUTABLE: ledger entries are append-only; record a reversing entry instead'
    using errcode = '55000';
end;
$$;


--
-- Name: marketing_campaign_terminal(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.marketing_campaign_terminal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status = 'closed' then
    raise exception 'MARKETING_CAMPAIGN_TERMINAL: a closed campaign cannot be reopened'
      using errcode = '55000';
  end if;
  return new;
end;
$$;


--
-- Name: marketing_entry_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.marketing_entry_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  campaign_status   text;
  campaign_platform text;
  campaign_channel  text;
begin
  select status, platform, channel
    into campaign_status, campaign_platform, campaign_channel
    from app.marketing_campaigns
   where id = new.campaign_id;

  if campaign_status is null then
    raise exception 'MARKETING_UNKNOWN_CAMPAIGN: % does not exist', new.campaign_id
      using errcode = '23503';
  end if;

  if campaign_status = 'closed' then
    raise exception 'MARKETING_CAMPAIGN_CLOSED: cannot append results to a closed campaign'
      using errcode = '55000';
  end if;

  new.platform := campaign_platform;
  new.channel  := campaign_channel;

  return new;
end;
$$;


--
-- Name: marketing_reject_mutation(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.marketing_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception
    'MARKETING_IMMUTABLE: marketing entries are append-only; record a correcting row instead'
    using errcode = '55000';
end;
$$;


--
-- Name: merchant_application_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.merchant_application_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.store_name     is distinct from old.store_name
  or new.contact_person is distinct from old.contact_person
  or new.phone_number   is distinct from old.phone_number
  or new.business_type  is distinct from old.business_type
  or new.created_at     is distinct from old.created_at then
    raise exception
      'MERCHANT_APPLICATION_IMMUTABLE: يمكن تغيير حالة الطلب فقط، لا بيانات مقدّم الطلب.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


--
-- Name: merchant_state_override_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.merchant_state_override_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception
    'MERCHANT_STATE_OVERRIDE_IMMUTABLE: a recorded state decision cannot be changed or deleted'
    using errcode = '23514';
end;
$$;


--
-- Name: FUNCTION merchant_state_override_guard(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.merchant_state_override_guard() IS 'Rejects UPDATE and DELETE: overrides are an append-only audit record.';


--
-- Name: normalize_phone(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.normalize_phone(raw text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case
    when regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') = '' then null
    else '+' || regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g')
  end;
$$;


--
-- Name: FUNCTION normalize_phone(raw text); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.normalize_phone(raw text) IS 'Canonical E.164 form for app.users.phone: one leading + then digits, whatever GoTrue stored in auth.users.phone.';


--
-- Name: operation_delete_journal_entry(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.operation_delete_journal_entry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  posting uuid := old.journal_entry_id;
begin
  if posting is null then
    return old;
  end if;

  perform set_config('app.hard_delete_orders', 'on', true);

  delete from app.transaction_receipts where entry_id = posting;
  delete from app.transaction_receipts
   where entry_id in (
     select id from app.journal_entries where reverses_entry_id = posting
   );
  delete from app.journal_entries where reverses_entry_id = posting;
  delete from app.journal_entries where id = posting;

  return old;
end;
$$;


--
-- Name: operation_freeze_amounts(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.operation_freeze_amounts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  merchant_rate  numeric(6, 2);
  fixed_profit   bigint;
  c_type         app.coupon_type;
  c_active       boolean;
  c_vendor_pct   numeric(5, 2);
  c_amount       bigint;
  c_shipping     bigint;
  c_cashback     bigint;
  c_max          bigint;
  base_minor     bigint;
  shipping_part  bigint;
  total_coupon   bigint;
  ceiling_disc   bigint;
  platform_share bigint;
begin
  select coalesce(agreed_commission, target_commission)
    into merchant_rate
    from app.merchants
   where id = new.merchant_id;

  if merchant_rate is null then
    raise exception
      'OPERATION_MERCHANT_MISSING: merchant % does not exist', new.merchant_id
      using errcode = '23503';
  end if;

  new.commission_percent := coalesce(merchant_rate, 0);
  new.commission_minor := round(new.order_value_minor * new.commission_percent / 100)::bigint;

  if new.courier_cut_minor is null or new.courier_cut_minor = 0 then
    select fixed_profit_per_order_minor into fixed_profit
      from app.couriers
     where id = new.courier_id;
    new.courier_cut_minor := coalesce(fixed_profit, 0);
  end if;
  new.courier_cut_percent := 0;

  new.coupon_discount_minor          := 0;
  new.coupon_shipping_minor          := 0;
  new.coupon_cashback_minor          := 0;
  new.coupon_platform_funded_minor   := 0;
  new.coupon_vendor_funded_minor     := 0;

  if new.coupon_id is not null then
    select coupon_type, active, vendor_funding_percent,
           discount_amount_minor, shipping_discount_minor,
           cashback_amount_minor, max_discount_minor
      into c_type, c_active, c_vendor_pct, c_amount, c_shipping,
           c_cashback, c_max
      from app.coupons
     where id = new.coupon_id;

    if c_type is null then
      raise exception 'OPERATION_COUPON_MISSING: coupon % does not exist', new.coupon_id
        using errcode = '23503';
    end if;
    if not c_active then
      raise exception 'OPERATION_COUPON_INACTIVE: coupon % is not active', new.coupon_id
        using errcode = '23514';
    end if;

    base_minor := case c_type
      when 'percentage_discount' then round(new.order_value_minor * c_amount / 10000.0)::bigint
      when 'fixed_amount'        then c_amount
      when 'welcome_coupon'      then c_amount
      when 'free_shipping'       then 0
      when 'cashback'            then 0
      else 0
    end;

    /* Absolute per-order cap. Applied to the value-based discount only, so a
     * free-shipping coupon still waives the fee it promises and the funding
     * split of the capped discount stays exact. */
    if c_max is not null and base_minor > c_max then
      base_minor := c_max;
    end if;

    shipping_part := case
      when c_type = 'free_shipping' then new.delivery_fee_minor
      else c_shipping
    end;

    total_coupon := base_minor + shipping_part;
    ceiling_disc := new.order_value_minor + new.delivery_fee_minor;
    if total_coupon > ceiling_disc then
      total_coupon := ceiling_disc;
    end if;

    select code into new.coupon_code from app.coupons where id = new.coupon_id;

    new.coupon_discount_minor := total_coupon;
    new.coupon_shipping_minor := shipping_part;
    new.coupon_cashback_minor := case when c_type = 'cashback' then c_cashback else 0 end;

    if c_type = 'free_shipping' then
      platform_share := total_coupon;
    else
      platform_share := round(total_coupon * (100 - c_vendor_pct) / 100.0)::bigint;
    end if;
    new.coupon_platform_funded_minor := platform_share;
    new.coupon_vendor_funded_minor := total_coupon - platform_share;
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION operation_freeze_amounts(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.operation_freeze_amounts() IS 'Resolves and freezes commission, courier profit, coupon split and wallet on an operation.';


--
-- Name: operation_log_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.operation_log_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'UPDATE'
     and old.journal_entry_id is null
     and new.journal_entry_id is not null
     and (to_jsonb(old) - 'journal_entry_id') = (to_jsonb(new) - 'journal_entry_id') then
    return new;
  end if;

  raise exception
    'OPERATION_IMMUTABLE: operations are append-only; log a correcting order instead'
    using errcode = '55000';
end;
$$;


--
-- Name: operation_post_journal(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.operation_post_journal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  entry_id       uuid;
  merchant_acct  uuid;
  courier_acct   uuid;
  bank_acct      uuid;
  m              bigint := new.commission_minor;
  d_fee          bigint := new.delivery_fee_minor;
  o_val          bigint := new.order_value_minor;
  c_coupon       bigint := new.coupon_discount_minor;
  cp_platform    bigint := new.coupon_platform_funded_minor;
  cv_vendor      bigint := new.coupon_vendor_funded_minor;
  w_wallet       bigint := new.wallet_discount_minor;
  k_cut          bigint := new.courier_cut_minor;
  cashback       bigint := new.coupon_cashback_minor;
  courier_pay    bigint;
  merchant_line  bigint;
  bank_line      bigint;
begin
  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency, created_by
  ) values (
    new.occurred_at::date,
    'عملية ' || new.order_id,
    'operation',
    new.id::text,
    new.currency,
    new.logged_by
  )
  returning id into entry_id;

  if new.payment_method = 'COD' then
    merchant_acct := app.party_account('1100', 'merchant', new.merchant_id::text);
    courier_acct  := app.party_account('2100', 'courier', new.courier_id::text);

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, merchant_acct, m, 'عمولة مستحقة');
    end if;

    if cp_platform > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5000'), cp_platform, 'خصم كوبون');
    end if;
    if w_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5300'), w_wallet, 'استرداد محفظة');
    end if;
    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5100'), k_cut, 'ربح المندوب');
    end if;

    courier_pay := cp_platform + w_wallet - d_fee + k_cut;
    if courier_pay > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, courier_acct, courier_pay, 'مستحق للمندوب');
    elsif courier_pay < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, courier_acct, -courier_pay, 'مستحق على المندوب');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if d_fee > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4100'), d_fee, 'إيراد توصيل');
    end if;
  else
    bank_acct      := app.system_account('1000');
    merchant_acct  := app.party_account('2000', 'merchant', new.merchant_id::text);
    courier_acct   := app.party_account('2100', 'courier', new.courier_id::text);

    bank_line := o_val + d_fee - c_coupon - w_wallet;
    if bank_line > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, bank_acct, bank_line, 'تحصيل إلكتروني');
    elsif bank_line < 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, bank_acct, -bank_line, 'تحصيل إلكتروني');
    end if;

    if cp_platform > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5000'), cp_platform, 'خصم كوبون');
    end if;
    if w_wallet > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5300'), w_wallet, 'استرداد محفظة');
    end if;
    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, app.system_account('5100'), k_cut, 'ربح المندوب');
    end if;

    merchant_line := o_val - cv_vendor - m;
    if merchant_line > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, merchant_acct, merchant_line, 'مستحق للتاجر');
    elsif merchant_line < 0 then
      insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
      values (entry_id, merchant_acct, -merchant_line, 'مستحق على التاجر');
    end if;

    if k_cut > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, courier_acct, k_cut, 'مستحق للمندوب');
    end if;

    if m > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4000'), m, 'إيراد عمولة');
    end if;
    if d_fee > 0 then
      insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
      values (entry_id, app.system_account('4100'), d_fee, 'إيراد توصيل');
    end if;
  end if;

  if cashback > 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, app.system_account('5200'), cashback, 'كاش باك');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, app.system_account('2400'), cashback, 'رصيد محفظة العميل');
  end if;

  update app.operation_logs
     set journal_entry_id = entry_id
   where id = new.id;

  return null;
end;
$$;


--
-- Name: FUNCTION operation_post_journal(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.operation_post_journal() IS 'Posts the balanced double-entry journal for a logged operation (COD and ONLINE).';


--
-- Name: party_account(text, app.party_type, text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.party_account(p_parent_code text, p_party_type app.party_type, p_party_id text, p_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  parent app.accounts;
  account_id uuid;
begin
  select * into parent
    from app.accounts
   where code = p_parent_code and party_type is null;

  if parent.id is null then
    raise exception 'ACCOUNT_CONTROL_MISSING: % does not exist', p_parent_code
      using errcode = '23503';
  end if;

  select id into account_id
    from app.accounts
   where parent_id = parent.id
     and party_type = p_party_type
     and party_id = p_party_id
     and currency = parent.currency;

  if account_id is not null then
    return account_id;
  end if;

  insert into app.accounts (
    code, name, type, normal_balance, currency, party_type, party_id, parent_id
  ) values (
    parent.code || ':' || p_party_id,
    coalesce(p_name, p_party_type::text || ' ' || p_party_id),
    parent.type, parent.normal_balance, parent.currency,
    p_party_type, p_party_id, parent.id
  )
  returning id into account_id;

  return account_id;
end;
$$;


--
-- Name: payout_methods_reset_decision(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.payout_methods_reset_decision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: payroll_line_sign(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.payroll_line_sign(p_item_type text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_item_type when 'deduction' then -1 else 1 end;
$$;


--
-- Name: post_bank_movement(uuid, text, text, bigint, timestamp with time zone, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.post_bank_movement(p_account_id uuid, p_kind text, p_label text, p_amount_minor bigint, p_occurred_at timestamp with time zone, p_actor uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  acct     app.accounts;
  entry_id uuid;
  contra   uuid;
  amount   bigint := p_amount_minor;
begin
  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'BANK_MOVEMENT_ACCOUNT_MISSING: account % does not exist', p_account_id
      using errcode = '23503';
  end if;
  if acct.party_type is not null then
    raise exception 'BANK_MOVEMENT_NOT_CONTROL: account % is a party account', p_account_id
      using errcode = '23514';
  end if;
  if acct.currency <> 'EGP' then
    raise exception
      'BANK_MOVEMENT_EGP_ONLY: manual movements post to the Egyptian bank only; account is %',
      acct.currency
      using errcode = '23514';
  end if;
  if p_kind not in ('deposit', 'expense') then
    raise exception 'BANK_MOVEMENT_KIND_INVALID: % is not deposit or expense', p_kind
      using errcode = '23514';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'BANK_MOVEMENT_AMOUNT_POSITIVE: amount must be greater than zero'
      using errcode = '23514';
  end if;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (
    coalesce(p_occurred_at, now())::date,
    coalesce(nullif(btrim(p_label), ''), 'حركة بنكية'),
    'manual',
    'EGP',
    p_actor
  )
  returning id into entry_id;

  if p_kind = 'deposit' then
    contra := app.system_account('3000');
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, acct.id, amount, 'إيداع بنكي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, contra, amount, 'إيداع بنكي');
  else
    contra := app.system_account('5400');
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, contra, amount, 'مصروف بنكي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, acct.id, amount, 'مصروف بنكي');
  end if;

  return entry_id;
end;
$$;


--
-- Name: post_fx_transfer(bigint, bigint, text, timestamp with time zone, uuid, text, text, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.post_fx_transfer(p_sar_amount_minor bigint, p_egp_amount_minor bigint, p_label text, p_occurred_at timestamp with time zone, p_actor uuid, p_receipt_no text DEFAULT NULL::text, p_storage_path text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_size_bytes integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  egp_bank      uuid;
  sar_bank      uuid;
  egp_suspense  uuid;
  sar_suspense  uuid;
  entry_id      uuid;
  memo          text := coalesce(nullif(btrim(p_label), ''), 'تحويل عملة');
begin
  if p_sar_amount_minor is null or p_sar_amount_minor <= 0 then
    raise exception 'FX_SAR_AMOUNT_POSITIVE: SAR amount must be greater than zero'
      using errcode = '23514';
  end if;
  if p_egp_amount_minor is null or p_egp_amount_minor <= 0 then
    raise exception 'FX_EGP_AMOUNT_POSITIVE: EGP amount must be greater than zero'
      using errcode = '23514';
  end if;
  if p_receipt_no is not null and btrim(p_receipt_no) <> ''
     and (p_storage_path is null or btrim(p_storage_path) = '') then
    raise exception 'FX_RECEIPT_PATH_REQUIRED: a receipt number needs a stored file'
      using errcode = '23514';
  end if;

  egp_bank     := app.system_account('1000');
  sar_bank     := app.system_account('1000-SAR');
  egp_suspense := app.system_account('2090');
  sar_suspense := app.system_account('1090-SAR');

  if egp_bank is null or sar_bank is null
     or egp_suspense is null or sar_suspense is null then
    raise exception 'FX_ACCOUNT_MISSING: a control account is not provisioned'
      using errcode = '23514';
  end if;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (coalesce(p_occurred_at, now())::date, memo, 'fx_transfer', 'EGP', p_actor)
  returning id into entry_id;

  insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
  values (entry_id, egp_bank, p_egp_amount_minor, 'تحويل وارد من الرياض');

  insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
  values (entry_id, egp_suspense, p_egp_amount_minor, 'وسيط التحويل (جنيه)');

  insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
  values (entry_id, sar_suspense, p_sar_amount_minor, 'وسيط التحويل (ريال)');

  insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
  values (entry_id, sar_bank, p_sar_amount_minor, 'تحويل صادر إلى مصر');

  if p_receipt_no is not null and length(btrim(p_receipt_no)) > 0 then
    insert into app.transaction_receipts (
      entry_id, receipt_no, storage_path, mime_type, size_bytes, uploaded_by
    ) values (
      entry_id, btrim(p_receipt_no), p_storage_path,
      coalesce(p_mime_type, 'application/octet-stream'),
      coalesce(p_size_bytes, 0), p_actor
    );
  end if;

  return entry_id;
end;
$$;


--
-- Name: FUNCTION post_fx_transfer(p_sar_amount_minor bigint, p_egp_amount_minor bigint, p_label text, p_occurred_at timestamp with time zone, p_actor uuid, p_receipt_no text, p_storage_path text, p_mime_type text, p_size_bytes integer); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.post_fx_transfer(p_sar_amount_minor bigint, p_egp_amount_minor bigint, p_label text, p_occurred_at timestamp with time zone, p_actor uuid, p_receipt_no text, p_storage_path text, p_mime_type text, p_size_bytes integer) IS 'Posts a manual SAR→EGP transfer as one balanced entry across both bank ledgers, optionally attaching the transfer receipt.';


--
-- Name: post_partial_settlement(uuid, bigint, uuid, text, text, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.post_partial_settlement(p_account_id uuid, p_amount_minor bigint, p_actor uuid, p_receipt_no text DEFAULT NULL::text, p_storage_path text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_size_bytes integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  acct     app.accounts;
  bal      bigint;
  bank_id  uuid;
  entry_id uuid;
  source   app.journal_source;
  label    text;
begin
  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'SETTLEMENT_ACCOUNT_MISSING: account % does not exist', p_account_id
      using errcode = '23503';
  end if;
  if acct.party_type is null then
    raise exception 'SETTLEMENT_NOT_A_PARTY: account % is a control account', p_account_id
      using errcode = '23514';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'SETTLEMENT_AMOUNT_POSITIVE: amount must be greater than zero'
      using errcode = '23514';
  end if;

  select coalesce(sum(debit_minor), 0) - coalesce(sum(credit_minor), 0)
    into bal
    from app.journal_lines
   where account_id = p_account_id;

  if bal = 0 then
    raise exception 'SETTLEMENT_ZERO_BALANCE: account % has nothing outstanding', p_account_id
      using errcode = '23514';
  end if;

  /* The amount may not exceed the outstanding balance. Compared against the
   * absolute value because the sign tells the direction, not the size. */
  if p_amount_minor > abs(bal) then
    raise exception
      'SETTLEMENT_AMOUNT_EXCEEDS_BALANCE: amount % is greater than the outstanding balance %',
      p_amount_minor, abs(bal)
      using errcode = '23514';
  end if;

  bank_id := app.system_account('1000');
  source  := case acct.party_type
    when 'courier' then 'courier_payout'::app.journal_source
    else 'merchant_settlement'::app.journal_source
  end;
  label := 'تسوية جزئية ' || acct.name;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (current_date, label, source, 'EGP', p_actor)
  returning id into entry_id;

  if bal < 0 then
    /* Credit balance: Kanjo owes the party. Debit the payable, credit bank. */
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, 'سداد جزئي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, bank_id, p_amount_minor, 'سداد جزئي من البنك');
  else
    /* Debit balance: the party owes Kanjo. Debit bank, credit the receivable. */
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, bank_id, p_amount_minor, 'تحصيل جزئي');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, 'تحصيل جزئي من الطرف');
  end if;

  if p_receipt_no is not null and length(btrim(p_receipt_no)) > 0 then
    if p_storage_path is null or length(btrim(p_storage_path)) = 0 then
      raise exception 'SETTLEMENT_RECEIPT_PATH_REQUIRED: storage path is required with a receipt number'
        using errcode = '23514';
    end if;
    insert into app.transaction_receipts (
      entry_id, receipt_no, storage_path, mime_type, size_bytes, uploaded_by
    ) values (
      entry_id, btrim(p_receipt_no), p_storage_path,
      coalesce(p_mime_type, 'application/octet-stream'),
      coalesce(p_size_bytes, 0), p_actor
    );
  end if;

  return entry_id;
end;
$$;


--
-- Name: FUNCTION post_partial_settlement(p_account_id uuid, p_amount_minor bigint, p_actor uuid, p_receipt_no text, p_storage_path text, p_mime_type text, p_size_bytes integer); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.post_partial_settlement(p_account_id uuid, p_amount_minor bigint, p_actor uuid, p_receipt_no text, p_storage_path text, p_mime_type text, p_size_bytes integer) IS 'Settles part of a party ledger account, bounded by its outstanding balance, optionally attaching a receipt.';


--
-- Name: post_settlement(uuid, uuid, text, text, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.post_settlement(p_account_id uuid, p_actor uuid, p_receipt_no text DEFAULT NULL::text, p_storage_path text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_size_bytes integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  acct     app.accounts;
  bal      bigint;
  bank_id  uuid;
  entry_id uuid;
  source   app.journal_source;
  label    text;
begin
  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'SETTLEMENT_ACCOUNT_MISSING: account % does not exist', p_account_id
      using errcode = '23503';
  end if;
  if acct.party_type is null then
    raise exception 'SETTLEMENT_NOT_A_PARTY: account % is a control account', p_account_id
      using errcode = '23514';
  end if;
  if acct.currency <> 'EGP' then
    raise exception
      'SETTLEMENT_EGP_ONLY: operational settlements post to the Egyptian bank; party % is %',
      p_account_id, acct.currency
      using errcode = '23514';
  end if;

  select coalesce(sum(debit_minor), 0) - coalesce(sum(credit_minor), 0)
    into bal
    from app.journal_lines
   where account_id = p_account_id;

  if bal = 0 then
    raise exception 'SETTLEMENT_ZERO_BALANCE: account % has nothing outstanding', p_account_id
      using errcode = '23514';
  end if;

  /* Daily operations always settle against the Egyptian bank. The SAR account
   * is holding/funding only and is never an operational counterparty. */
  bank_id := app.system_account('1000');
  source  := case acct.party_type
    when 'courier' then 'courier_payout'::app.journal_source
    else 'merchant_settlement'::app.journal_source
  end;
  label := 'تسوية ' || acct.name;

  insert into app.journal_entries (entry_date, memo, source_type, currency, created_by)
  values (current_date, label, source, 'EGP', p_actor)
  returning id into entry_id;

  if bal < 0 then
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, -bal, 'سداد مستحق');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, bank_id, -bal, 'سداد من البنك');
  else
    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, bank_id, bal, 'تحصيل مستحق');
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, p_account_id, bal, 'تحصيل من الطرف');
  end if;

  if p_receipt_no is not null and length(btrim(p_receipt_no)) > 0 then
    if p_storage_path is null or length(btrim(p_storage_path)) = 0 then
      raise exception 'SETTLEMENT_RECEIPT_PATH_REQUIRED: storage path is required with a receipt number'
        using errcode = '23514';
    end if;
    insert into app.transaction_receipts (
      entry_id, receipt_no, storage_path, mime_type, size_bytes, uploaded_by
    ) values (
      entry_id, btrim(p_receipt_no), p_storage_path,
      coalesce(p_mime_type, 'application/octet-stream'),
      coalesce(p_size_bytes, 0), p_actor
    );
  end if;

  return entry_id;
end;
$$;


--
-- Name: FUNCTION post_settlement(p_account_id uuid, p_actor uuid, p_receipt_no text, p_storage_path text, p_mime_type text, p_size_bytes integer); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.post_settlement(p_account_id uuid, p_actor uuid, p_receipt_no text, p_storage_path text, p_mime_type text, p_size_bytes integer) IS 'Settles an EGP party account by posting a balanced journal entry against the EGP bank (1000), optionally attaching a receipt.';


--
-- Name: rbac_revision(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.rbac_revision() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select greatest(
    coalesce(
      (select max(floor(extract(epoch from u.updated_at)))::bigint
         from app.users u),
      0
    ),
    coalesce(
      (select max(floor(extract(epoch from g.granted_at)))::bigint
         from app.user_permissions g),
      0
    ),
    coalesce(
      (select max(floor(extract(epoch from s.granted_at)))::bigint
         from app.user_city_scope s),
      0
    )
  );
$$;


--
-- Name: FUNCTION rbac_revision(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.rbac_revision() IS 'Newest authorization mutation (unix seconds) across profiles, grants and city scope. A session whose rev is lower is stale.';


--
-- Name: rbac_session(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.rbac_session(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'name', u.full_name,
      'email', u.email,
      'title', u.title,
      'team', u.team,
      'teamId', u.team_id,
      'teamName', (
        select t.name
          from app.field_teams t
         where t.id = u.team_id
      ),
      'clearanceLevel', u.clearance_level,
      'globalScope', u.global_scope,
      'active', u.active,
      'updatedAt', u.updated_at
    ),
    'permissions', coalesce(
      (
        select jsonb_agg(g.permission_key order by g.permission_key)
          from app.user_permissions g
         where g.user_id = u.id
      ),
      '[]'::jsonb
    ),
    'cities', coalesce(
      (
        select jsonb_agg(s.city_id order by s.city_id)
          from app.user_city_scope s
         where s.user_id = u.id
      ),
      '[]'::jsonb
    ),
    'revision', app.rbac_revision()
  )
  from app.users u
  where u.id = p_user_id;
$$;


--
-- Name: FUNCTION rbac_session(p_user_id uuid); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.rbac_session(p_user_id uuid) IS 'Profile, capability keys, city scope and the global revision for one operator in a single read. Service role only: the payload is another operator''s authorization data when called with their id.';


--
-- Name: rbac_user_directory(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.rbac_user_directory() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(jsonb_agg(directory.document order by directory.sort_name), '[]'::jsonb)
  from (
    select
      u.full_name as sort_name,
      jsonb_build_object(
        'user', jsonb_build_object(
          'id', u.id,
          'name', u.full_name,
          'email', u.email,
          'title', u.title,
          'team', u.team,
          'teamId', u.team_id,
          'teamName', (
            select t.name
              from app.field_teams t
             where t.id = u.team_id
          ),
          'clearanceLevel', u.clearance_level,
          'globalScope', u.global_scope,
          'active', u.active,
          'updatedAt', u.updated_at
        ),
        'permissions', coalesce(
          (
            select jsonb_agg(g.permission_key order by g.permission_key)
              from app.user_permissions g
             where g.user_id = u.id
          ),
          '[]'::jsonb
        ),
        'cities', coalesce(
          (
            select jsonb_agg(s.city_id order by s.city_id)
              from app.user_city_scope s
             where s.user_id = u.id
          ),
          '[]'::jsonb
        )
      ) as document
      from app.users u
  ) directory;
$$;


--
-- Name: FUNCTION rbac_user_directory(); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.rbac_user_directory() IS 'Every operator profile with their capability keys and city scope, aggregated into one jsonb array. Service role only: the payload is the whole roster''s authorization data.';


--
-- Name: sync_bank_info_status(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.sync_bank_info_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  update app.users
     set bank_info_status = new.status
   where id = new.user_id;
  return null;
end;
$$;


--
-- Name: system_account(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.system_account(p_code text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select id from app.accounts
   where code = p_code and party_type is null
   limit 1;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: upsert_coupons(jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.upsert_coupons(p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  affected integer;
begin
  insert into app.coupons (
    code, coupon_type, active, discount_funded_by, vendor_funding_percent,
    stackable, stack_priority, uses_count, discount_amount_minor,
    shipping_discount_minor, cashback_amount_minor, total_impact_minor,
    vendor_funded_minor, platform_funded_minor, budget_applied_minor,
    budget_cap_minor, budget_used_minor, max_discount_minor, last_used_at,
    source_created_at
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
    r.max_discount_minor,
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
    max_discount_minor       bigint,
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
    max_discount_minor     = excluded.max_discount_minor,
    last_used_at           = excluded.last_used_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;


--
-- Name: FUNCTION upsert_coupons(p_rows jsonb); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.upsert_coupons(p_rows jsonb) IS 'Upserts a jsonb rowset of coupons, conflicting on the case-insensitive code index.';


--
-- Name: user_permissions_governor_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.user_permissions_governor_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  affected uuid;
begin
  if tg_op = 'INSERT' then
    return null; -- granting can never remove a governor
  end if;

  if old.permission_key = 'manage_system_users' then
    affected := old.user_id;
  end if;

  if affected is not null then
    perform app.assert_governor_remaining(affected);
  end if;

  return null;
end;
$$;


--
-- Name: users_governor_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.users_governor_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  was_governor boolean;
begin
  was_governor := old.active and exists (
    select 1 from app.user_permissions p
    where p.user_id = old.id
      and p.permission_key = 'manage_system_users'
  );

  if not was_governor then
    return null;
  end if;

  if tg_op = 'UPDATE' and new.active then
    return null; -- still active, governorship unchanged
  end if;

  perform app.assert_governor_remaining(old.id);
  return null;
end;
$$;


--
-- Name: visit_report_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.visit_report_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'VISIT_REPORT_IMMUTABLE: لا يمكن تعديل أو حذف تقرير زيارة مسجّل.'
    using errcode = 'P0001';
end;
$$;


--
-- Name: account_balances; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.account_balances AS
SELECT
    NULL::uuid AS id,
    NULL::text AS bank_name,
    NULL::text AS account_name,
    NULL::text AS account_number,
    NULL::text AS iban,
    NULL::character(2) AS country_code,
    NULL::character(3) AS currency,
    NULL::text AS city_id,
    NULL::boolean AS active,
    NULL::bigint AS deposits_minor,
    NULL::bigint AS expenses_minor,
    NULL::bigint AS balance_minor;


--
-- Name: VIEW account_balances; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.account_balances IS 'Balance = deposits − expenses, computed from the ledger. Never a stored column.';


--
-- Name: accounts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type app.account_type NOT NULL,
    normal_balance app.normal_balance NOT NULL,
    currency character(3) DEFAULT 'EGP'::bpchar NOT NULL,
    party_type app.party_type,
    party_id text,
    is_system boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT accounts_party_pair CHECK (((party_type IS NULL) = (party_id IS NULL))),
    CONSTRAINT accounts_system_has_no_party CHECK (((NOT is_system) OR (party_type IS NULL)))
);

ALTER TABLE ONLY app.accounts FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE accounts; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.accounts IS 'Chart of accounts. Party sub-accounts hang under a system control account by parent_id.';


--
-- Name: COLUMN accounts.normal_balance; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.accounts.normal_balance IS 'The side that increases the account. Used to report natural balances.';


--
-- Name: catalog_products; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.catalog_products (
    id text NOT NULL,
    merchant_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    sku text,
    barcode text,
    image_data_url text,
    price_minor bigint DEFAULT 0 NOT NULL,
    state text DEFAULT 'pending_review'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_type_id integer,
    category_key text,
    product_type text DEFAULT 'simple'::text NOT NULL,
    attributes jsonb DEFAULT '[]'::jsonb NOT NULL,
    review_note text DEFAULT ''::text NOT NULL,
    entered_by_name text,
    client_product_id text,
    normalized_name text DEFAULT ''::text NOT NULL,
    qa_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    taxonomy_category_id uuid,
    ai_categorized_at timestamp with time zone,
    ai_confidence_score numeric,
    needs_human_review boolean DEFAULT false NOT NULL,
    CONSTRAINT catalog_products_price_minor_check CHECK ((price_minor >= 0)),
    CONSTRAINT catalog_products_product_type_check CHECK ((product_type = ANY (ARRAY['simple'::text, 'variable'::text]))),
    CONSTRAINT catalog_products_state_check CHECK ((state = ANY (ARRAY['pending_review'::text, 'completed'::text, 'published'::text])))
);

ALTER TABLE ONLY app.catalog_products FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE catalog_products; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.catalog_products IS 'SQL mirror of the catalog product record, with per-product authorship.';


--
-- Name: COLUMN catalog_products.price_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.catalog_products.price_minor IS 'Price in minor units, never a float.';


--
-- Name: COLUMN catalog_products.created_by; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.catalog_products.created_by IS 'Operator who created the product. Makes photo/entry credit per-rep, not per-team.';


--
-- Name: COLUMN catalog_products.category_key; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.catalog_products.category_key IS 'Taxonomy category key. Mandatory in the domain; nullable here for legacy rows.';


--
-- Name: COLUMN catalog_products.attributes; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.catalog_products.attributes IS 'JSON array of {variantId, optionIds} selections. Kept with the product, not normalised.';


--
-- Name: COLUMN catalog_products.client_product_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.catalog_products.client_product_id IS 'Offline draft id. Unique when present so a replay cannot create a duplicate row.';


--
-- Name: COLUMN catalog_products.qa_metadata; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.catalog_products.qa_metadata IS 'V1 image provenance: image_locked_by/_at, image_uploaded_by/_at, edit_type, edited_by/_at, upload history and delete-request state. Preserved verbatim; the review_note column stays the human-facing note.';


--
-- Name: merchants; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.merchants (
    id text NOT NULL,
    name text NOT NULL,
    normalized_name text DEFAULT ''::text NOT NULL,
    vendor_type_id integer,
    vendor_type text DEFAULT ''::text NOT NULL,
    team text,
    city_id text NOT NULL,
    target_commission numeric(6,2) DEFAULT 0 NOT NULL,
    monthly_value_minor bigint DEFAULT 0 NOT NULL,
    strategic_notes text DEFAULT ''::text NOT NULL,
    contract_state text DEFAULT 'no_agreement'::text NOT NULL,
    agreed_commission numeric(6,2),
    edit_unlocked boolean DEFAULT false NOT NULL,
    last_visit_at timestamp with time zone,
    first_entry_by uuid,
    first_entry_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_margin numeric(6,2),
    agreed_margin numeric(6,2),
    contracted_by_team_id uuid,
    commission_amount numeric(14,2) DEFAULT 0 NOT NULL,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    contact jsonb,
    opinions jsonb DEFAULT '[]'::jsonb NOT NULL,
    contact_updated_at timestamp with time zone,
    logo_url text,
    cover_url text,
    phone text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    CONSTRAINT merchants_agreed_commission_check CHECK (((agreed_commission IS NULL) OR ((agreed_commission >= (0)::numeric) AND (agreed_commission <= (100)::numeric)))),
    CONSTRAINT merchants_agreed_margin_range CHECK (((agreed_margin IS NULL) OR ((agreed_margin >= (0)::numeric) AND (agreed_margin <= (100)::numeric)))),
    CONSTRAINT merchants_city_present CHECK ((length(btrim(city_id)) > 0)),
    CONSTRAINT merchants_commission_amount_non_negative CHECK ((commission_amount >= (0)::numeric)),
    CONSTRAINT merchants_contract_state_check CHECK ((contract_state = ANY (ARRAY['no_agreement'::text, 'provisional'::text, 'final_contract'::text, 'signed_contract'::text]))),
    CONSTRAINT merchants_first_entry_paired CHECK (((first_entry_by IS NULL) = (first_entry_at IS NULL))),
    CONSTRAINT merchants_monthly_value_minor_check CHECK ((monthly_value_minor >= 0)),
    CONSTRAINT merchants_target_commission_check CHECK (((target_commission >= (0)::numeric) AND (target_commission <= (100)::numeric))),
    CONSTRAINT merchants_target_margin_range CHECK (((target_margin IS NULL) OR ((target_margin >= (0)::numeric) AND (target_margin <= (100)::numeric))))
);

ALTER TABLE ONLY app.merchants FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE merchants; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.merchants IS 'SQL mirror of the field-ops merchant record, plus first-touch attribution.';


--
-- Name: COLUMN merchants.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.city_id IS 'Firestore city document id. No FK by design: cross-database reference.';


--
-- Name: COLUMN merchants.monthly_value_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.monthly_value_minor IS 'Monthly value in minor units, never a float.';


--
-- Name: COLUMN merchants.first_entry_by; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.first_entry_by IS 'Operator who first registered the merchant. Replaces the team-level KPI proxy.';


--
-- Name: COLUMN merchants.target_margin; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.target_margin IS 'Negotiation margin the team is aiming for, in percent.';


--
-- Name: COLUMN merchants.agreed_margin; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.agreed_margin IS 'Margin actually agreed with the merchant, in percent.';


--
-- Name: COLUMN merchants.contracted_by_team_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.contracted_by_team_id IS 'Team that closed the contract. Both reps on the team share the commission; the split is a payout concern, not a schema one. RESTRICT on delete: attribution is history.';


--
-- Name: COLUMN merchants.commission_amount; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.commission_amount IS 'Commission earned at signature, in currency units. Frozen until the contract changes.';


--
-- Name: COLUMN merchants.documents; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.documents IS 'Ordered JSON array of MerchantDocument. Replaced wholesale; never queried per element.';


--
-- Name: COLUMN merchants.contact; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.contact IS 'Latest CRM contact block (name, role, mobile) or null when no visit captured one.';


--
-- Name: COLUMN merchants.opinions; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.opinions IS 'Weighted rep opinions merged across visits. Kept on the row so the card needs one read.';


--
-- Name: COLUMN merchants.logo_url; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.logo_url IS 'Merchant logo image URL (V1 Firebase Storage object or Drive link). Null means the merchant has no logo; the UI falls back to a brand monogram.';


--
-- Name: COLUMN merchants.cover_url; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.cover_url IS 'Merchant cover/banner image URL. Null means no cover uploaded; the catalog tile renders a brand gradient.';


--
-- Name: COLUMN merchants.phone; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.phone IS 'Contact phone captured from the merchant import or profile.';


--
-- Name: COLUMN merchants.address; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchants.address IS 'Street address captured from the merchant import or profile.';


--
-- Name: user_city_scope; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_city_scope (
    user_id uuid NOT NULL,
    city_id text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_city_scope_city_present CHECK ((length(btrim(city_id)) > 0))
);

ALTER TABLE ONLY app.user_city_scope FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN user_city_scope.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.user_city_scope.city_id IS 'Firestore city document id. No FK by design: cross-database reference.';


--
-- Name: user_permissions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_permissions (
    user_id uuid NOT NULL,
    permission_key text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.user_permissions FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.users (
    id uuid NOT NULL,
    phone text NOT NULL,
    email text,
    full_name text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    team text DEFAULT ''::text NOT NULL,
    clearance_level smallint DEFAULT 1 NOT NULL,
    global_scope boolean GENERATED ALWAYS AS ((clearance_level >= 3)) STORED,
    active boolean DEFAULT true NOT NULL,
    auth_revision integer DEFAULT 1 NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    team_id uuid,
    avatar_url text,
    bank_info_status app.bank_info_status DEFAULT 'pending'::app.bank_info_status NOT NULL,
    CONSTRAINT users_avatar_url_shape CHECK (((avatar_url IS NULL) OR ((avatar_url ~ '^https://'::text) AND (length(avatar_url) <= 2048)))),
    CONSTRAINT users_clearance_range CHECK (((clearance_level >= 1) AND (clearance_level <= 4))),
    CONSTRAINT users_email_shape CHECK (((email IS NULL) OR (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))),
    CONSTRAINT users_phone_e164 CHECK ((phone ~ '^\+[1-9][0-9]{7,14}$'::text))
);

ALTER TABLE ONLY app.users FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN users.phone; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.phone IS 'E.164 login identity. Unique. Mirrors auth.users.phone.';


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.email IS 'Optional profile data. Never used for authentication, therefore not unique.';


--
-- Name: COLUMN users.full_name; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.full_name IS 'Defaults to empty on auth signup; the onboarding flow must set it. A profile is usable for authorization without a name, because name is presentation-only.';


--
-- Name: COLUMN users.team; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.team IS 'DEPRECATED: legacy free-text label. Superseded by team_id; kept only until existing rows are migrated.';


--
-- Name: COLUMN users.global_scope; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.global_scope IS 'Derived from clearance_level >= 3; cannot drift from the clearance level.';


--
-- Name: COLUMN users.auth_revision; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.auth_revision IS 'Incremented on any authorization change. Sessions with a lower revision are stale.';


--
-- Name: COLUMN users.team_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.team_id IS 'City-bound team the operator belongs to. Replaces the free-text `team` label.';


--
-- Name: COLUMN users.avatar_url; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.avatar_url IS 'Public URL of the operator avatar in the avatars bucket. Null renders initials.';


--
-- Name: COLUMN users.bank_info_status; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.users.bank_info_status IS 'Derived from the operator payout method decision. Never set by the operator themselves.';


--
-- Name: agent_kpi_rank_rollup; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.agent_kpi_rank_rollup WITH (security_invoker='true') AS
 WITH bounds AS (
         SELECT date_trunc('month'::text, now()) AS start_at
        ), activations AS (
         SELECT m.first_entry_by AS rep_id,
            (count(*))::integer AS activations
           FROM app.merchants m,
            bounds b
          WHERE ((m.first_entry_by IS NOT NULL) AND (m.first_entry_at >= b.start_at) AND (m.first_entry_at < (b.start_at + '1 mon'::interval)))
          GROUP BY m.first_entry_by
        ), items AS (
         SELECT p.created_by AS rep_id,
            (count(*))::integer AS items_added
           FROM app.catalog_products p,
            bounds b
          WHERE ((p.created_by IS NOT NULL) AND (p.created_at >= b.start_at) AND (p.created_at < (b.start_at + '1 mon'::interval)))
          GROUP BY p.created_by
        ), contracts AS (
         SELECT m.contracted_by_team_id AS team_id,
            (count(*))::integer AS contracts_closed,
            COALESCE(avg(
                CASE
                    WHEN ((m.target_margin IS NOT NULL) AND (m.target_margin > (0)::numeric)) THEN ((m.agreed_margin / m.target_margin) * (100)::numeric)
                    ELSE NULL::numeric
                END), (0)::numeric) AS margin_ratio
           FROM app.merchants m,
            bounds b
          WHERE ((m.contracted_by_team_id IS NOT NULL) AND (m.contract_state = ANY (ARRAY['final_contract'::text, 'signed_contract'::text])) AND (m.updated_at >= b.start_at) AND (m.updated_at < (b.start_at + '1 mon'::interval)))
          GROUP BY m.contracted_by_team_id
        ), rep_scores AS (
         SELECT u.id AS rep_id,
            u.full_name AS rep_name,
            u.team_id,
            COALESCE(a.activations, 0) AS activations,
            COALESCE(i.items_added, 0) AS items_added,
            COALESCE(c.contracts_closed, 0) AS contracts_closed,
            COALESCE(c.margin_ratio, (0)::numeric) AS margin_ratio,
            LEAST((100)::numeric, GREATEST((0)::numeric, ((((LEAST(35, GREATEST(0, (COALESCE(a.activations, 0) * 12))) + LEAST(20, GREATEST(0, COALESCE(i.items_added, 0)))) + LEAST(35, GREATEST(0, (COALESCE(c.contracts_closed, 0) * 12)))))::numeric + LEAST((10)::numeric, GREATEST((0)::numeric, COALESCE(c.margin_ratio, (0)::numeric)))))) AS score
           FROM (((app.users u
             LEFT JOIN activations a ON ((a.rep_id = u.id)))
             LEFT JOIN items i ON ((i.rep_id = u.id)))
             LEFT JOIN contracts c ON ((c.team_id = u.team_id)))
          WHERE (u.active AND (u.title = 'مندوب ميداني'::text) AND (u.clearance_level <= 2) AND (EXISTS ( SELECT 1
                   FROM app.user_permissions up
                  WHERE ((up.user_id = u.id) AND (up.permission_key = 'start_end_visit'::text)))))
        ), primary_scope AS (
         SELECT DISTINCT ON (s.user_id) s.user_id,
            s.city_id
           FROM app.user_city_scope s
          ORDER BY s.user_id, s.granted_at, s.city_id
        ), ranked AS (
         SELECT r.rep_id,
            r.rep_name,
            ps.city_id,
            r.score,
            rank() OVER (PARTITION BY ps.city_id ORDER BY r.score DESC, r.rep_name) AS "position",
            count(*) OVER (PARTITION BY ps.city_id) AS total
           FROM (rep_scores r
             JOIN primary_scope ps ON ((ps.user_id = r.rep_id)))
        )
 SELECT ranked.rep_id,
    ranked.rep_name,
    ranked.city_id,
    ranked.score,
    ranked."position",
    ranked.total
   FROM ranked;


--
-- Name: VIEW agent_kpi_rank_rollup; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.agent_kpi_rank_rollup IS 'Live-month KPI score and city rank per rep. Replaces the O(agents²) peer scoring loop.';


--
-- Name: archived_reports; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.archived_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    task_id text,
    merchant_id text DEFAULT ''::text NOT NULL,
    task_name text DEFAULT ''::text NOT NULL,
    report jsonb DEFAULT '{}'::jsonb NOT NULL,
    archived_by uuid,
    archived_by_name text DEFAULT ''::text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.archived_reports FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE archived_reports; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.archived_reports IS 'Visit reports pulled out of the live task timeline, with the reason and author preserved. Restoring deletes the archive row only; the canonical visit_reports history is untouched.';


--
-- Name: audit_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_name text DEFAULT ''::text NOT NULL,
    actor_role text DEFAULT ''::text NOT NULL,
    action_type text DEFAULT ''::text NOT NULL,
    target_entity text DEFAULT ''::text NOT NULL,
    target_id text DEFAULT ''::text NOT NULL,
    target_name text DEFAULT ''::text NOT NULL,
    entity_kind text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    collection text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'migration'::text NOT NULL,
    previous_data jsonb,
    new_data jsonb,
    changes jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.audit_logs IS 'Append-only Black Box: who changed what, before and after. Distinct from app.operation_logs, which records courier orders.';


--
-- Name: COLUMN audit_logs.legacy_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.audit_logs.legacy_id IS 'Firestore document id, so the V1 history import is idempotent.';


--
-- Name: bank_accounts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_name text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    iban text NOT NULL,
    country_code character(2) NOT NULL,
    currency character(3) NOT NULL,
    city_id text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bank_accounts_account_number_present CHECK ((length(btrim(account_number)) > 0)),
    CONSTRAINT bank_accounts_bank_present CHECK ((length(btrim(bank_name)) > 0)),
    CONSTRAINT bank_accounts_country_allowed CHECK ((country_code = ANY (ARRAY['EG'::bpchar, 'SA'::bpchar]))),
    CONSTRAINT bank_accounts_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT bank_accounts_currency_matches_country CHECK ((((country_code = 'EG'::bpchar) AND (currency = 'EGP'::bpchar)) OR ((country_code = 'SA'::bpchar) AND (currency = 'SAR'::bpchar)))),
    CONSTRAINT bank_accounts_iban_shape CHECK ((iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'::text))
);

ALTER TABLE ONLY app.bank_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bank_accounts; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.bank_accounts IS 'Company bank accounts. Currency is derived from the country and enforced by a check.';


--
-- Name: COLUMN bank_accounts.iban; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.bank_accounts.iban IS 'Normalized, unspaced, uppercase IBAN. Unique per currency.';


--
-- Name: COLUMN bank_accounts.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.bank_accounts.city_id IS 'Firestore city document id. No FK by design: cross-database reference.';


--
-- Name: visit_reports; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.visit_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    task_id text,
    rep_id text NOT NULL,
    rep_name text DEFAULT ''::text NOT NULL,
    team text DEFAULT ''::text NOT NULL,
    outcome text NOT NULL,
    previous_state text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    commission_amount numeric(14,2) DEFAULT 0 NOT NULL,
    agreed_commission numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    start_location jsonb,
    end_location jsonb,
    contact jsonb,
    opinions jsonb DEFAULT '[]'::jsonb NOT NULL,
    follow_up_at timestamp with time zone,
    follow_up_task_id text,
    follow_up_contact_number text,
    source text DEFAULT 'task'::text NOT NULL,
    client_visit_id text,
    logged_by uuid,
    CONSTRAINT visit_reports_agreed_commission_range CHECK (((agreed_commission IS NULL) OR ((agreed_commission >= (0)::numeric) AND (agreed_commission <= (100)::numeric)))),
    CONSTRAINT visit_reports_commission_non_negative CHECK ((commission_amount >= (0)::numeric)),
    CONSTRAINT visit_reports_duration_non_negative CHECK (((duration_seconds IS NULL) OR (duration_seconds >= 0))),
    CONSTRAINT visit_reports_merchant_present CHECK ((length(btrim(merchant_id)) > 0)),
    CONSTRAINT visit_reports_outcome_allowed CHECK ((outcome = ANY (ARRAY['no_agreement'::text, 'provisional'::text, 'final_contract'::text, 'signed_contract'::text]))),
    CONSTRAINT visit_reports_previous_state_allowed CHECK ((previous_state = ANY (ARRAY['no_agreement'::text, 'provisional'::text, 'final_contract'::text, 'signed_contract'::text]))),
    CONSTRAINT visit_reports_rep_present CHECK ((length(btrim(rep_id)) > 0)),
    CONSTRAINT visit_reports_source_allowed CHECK ((source = ANY (ARRAY['task'::text, 'unplanned'::text, 'offline'::text, 'override'::text])))
);

ALTER TABLE ONLY app.visit_reports FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE visit_reports; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.visit_reports IS 'Append-only record of a completed field visit. Replaces the process-local field-ops store as the durable write target.';


--
-- Name: COLUMN visit_reports.merchant_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.visit_reports.merchant_id IS 'Field-ops merchant id (text, cross-database reference). No FK: field-ops merchants are not all rows of app.merchants yet.';


--
-- Name: COLUMN visit_reports.opinions; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.visit_reports.opinions IS 'Weighted rep opinions captured with the visit, as JSON.';


--
-- Name: COLUMN visit_reports.client_visit_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.visit_reports.client_visit_id IS 'Offline queue id. Unique per merchant so a replayed batch cannot duplicate a visit.';


--
-- Name: bi_merchant_rollup; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.bi_merchant_rollup WITH (security_invoker='true') AS
 WITH visit_agg AS (
         SELECT visit_reports.merchant_id,
            max(visit_reports.created_at) AS visited_at
           FROM app.visit_reports
          GROUP BY visit_reports.merchant_id
        ), latest_visit AS (
         SELECT DISTINCT ON (r.merchant_id) r.merchant_id,
            r.rep_id,
            r.rep_name
           FROM app.visit_reports r
          ORDER BY r.merchant_id, r.created_at DESC
        ), latest_negotiation AS (
         SELECT DISTINCT ON (r.merchant_id) r.merchant_id,
            r.agreed_commission
           FROM app.visit_reports r
          WHERE (r.agreed_commission IS NOT NULL)
          ORDER BY r.merchant_id, r.created_at DESC
        )
 SELECT v.merchant_id AS id,
    v.visited_at,
    lv.rep_id,
    lv.rep_name,
    n.agreed_commission AS negotiated_commission
   FROM ((visit_agg v
     LEFT JOIN latest_visit lv ON ((lv.merchant_id = v.merchant_id)))
     LEFT JOIN latest_negotiation n ON ((n.merchant_id = v.merchant_id)));


--
-- Name: VIEW bi_merchant_rollup; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.bi_merchant_rollup IS 'Per-merchant BI facts (newest visit, negotiated commission). Replaces the in-memory report reduction on the overview.';


--
-- Name: capital_deposits; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.capital_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    founder_id uuid NOT NULL,
    account_id uuid,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    receipt_path text,
    note text DEFAULT ''::text NOT NULL,
    status app.capital_deposit_status DEFAULT 'pending'::app.capital_deposit_status NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    ledger_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capital_deposits_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT capital_deposits_approved_shape CHECK (((status <> 'approved'::app.capital_deposit_status) OR ((account_id IS NOT NULL) AND (ledger_entry_id IS NOT NULL) AND (decided_by IS NOT NULL)))),
    CONSTRAINT capital_deposits_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT capital_deposits_decision_shape CHECK (((status = 'pending'::app.capital_deposit_status) = (decided_at IS NULL)))
);

ALTER TABLE ONLY app.capital_deposits FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE capital_deposits; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.capital_deposits IS 'Founder capital entering the company. Approval appends one immutable ledger entry; the deposit row never stores a balance.';


--
-- Name: COLUMN capital_deposits.amount_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.capital_deposits.amount_minor IS 'Positive minor units (piastres/halalas), the same unit the ledger uses.';


--
-- Name: COLUMN capital_deposits.receipt_path; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.capital_deposits.receipt_path IS 'Object path in the private capital-receipts bucket. Reads go through a signed URL.';


--
-- Name: cities; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.cities (
    id text NOT NULL,
    name text NOT NULL,
    country text DEFAULT ''::text NOT NULL,
    governorate text DEFAULT ''::text NOT NULL,
    population integer DEFAULT 0 NOT NULL,
    stage text DEFAULT 'preparation'::text NOT NULL,
    competitors jsonb DEFAULT '[]'::jsonb NOT NULL,
    strategic_notes text DEFAULT ''::text NOT NULL,
    zone jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by text DEFAULT ''::text NOT NULL,
    created_by_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cities_name_present CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT cities_population_non_negative CHECK ((population >= 0)),
    CONSTRAINT cities_stage_allowed CHECK ((stage = ANY (ARRAY['preparation'::text, 'contracting'::text, 'data_entry'::text, 'live_operations'::text])))
);


--
-- Name: TABLE cities; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.cities IS 'City catalogue. `zone` is the editable vertex list; the GeoJSON boundary is derived in TypeScript from it.';


--
-- Name: COLUMN cities.id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.cities.id IS 'Firestore-era city id (`city-cairo`). Kept text so app.user_city_scope rows stay valid without a rewrite.';


--
-- Name: contract_clauses; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.contract_clauses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid,
    scope text DEFAULT 'contract'::text NOT NULL,
    vendor_type_id text,
    merchant_id text,
    ordinal integer DEFAULT 0 NOT NULL,
    title_ar text DEFAULT ''::text NOT NULL,
    body_ar text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_clauses_ordinal_non_negative CHECK ((ordinal >= 0)),
    CONSTRAINT contract_clauses_scope_allowed CHECK ((scope = ANY (ARRAY['contract'::text, 'vendor_type'::text, 'merchant'::text])))
);

ALTER TABLE ONLY app.contract_clauses FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE contract_clauses; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.contract_clauses IS 'Ordered contract clauses: library templates (scope vendor_type/merchant) and per-contract snapshots.';


--
-- Name: COLUMN contract_clauses.scope; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contract_clauses.scope IS 'contract = belongs to one contract; vendor_type/merchant = reusable template.';


--
-- Name: contract_commission_lines; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.contract_commission_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    category_name text NOT NULL,
    commission_rate numeric(6,3) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_commission_rate_non_negative CHECK ((commission_rate >= (0)::numeric)),
    CONSTRAINT contract_commission_rate_reasonable CHECK ((commission_rate <= (100)::numeric))
);

ALTER TABLE ONLY app.contract_commission_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE contract_commission_lines; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.contract_commission_lines IS 'Per-category commission rate lines rendered into the contract document.';


--
-- Name: contract_section_overrides; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.contract_section_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    section_key text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_section_overrides_key_allowed CHECK ((section_key = ANY (ARRAY['preamble'::text, 'copies_note'::text, 'first_party'::text, 'second_party'::text, 'summary'::text, 'commission_base'::text])))
);

ALTER TABLE ONLY app.contract_section_overrides FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE contract_section_overrides; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.contract_section_overrides IS 'Per-contract overrides for narrative sections (preamble, notes, party panels, summary).';


--
-- Name: COLUMN contract_section_overrides.content; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contract_section_overrides.content IS 'Section payload: { text } for prose, { rows: [{label,value}] } for party panels.';


--
-- Name: contract_serial_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.contract_serial_seq
    START WITH 1094
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contracts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference text NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    city_id text,
    value_minor bigint DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'EGP'::bpchar NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    signatory text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    drafted_by uuid,
    edited_by uuid,
    signed_by uuid,
    cancelled_by uuid,
    signed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    serial_number bigint DEFAULT nextval('app.contract_serial_seq'::regclass),
    storage_path text,
    sha256 text,
    CONSTRAINT contracts_cancelled_shape CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL))),
    CONSTRAINT contracts_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT contracts_merchant_present CHECK ((length(btrim(merchant_id)) > 0)),
    CONSTRAINT contracts_reference_present CHECK ((length(btrim(reference)) > 0)),
    CONSTRAINT contracts_signed_shape CHECK (((status = 'signed'::text) = (signed_at IS NOT NULL))),
    CONSTRAINT contracts_status_allowed CHECK ((status = ANY (ARRAY['draft'::text, 'pending_signature'::text, 'signed'::text, 'cancelled'::text]))),
    CONSTRAINT contracts_value_non_negative CHECK ((value_minor >= 0))
);

ALTER TABLE ONLY app.contracts FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE contracts; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.contracts IS 'Commercial contract register. Signed and cancelled contracts are terminal.';


--
-- Name: COLUMN contracts.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contracts.city_id IS 'Firestore city document id. No FK by design: cross-database reference.';


--
-- Name: COLUMN contracts.value_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contracts.value_minor IS 'Contract value in minor units (piastres/halalas) of the contract currency.';


--
-- Name: COLUMN contracts.serial_number; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contracts.serial_number IS 'Printed contract serial. Continues the frozen V1 baseline (#1001-#1093); new rows start at #1094.';


--
-- Name: COLUMN contracts.storage_path; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contracts.storage_path IS 'Storage object path of the rendered PDF, e.g. contracts/<id>.pdf.';


--
-- Name: COLUMN contracts.sha256; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.contracts.sha256 IS 'SHA-256 of the rendered PDF bytes, for integrity checks and cache keys.';


--
-- Name: coupons; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    coupon_type app.coupon_type DEFAULT 'fixed_amount'::app.coupon_type NOT NULL,
    active boolean DEFAULT true NOT NULL,
    discount_funded_by app.coupon_funding DEFAULT 'platform'::app.coupon_funding NOT NULL,
    vendor_funding_percent numeric(5,2) DEFAULT 0 NOT NULL,
    stackable boolean DEFAULT false NOT NULL,
    stack_priority integer DEFAULT 0 NOT NULL,
    discount_amount_minor bigint DEFAULT 0 NOT NULL,
    shipping_discount_minor bigint DEFAULT 0 NOT NULL,
    cashback_amount_minor bigint DEFAULT 0 NOT NULL,
    total_impact_minor bigint DEFAULT 0 NOT NULL,
    vendor_funded_minor bigint DEFAULT 0 NOT NULL,
    platform_funded_minor bigint DEFAULT 0 NOT NULL,
    budget_applied_minor bigint DEFAULT 0 NOT NULL,
    budget_cap_minor bigint,
    budget_used_minor bigint DEFAULT 0 NOT NULL,
    budget_remaining_minor bigint GENERATED ALWAYS AS (
CASE
    WHEN (budget_cap_minor IS NULL) THEN NULL::bigint
    ELSE (budget_cap_minor - budget_used_minor)
END) STORED,
    uses_count integer DEFAULT 0 NOT NULL,
    last_used_at timestamp with time zone,
    source_created_at timestamp with time zone DEFAULT now() NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_discount_minor bigint,
    CONSTRAINT coupons_amounts_non_negative CHECK (((discount_amount_minor >= 0) AND (shipping_discount_minor >= 0) AND (cashback_amount_minor >= 0) AND (budget_applied_minor >= 0) AND (budget_used_minor >= 0) AND ((budget_cap_minor IS NULL) OR (budget_cap_minor >= 0)))),
    CONSTRAINT coupons_code_present CHECK ((length(btrim(code)) > 0)),
    CONSTRAINT coupons_max_discount_non_negative CHECK (((max_discount_minor IS NULL) OR (max_discount_minor >= 0))),
    CONSTRAINT coupons_uses_non_negative CHECK ((uses_count >= 0)),
    CONSTRAINT coupons_vendor_percent_range CHECK (((vendor_funding_percent >= (0)::numeric) AND (vendor_funding_percent <= (100)::numeric)))
);

ALTER TABLE ONLY app.coupons FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE coupons; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.coupons IS 'Discount rules imported from the dashboard CSV. Priced per order at logging time.';


--
-- Name: COLUMN coupons.vendor_funding_percent; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.coupons.vendor_funding_percent IS 'Share of the discount the merchant absorbs. The remainder is platform-funded.';


--
-- Name: COLUMN coupons.discount_amount_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.coupons.discount_amount_minor IS 'Fixed discount in minor units, or the rate in basis points for percentage_discount.';


--
-- Name: COLUMN coupons.budget_remaining_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.coupons.budget_remaining_minor IS 'Generated: cap − used. Carried by the CSV for reporting and recomputed here.';


--
-- Name: COLUMN coupons.max_discount_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.coupons.max_discount_minor IS 'Absolute per-order discount cap in minor units. Null means no cap. Clamps the percentage/base discount before the funding split.';


--
-- Name: couriers; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.couriers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    fixed_profit_per_order_minor bigint DEFAULT 0 NOT NULL,
    payout_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT couriers_fixed_profit_non_negative CHECK ((fixed_profit_per_order_minor >= 0)),
    CONSTRAINT couriers_name_present CHECK ((length(btrim(display_name)) > 0)),
    CONSTRAINT couriers_payout_preferences_object CHECK ((jsonb_typeof(payout_preferences) = 'object'::text))
);

ALTER TABLE ONLY app.couriers FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE couriers; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.couriers IS 'Delivery roster layered on app.users. The cut percent is the default share of the delivery fee the courier keeps.';


--
-- Name: COLUMN couriers.applied_at; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.couriers.applied_at IS 'Date the partner joined the delivery roster; shown on the couriers list.';


--
-- Name: COLUMN couriers.phone; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.couriers.phone IS 'Roster contact number. Unique when present so one partner cannot be entered twice.';


--
-- Name: COLUMN couriers.fixed_profit_per_order_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.couriers.fixed_profit_per_order_minor IS 'Fixed profit the partner keeps per delivered order, in minor units (piastres/halalas).';


--
-- Name: COLUMN couriers.payout_preferences; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.couriers.payout_preferences IS 'How the partner is paid: method plus the method-specific destination fields.';


--
-- Name: edit_requests; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.edit_requests (
    id text NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    requested_by text DEFAULT ''::text NOT NULL,
    requested_by_name text DEFAULT ''::text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by text,
    reviewed_by_name text,
    reviewed_at timestamp with time zone,
    review_note text DEFAULT ''::text NOT NULL,
    CONSTRAINT edit_requests_decision_shape CHECK (((status = 'pending'::text) = (reviewed_at IS NULL))),
    CONSTRAINT edit_requests_status_allowed CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: field_tasks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.field_tasks (
    id text NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    team text DEFAULT ''::text NOT NULL,
    city_id text DEFAULT ''::text NOT NULL,
    visit_date date NOT NULL,
    target_commission numeric(6,2) DEFAULT 0 NOT NULL,
    strategic_notes text DEFAULT ''::text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    follow_up_kind text,
    follow_up_contact_number text,
    created_by text DEFAULT ''::text NOT NULL,
    created_by_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT field_tasks_commission_range CHECK (((target_commission >= (0)::numeric) AND (target_commission <= (100)::numeric))),
    CONSTRAINT field_tasks_follow_up_kind_allowed CHECK (((follow_up_kind IS NULL) OR (follow_up_kind = ANY (ARRAY['visit'::text, 'call'::text, 'whatsapp'::text])))),
    CONSTRAINT field_tasks_status_allowed CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text])))
);


--
-- Name: TABLE field_tasks; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.field_tasks IS 'Scheduled merchant visits. `merchant_id` is text with no FK, for the same cross-catalogue reason as visit_reports.';


--
-- Name: field_teams; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.field_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city_id text NOT NULL,
    name character varying(120) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT field_teams_city_present CHECK ((length(btrim(city_id)) > 0)),
    CONSTRAINT field_teams_name_present CHECK ((length(btrim((name)::text)) > 0))
);

ALTER TABLE ONLY app.field_teams FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE field_teams; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.field_teams IS 'Dynamic field team owned by one city. Contracting is executed by these teams, not by a global label.';


--
-- Name: COLUMN field_teams.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.field_teams.city_id IS 'Firestore city document id. No FK by design: cross-database reference.';


--
-- Name: follow_up_tasks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.follow_up_tasks (
    id text NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    team text DEFAULT ''::text NOT NULL,
    city_id text DEFAULT ''::text NOT NULL,
    visit_date date NOT NULL,
    due_at timestamp with time zone NOT NULL,
    kind text DEFAULT 'visit'::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    contact_number text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_by text DEFAULT ''::text NOT NULL,
    created_by_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_report_id text,
    CONSTRAINT follow_up_tasks_kind_allowed CHECK ((kind = ANY (ARRAY['visit'::text, 'call'::text, 'whatsapp'::text]))),
    CONSTRAINT follow_up_tasks_status_allowed CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text])))
);


--
-- Name: journal_account_balances; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.journal_account_balances AS
SELECT
    NULL::uuid AS id,
    NULL::text AS code,
    NULL::text AS name,
    NULL::app.account_type AS type,
    NULL::character(3) AS currency,
    NULL::app.party_type AS party_type,
    NULL::text AS party_id,
    NULL::boolean AS active,
    NULL::bigint AS debit_total_minor,
    NULL::bigint AS credit_total_minor,
    NULL::bigint AS balance_minor;


--
-- Name: VIEW journal_account_balances; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.journal_account_balances IS 'Balance = debits − credits, computed from the journal. Never a stored column.';


--
-- Name: journal_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_no bigint NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    memo text DEFAULT ''::text NOT NULL,
    source_type app.journal_source NOT NULL,
    source_id text,
    currency character(3) DEFAULT 'EGP'::bpchar NOT NULL,
    status app.journal_status DEFAULT 'posted'::app.journal_status NOT NULL,
    reverses_entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_entries_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT journal_entries_reversal_shape CHECK (((source_type = 'reversal'::app.journal_source) = (reverses_entry_id IS NOT NULL)))
);

ALTER TABLE ONLY app.journal_entries FORCE ROW LEVEL SECURITY;


--
-- Name: journal_entries_entry_no_seq; Type: SEQUENCE; Schema: app; Owner: -
--

ALTER TABLE app.journal_entries ALTER COLUMN entry_no ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME app.journal_entries_entry_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: journal_lines; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    debit_minor bigint DEFAULT 0 NOT NULL,
    credit_minor bigint DEFAULT 0 NOT NULL,
    memo text DEFAULT ''::text NOT NULL,
    CONSTRAINT journal_lines_exactly_one CHECK ((((debit_minor > 0) AND (credit_minor = 0)) OR ((credit_minor > 0) AND (debit_minor = 0)))),
    CONSTRAINT journal_lines_non_negative CHECK (((debit_minor >= 0) AND (credit_minor >= 0)))
);

ALTER TABLE ONLY app.journal_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE journal_lines; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.journal_lines IS 'Debit/credit legs of a journal entry. Append-only; each line is exactly one side.';


--
-- Name: kpi_snapshots; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.kpi_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rep_id uuid NOT NULL,
    month_year date NOT NULL,
    new_merchants_activated integer DEFAULT 0 NOT NULL,
    items_added integer DEFAULT 0 NOT NULL,
    calculated_salary numeric(14,2) DEFAULT 0 NOT NULL,
    status app.kpi_snapshot_status DEFAULT 'pending'::app.kpi_snapshot_status NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_merchant_rate numeric(12,2),
    applied_item_rate numeric(12,2),
    contracts_closed integer DEFAULT 0 NOT NULL,
    avg_achievement_ratio numeric(8,2) DEFAULT 0 NOT NULL,
    applied_contract_fee numeric(12,2),
    legacy_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT kpi_snapshots_applied_contract_fee_non_negative CHECK (((applied_contract_fee IS NULL) OR (applied_contract_fee >= (0)::numeric))),
    CONSTRAINT kpi_snapshots_applied_item_rate_non_negative CHECK (((applied_item_rate IS NULL) OR (applied_item_rate >= (0)::numeric))),
    CONSTRAINT kpi_snapshots_applied_merchant_rate_non_negative CHECK (((applied_merchant_rate IS NULL) OR (applied_merchant_rate >= (0)::numeric))),
    CONSTRAINT kpi_snapshots_avg_achievement_ratio_non_negative CHECK ((avg_achievement_ratio >= (0)::numeric)),
    CONSTRAINT kpi_snapshots_calculated_salary_check CHECK ((calculated_salary >= (0)::numeric)),
    CONSTRAINT kpi_snapshots_contracts_closed_non_negative CHECK ((contracts_closed >= 0)),
    CONSTRAINT kpi_snapshots_items_added_check CHECK ((items_added >= 0)),
    CONSTRAINT kpi_snapshots_month_first_day CHECK ((month_year = (date_trunc('month'::text, (month_year)::timestamp with time zone))::date)),
    CONSTRAINT kpi_snapshots_new_merchants_activated_check CHECK ((new_merchants_activated >= 0))
);

ALTER TABLE ONLY app.kpi_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE kpi_snapshots; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.kpi_snapshots IS 'Monthly KPI vault. Financial history: figures are immutable, only status may move pending -> paid.';


--
-- Name: COLUMN kpi_snapshots.calculated_salary; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.calculated_salary IS 'Amount in major units with 2 decimals, frozen from the rates in force that month.';


--
-- Name: COLUMN kpi_snapshots.locked_at; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.locked_at IS 'Set when the snapshot row is written; the immutable-amount trigger refuses any later change.';


--
-- Name: COLUMN kpi_snapshots.applied_merchant_rate; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.applied_merchant_rate IS 'Merchant activation fee in force when this snapshot was calculated. Frozen with the row. NULL only for rows written before rate history existed.';


--
-- Name: COLUMN kpi_snapshots.applied_item_rate; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.applied_item_rate IS 'Per-photo / per-item fee in force when this snapshot was calculated. Frozen with the row. NULL only for rows written before rate history existed.';


--
-- Name: COLUMN kpi_snapshots.contracts_closed; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.contracts_closed IS 'Contracts the rep''s team closed in the month. Credited to both paired reps.';


--
-- Name: COLUMN kpi_snapshots.avg_achievement_ratio; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.avg_achievement_ratio IS 'Average agreed/target margin across closed contracts, in percent. 0 when no contract closed.';


--
-- Name: COLUMN kpi_snapshots.applied_contract_fee; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.applied_contract_fee IS 'Tiered contract fee in force when this snapshot was calculated. Frozen with the row. NULL only for rows written before tiered contracting existed.';


--
-- Name: COLUMN kpi_snapshots.legacy_metrics; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.kpi_snapshots.legacy_metrics IS 'V1 payroll-snapshot metrics that have no dedicated column: products, vendors, photos, activeSeconds, imageEditSeconds and rep_kpis time tracking. Preserved verbatim for accounting; intentionally outside the immutability guard so a later targeted backfill can fill rows written before this migration.';


--
-- Name: ledger_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_entries_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT ledger_entries_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT ledger_entries_kind_allowed CHECK ((kind = ANY (ARRAY['deposit'::text, 'expense'::text]))),
    CONSTRAINT ledger_entries_label_present CHECK ((length(btrim(label)) > 0))
);

ALTER TABLE ONLY app.ledger_entries FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE ledger_entries; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.ledger_entries IS 'Immutable money movements. A correction is a new opposing entry, never an update.';


--
-- Name: COLUMN ledger_entries.amount_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.ledger_entries.amount_minor IS 'Positive minor units (piastres/halalas). The kind column supplies the sign.';


--
-- Name: marketing_campaign_totals; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.marketing_campaign_totals AS
SELECT
    NULL::uuid AS id,
    NULL::text AS name,
    NULL::text AS platform,
    NULL::text AS channel,
    NULL::text AS city_id,
    NULL::bigint AS budget_minor,
    NULL::text AS status,
    NULL::date AS starts_on,
    NULL::date AS ends_on,
    NULL::numeric AS spend_minor,
    NULL::numeric AS leads,
    NULL::numeric AS conversions,
    NULL::numeric AS budget_left_minor;


--
-- Name: VIEW marketing_campaign_totals; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.marketing_campaign_totals IS 'Per-campaign spend/leads rollup derived from the append-only entries.';


--
-- Name: marketing_campaigns; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.marketing_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    platform text NOT NULL,
    channel text NOT NULL,
    city_id text,
    budget_minor bigint DEFAULT 0 NOT NULL,
    target_leads bigint DEFAULT 0 NOT NULL,
    target_conversions bigint DEFAULT 0 NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT marketing_campaign_budget_nonnegative CHECK ((budget_minor >= 0)),
    CONSTRAINT marketing_campaign_channel_allowed CHECK ((channel = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'google'::text, 'referral'::text, 'field'::text]))),
    CONSTRAINT marketing_campaign_closed_shape CHECK (((status = 'closed'::text) = (closed_at IS NOT NULL))),
    CONSTRAINT marketing_campaign_name_present CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT marketing_campaign_platform_allowed CHECK ((platform = ANY (ARRAY['meta'::text, 'tiktok'::text, 'google'::text, 'snapchat'::text, 'offline'::text]))),
    CONSTRAINT marketing_campaign_status_allowed CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'closed'::text]))),
    CONSTRAINT marketing_campaign_targets_nonnegative CHECK (((target_leads >= 0) AND (target_conversions >= 0))),
    CONSTRAINT marketing_campaign_window_ordered CHECK ((ends_on >= starts_on))
);

ALTER TABLE ONLY app.marketing_campaigns FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE marketing_campaigns; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.marketing_campaigns IS 'Marketing campaign plan. Closed campaigns are terminal: their results can no longer change.';


--
-- Name: marketing_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.marketing_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text,
    channel text,
    campaign text NOT NULL,
    spend_minor bigint DEFAULT 0 NOT NULL,
    impressions bigint DEFAULT 0 NOT NULL,
    clicks bigint DEFAULT 0 NOT NULL,
    conversions bigint DEFAULT 0 NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    city_id text,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_id uuid,
    leads bigint DEFAULT 0 NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    CONSTRAINT marketing_entries_campaign_present CHECK ((length(btrim(campaign)) > 0)),
    CONSTRAINT marketing_entries_channel_allowed CHECK ((channel = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'google'::text, 'referral'::text, 'field'::text]))),
    CONSTRAINT marketing_entries_clicks_within_impressions CHECK ((clicks <= impressions)),
    CONSTRAINT marketing_entries_conversions_within_clicks CHECK ((conversions <= clicks)),
    CONSTRAINT marketing_entries_leads_nonnegative CHECK ((leads >= 0)),
    CONSTRAINT marketing_entries_leads_within_clicks CHECK ((leads <= clicks)),
    CONSTRAINT marketing_entries_nonnegative CHECK (((spend_minor >= 0) AND (impressions >= 0) AND (clicks >= 0) AND (conversions >= 0))),
    CONSTRAINT marketing_entries_platform_allowed CHECK ((platform = ANY (ARRAY['meta'::text, 'tiktok'::text, 'google'::text, 'snapchat'::text, 'offline'::text])))
);

ALTER TABLE ONLY app.marketing_entries FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE marketing_entries; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.marketing_entries IS 'Manual campaign facts. Append-only: corrections are new rows so spend stays auditable.';


--
-- Name: COLUMN marketing_entries.city_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.marketing_entries.city_id IS 'Firestore city document id. Null means the campaign covers all cities.';


--
-- Name: marketing_leads; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.marketing_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    campaign_id uuid,
    city_id text,
    phone_number text NOT NULL,
    promo_code text DEFAULT ''::text NOT NULL,
    user_guess text DEFAULT ''::text NOT NULL,
    prize_details text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'spinwheel'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_leads_phone_dialable CHECK ((phone_number ~ '^[0-9]{8,15}$'::text)),
    CONSTRAINT marketing_leads_source_allowed CHECK ((source = ANY (ARRAY['spinwheel'::text, 'landing'::text, 'referral'::text, 'import'::text]))),
    CONSTRAINT marketing_leads_status_allowed CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'converted'::text, 'rejected'::text])))
);

ALTER TABLE ONLY app.marketing_leads FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE marketing_leads; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.marketing_leads IS 'Inbound campaign leads (Spinwheel, landing page, referrals). Separate from app.marketing_entries, which records ad spend.';


--
-- Name: COLUMN marketing_leads.phone_number; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.marketing_leads.phone_number IS 'Digits only, international form. Used to spot repeat entries from one contestant.';


--
-- Name: marketing_platform_settings; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.marketing_platform_settings (
    platform text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    api_key_ciphertext text,
    webhook_url text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT marketing_platform_allowed CHECK ((platform = ANY (ARRAY['meta'::text, 'tiktok'::text, 'google'::text, 'snapchat'::text, 'offline'::text]))),
    CONSTRAINT marketing_webhook_shape CHECK (((webhook_url = ''::text) OR (webhook_url ~* '^https?://'::text)))
);

ALTER TABLE ONLY app.marketing_platform_settings FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE marketing_platform_settings; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.marketing_platform_settings IS 'Per-platform sync settings. The API key is ciphertext and is never exposed to client roles.';


--
-- Name: marketing_platform_settings_public; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.marketing_platform_settings_public WITH (security_invoker='true') AS
 SELECT marketing_platform_settings.platform,
    marketing_platform_settings.enabled,
    ((marketing_platform_settings.api_key_ciphertext IS NOT NULL) AND (length(marketing_platform_settings.api_key_ciphertext) > 0)) AS api_key_configured,
    marketing_platform_settings.webhook_url,
    marketing_platform_settings.updated_at
   FROM app.marketing_platform_settings;


--
-- Name: VIEW marketing_platform_settings_public; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.marketing_platform_settings_public IS 'Client-safe projection of platform settings: no ciphertext, only a configured flag.';


--
-- Name: merchant_applications; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.merchant_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_name text NOT NULL,
    contact_person text NOT NULL,
    phone_number text NOT NULL,
    business_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_applications_business_type_present CHECK (((length(btrim(business_type)) >= 2) AND (length(btrim(business_type)) <= 120))),
    CONSTRAINT merchant_applications_contact_present CHECK (((length(btrim(contact_person)) >= 2) AND (length(btrim(contact_person)) <= 120))),
    CONSTRAINT merchant_applications_phone_dialable CHECK ((phone_number ~ '^[0-9]{8,15}$'::text)),
    CONSTRAINT merchant_applications_status_allowed CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT merchant_applications_store_name_present CHECK (((length(btrim(store_name)) >= 2) AND (length(btrim(store_name)) <= 160)))
);

ALTER TABLE ONLY app.merchant_applications FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE merchant_applications; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.merchant_applications IS 'Inbound merchant applications from the public landing page. Reviewed in the Ops Center; not merchants until an operator promotes them.';


--
-- Name: COLUMN merchant_applications.phone_number; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchant_applications.phone_number IS 'Digits only, normalized to the international form by the public API. Used to spot repeat applications from the same contact.';


--
-- Name: COLUMN merchant_applications.status; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchant_applications.status IS 'Review lifecycle: pending, contacted, approved, rejected. Set by an operator, never by the applicant.';


--
-- Name: merchant_state_overrides; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.merchant_state_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    from_state text NOT NULL,
    to_state text NOT NULL,
    actor_id text NOT NULL,
    actor_name text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    logged_by uuid,
    CONSTRAINT merchant_state_overrides_states CHECK (((from_state = ANY (ARRAY['no_agreement'::text, 'provisional'::text, 'final_contract'::text, 'signed_contract'::text])) AND (to_state = ANY (ARRAY['no_agreement'::text, 'provisional'::text, 'final_contract'::text, 'signed_contract'::text]))))
);

ALTER TABLE ONLY app.merchant_state_overrides FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE merchant_state_overrides; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.merchant_state_overrides IS 'Durable, append-only record of a manager agreement-state decision. Read by app.merchant_state_rollup.';


--
-- Name: COLUMN merchant_state_overrides.merchant_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchant_state_overrides.merchant_id IS 'Field-ops merchant id. No FK by design: the merchant catalogue is seeded in the application.';


--
-- Name: merchant_state_rollup; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.merchant_state_rollup WITH (security_invoker='true') AS
 WITH visit_stats AS (
         SELECT r.merchant_id,
            (count(*))::integer AS visit_count,
            COALESCE(sum(r.duration_seconds), (0)::bigint) AS total_duration_seconds,
            max(COALESCE(r.ended_at, r.started_at, r.created_at)) AS last_visit_at
           FROM app.visit_reports r
          GROUP BY r.merchant_id
        ), latest_visit AS (
         SELECT DISTINCT ON (r.merchant_id) r.merchant_id,
            r.outcome AS state,
            COALESCE(r.ended_at, r.started_at, r.created_at) AS state_at,
            r.rep_name AS actor
           FROM app.visit_reports r
          ORDER BY r.merchant_id, COALESCE(r.ended_at, r.started_at, r.created_at) DESC, r.created_at DESC
        ), latest_override AS (
         SELECT DISTINCT ON (o.merchant_id) o.merchant_id,
            o.to_state AS state,
            o.created_at AS state_at,
            o.actor_name AS actor
           FROM app.merchant_state_overrides o
          ORDER BY o.merchant_id, o.created_at DESC
        ), stored AS (
         SELECT m.id AS merchant_id,
            m.contract_state AS state,
            m.updated_at AS state_at
           FROM app.merchants m
        ), candidates AS (
         SELECT stored.merchant_id,
            stored.state,
            stored.state_at,
            'merchant'::text AS source,
            0 AS source_rank,
            NULL::text AS actor
           FROM stored
        UNION ALL
         SELECT latest_visit.merchant_id,
            latest_visit.state,
            latest_visit.state_at,
            'visit'::text AS text,
            1,
            latest_visit.actor
           FROM latest_visit
        UNION ALL
         SELECT latest_override.merchant_id,
            latest_override.state,
            latest_override.state_at,
            'override'::text AS text,
            2,
            latest_override.actor
           FROM latest_override
        ), resolved AS (
         SELECT DISTINCT ON (candidates.merchant_id) candidates.merchant_id,
            candidates.state,
            candidates.state_at,
            candidates.source,
            candidates.actor
           FROM candidates
          WHERE (candidates.state_at IS NOT NULL)
          ORDER BY candidates.merchant_id, candidates.state_at DESC, candidates.source_rank DESC
        ), merchant_keys AS (
         SELECT stored.merchant_id
           FROM stored
        UNION
         SELECT visit_stats.merchant_id
           FROM visit_stats
        UNION
         SELECT latest_override.merchant_id
           FROM latest_override
        )
 SELECT k.merchant_id,
    COALESCE(res.state, 'no_agreement'::text) AS current_state,
    res.state_at AS current_state_at,
    COALESCE(res.source, 'none'::text) AS current_state_source,
    res.actor AS current_state_actor,
    COALESCE(s.visit_count, 0) AS visit_count,
    COALESCE(s.total_duration_seconds, (0)::bigint) AS total_duration_seconds,
    s.last_visit_at,
    v.state AS last_outcome,
    v.state_at AS last_outcome_at,
    v.actor AS last_rep_name,
    st.state AS stored_state,
    st.state_at AS stored_state_at
   FROM ((((merchant_keys k
     LEFT JOIN resolved res ON ((res.merchant_id = k.merchant_id)))
     LEFT JOIN visit_stats s ON ((s.merchant_id = k.merchant_id)))
     LEFT JOIN latest_visit v ON ((v.merchant_id = k.merchant_id)))
     LEFT JOIN stored st ON ((st.merchant_id = k.merchant_id)));


--
-- Name: VIEW merchant_state_rollup; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.merchant_state_rollup IS 'Pre-computed merchant agreement state: newest of visit outcome, manager override and stored column, plus visit counters. Read instead of scanning app.visit_reports.';


--
-- Name: merchant_v1_profiles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.merchant_v1_profiles (
    merchant_id text NOT NULL,
    actual_address text DEFAULT ''::text NOT NULL,
    facebook_url text DEFAULT ''::text NOT NULL,
    instagram_url text DEFAULT ''::text NOT NULL,
    drive_folder_url text DEFAULT ''::text NOT NULL,
    app_published boolean DEFAULT false NOT NULL,
    vip_menu boolean DEFAULT false NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.merchant_v1_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE merchant_v1_profiles; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.merchant_v1_profiles IS 'V1 merchant working fields that are not part of the contract record: address, socials, app publish state, VIP listing and the official Drive folder.';


--
-- Name: COLUMN merchant_v1_profiles.app_published; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchant_v1_profiles.app_published IS 'Independent of contract_state: publish state is a product decision, not a legal one.';


--
-- Name: COLUMN merchant_v1_profiles.vip_menu; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.merchant_v1_profiles.vip_menu IS 'Allows a menu listing without a final commission contract (VIP / preliminary offer).';


--
-- Name: notification_reads; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.notification_reads (
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.notification_reads FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    user_id uuid,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    icon text DEFAULT ''::text NOT NULL,
    color text DEFAULT ''::text NOT NULL,
    kind text DEFAULT 'system'::text NOT NULL,
    task_id text,
    link text DEFAULT ''::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    target_url text,
    metadata jsonb,
    is_broadcast boolean DEFAULT true NOT NULL,
    CONSTRAINT notifications_read_shape CHECK ((is_read = (read_at IS NOT NULL)))
);

ALTER TABLE ONLY app.notifications FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE notifications; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.notifications IS 'Operator inbox. `user_id` NULL is a broadcast to every active operator; a row with a user_id is that operator''s own notification.';


--
-- Name: operation_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.operation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id text NOT NULL,
    merchant_id text NOT NULL,
    courier_id uuid NOT NULL,
    payment_method app.payment_method NOT NULL,
    currency character(3) DEFAULT 'EGP'::bpchar NOT NULL,
    order_value_minor bigint NOT NULL,
    delivery_fee_minor bigint DEFAULT 0 NOT NULL,
    commission_percent numeric(6,2) DEFAULT 0 NOT NULL,
    commission_minor bigint DEFAULT 0 NOT NULL,
    courier_cut_percent numeric(6,2) DEFAULT 0 NOT NULL,
    courier_cut_minor bigint DEFAULT 0 NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    logged_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    coupon_id uuid,
    coupon_code text DEFAULT ''::text NOT NULL,
    coupon_discount_minor bigint DEFAULT 0 NOT NULL,
    coupon_shipping_minor bigint DEFAULT 0 NOT NULL,
    coupon_cashback_minor bigint DEFAULT 0 NOT NULL,
    coupon_platform_funded_minor bigint DEFAULT 0 NOT NULL,
    coupon_vendor_funded_minor bigint DEFAULT 0 NOT NULL,
    wallet_discount_minor bigint DEFAULT 0 NOT NULL,
    wallet_discount_reason text DEFAULT ''::text NOT NULL,
    wallet_discount_ref text DEFAULT ''::text NOT NULL,
    journal_entry_id uuid,
    CONSTRAINT operation_logs_amounts_non_negative CHECK (((commission_minor >= 0) AND (courier_cut_minor >= 0))),
    CONSTRAINT operation_logs_commission_range CHECK (((commission_percent >= (0)::numeric) AND (commission_percent <= (100)::numeric))),
    CONSTRAINT operation_logs_coupon_amounts_non_negative CHECK (((coupon_discount_minor >= 0) AND (coupon_shipping_minor >= 0) AND (coupon_cashback_minor >= 0) AND (coupon_platform_funded_minor >= 0) AND (coupon_vendor_funded_minor >= 0) AND (wallet_discount_minor >= 0))),
    CONSTRAINT operation_logs_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT operation_logs_cut_range CHECK (((courier_cut_percent >= (0)::numeric) AND (courier_cut_percent <= (100)::numeric))),
    CONSTRAINT operation_logs_delivery_non_negative CHECK ((delivery_fee_minor >= 0)),
    CONSTRAINT operation_logs_order_present CHECK ((length(btrim(order_id)) > 0)),
    CONSTRAINT operation_logs_value_positive CHECK ((order_value_minor > 0))
);

ALTER TABLE ONLY app.operation_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE operation_logs; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.operation_logs IS 'Append-only record of a fulfilled order. Money terms are frozen at insert time.';


--
-- Name: COLUMN operation_logs.commission_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.commission_minor IS 'Frozen commission in minor units. Resolved from the merchant rate when the caller does not supply a percent.';


--
-- Name: COLUMN operation_logs.courier_cut_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.courier_cut_minor IS 'Frozen courier share in minor units. Resolved from the courier default when the caller does not supply an amount.';


--
-- Name: COLUMN operation_logs.coupon_discount_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.coupon_discount_minor IS 'Coupon discount granted at checkout, computed per order. Reduces cash collected.';


--
-- Name: COLUMN operation_logs.coupon_platform_funded_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.coupon_platform_funded_minor IS 'Platform share of the coupon discount (Coupon Expense).';


--
-- Name: COLUMN operation_logs.coupon_vendor_funded_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.coupon_vendor_funded_minor IS 'Vendor share of the coupon discount, absorbed by the merchant.';


--
-- Name: COLUMN operation_logs.wallet_discount_minor; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.wallet_discount_minor IS 'Manual wallet balance used as cash. Platform-funded; Kanjo owes the courier.';


--
-- Name: COLUMN operation_logs.journal_entry_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.operation_logs.journal_entry_id IS 'The journal entry posted for this operation. Set once, immutable like the rest of the row.';


--
-- Name: payroll_commission_tiers; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.payroll_commission_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    threshold_minor bigint NOT NULL,
    rate numeric(6,5) NOT NULL,
    CONSTRAINT payroll_tiers_rate_range CHECK (((rate >= (0)::numeric) AND (rate <= (1)::numeric))),
    CONSTRAINT payroll_tiers_threshold_positive CHECK ((threshold_minor > 0))
);

ALTER TABLE ONLY app.payroll_commission_tiers FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE payroll_commission_tiers; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.payroll_commission_tiers IS 'Cumulative contracting-commission bands. Sorted by threshold; the slice above each band earns that band rate.';


--
-- Name: payroll_contributions_rollup; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.payroll_contributions_rollup WITH (security_invoker='true') AS
 SELECT r.rep_id,
    (COALESCE(sum(
        CASE
            WHEN (r.commission_amount > (0)::numeric) THEN r.commission_amount
            WHEN ((m.id IS NOT NULL) AND (m.monthly_value_minor > 0)) THEN round(((((m.monthly_value_minor)::numeric / 100.0) * COALESCE(m.agreed_commission, m.target_commission)) / 100.0))
            ELSE (0)::numeric
        END), (0)::numeric))::numeric(14,2) AS contribution,
    (count(*))::integer AS signed_visits
   FROM (app.visit_reports r
     LEFT JOIN app.merchants m ON ((m.id = r.merchant_id)))
  WHERE (r.outcome = 'signed_contract'::text)
  GROUP BY r.rep_id;


--
-- Name: VIEW payroll_contributions_rollup; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON VIEW app.payroll_contributions_rollup IS 'Per-rep signed-contract contribution for payroll. Replaces the per-profile full scan of app.visit_reports.';


--
-- Name: payroll_kpi_links; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.payroll_kpi_links (
    user_id uuid NOT NULL,
    kpi_key text NOT NULL,
    weight numeric(6,3) DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_kpi_key_present CHECK ((length(btrim(kpi_key)) > 0)),
    CONSTRAINT payroll_kpi_weight_range CHECK (((weight >= (0)::numeric) AND (weight <= (10)::numeric)))
);

ALTER TABLE ONLY app.payroll_kpi_links FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE payroll_kpi_links; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.payroll_kpi_links IS 'Links an operator payslip to KPI keys, so an incentive can be tied to a measured outcome.';


--
-- Name: payroll_lines; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.payroll_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    user_id uuid NOT NULL,
    item_type text NOT NULL,
    amount_minor bigint NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    CONSTRAINT payroll_lines_amount_nonnegative CHECK ((amount_minor >= 0)),
    CONSTRAINT payroll_lines_type_allowed CHECK ((item_type = ANY (ARRAY['base_salary'::text, 'transport'::text, 'commission'::text, 'data_entry'::text, 'incentive'::text, 'deduction'::text])))
);

ALTER TABLE ONLY app.payroll_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE payroll_lines; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.payroll_lines IS 'One line per component of a payslip. Net is the signed sum, never a stored total.';


--
-- Name: payroll_profiles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.payroll_profiles (
    user_id uuid NOT NULL,
    base_salary_minor bigint DEFAULT 0 NOT NULL,
    transport_minor bigint DEFAULT 0 NOT NULL,
    data_entry_rate_minor bigint DEFAULT 0 NOT NULL,
    data_entry_count integer DEFAULT 0 NOT NULL,
    incentive_multiplier numeric(6,3) DEFAULT 1 NOT NULL,
    currency character(3) DEFAULT 'EGP'::bpchar NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_profiles_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT payroll_profiles_multiplier CHECK (((incentive_multiplier >= (0)::numeric) AND (incentive_multiplier <= (10)::numeric))),
    CONSTRAINT payroll_profiles_nonnegative CHECK (((base_salary_minor >= 0) AND (transport_minor >= 0) AND (data_entry_rate_minor >= 0) AND (data_entry_count >= 0)))
);

ALTER TABLE ONLY app.payroll_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE payroll_profiles; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.payroll_profiles IS 'Fixed monthly terms per operator. Variable commission is derived from the tier table.';


--
-- Name: payroll_run_totals; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.payroll_run_totals WITH (security_invoker='true') AS
 SELECT l.run_id,
    l.user_id,
    sum((l.amount_minor * app.payroll_line_sign(l.item_type))) FILTER (WHERE (app.payroll_line_sign(l.item_type) > 0)) AS gross_minor,
    sum(l.amount_minor) FILTER (WHERE (app.payroll_line_sign(l.item_type) < 0)) AS deductions_minor,
    sum((l.amount_minor * app.payroll_line_sign(l.item_type))) AS net_minor
   FROM app.payroll_lines l
  GROUP BY l.run_id, l.user_id;


--
-- Name: payroll_runs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.payroll_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    currency character(3) NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_runs_currency_allowed CHECK ((currency = ANY (ARRAY['EGP'::bpchar, 'SAR'::bpchar]))),
    CONSTRAINT payroll_runs_period_order CHECK ((period_end >= period_start)),
    CONSTRAINT payroll_runs_status_allowed CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'paid'::text])))
);

ALTER TABLE ONLY app.payroll_runs FORCE ROW LEVEL SECURITY;


--
-- Name: permissions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.permissions (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    group_key text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permissions_key_format CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))
);

ALTER TABLE ONLY app.permissions FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE permissions; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.permissions IS 'Capability catalogue. The only source of authorization truth; job titles never gate access.';


--
-- Name: taxonomy_categories; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.taxonomy_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    vendor_type text NOT NULL,
    name_ar text DEFAULT ''::text NOT NULL,
    name_en text DEFAULT ''::text NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transaction_receipts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.transaction_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    receipt_no text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transaction_receipts_no_present CHECK ((length(btrim(receipt_no)) > 0)),
    CONSTRAINT transaction_receipts_size_non_negative CHECK ((size_bytes >= 0))
);

ALTER TABLE ONLY app.transaction_receipts FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE transaction_receipts; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.transaction_receipts IS 'Receipt attached to a journal entry. Visible wherever that entry is, without duplicating the file.';


--
-- Name: transfer_requests; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.transfer_requests (
    id text NOT NULL,
    merchant_id text NOT NULL,
    merchant_name text DEFAULT ''::text NOT NULL,
    from_team text DEFAULT ''::text NOT NULL,
    to_team text DEFAULT ''::text NOT NULL,
    requested_by text DEFAULT ''::text NOT NULL,
    requested_by_name text DEFAULT ''::text NOT NULL,
    justification text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by text,
    reviewed_by_name text,
    reviewed_at timestamp with time zone,
    review_note text DEFAULT ''::text NOT NULL,
    CONSTRAINT transfer_requests_decision_shape CHECK (((status = 'pending'::text) = (reviewed_at IS NULL))),
    CONSTRAINT transfer_requests_status_allowed CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: user_payout_methods; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_payout_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    method app.payout_method_kind NOT NULL,
    bank_name text,
    account_holder text,
    account_number text,
    iban text,
    wallet_provider text,
    wallet_phone text,
    instapay_type text,
    instapay_value text,
    status app.bank_info_status DEFAULT 'pending'::app.bank_info_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    post_national_id text,
    CONSTRAINT user_payout_methods_decision_shape CHECK (((status = 'pending'::app.bank_info_status) = (reviewed_at IS NULL))),
    CONSTRAINT user_payout_methods_shape CHECK (
CASE (method)::text
    WHEN 'bank_account'::text THEN ((length(btrim(COALESCE(bank_name, ''::text))) > 0) AND (length(btrim(COALESCE(account_holder, ''::text))) > 0) AND (length(btrim(COALESCE(account_number, ''::text))) > 0) AND (iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'::text) AND (wallet_provider IS NULL) AND (wallet_phone IS NULL) AND (instapay_type IS NULL) AND (instapay_value IS NULL) AND (post_national_id IS NULL))
    WHEN 'e_wallet'::text THEN ((length(btrim(COALESCE(wallet_provider, ''::text))) > 0) AND (wallet_phone ~ '^01[0125][0-9]{8}$'::text) AND (bank_name IS NULL) AND (account_holder IS NULL) AND (account_number IS NULL) AND (iban IS NULL) AND (instapay_type IS NULL) AND (instapay_value IS NULL) AND (post_national_id IS NULL))
    WHEN 'instapay'::text THEN ((instapay_type = ANY (ARRAY['ipa'::text, 'phone'::text])) AND (length(btrim(COALESCE(instapay_value, ''::text))) > 0) AND (bank_name IS NULL) AND (account_holder IS NULL) AND (account_number IS NULL) AND (iban IS NULL) AND (wallet_provider IS NULL) AND (wallet_phone IS NULL) AND (post_national_id IS NULL))
    WHEN 'egypt_post'::text THEN ((post_national_id ~ '^[0-9]{14}$'::text) AND (bank_name IS NULL) AND (account_holder IS NULL) AND (account_number IS NULL) AND (iban IS NULL) AND (wallet_provider IS NULL) AND (wallet_phone IS NULL) AND (instapay_type IS NULL) AND (instapay_value IS NULL))
    ELSE NULL::boolean
END)
);

ALTER TABLE ONLY app.user_payout_methods FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE user_payout_methods; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON TABLE app.user_payout_methods IS 'One salary destination per operator. A change after approval returns the row to pending.';


--
-- Name: COLUMN user_payout_methods.iban; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.user_payout_methods.iban IS 'Normalized, unspaced, uppercase IBAN for a bank account payout.';


--
-- Name: COLUMN user_payout_methods.post_national_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.user_payout_methods.post_national_id IS 'Egypt Post national id (14 digits). Only populated when method = egypt_post.';


--
-- Name: accounts accounts_code_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.accounts
    ADD CONSTRAINT accounts_code_key UNIQUE (code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: archived_reports archived_reports_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.archived_reports
    ADD CONSTRAINT archived_reports_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: capital_deposits capital_deposits_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.capital_deposits
    ADD CONSTRAINT capital_deposits_pkey PRIMARY KEY (id);


--
-- Name: catalog_products catalog_products_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.catalog_products
    ADD CONSTRAINT catalog_products_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: commission_rates commission_rates_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.commission_rates
    ADD CONSTRAINT commission_rates_pkey PRIMARY KEY (id);


--
-- Name: contract_clauses contract_clauses_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_clauses
    ADD CONSTRAINT contract_clauses_pkey PRIMARY KEY (id);


--
-- Name: contract_commission_lines contract_commission_lines_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_commission_lines
    ADD CONSTRAINT contract_commission_lines_pkey PRIMARY KEY (id);


--
-- Name: contract_section_overrides contract_section_overrides_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_section_overrides
    ADD CONSTRAINT contract_section_overrides_pkey PRIMARY KEY (id);


--
-- Name: contract_section_overrides contract_section_overrides_unique; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_section_overrides
    ADD CONSTRAINT contract_section_overrides_unique UNIQUE (contract_id, section_key);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: couriers couriers_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.couriers
    ADD CONSTRAINT couriers_pkey PRIMARY KEY (id);


--
-- Name: edit_requests edit_requests_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.edit_requests
    ADD CONSTRAINT edit_requests_pkey PRIMARY KEY (id);


--
-- Name: field_tasks field_tasks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.field_tasks
    ADD CONSTRAINT field_tasks_pkey PRIMARY KEY (id);


--
-- Name: field_teams field_teams_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.field_teams
    ADD CONSTRAINT field_teams_pkey PRIMARY KEY (id);


--
-- Name: follow_up_tasks follow_up_tasks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.follow_up_tasks
    ADD CONSTRAINT follow_up_tasks_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_entry_no_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_entries
    ADD CONSTRAINT journal_entries_entry_no_key UNIQUE (entry_no);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: kpi_snapshots kpi_snapshots_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_pkey PRIMARY KEY (id);


--
-- Name: kpi_snapshots kpi_snapshots_rep_month_unique; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_rep_month_unique UNIQUE (rep_id, month_year);


--
-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: marketing_entries marketing_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_entries
    ADD CONSTRAINT marketing_entries_pkey PRIMARY KEY (id);


--
-- Name: marketing_leads marketing_leads_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_leads
    ADD CONSTRAINT marketing_leads_pkey PRIMARY KEY (id);


--
-- Name: marketing_platform_settings marketing_platform_settings_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_platform_settings
    ADD CONSTRAINT marketing_platform_settings_pkey PRIMARY KEY (platform);


--
-- Name: merchant_applications merchant_applications_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchant_applications
    ADD CONSTRAINT merchant_applications_pkey PRIMARY KEY (id);


--
-- Name: merchant_state_overrides merchant_state_overrides_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchant_state_overrides
    ADD CONSTRAINT merchant_state_overrides_pkey PRIMARY KEY (id);


--
-- Name: merchant_v1_profiles merchant_v1_profiles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchant_v1_profiles
    ADD CONSTRAINT merchant_v1_profiles_pkey PRIMARY KEY (merchant_id);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (notification_id, user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operation_logs operation_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.operation_logs
    ADD CONSTRAINT operation_logs_pkey PRIMARY KEY (id);


--
-- Name: payroll_commission_tiers payroll_commission_tiers_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_commission_tiers
    ADD CONSTRAINT payroll_commission_tiers_pkey PRIMARY KEY (id);


--
-- Name: payroll_kpi_links payroll_kpi_links_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_kpi_links
    ADD CONSTRAINT payroll_kpi_links_pkey PRIMARY KEY (user_id, kpi_key);


--
-- Name: payroll_lines payroll_lines_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_lines
    ADD CONSTRAINT payroll_lines_pkey PRIMARY KEY (id);


--
-- Name: payroll_profiles payroll_profiles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_profiles
    ADD CONSTRAINT payroll_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: payroll_commission_tiers payroll_tiers_unique_band; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_commission_tiers
    ADD CONSTRAINT payroll_tiers_unique_band UNIQUE (user_id, threshold_minor);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (key);


--
-- Name: taxonomy_categories taxonomy_categories_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.taxonomy_categories
    ADD CONSTRAINT taxonomy_categories_pkey PRIMARY KEY (id);


--
-- Name: transaction_receipts transaction_receipts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.transaction_receipts
    ADD CONSTRAINT transaction_receipts_pkey PRIMARY KEY (id);


--
-- Name: transfer_requests transfer_requests_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.transfer_requests
    ADD CONSTRAINT transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: user_city_scope user_city_scope_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_city_scope
    ADD CONSTRAINT user_city_scope_pkey PRIMARY KEY (user_id, city_id);


--
-- Name: user_payout_methods user_payout_methods_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_payout_methods
    ADD CONSTRAINT user_payout_methods_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission_key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visit_reports visit_reports_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.visit_reports
    ADD CONSTRAINT visit_reports_pkey PRIMARY KEY (id);


--
-- Name: accounts_party_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX accounts_party_key ON app.accounts USING btree (parent_id, party_type, party_id, currency) WHERE (party_type IS NOT NULL);


--
-- Name: accounts_type_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX accounts_type_idx ON app.accounts USING btree (type, active);


--
-- Name: archived_reports_legacy_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX archived_reports_legacy_key ON app.archived_reports USING btree (legacy_id) WHERE (legacy_id IS NOT NULL);


--
-- Name: archived_reports_occurred_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX archived_reports_occurred_idx ON app.archived_reports USING btree (occurred_at DESC);


--
-- Name: archived_reports_task_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX archived_reports_task_idx ON app.archived_reports USING btree (task_id);


--
-- Name: audit_logs_actor_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX audit_logs_actor_idx ON app.audit_logs USING btree (actor_id, occurred_at DESC);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX audit_logs_entity_idx ON app.audit_logs USING btree (collection, target_id);


--
-- Name: audit_logs_legacy_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX audit_logs_legacy_key ON app.audit_logs USING btree (legacy_id) WHERE (legacy_id IS NOT NULL);


--
-- Name: audit_logs_occurred_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX audit_logs_occurred_idx ON app.audit_logs USING btree (occurred_at DESC);


--
-- Name: bank_accounts_active_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX bank_accounts_active_idx ON app.bank_accounts USING btree (active, country_code);


--
-- Name: bank_accounts_iban_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX bank_accounts_iban_key ON app.bank_accounts USING btree (iban);


--
-- Name: capital_deposits_founder_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX capital_deposits_founder_idx ON app.capital_deposits USING btree (founder_id, created_at DESC);


--
-- Name: capital_deposits_ledger_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX capital_deposits_ledger_key ON app.capital_deposits USING btree (ledger_entry_id) WHERE (ledger_entry_id IS NOT NULL);


--
-- Name: capital_deposits_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX capital_deposits_status_idx ON app.capital_deposits USING btree (status, created_at DESC);


--
-- Name: catalog_products_barcode_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX catalog_products_barcode_key ON app.catalog_products USING btree (barcode) WHERE ((barcode IS NOT NULL) AND (length(btrim(barcode)) > 0));


--
-- Name: catalog_products_client_id_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX catalog_products_client_id_key ON app.catalog_products USING btree (client_product_id) WHERE (client_product_id IS NOT NULL);


--
-- Name: catalog_products_created_by_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX catalog_products_created_by_idx ON app.catalog_products USING btree (created_by);


--
-- Name: catalog_products_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX catalog_products_merchant_idx ON app.catalog_products USING btree (merchant_id);


--
-- Name: catalog_products_merchant_name_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX catalog_products_merchant_name_idx ON app.catalog_products USING btree (merchant_id, name);


--
-- Name: catalog_products_merchant_name_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX catalog_products_merchant_name_key ON app.catalog_products USING btree (merchant_id, normalized_name) WHERE (length(btrim(normalized_name)) > 0);


--
-- Name: catalog_products_sku_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX catalog_products_sku_key ON app.catalog_products USING btree (sku) WHERE ((sku IS NOT NULL) AND (length(btrim(sku)) > 0));


--
-- Name: catalog_products_state_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX catalog_products_state_idx ON app.catalog_products USING btree (state);


--
-- Name: cities_name_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX cities_name_key ON app.cities USING btree (lower(btrim(name)));


--
-- Name: commission_rates_city_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX commission_rates_city_key ON app.commission_rates USING btree (city_id) WHERE (city_id IS NOT NULL);


--
-- Name: commission_rates_global_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX commission_rates_global_key ON app.commission_rates USING btree (((city_id IS NULL))) WHERE (city_id IS NULL);


--
-- Name: contract_clauses_contract_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contract_clauses_contract_idx ON app.contract_clauses USING btree (contract_id, ordinal) WHERE (contract_id IS NOT NULL);


--
-- Name: contract_clauses_scope_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contract_clauses_scope_idx ON app.contract_clauses USING btree (scope, vendor_type_id, merchant_id, ordinal) WHERE (contract_id IS NULL);


--
-- Name: contract_commission_lines_contract_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contract_commission_lines_contract_idx ON app.contract_commission_lines USING btree (contract_id, category_name);


--
-- Name: contract_section_overrides_contract_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contract_section_overrides_contract_idx ON app.contract_section_overrides USING btree (contract_id);


--
-- Name: contracts_city_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contracts_city_idx ON app.contracts USING btree (city_id) WHERE (city_id IS NOT NULL);


--
-- Name: contracts_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contracts_merchant_idx ON app.contracts USING btree (merchant_id);


--
-- Name: contracts_reference_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX contracts_reference_key ON app.contracts USING btree (reference);


--
-- Name: contracts_serial_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contracts_serial_idx ON app.contracts USING btree (serial_number DESC);


--
-- Name: contracts_serial_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX contracts_serial_key ON app.contracts USING btree (serial_number) WHERE (serial_number IS NOT NULL);


--
-- Name: contracts_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX contracts_status_idx ON app.contracts USING btree (status, created_at DESC);


--
-- Name: coupons_active_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX coupons_active_idx ON app.coupons USING btree (active);


--
-- Name: coupons_code_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX coupons_code_key ON app.coupons USING btree (upper(btrim(code)));


--
-- Name: coupons_type_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX coupons_type_idx ON app.coupons USING btree (coupon_type);


--
-- Name: couriers_active_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX couriers_active_idx ON app.couriers USING btree (active);


--
-- Name: couriers_phone_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX couriers_phone_key ON app.couriers USING btree (phone) WHERE (phone <> ''::text);


--
-- Name: edit_requests_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX edit_requests_merchant_idx ON app.edit_requests USING btree (merchant_id, created_at DESC);


--
-- Name: edit_requests_one_pending_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX edit_requests_one_pending_key ON app.edit_requests USING btree (merchant_id, requested_by) WHERE (status = 'pending'::text);


--
-- Name: edit_requests_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX edit_requests_status_idx ON app.edit_requests USING btree (status, created_at DESC);


--
-- Name: field_tasks_city_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX field_tasks_city_idx ON app.field_tasks USING btree (city_id);


--
-- Name: field_tasks_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX field_tasks_merchant_idx ON app.field_tasks USING btree (merchant_id);


--
-- Name: field_tasks_team_date_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX field_tasks_team_date_idx ON app.field_tasks USING btree (team, visit_date);


--
-- Name: field_teams_city_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX field_teams_city_idx ON app.field_teams USING btree (city_id);


--
-- Name: field_teams_city_name_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX field_teams_city_name_key ON app.field_teams USING btree (city_id, lower(btrim((name)::text)));


--
-- Name: follow_up_tasks_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX follow_up_tasks_merchant_idx ON app.follow_up_tasks USING btree (merchant_id, due_at DESC);


--
-- Name: follow_up_tasks_open_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX follow_up_tasks_open_idx ON app.follow_up_tasks USING btree (status, due_at);


--
-- Name: journal_entries_date_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX journal_entries_date_idx ON app.journal_entries USING btree (entry_date DESC, entry_no DESC);


--
-- Name: journal_entries_source_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX journal_entries_source_key ON app.journal_entries USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: journal_lines_account_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX journal_lines_account_idx ON app.journal_lines USING btree (account_id);


--
-- Name: journal_lines_entry_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX journal_lines_entry_idx ON app.journal_lines USING btree (entry_id);


--
-- Name: kpi_snapshots_month_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX kpi_snapshots_month_idx ON app.kpi_snapshots USING btree (month_year);


--
-- Name: kpi_snapshots_rep_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX kpi_snapshots_rep_idx ON app.kpi_snapshots USING btree (rep_id, month_year DESC);


--
-- Name: ledger_entries_account_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ledger_entries_account_idx ON app.ledger_entries USING btree (account_id, occurred_at DESC);


--
-- Name: ledger_entries_recorded_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ledger_entries_recorded_idx ON app.ledger_entries USING btree (recorded_at DESC);


--
-- Name: marketing_campaigns_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_campaigns_status_idx ON app.marketing_campaigns USING btree (status, starts_on DESC);


--
-- Name: marketing_entries_campaign_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_entries_campaign_idx ON app.marketing_entries USING btree (campaign_id, occurred_at DESC);


--
-- Name: marketing_entries_city_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_entries_city_idx ON app.marketing_entries USING btree (city_id, occurred_at DESC);


--
-- Name: marketing_entries_platform_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_entries_platform_idx ON app.marketing_entries USING btree (platform, occurred_at DESC);


--
-- Name: marketing_leads_campaign_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_leads_campaign_idx ON app.marketing_leads USING btree (campaign_id);


--
-- Name: marketing_leads_legacy_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX marketing_leads_legacy_key ON app.marketing_leads USING btree (legacy_id) WHERE (legacy_id IS NOT NULL);


--
-- Name: marketing_leads_occurred_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_leads_occurred_idx ON app.marketing_leads USING btree (occurred_at DESC);


--
-- Name: marketing_leads_phone_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_leads_phone_idx ON app.marketing_leads USING btree (phone_number);


--
-- Name: marketing_leads_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX marketing_leads_status_idx ON app.marketing_leads USING btree (status, occurred_at DESC);


--
-- Name: merchant_applications_created_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchant_applications_created_idx ON app.merchant_applications USING btree (created_at DESC);


--
-- Name: merchant_applications_phone_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchant_applications_phone_idx ON app.merchant_applications USING btree (phone_number);


--
-- Name: merchant_applications_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchant_applications_status_idx ON app.merchant_applications USING btree (status, created_at DESC);


--
-- Name: merchant_state_overrides_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchant_state_overrides_merchant_idx ON app.merchant_state_overrides USING btree (merchant_id, created_at DESC);


--
-- Name: merchants_city_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchants_city_idx ON app.merchants USING btree (city_id);


--
-- Name: merchants_contracted_by_team_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchants_contracted_by_team_idx ON app.merchants USING btree (contracted_by_team_id);


--
-- Name: merchants_first_entry_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchants_first_entry_idx ON app.merchants USING btree (first_entry_by);


--
-- Name: merchants_name_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchants_name_idx ON app.merchants USING btree (name);


--
-- Name: merchants_normalized_name_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX merchants_normalized_name_key ON app.merchants USING btree (normalized_name) WHERE (length(btrim(normalized_name)) > 0);


--
-- Name: merchants_with_cover_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchants_with_cover_idx ON app.merchants USING btree (id) WHERE (cover_url IS NOT NULL);


--
-- Name: merchants_with_logo_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX merchants_with_logo_idx ON app.merchants USING btree (id) WHERE (logo_url IS NOT NULL);


--
-- Name: notifications_inbox_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX notifications_inbox_idx ON app.notifications USING btree (user_id, occurred_at DESC);


--
-- Name: notifications_legacy_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX notifications_legacy_key ON app.notifications USING btree (legacy_id) WHERE (legacy_id IS NOT NULL);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX notifications_unread_idx ON app.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: operation_logs_courier_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX operation_logs_courier_idx ON app.operation_logs USING btree (courier_id, occurred_at DESC);


--
-- Name: operation_logs_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX operation_logs_merchant_idx ON app.operation_logs USING btree (merchant_id, occurred_at DESC);


--
-- Name: operation_logs_occurred_at_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX operation_logs_occurred_at_idx ON app.operation_logs USING btree (occurred_at DESC, created_at DESC);


--
-- Name: operation_logs_order_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX operation_logs_order_key ON app.operation_logs USING btree (order_id);


--
-- Name: payroll_lines_run_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX payroll_lines_run_idx ON app.payroll_lines USING btree (run_id);


--
-- Name: payroll_lines_user_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX payroll_lines_user_idx ON app.payroll_lines USING btree (user_id);


--
-- Name: payroll_tiers_user_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX payroll_tiers_user_idx ON app.payroll_commission_tiers USING btree (user_id, threshold_minor);


--
-- Name: transaction_receipts_entry_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX transaction_receipts_entry_idx ON app.transaction_receipts USING btree (entry_id);


--
-- Name: transaction_receipts_no_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX transaction_receipts_no_key ON app.transaction_receipts USING btree (receipt_no);


--
-- Name: transfer_requests_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX transfer_requests_merchant_idx ON app.transfer_requests USING btree (merchant_id, created_at DESC);


--
-- Name: transfer_requests_one_pending_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX transfer_requests_one_pending_key ON app.transfer_requests USING btree (merchant_id, requested_by) WHERE (status = 'pending'::text);


--
-- Name: transfer_requests_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX transfer_requests_status_idx ON app.transfer_requests USING btree (status, created_at DESC);


--
-- Name: user_payout_methods_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX user_payout_methods_status_idx ON app.user_payout_methods USING btree (status, updated_at DESC);


--
-- Name: user_payout_methods_user_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX user_payout_methods_user_key ON app.user_payout_methods USING btree (user_id);


--
-- Name: user_permissions_permission_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX user_permissions_permission_idx ON app.user_permissions USING btree (permission_key);


--
-- Name: users_phone_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX users_phone_key ON app.users USING btree (phone);


--
-- Name: users_team_id_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX users_team_id_idx ON app.users USING btree (team_id);


--
-- Name: visit_reports_client_visit_key; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX visit_reports_client_visit_key ON app.visit_reports USING btree (merchant_id, client_visit_id) WHERE (client_visit_id IS NOT NULL);


--
-- Name: visit_reports_merchant_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX visit_reports_merchant_idx ON app.visit_reports USING btree (merchant_id, created_at DESC);


--
-- Name: visit_reports_merchant_state_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX visit_reports_merchant_state_idx ON app.visit_reports USING btree (merchant_id, COALESCE(ended_at, started_at, created_at) DESC);


--
-- Name: visit_reports_rep_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX visit_reports_rep_idx ON app.visit_reports USING btree (rep_id, created_at DESC);


--
-- Name: visit_reports_team_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX visit_reports_team_idx ON app.visit_reports USING btree (team, created_at DESC);


--
-- Name: account_balances _RETURN; Type: RULE; Schema: app; Owner: -
--

CREATE OR REPLACE VIEW app.account_balances WITH (security_invoker='true') AS
 SELECT a.id,
    a.bank_name,
    a.account_name,
    a.account_number,
    a.iban,
    a.country_code,
    a.currency,
    a.city_id,
    a.active,
    (COALESCE(sum(
        CASE e.kind
            WHEN 'deposit'::text THEN e.amount_minor
            ELSE NULL::bigint
        END), (0)::numeric))::bigint AS deposits_minor,
    (COALESCE(sum(
        CASE e.kind
            WHEN 'expense'::text THEN e.amount_minor
            ELSE NULL::bigint
        END), (0)::numeric))::bigint AS expenses_minor,
    app.account_balance(a.id) AS balance_minor
   FROM (app.bank_accounts a
     LEFT JOIN app.ledger_entries e ON ((e.account_id = a.id)))
  GROUP BY a.id;


--
-- Name: journal_account_balances _RETURN; Type: RULE; Schema: app; Owner: -
--

CREATE OR REPLACE VIEW app.journal_account_balances WITH (security_invoker='true') AS
 SELECT a.id,
    a.code,
    a.name,
    a.type,
    a.currency,
    a.party_type,
    a.party_id,
    a.active,
    (COALESCE(sum(l.debit_minor), (0)::numeric))::bigint AS debit_total_minor,
    (COALESCE(sum(l.credit_minor), (0)::numeric))::bigint AS credit_total_minor,
    ((COALESCE(sum(l.debit_minor), (0)::numeric) - COALESCE(sum(l.credit_minor), (0)::numeric)))::bigint AS balance_minor
   FROM (app.accounts a
     LEFT JOIN app.journal_lines l ON ((l.account_id = a.id)))
  GROUP BY a.id;


--
-- Name: marketing_campaign_totals _RETURN; Type: RULE; Schema: app; Owner: -
--

CREATE OR REPLACE VIEW app.marketing_campaign_totals WITH (security_invoker='true') AS
 SELECT c.id,
    c.name,
    c.platform,
    c.channel,
    c.city_id,
    c.budget_minor,
    c.status,
    c.starts_on,
    c.ends_on,
    COALESCE(sum(e.spend_minor), (0)::numeric) AS spend_minor,
    COALESCE(sum(e.leads), (0)::numeric) AS leads,
    COALESCE(sum(e.conversions), (0)::numeric) AS conversions,
    GREATEST(((c.budget_minor)::numeric - COALESCE(sum(e.spend_minor), (0)::numeric)), (0)::numeric) AS budget_left_minor
   FROM (app.marketing_campaigns c
     LEFT JOIN app.marketing_entries e ON ((e.campaign_id = c.id)))
  GROUP BY c.id;


--
-- Name: audit_logs audit_logs_immutable; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_logs_immutable BEFORE UPDATE ON app.audit_logs FOR EACH ROW EXECUTE FUNCTION app.audit_log_immutable();


--
-- Name: capital_deposits capital_deposits_decide; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER capital_deposits_decide BEFORE INSERT OR UPDATE ON app.capital_deposits FOR EACH ROW EXECUTE FUNCTION app.capital_deposit_decide();


--
-- Name: capital_deposits capital_deposits_no_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER capital_deposits_no_delete BEFORE DELETE ON app.capital_deposits FOR EACH ROW EXECUTE FUNCTION app.capital_deposit_no_delete();


--
-- Name: catalog_products catalog_products_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER catalog_products_touch_updated_at BEFORE UPDATE ON app.catalog_products FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: cities cities_touch; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER cities_touch BEFORE UPDATE ON app.cities FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: commission_rates commission_rates_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER commission_rates_touch_updated_at BEFORE UPDATE ON app.commission_rates FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: contract_clauses contract_clauses_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contract_clauses_touch_updated_at BEFORE UPDATE ON app.contract_clauses FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: contract_commission_lines contract_commission_lines_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contract_commission_lines_touch_updated_at BEFORE UPDATE ON app.contract_commission_lines FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: contract_section_overrides contract_section_overrides_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contract_section_overrides_touch_updated_at BEFORE UPDATE ON app.contract_section_overrides FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: contracts contracts_terminal_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_terminal_guard BEFORE UPDATE ON app.contracts FOR EACH ROW EXECUTE FUNCTION app.contract_terminal_guard();


--
-- Name: contracts contracts_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_touch_updated_at BEFORE UPDATE ON app.contracts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: coupons coupons_enforce_funding; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER coupons_enforce_funding BEFORE INSERT OR UPDATE ON app.coupons FOR EACH ROW EXECUTE FUNCTION app.coupon_enforce_funding();


--
-- Name: journal_entries journal_entries_immutable_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER journal_entries_immutable_delete BEFORE DELETE ON app.journal_entries FOR EACH ROW EXECUTE FUNCTION app.journal_reject_mutation();


--
-- Name: journal_entries journal_entries_immutable_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER journal_entries_immutable_update BEFORE UPDATE ON app.journal_entries FOR EACH ROW EXECUTE FUNCTION app.journal_reject_mutation();


--
-- Name: journal_lines journal_lines_balanced; Type: TRIGGER; Schema: app; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR DELETE OR UPDATE ON app.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.journal_entry_balanced();


--
-- Name: journal_lines journal_lines_immutable_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER journal_lines_immutable_delete BEFORE DELETE ON app.journal_lines FOR EACH ROW EXECUTE FUNCTION app.journal_reject_mutation();


--
-- Name: journal_lines journal_lines_immutable_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER journal_lines_immutable_update BEFORE UPDATE ON app.journal_lines FOR EACH ROW EXECUTE FUNCTION app.journal_reject_mutation();


--
-- Name: kpi_snapshots kpi_snapshots_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER kpi_snapshots_guard BEFORE INSERT OR UPDATE ON app.kpi_snapshots FOR EACH ROW EXECUTE FUNCTION app.kpi_snapshots_guard();


--
-- Name: ledger_entries ledger_entries_enforce_currency; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER ledger_entries_enforce_currency BEFORE INSERT ON app.ledger_entries FOR EACH ROW EXECUTE FUNCTION app.ledger_enforce_account_currency();


--
-- Name: ledger_entries ledger_entries_immutable_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER ledger_entries_immutable_delete BEFORE DELETE ON app.ledger_entries FOR EACH ROW EXECUTE FUNCTION app.ledger_reject_mutation();


--
-- Name: ledger_entries ledger_entries_immutable_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER ledger_entries_immutable_update BEFORE UPDATE ON app.ledger_entries FOR EACH ROW EXECUTE FUNCTION app.ledger_reject_mutation();


--
-- Name: marketing_campaigns marketing_campaigns_terminal_status; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER marketing_campaigns_terminal_status BEFORE UPDATE ON app.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION app.marketing_campaign_terminal();


--
-- Name: marketing_entries marketing_entries_guard_insert; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER marketing_entries_guard_insert BEFORE INSERT ON app.marketing_entries FOR EACH ROW EXECUTE FUNCTION app.marketing_entry_guard();


--
-- Name: marketing_entries marketing_entries_immutable_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER marketing_entries_immutable_delete BEFORE DELETE ON app.marketing_entries FOR EACH ROW EXECUTE FUNCTION app.marketing_reject_mutation();


--
-- Name: marketing_entries marketing_entries_immutable_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER marketing_entries_immutable_update BEFORE UPDATE ON app.marketing_entries FOR EACH ROW EXECUTE FUNCTION app.marketing_reject_mutation();


--
-- Name: merchant_applications merchant_applications_guard_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER merchant_applications_guard_update BEFORE UPDATE ON app.merchant_applications FOR EACH ROW EXECUTE FUNCTION app.merchant_application_guard();


--
-- Name: merchant_state_overrides merchant_state_overrides_guard_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER merchant_state_overrides_guard_delete BEFORE DELETE ON app.merchant_state_overrides FOR EACH ROW EXECUTE FUNCTION app.merchant_state_override_guard();


--
-- Name: merchant_state_overrides merchant_state_overrides_guard_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER merchant_state_overrides_guard_update BEFORE UPDATE ON app.merchant_state_overrides FOR EACH ROW EXECUTE FUNCTION app.merchant_state_override_guard();


--
-- Name: merchants merchants_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER merchants_touch_updated_at BEFORE UPDATE ON app.merchants FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: operation_logs operation_logs_delete_journal; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER operation_logs_delete_journal BEFORE DELETE ON app.operation_logs FOR EACH ROW EXECUTE FUNCTION app.operation_delete_journal_entry();


--
-- Name: operation_logs operation_logs_freeze_amounts; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER operation_logs_freeze_amounts BEFORE INSERT ON app.operation_logs FOR EACH ROW EXECUTE FUNCTION app.operation_freeze_amounts();


--
-- Name: operation_logs operation_logs_immutable_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER operation_logs_immutable_update BEFORE UPDATE ON app.operation_logs FOR EACH ROW EXECUTE FUNCTION app.operation_log_guard();


--
-- Name: operation_logs operation_logs_post_journal; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER operation_logs_post_journal AFTER INSERT ON app.operation_logs FOR EACH ROW EXECUTE FUNCTION app.operation_post_journal();


--
-- Name: payroll_profiles payroll_profiles_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER payroll_profiles_touch_updated_at BEFORE UPDATE ON app.payroll_profiles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: user_payout_methods user_payout_methods_reset_decision; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER user_payout_methods_reset_decision BEFORE UPDATE ON app.user_payout_methods FOR EACH ROW EXECUTE FUNCTION app.payout_methods_reset_decision();


--
-- Name: user_payout_methods user_payout_methods_sync_status; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER user_payout_methods_sync_status AFTER INSERT OR UPDATE ON app.user_payout_methods FOR EACH ROW EXECUTE FUNCTION app.sync_bank_info_status();


--
-- Name: user_payout_methods user_payout_methods_touch; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER user_payout_methods_touch BEFORE UPDATE ON app.user_payout_methods FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: user_permissions user_permissions_governor_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE CONSTRAINT TRIGGER user_permissions_governor_guard AFTER INSERT OR DELETE OR UPDATE ON app.user_permissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.user_permissions_governor_guard();


--
-- Name: users users_governor_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE CONSTRAINT TRIGGER users_governor_guard AFTER DELETE OR UPDATE ON app.users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.users_governor_guard();


--
-- Name: users users_touch_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: visit_reports visit_reports_guard_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER visit_reports_guard_delete BEFORE DELETE ON app.visit_reports FOR EACH ROW EXECUTE FUNCTION app.visit_report_guard();


--
-- Name: visit_reports visit_reports_guard_update; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER visit_reports_guard_update BEFORE UPDATE ON app.visit_reports FOR EACH ROW EXECUTE FUNCTION app.visit_report_guard();


--
-- Name: accounts accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.accounts
    ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES app.accounts(id) ON DELETE RESTRICT;


--
-- Name: archived_reports archived_reports_archived_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.archived_reports
    ADD CONSTRAINT archived_reports_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: bank_accounts bank_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bank_accounts
    ADD CONSTRAINT bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: capital_deposits capital_deposits_account_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.capital_deposits
    ADD CONSTRAINT capital_deposits_account_id_fkey FOREIGN KEY (account_id) REFERENCES app.bank_accounts(id) ON DELETE RESTRICT;


--
-- Name: capital_deposits capital_deposits_decided_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.capital_deposits
    ADD CONSTRAINT capital_deposits_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: capital_deposits capital_deposits_founder_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.capital_deposits
    ADD CONSTRAINT capital_deposits_founder_id_fkey FOREIGN KEY (founder_id) REFERENCES app.users(id) ON DELETE RESTRICT;


--
-- Name: capital_deposits capital_deposits_ledger_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.capital_deposits
    ADD CONSTRAINT capital_deposits_ledger_entry_id_fkey FOREIGN KEY (ledger_entry_id) REFERENCES app.ledger_entries(id) ON DELETE RESTRICT;


--
-- Name: catalog_products catalog_products_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.catalog_products
    ADD CONSTRAINT catalog_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: catalog_products catalog_products_merchant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.catalog_products
    ADD CONSTRAINT catalog_products_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES app.merchants(id) ON DELETE CASCADE;


--
-- Name: catalog_products catalog_products_taxonomy_category_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.catalog_products
    ADD CONSTRAINT catalog_products_taxonomy_category_id_fkey FOREIGN KEY (taxonomy_category_id) REFERENCES app.taxonomy_categories(id) ON DELETE SET NULL;


--
-- Name: commission_rates commission_rates_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.commission_rates
    ADD CONSTRAINT commission_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: contract_clauses contract_clauses_contract_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_clauses
    ADD CONSTRAINT contract_clauses_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES app.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_commission_lines contract_commission_lines_contract_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_commission_lines
    ADD CONSTRAINT contract_commission_lines_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES app.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_section_overrides contract_section_overrides_contract_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contract_section_overrides
    ADD CONSTRAINT contract_section_overrides_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES app.contracts(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_drafted_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_drafted_by_fkey FOREIGN KEY (drafted_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_edited_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_signed_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_reverses_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_entries
    ADD CONSTRAINT journal_entries_reverses_entry_id_fkey FOREIGN KEY (reverses_entry_id) REFERENCES app.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES app.accounts(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.journal_lines
    ADD CONSTRAINT journal_lines_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES app.journal_entries(id) ON DELETE CASCADE;


--
-- Name: kpi_snapshots kpi_snapshots_rep_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES app.users(id) ON DELETE RESTRICT;


--
-- Name: ledger_entries ledger_entries_account_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ledger_entries
    ADD CONSTRAINT ledger_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES app.bank_accounts(id) ON DELETE RESTRICT;


--
-- Name: ledger_entries ledger_entries_recorded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ledger_entries
    ADD CONSTRAINT ledger_entries_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: marketing_campaigns marketing_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: marketing_entries marketing_entries_campaign_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_entries
    ADD CONSTRAINT marketing_entries_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES app.marketing_campaigns(id) ON DELETE RESTRICT;


--
-- Name: marketing_entries marketing_entries_recorded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_entries
    ADD CONSTRAINT marketing_entries_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: marketing_leads marketing_leads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_leads
    ADD CONSTRAINT marketing_leads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES app.marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: marketing_platform_settings marketing_platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.marketing_platform_settings
    ADD CONSTRAINT marketing_platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: merchant_state_overrides merchant_state_overrides_logged_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchant_state_overrides
    ADD CONSTRAINT merchant_state_overrides_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: merchant_v1_profiles merchant_v1_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchant_v1_profiles
    ADD CONSTRAINT merchant_v1_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: merchants merchants_contracted_by_team_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchants
    ADD CONSTRAINT merchants_contracted_by_team_id_fkey FOREIGN KEY (contracted_by_team_id) REFERENCES app.field_teams(id) ON DELETE RESTRICT;


--
-- Name: merchants merchants_first_entry_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.merchants
    ADD CONSTRAINT merchants_first_entry_by_fkey FOREIGN KEY (first_entry_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: notification_reads notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notification_reads
    ADD CONSTRAINT notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES app.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notification_reads
    ADD CONSTRAINT notification_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: operation_logs operation_logs_coupon_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.operation_logs
    ADD CONSTRAINT operation_logs_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES app.coupons(id) ON DELETE RESTRICT;


--
-- Name: operation_logs operation_logs_courier_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.operation_logs
    ADD CONSTRAINT operation_logs_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES app.couriers(id) ON DELETE RESTRICT;


--
-- Name: operation_logs operation_logs_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.operation_logs
    ADD CONSTRAINT operation_logs_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES app.journal_entries(id);


--
-- Name: operation_logs operation_logs_logged_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.operation_logs
    ADD CONSTRAINT operation_logs_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: operation_logs operation_logs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.operation_logs
    ADD CONSTRAINT operation_logs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES app.merchants(id) ON DELETE RESTRICT;


--
-- Name: payroll_commission_tiers payroll_commission_tiers_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_commission_tiers
    ADD CONSTRAINT payroll_commission_tiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.payroll_profiles(user_id) ON DELETE CASCADE;


--
-- Name: payroll_kpi_links payroll_kpi_links_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_kpi_links
    ADD CONSTRAINT payroll_kpi_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.payroll_profiles(user_id) ON DELETE CASCADE;


--
-- Name: payroll_lines payroll_lines_run_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_lines
    ADD CONSTRAINT payroll_lines_run_id_fkey FOREIGN KEY (run_id) REFERENCES app.payroll_runs(id) ON DELETE CASCADE;


--
-- Name: payroll_lines payroll_lines_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_lines
    ADD CONSTRAINT payroll_lines_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.payroll_profiles(user_id) ON DELETE RESTRICT;


--
-- Name: payroll_profiles payroll_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_profiles
    ADD CONSTRAINT payroll_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: payroll_runs payroll_runs_approved_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.payroll_runs
    ADD CONSTRAINT payroll_runs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: taxonomy_categories taxonomy_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.taxonomy_categories
    ADD CONSTRAINT taxonomy_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES app.taxonomy_categories(id) ON DELETE SET NULL;


--
-- Name: transaction_receipts transaction_receipts_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.transaction_receipts
    ADD CONSTRAINT transaction_receipts_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES app.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: transaction_receipts transaction_receipts_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.transaction_receipts
    ADD CONSTRAINT transaction_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: user_city_scope user_city_scope_granted_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_city_scope
    ADD CONSTRAINT user_city_scope_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: user_city_scope user_city_scope_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_city_scope
    ADD CONSTRAINT user_city_scope_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_payout_methods user_payout_methods_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_payout_methods
    ADD CONSTRAINT user_payout_methods_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: user_payout_methods user_payout_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_payout_methods
    ADD CONSTRAINT user_payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_permissions
    ADD CONSTRAINT user_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: user_permissions user_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_permissions
    ADD CONSTRAINT user_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES app.permissions(key) ON DELETE RESTRICT;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_team_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES app.field_teams(id) ON DELETE SET NULL;


--
-- Name: visit_reports visit_reports_logged_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.visit_reports
    ADD CONSTRAINT visit_reports_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: accounts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY accounts_read_capable ON app.accounts FOR SELECT TO authenticated USING ((app.has_permission('view_journal'::text) OR app.has_permission('view_accounts'::text) OR app.has_permission('manage_accounts'::text)));


--
-- Name: archived_reports; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.archived_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: archived_reports archived_reports_delete_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY archived_reports_delete_capable ON app.archived_reports FOR DELETE TO authenticated USING (app.has_permission('manage_archived_reports'::text));


--
-- Name: archived_reports archived_reports_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY archived_reports_insert_capable ON app.archived_reports FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_archived_reports'::text));


--
-- Name: archived_reports archived_reports_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY archived_reports_read_capable ON app.archived_reports FOR SELECT TO authenticated USING (app.has_permission('view_archived_reports'::text));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY audit_logs_read_capable ON app.audit_logs FOR SELECT TO authenticated USING (app.has_permission('view_audit_logs'::text));


--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts bank_accounts_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY bank_accounts_read_capable ON app.bank_accounts FOR SELECT TO authenticated USING ((app.can_read_ledger() OR (app.can_record_deposits() AND (country_code = 'EG'::bpchar))));


--
-- Name: bank_accounts bank_accounts_update_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY bank_accounts_update_capable ON app.bank_accounts FOR UPDATE TO authenticated USING (app.has_permission('manage_accounts'::text)) WITH CHECK (app.has_permission('manage_accounts'::text));


--
-- Name: bank_accounts bank_accounts_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY bank_accounts_write_capable ON app.bank_accounts FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_accounts'::text));


--
-- Name: capital_deposits; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.capital_deposits ENABLE ROW LEVEL SECURITY;

--
-- Name: capital_deposits capital_deposits_decide_finance; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY capital_deposits_decide_finance ON app.capital_deposits FOR UPDATE TO authenticated USING (app.can_manage_treasury()) WITH CHECK (app.can_manage_treasury());


--
-- Name: capital_deposits capital_deposits_insert_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY capital_deposits_insert_self ON app.capital_deposits FOR INSERT TO authenticated WITH CHECK (((founder_id = auth.uid()) AND (status = 'pending'::app.capital_deposit_status)));


--
-- Name: capital_deposits capital_deposits_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY capital_deposits_read ON app.capital_deposits FOR SELECT TO authenticated USING (((founder_id = auth.uid()) OR app.can_manage_treasury()));


--
-- Name: catalog_products; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.catalog_products ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_products catalog_products_read_active; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY catalog_products_read_active ON app.catalog_products FOR SELECT TO authenticated USING (app.is_active_user());


--
-- Name: cities; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.cities ENABLE ROW LEVEL SECURITY;

--
-- Name: cities cities_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY cities_read_capable ON app.cities FOR SELECT TO authenticated USING ((app.has_permission('view_cities'::text) OR app.has_permission('manage_cities'::text) OR app.has_permission('add_city'::text) OR app.has_permission('view_field_ops'::text) OR app.has_permission('start_end_visit'::text)));


--
-- Name: cities cities_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY cities_write_capable ON app.cities TO authenticated USING ((app.has_permission('manage_cities'::text) OR app.has_permission('add_city'::text))) WITH CHECK ((app.has_permission('manage_cities'::text) OR app.has_permission('add_city'::text)));


--
-- Name: commission_rates; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.commission_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rates commission_rates_delete_l4; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY commission_rates_delete_l4 ON app.commission_rates FOR DELETE TO authenticated USING (app.has_min_clearance(4));


--
-- Name: commission_rates commission_rates_insert_l4; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY commission_rates_insert_l4 ON app.commission_rates FOR INSERT TO authenticated WITH CHECK (app.has_min_clearance(4));


--
-- Name: commission_rates commission_rates_read_active; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY commission_rates_read_active ON app.commission_rates FOR SELECT TO authenticated USING (app.is_active_user());


--
-- Name: commission_rates commission_rates_write_l4; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY commission_rates_write_l4 ON app.commission_rates FOR UPDATE TO authenticated USING (app.has_min_clearance(4)) WITH CHECK (app.has_min_clearance(4));


--
-- Name: contract_clauses; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.contract_clauses ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_clauses contract_clauses_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contract_clauses_read ON app.contract_clauses FOR SELECT TO authenticated USING ((app.has_permission('view_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('sign_contract'::text) OR app.has_permission('sign_contracts'::text) OR app.has_permission('cancel_contract'::text) OR app.has_permission('delete_contracts'::text)));


--
-- Name: contract_clauses contract_clauses_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contract_clauses_write ON app.contract_clauses TO authenticated USING ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text))) WITH CHECK ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text)));


--
-- Name: contract_commission_lines; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.contract_commission_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_commission_lines contract_commission_lines_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contract_commission_lines_read ON app.contract_commission_lines FOR SELECT TO authenticated USING ((app.has_permission('view_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('sign_contract'::text) OR app.has_permission('sign_contracts'::text) OR app.has_permission('cancel_contract'::text) OR app.has_permission('delete_contracts'::text)));


--
-- Name: contract_commission_lines contract_commission_lines_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contract_commission_lines_write ON app.contract_commission_lines TO authenticated USING ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text))) WITH CHECK ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text)));


--
-- Name: contract_section_overrides; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.contract_section_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_section_overrides contract_section_overrides_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contract_section_overrides_read ON app.contract_section_overrides FOR SELECT TO authenticated USING ((app.has_permission('view_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('sign_contract'::text) OR app.has_permission('sign_contracts'::text) OR app.has_permission('cancel_contract'::text) OR app.has_permission('delete_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text)));


--
-- Name: contract_section_overrides contract_section_overrides_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contract_section_overrides_write ON app.contract_section_overrides TO authenticated USING ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text))) WITH CHECK ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_finalized_contracts'::text)));


--
-- Name: contracts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts contracts_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contracts_insert_capable ON app.contracts FOR INSERT TO authenticated WITH CHECK ((app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text)));


--
-- Name: contracts contracts_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contracts_read_capable ON app.contracts FOR SELECT TO authenticated USING ((app.has_permission('view_contracts'::text) OR app.has_permission('draft_contract'::text) OR app.has_permission('create_contracts'::text) OR app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('sign_contract'::text) OR app.has_permission('sign_contracts'::text) OR app.has_permission('cancel_contract'::text) OR app.has_permission('delete_contracts'::text)));


--
-- Name: contracts contracts_update_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY contracts_update_capable ON app.contracts FOR UPDATE TO authenticated USING ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('sign_contract'::text) OR app.has_permission('sign_contracts'::text) OR app.has_permission('cancel_contract'::text))) WITH CHECK ((app.has_permission('edit_contract'::text) OR app.has_permission('edit_contracts'::text) OR app.has_permission('sign_contract'::text) OR app.has_permission('sign_contracts'::text) OR app.has_permission('cancel_contract'::text)));


--
-- Name: coupons; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons_delete_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY coupons_delete_capable ON app.coupons FOR DELETE TO authenticated USING (app.has_permission('manage_coupons'::text));


--
-- Name: coupons coupons_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY coupons_insert_capable ON app.coupons FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_coupons'::text));


--
-- Name: coupons coupons_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY coupons_read_capable ON app.coupons FOR SELECT TO authenticated USING ((app.has_permission('view_coupons'::text) OR app.has_permission('log_operations'::text)));


--
-- Name: coupons coupons_update_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY coupons_update_capable ON app.coupons FOR UPDATE TO authenticated USING (app.has_permission('manage_coupons'::text)) WITH CHECK (app.has_permission('manage_coupons'::text));


--
-- Name: couriers; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.couriers ENABLE ROW LEVEL SECURITY;

--
-- Name: couriers couriers_delete_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY couriers_delete_capable ON app.couriers FOR DELETE TO authenticated USING (app.has_permission('manage_couriers'::text));


--
-- Name: couriers couriers_read_active; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY couriers_read_active ON app.couriers FOR SELECT TO authenticated USING (app.is_active_user());


--
-- Name: couriers couriers_update_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY couriers_update_capable ON app.couriers FOR UPDATE TO authenticated USING ((app.has_permission('manage_couriers'::text) OR app.has_permission('log_operations'::text) OR app.has_permission('manage_system_users'::text))) WITH CHECK ((app.has_permission('manage_couriers'::text) OR app.has_permission('log_operations'::text) OR app.has_permission('manage_system_users'::text)));


--
-- Name: couriers couriers_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY couriers_write_capable ON app.couriers FOR INSERT TO authenticated WITH CHECK ((app.has_permission('manage_couriers'::text) OR app.has_permission('log_operations'::text) OR app.has_permission('manage_system_users'::text)));


--
-- Name: edit_requests; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.edit_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: edit_requests edit_requests_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY edit_requests_read_capable ON app.edit_requests FOR SELECT TO authenticated USING ((app.has_permission('view_field_ops'::text) OR app.has_permission('view_all_teams_visits'::text) OR app.has_permission('approve_report_edits'::text)));


--
-- Name: edit_requests edit_requests_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY edit_requests_write_capable ON app.edit_requests TO authenticated USING ((app.has_permission('view_all_teams_visits'::text) OR app.has_permission('approve_report_edits'::text))) WITH CHECK ((app.has_permission('view_all_teams_visits'::text) OR app.has_permission('approve_report_edits'::text)));


--
-- Name: field_tasks; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.field_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: field_tasks field_tasks_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY field_tasks_read_capable ON app.field_tasks FOR SELECT TO authenticated USING ((app.has_permission('view_field_ops'::text) OR app.has_permission('start_end_visit'::text) OR app.has_permission('assign_tasks'::text)));


--
-- Name: field_tasks field_tasks_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY field_tasks_write_capable ON app.field_tasks TO authenticated USING ((app.has_permission('assign_tasks'::text) OR app.has_permission('start_end_visit'::text))) WITH CHECK ((app.has_permission('assign_tasks'::text) OR app.has_permission('start_end_visit'::text)));


--
-- Name: field_teams; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.field_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: field_teams field_teams_delete_city_manager; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY field_teams_delete_city_manager ON app.field_teams FOR DELETE TO authenticated USING (app.can_manage_city(city_id));


--
-- Name: field_teams field_teams_insert_city_manager; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY field_teams_insert_city_manager ON app.field_teams FOR INSERT TO authenticated WITH CHECK (app.can_manage_city(city_id));


--
-- Name: field_teams field_teams_read_active; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY field_teams_read_active ON app.field_teams FOR SELECT TO authenticated USING (app.is_active_user());


--
-- Name: field_teams field_teams_update_city_manager; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY field_teams_update_city_manager ON app.field_teams FOR UPDATE TO authenticated USING (app.can_manage_city(city_id)) WITH CHECK (app.can_manage_city(city_id));


--
-- Name: follow_up_tasks; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.follow_up_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_tasks follow_up_tasks_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY follow_up_tasks_read_capable ON app.follow_up_tasks FOR SELECT TO authenticated USING ((app.has_permission('view_field_ops'::text) OR app.has_permission('start_end_visit'::text) OR app.has_permission('assign_tasks'::text)));


--
-- Name: follow_up_tasks follow_up_tasks_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY follow_up_tasks_write_capable ON app.follow_up_tasks TO authenticated USING ((app.has_permission('start_end_visit'::text) OR app.has_permission('assign_tasks'::text))) WITH CHECK ((app.has_permission('start_end_visit'::text) OR app.has_permission('assign_tasks'::text)));


--
-- Name: journal_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries journal_entries_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY journal_entries_insert_capable ON app.journal_entries FOR INSERT TO authenticated WITH CHECK (app.has_permission('post_journal_entries'::text));


--
-- Name: journal_entries journal_entries_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY journal_entries_read_capable ON app.journal_entries FOR SELECT TO authenticated USING ((app.has_permission('view_journal'::text) OR app.has_permission('view_accounts'::text)));


--
-- Name: journal_lines; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.journal_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_lines journal_lines_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY journal_lines_insert_capable ON app.journal_lines FOR INSERT TO authenticated WITH CHECK (app.has_permission('post_journal_entries'::text));


--
-- Name: journal_lines journal_lines_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY journal_lines_read_capable ON app.journal_lines FOR SELECT TO authenticated USING ((app.has_permission('view_journal'::text) OR app.has_permission('view_accounts'::text)));


--
-- Name: kpi_snapshots; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.kpi_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_snapshots kpi_snapshots_read_self_or_exec; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY kpi_snapshots_read_self_or_exec ON app.kpi_snapshots FOR SELECT TO authenticated USING (((rep_id = auth.uid()) OR app.has_min_clearance(3)));


--
-- Name: kpi_snapshots kpi_snapshots_update_l4; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY kpi_snapshots_update_l4 ON app.kpi_snapshots FOR UPDATE TO authenticated USING (app.has_min_clearance(4)) WITH CHECK (app.has_min_clearance(4));


--
-- Name: ledger_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.ledger_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: ledger_entries ledger_entries_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY ledger_entries_insert_capable ON app.ledger_entries FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_accounts'::text));


--
-- Name: ledger_entries ledger_entries_insert_deposits; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY ledger_entries_insert_deposits ON app.ledger_entries FOR INSERT TO authenticated WITH CHECK ((app.can_record_deposits() AND (kind = 'deposit'::text) AND (EXISTS ( SELECT 1
   FROM app.bank_accounts a
  WHERE ((a.id = ledger_entries.account_id) AND (a.country_code = 'EG'::bpchar))))));


--
-- Name: ledger_entries ledger_entries_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY ledger_entries_read_capable ON app.ledger_entries FOR SELECT TO authenticated USING ((app.can_read_ledger() OR (app.can_record_deposits() AND (kind = 'deposit'::text) AND (EXISTS ( SELECT 1
   FROM app.bank_accounts a
  WHERE ((a.id = ledger_entries.account_id) AND (a.country_code = 'EG'::bpchar)))))));


--
-- Name: marketing_campaigns; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.marketing_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_campaigns marketing_campaigns_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_campaigns_insert ON app.marketing_campaigns FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: marketing_campaigns marketing_campaigns_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_campaigns_read ON app.marketing_campaigns FOR SELECT TO authenticated USING (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: marketing_campaigns marketing_campaigns_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_campaigns_update ON app.marketing_campaigns FOR UPDATE TO authenticated USING (app.has_permission('manage_marketing_metrics'::text)) WITH CHECK (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: marketing_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.marketing_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_entries marketing_entries_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_entries_insert ON app.marketing_entries FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: marketing_entries marketing_entries_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_entries_read ON app.marketing_entries FOR SELECT TO authenticated USING (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: marketing_leads; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.marketing_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_leads marketing_leads_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_leads_read_capable ON app.marketing_leads FOR SELECT TO authenticated USING ((app.has_permission('view_marketing_leads'::text) OR app.has_permission('view_campaigns'::text)));


--
-- Name: marketing_leads marketing_leads_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_leads_write_capable ON app.marketing_leads TO authenticated USING (app.has_permission('manage_marketing_leads'::text)) WITH CHECK (app.has_permission('manage_marketing_leads'::text));


--
-- Name: marketing_platform_settings; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.marketing_platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_platform_settings marketing_settings_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_settings_read ON app.marketing_platform_settings FOR SELECT TO authenticated USING (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: marketing_platform_settings marketing_settings_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY marketing_settings_write ON app.marketing_platform_settings TO authenticated USING (app.has_permission('manage_marketing_metrics'::text)) WITH CHECK (app.has_permission('manage_marketing_metrics'::text));


--
-- Name: merchant_applications; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.merchant_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_applications merchant_applications_public_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_applications_public_insert ON app.merchant_applications FOR INSERT TO anon WITH CHECK (((status = 'pending'::text) AND ((length(btrim(store_name)) >= 2) AND (length(btrim(store_name)) <= 160)) AND ((length(btrim(contact_person)) >= 2) AND (length(btrim(contact_person)) <= 120)) AND (phone_number ~ '^[0-9]{8,15}$'::text) AND ((length(btrim(business_type)) >= 2) AND (length(btrim(business_type)) <= 120))));


--
-- Name: merchant_applications merchant_applications_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_applications_read_capable ON app.merchant_applications FOR SELECT TO authenticated USING ((app.is_active_user() AND app.has_permission('manage_merchant_applications'::text)));


--
-- Name: merchant_applications merchant_applications_update_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_applications_update_capable ON app.merchant_applications FOR UPDATE TO authenticated USING ((app.is_active_user() AND app.has_permission('manage_merchant_applications'::text))) WITH CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'approved'::text, 'rejected'::text])));


--
-- Name: merchant_state_overrides; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.merchant_state_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_state_overrides merchant_state_overrides_insert_contract; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_state_overrides_insert_contract ON app.merchant_state_overrides FOR INSERT TO authenticated WITH CHECK ((app.is_active_user() AND app.has_permission('edit_contract'::text)));


--
-- Name: merchant_state_overrides merchant_state_overrides_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_state_overrides_read_capable ON app.merchant_state_overrides FOR SELECT TO authenticated USING ((app.is_active_user() AND (app.has_permission('view_merchants'::text) OR app.has_permission('view_all_teams_visits'::text))));


--
-- Name: merchant_v1_profiles; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.merchant_v1_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_v1_profiles merchant_v1_profiles_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_v1_profiles_read_capable ON app.merchant_v1_profiles FOR SELECT TO authenticated USING ((app.is_active_user() AND (app.has_permission('view_merchants'::text) OR app.has_permission('view_all_teams_visits'::text))));


--
-- Name: merchant_v1_profiles merchant_v1_profiles_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchant_v1_profiles_write_capable ON app.merchant_v1_profiles TO authenticated USING ((app.is_active_user() AND (app.has_permission('edit_merchant_socials'::text) OR app.has_permission('toggle_app_publish'::text) OR app.has_permission('manage_vip_menu'::text) OR app.has_permission('export_merchant_data'::text)))) WITH CHECK ((app.is_active_user() AND (app.has_permission('edit_merchant_socials'::text) OR app.has_permission('toggle_app_publish'::text) OR app.has_permission('manage_vip_menu'::text) OR app.has_permission('export_merchant_data'::text))));


--
-- Name: merchants; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.merchants ENABLE ROW LEVEL SECURITY;

--
-- Name: merchants merchants_read_active; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY merchants_read_active ON app.merchants FOR SELECT TO authenticated USING (app.is_active_user());


--
-- Name: notification_reads; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.notification_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_reads notification_reads_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY notification_reads_self ON app.notification_reads TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_read_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY notifications_read_self ON app.notifications FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR ((user_id IS NULL) AND app.is_active_user())));


--
-- Name: notifications notifications_update_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY notifications_update_self ON app.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: operation_logs; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.operation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_logs operation_logs_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY operation_logs_insert_capable ON app.operation_logs FOR INSERT TO authenticated WITH CHECK (app.has_permission('log_operations'::text));


--
-- Name: operation_logs operation_logs_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY operation_logs_read_capable ON app.operation_logs FOR SELECT TO authenticated USING ((app.has_permission('log_operations'::text) OR app.has_permission('view_clearinghouse'::text) OR app.has_permission('settle_clearinghouse'::text) OR app.has_permission('view_operations_kpi'::text)));


--
-- Name: payroll_commission_tiers; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.payroll_commission_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_kpi_links; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.payroll_kpi_links ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_kpi_links payroll_kpi_links_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_kpi_links_read ON app.payroll_kpi_links FOR SELECT TO authenticated USING (app.has_permission('view_payroll'::text));


--
-- Name: payroll_kpi_links payroll_kpi_links_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_kpi_links_write ON app.payroll_kpi_links TO authenticated USING (app.has_permission('manage_payroll'::text)) WITH CHECK (app.has_permission('manage_payroll'::text));


--
-- Name: payroll_lines; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.payroll_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_lines payroll_lines_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_lines_read ON app.payroll_lines FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app.has_permission('view_payroll'::text)));


--
-- Name: payroll_lines payroll_lines_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_lines_write ON app.payroll_lines TO authenticated USING (app.has_permission('manage_payroll'::text)) WITH CHECK (app.has_permission('manage_payroll'::text));


--
-- Name: payroll_profiles; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.payroll_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_profiles payroll_profiles_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_profiles_read ON app.payroll_profiles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app.has_permission('view_payroll'::text)));


--
-- Name: payroll_profiles payroll_profiles_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_profiles_write ON app.payroll_profiles TO authenticated USING (app.has_permission('manage_payroll'::text)) WITH CHECK (app.has_permission('manage_payroll'::text));


--
-- Name: payroll_runs; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.payroll_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_runs payroll_runs_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_runs_read ON app.payroll_runs FOR SELECT TO authenticated USING (app.has_permission('view_payroll'::text));


--
-- Name: payroll_runs payroll_runs_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_runs_write ON app.payroll_runs TO authenticated USING (app.has_permission('manage_payroll'::text)) WITH CHECK (app.has_permission('manage_payroll'::text));


--
-- Name: payroll_commission_tiers payroll_tiers_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_tiers_read ON app.payroll_commission_tiers FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app.has_permission('view_payroll'::text)));


--
-- Name: payroll_commission_tiers payroll_tiers_write; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY payroll_tiers_write ON app.payroll_commission_tiers TO authenticated USING (app.has_permission('manage_payroll'::text)) WITH CHECK (app.has_permission('manage_payroll'::text));


--
-- Name: permissions; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_read_active; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY permissions_read_active ON app.permissions FOR SELECT TO authenticated USING (app.is_active_user());


--
-- Name: transaction_receipts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.transaction_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_receipts transaction_receipts_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY transaction_receipts_insert_capable ON app.transaction_receipts FOR INSERT TO authenticated WITH CHECK ((app.has_permission('post_journal_entries'::text) OR app.has_permission('settle_clearinghouse'::text)));


--
-- Name: transaction_receipts transaction_receipts_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY transaction_receipts_read_capable ON app.transaction_receipts FOR SELECT TO authenticated USING ((app.has_permission('view_journal'::text) OR app.has_permission('view_clearinghouse'::text)));


--
-- Name: transfer_requests; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.transfer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_requests transfer_requests_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY transfer_requests_read_capable ON app.transfer_requests FOR SELECT TO authenticated USING ((app.has_permission('view_field_ops'::text) OR app.has_permission('request_ownership_transfer'::text) OR app.has_permission('approve_ownership_transfer'::text)));


--
-- Name: transfer_requests transfer_requests_write_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY transfer_requests_write_capable ON app.transfer_requests TO authenticated USING ((app.has_permission('request_ownership_transfer'::text) OR app.has_permission('approve_ownership_transfer'::text))) WITH CHECK ((app.has_permission('request_ownership_transfer'::text) OR app.has_permission('approve_ownership_transfer'::text)));


--
-- Name: user_city_scope; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.user_city_scope ENABLE ROW LEVEL SECURITY;

--
-- Name: user_city_scope user_city_scope_read_self_or_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_city_scope_read_self_or_governor ON app.user_city_scope FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app.has_permission('manage_system_users'::text)));


--
-- Name: user_city_scope user_city_scope_write_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_city_scope_write_governor ON app.user_city_scope TO authenticated USING (app.has_permission('manage_system_users'::text)) WITH CHECK (app.has_permission('manage_system_users'::text));


--
-- Name: user_payout_methods; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.user_payout_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: user_payout_methods user_payout_methods_delete_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_payout_methods_delete_self ON app.user_payout_methods FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_payout_methods user_payout_methods_insert_self; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_payout_methods_insert_self ON app.user_payout_methods FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::app.bank_info_status)));


--
-- Name: user_payout_methods user_payout_methods_read; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_payout_methods_read ON app.user_payout_methods FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app.can_manage_treasury()));


--
-- Name: user_payout_methods user_payout_methods_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_payout_methods_update ON app.user_payout_methods FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR app.can_manage_treasury())) WITH CHECK (((user_id = auth.uid()) OR app.can_manage_treasury()));


--
-- Name: user_permissions; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_permissions user_permissions_read_self_or_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_permissions_read_self_or_governor ON app.user_permissions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app.has_permission('manage_system_users'::text)));


--
-- Name: user_permissions user_permissions_write_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY user_permissions_write_governor ON app.user_permissions TO authenticated USING (app.has_permission('manage_system_users'::text)) WITH CHECK (app.has_permission('manage_system_users'::text));


--
-- Name: users; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_auth_mirror_insert; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_auth_mirror_insert ON app.users FOR INSERT TO postgres WITH CHECK (true);


--
-- Name: users users_auth_mirror_select; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_auth_mirror_select ON app.users FOR SELECT TO postgres USING (true);


--
-- Name: users users_auth_mirror_update; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_auth_mirror_update ON app.users FOR UPDATE TO postgres USING (true) WITH CHECK (true);


--
-- Name: users users_delete_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_delete_governor ON app.users FOR DELETE TO authenticated USING (app.has_permission('manage_system_users'::text));


--
-- Name: users users_insert_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_insert_governor ON app.users FOR INSERT TO authenticated WITH CHECK (app.has_permission('manage_system_users'::text));


--
-- Name: users users_read_self_or_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_read_self_or_governor ON app.users FOR SELECT TO authenticated USING (((id = auth.uid()) OR app.has_permission('manage_system_users'::text)));


--
-- Name: users users_write_governor; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY users_write_governor ON app.users FOR UPDATE TO authenticated USING (app.has_permission('manage_system_users'::text)) WITH CHECK (app.has_permission('manage_system_users'::text));


--
-- Name: visit_reports; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.visit_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_reports visit_reports_insert_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY visit_reports_insert_capable ON app.visit_reports FOR INSERT TO authenticated WITH CHECK ((app.is_active_user() AND app.has_permission('view_all_teams_visits'::text)));


--
-- Name: visit_reports visit_reports_read_capable; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY visit_reports_read_capable ON app.visit_reports FOR SELECT TO authenticated USING ((app.is_active_user() AND (app.has_permission('view_all_teams_visits'::text) OR app.has_permission('view_merchants'::text))));


--
-- PostgreSQL database dump complete
--

\unrestrict newqOnwqVu5eB258qBjM6GRDAocfd9PpjDbOTmoVdSAIkUNl5vvp0V5TxIv190L

