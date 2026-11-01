begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Re-runnable against a database that already carries the V1 deployment.
 * Tables are created only when absent and then widened column by column,
 * indexes use `if not exists`, functions and views are replaced, and every
 * policy and trigger is dropped before it is recreated.
 * ───────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
 * Pillar 1 — operator profile and founder capital.
 *
 * Three additions:
 *
 *   1. `app.users` gains `avatar_url` and `bank_info_status`. Profile detail
 *      belongs beside the identity row it describes, so reading an operator
 *      never needs a second round trip or a left join that can fail.
 *
 *   2. `app.user_payout_methods` is the operator's single salary destination:
 *      a bank account, an e-wallet, or InstaPay. Editing a method after it was
 *      approved moves it back to `pending`, so a changed IBAN is never paid
 *      against a decision taken on the previous one.
 *
 *   3. `app.capital_deposits` records founder capital entering the company.
 *      Approval appends exactly one immutable ledger entry to the treasury, in
 *      the same transaction. The treasury remains the single source of truth
 *      for balances: this table never carries a running total.
 *
 * Money stays in minor units (`bigint`) on the ledger; the deposit row keeps
 * the same unit so the two can never disagree by a rounding step.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── Enums ─────────────────────────────────────────────────────────────── */

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'app' and t.typname = 'bank_info_status'
  ) then
    create type app.bank_info_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'app' and t.typname = 'payout_method_kind'
  ) then
    create type app.payout_method_kind as enum ('bank_account', 'e_wallet', 'instapay');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'app' and t.typname = 'capital_deposit_status'
  ) then
    create type app.capital_deposit_status as enum ('pending', 'approved', 'rejected');
  end if;
end;
$$;

/* ── 1. Profile columns on the identity row ────────────────────────────── */

alter table app.users
  add column if not exists avatar_url       text,
  add column if not exists bank_info_status app.bank_info_status
    not null default 'pending';

comment on column app.users.avatar_url is
  'Public URL of the operator avatar in the avatars bucket. Null renders initials.';
comment on column app.users.bank_info_status is
  'Derived from the operator payout method decision. Never set by the operator themselves.';

/* Shape guard: either no avatar, or an absolute https URL of sane length.
 * A data: URL is rejected on purpose — avatars are uploaded to storage, so a
 * base64 blob must never land in a profile row. */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'app.users'::regclass
      and conname = 'users_avatar_url_shape'
  ) then
    alter table app.users
      add constraint users_avatar_url_shape check (
        avatar_url is null
        or (avatar_url ~ '^https://' and length(avatar_url) <= 2048)
      );
  end if;
end;
$$;

/* ── 2. Payout methods ─────────────────────────────────────────────────── */

create table if not exists app.user_payout_methods (
  id              uuid                     primary key default gen_random_uuid(),
  user_id         uuid                     not null references app.users (id) on delete cascade,
  method          app.payout_method_kind   not null,
  bank_name       text,
  account_holder  text,
  account_number  text,
  iban            text,
  wallet_provider text,
  wallet_phone    text,
  instapay_type   text,
  instapay_value  text,
  status          app.bank_info_status     not null default 'pending',
  reviewed_by     uuid                     references app.users (id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz              not null default now(),
  updated_at      timestamptz              not null default now()
);

/* Reconciliation: a pre-existing table from the V1 deployment is
 * widened to this contract instead of being skipped wholesale. */
alter table app.user_payout_methods
  add column if not exists id              uuid                   default gen_random_uuid(),
  add column if not exists user_id         uuid                   references app.users (id) on delete cascade,
  add column if not exists method          app.payout_method_kind,
  add column if not exists bank_name       text,
  add column if not exists account_holder  text,
  add column if not exists account_number  text,
  add column if not exists iban            text,
  add column if not exists wallet_provider text,
  add column if not exists wallet_phone    text,
  add column if not exists instapay_type   text,
  add column if not exists instapay_value  text,
  add column if not exists status          app.bank_info_status   not null default 'pending',
  add column if not exists reviewed_by     uuid                   references app.users (id) on delete set null,
  add column if not exists reviewed_at     timestamptz,
  add column if not exists created_at      timestamptz            not null default now(),
  add column if not exists updated_at      timestamptz            not null default now();

comment on table app.user_payout_methods is
  'One salary destination per operator. A change after approval returns the row to pending.';
comment on column app.user_payout_methods.iban is
  'Normalized, unspaced, uppercase IBAN for a bank account payout.';

/* One method per operator: the legacy flow kept a single financial profile,
 * and paying into two destinations would need a split rule that does not exist. */
create unique index if not exists user_payout_methods_user_key
  on app.user_payout_methods (user_id);

create index if not exists user_payout_methods_status_idx
  on app.user_payout_methods (status, updated_at desc);

/* Method-specific shape. Only the columns that belong to the chosen method may
 * carry a value, so a row can never describe a bank account and a wallet at
 * once and leave the payer guessing which one is live. */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'app.user_payout_methods'::regclass
      and conname = 'user_payout_methods_shape'
  ) then
    alter table app.user_payout_methods
      add constraint user_payout_methods_shape check (
        case method
          when 'bank_account' then
            length(btrim(coalesce(bank_name, ''))) > 0
            and length(btrim(coalesce(account_holder, ''))) > 0
            and length(btrim(coalesce(account_number, ''))) > 0
            and iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'
            and wallet_provider is null and wallet_phone is null
            and instapay_type is null and instapay_value is null
          when 'e_wallet' then
            length(btrim(coalesce(wallet_provider, ''))) > 0
            and wallet_phone ~ '^01[0125][0-9]{8}$'
            and bank_name is null and account_holder is null
            and account_number is null and iban is null
            and instapay_type is null and instapay_value is null
          when 'instapay' then
            instapay_type in ('ipa', 'phone')
            and length(btrim(coalesce(instapay_value, ''))) > 0
            and bank_name is null and account_holder is null
            and account_number is null and iban is null
            and wallet_provider is null and wallet_phone is null
        end
      );
  end if;
end;
$$;

/* A decision always carries who and when. */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'app.user_payout_methods'::regclass
      and conname = 'user_payout_methods_decision_shape'
  ) then
    alter table app.user_payout_methods
      add constraint user_payout_methods_decision_shape check (
        (status = 'pending') = (reviewed_at is null)
      );
  end if;
end;
$$;

drop trigger if exists user_payout_methods_touch on app.user_payout_methods;
create trigger user_payout_methods_touch
before update on app.user_payout_methods
for each row execute function app.touch_updated_at();

/* Any material edit invalidates the previous decision. Without this a reviewer
 * could approve one IBAN and the operator could then replace it, leaving an
 * approved badge on a destination nobody vetted. */
create or replace function app.payout_methods_reset_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    -- A transition is a decision; it must come from a reviewer, never from the
    -- row's owner. auth.uid() is NULL for the service role, which is how the
    -- approval route connects.
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

  -- Detail changed without an explicit decision: the row needs a fresh review.
  if row(
    new.method, new.bank_name, new.account_holder, new.account_number,
    new.iban, new.wallet_provider, new.wallet_phone, new.instapay_type,
    new.instapay_value
  ) is distinct from row(
    old.method, old.bank_name, old.account_holder, old.account_number,
    old.iban, old.wallet_provider, old.wallet_phone, old.instapay_type,
    old.instapay_value
  ) then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists user_payout_methods_reset_decision on app.user_payout_methods;
create trigger user_payout_methods_reset_decision
before update on app.user_payout_methods
for each row execute function app.payout_methods_reset_decision();

/* Mirror the decision onto the profile so the topbar and any capability check
 * can read one column instead of joining the payout table.
 *
 * The trigger fires on every update rather than `update of status`: a
 * detail-only edit resets the status inside a BEFORE trigger, which the
 * column-specific event would not see, leaving the profile mirror stale. */
create or replace function app.sync_bank_info_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

drop trigger if exists user_payout_methods_sync_status on app.user_payout_methods;
create trigger user_payout_methods_sync_status
after insert or update on app.user_payout_methods
for each row execute function app.sync_bank_info_status();

/* ── 3. Founder capital deposits ───────────────────────────────────────── */

create table if not exists app.capital_deposits (
  id              uuid                       primary key default gen_random_uuid(),
  founder_id      uuid                       not null references app.users (id) on delete restrict,
  account_id      uuid                       references app.bank_accounts (id) on delete restrict,
  amount_minor    bigint                     not null,
  currency        char(3)                    not null,
  receipt_path    text,
  note            text                       not null default '',
  status          app.capital_deposit_status not null default 'pending',
  decided_by      uuid                       references app.users (id) on delete set null,
  decided_at      timestamptz,
  ledger_entry_id uuid                       references app.ledger_entries (id) on delete restrict,
  created_at      timestamptz                not null default now(),
  constraint capital_deposits_amount_positive check (amount_minor > 0),
  constraint capital_deposits_currency_allowed check (currency in ('EGP', 'SAR')),
  constraint capital_deposits_decision_shape check (
    (status = 'pending') = (decided_at is null)
  ),
  constraint capital_deposits_approved_shape check (
    status <> 'approved' or (
      account_id is not null
      and ledger_entry_id is not null
      and decided_by is not null
    )
  )
);

/* Reconciliation: a pre-existing table from the V1 deployment is
 * widened to this contract instead of being skipped wholesale. */
alter table app.capital_deposits
  add column if not exists id              uuid                       default gen_random_uuid(),
  add column if not exists founder_id      uuid                       references app.users (id) on delete restrict,
  add column if not exists account_id      uuid                       references app.bank_accounts (id) on delete restrict,
  add column if not exists amount_minor    bigint,
  add column if not exists currency        char(3),
  add column if not exists receipt_path    text,
  add column if not exists note            text                       not null default '',
  add column if not exists status          app.capital_deposit_status not null default 'pending',
  add column if not exists decided_by      uuid                       references app.users (id) on delete set null,
  add column if not exists decided_at      timestamptz,
  add column if not exists ledger_entry_id uuid                       references app.ledger_entries (id) on delete restrict,
  add column if not exists created_at      timestamptz                not null default now();

comment on table app.capital_deposits is
  'Founder capital entering the company. Approval appends one immutable ledger entry; the deposit row never stores a balance.';
comment on column app.capital_deposits.amount_minor is
  'Positive minor units (piastres/halalas), the same unit the ledger uses.';
comment on column app.capital_deposits.receipt_path is
  'Object path in the private capital-receipts bucket. Reads go through a signed URL.';

create index if not exists capital_deposits_founder_idx
  on app.capital_deposits (founder_id, created_at desc);

create index if not exists capital_deposits_status_idx
  on app.capital_deposits (status, created_at desc);

/* One ledger entry per approved deposit, so a retry can never double-credit. */
create unique index if not exists capital_deposits_ledger_key
  on app.capital_deposits (ledger_entry_id)
  where ledger_entry_id is not null;

/* ── Approval writes the ledger entry in the same transaction ──────────── */

create or replace function app.capital_deposit_decide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid;
  account_currency char(3);
  founder_name text;
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
    -- No decision. Money terms are frozen once the row exists: the only thing
    -- a later update may do is attach the decision.
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

  /* Segregation of duties: the founder who placed the capital can never be the
   * one who credits it to the treasury. Rank alone cannot express this, because
   * a founder sits at clearance 3 and outranks nobody on their own money. */
  if new.decided_by = old.founder_id then
    raise exception
      'CAPITAL_DEPOSIT_SELF_REVIEW: a founder cannot approve their own capital deposit'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.users
    where id = new.decided_by and active
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

    insert into app.ledger_entries (
      account_id, kind, label, amount_minor, currency, occurred_at, recorded_by
    ) values (
      new.account_id,
      'deposit',
      format('إيداع رأسمالي — %s', coalesce(nullif(btrim(founder_name), ''), 'مؤسس')),
      new.amount_minor,
      new.currency,
      now(),
      new.decided_by
    )
    returning id into entry_id;

    new.ledger_entry_id := entry_id;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists capital_deposits_decide on app.capital_deposits;
create trigger capital_deposits_decide
before insert or update on app.capital_deposits
for each row execute function app.capital_deposit_decide();

/* A decided deposit is financial history. */
create or replace function app.capital_deposit_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception
      'CAPITAL_DEPOSIT_IMMUTABLE: a decided deposit cannot be deleted'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists capital_deposits_no_delete on app.capital_deposits;
create trigger capital_deposits_no_delete
before delete on app.capital_deposits
for each row execute function app.capital_deposit_no_delete();

/* ── Row Level Security ────────────────────────────────────────────────── */

alter table app.user_payout_methods enable row level security;
alter table app.capital_deposits    enable row level security;

alter table app.user_payout_methods force row level security;
alter table app.capital_deposits    force row level security;

/* Payout methods: the owner reads and writes their own row; finance (rank 3+)
 * reads every row and records the decision. */
drop policy if exists user_payout_methods_read on app.user_payout_methods;
create policy user_payout_methods_read on app.user_payout_methods
  for select to authenticated
  using (user_id = auth.uid() or app.has_min_clearance(3));

drop policy if exists user_payout_methods_insert_self on app.user_payout_methods;
create policy user_payout_methods_insert_self on app.user_payout_methods
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists user_payout_methods_update on app.user_payout_methods;
create policy user_payout_methods_update on app.user_payout_methods
  for update to authenticated
  using (user_id = auth.uid() or app.has_min_clearance(3))
  with check (user_id = auth.uid() or app.has_min_clearance(3));

drop policy if exists user_payout_methods_delete_self on app.user_payout_methods;
create policy user_payout_methods_delete_self on app.user_payout_methods
  for delete to authenticated
  using (user_id = auth.uid());

/* Capital deposits: a founder files their own deposit and reads it back.
 * Treasury authority (`manage_accounts`) reads every deposit and records the
 * decision. Insert is always pending — approval is the only path that can name
 * an account. */
drop policy if exists capital_deposits_read on app.capital_deposits;
create policy capital_deposits_read on app.capital_deposits
  for select to authenticated
  using (founder_id = auth.uid() or app.has_permission('manage_accounts'));

drop policy if exists capital_deposits_insert_self on app.capital_deposits;
create policy capital_deposits_insert_self on app.capital_deposits
  for insert to authenticated
  with check (founder_id = auth.uid() and status = 'pending');

/* The decision is a treasury write, so it follows the same capability that
 * gates every other ledger movement: `manage_accounts`. Rank is not enough —
 * a founder is clearance 3 and must not credit their own capital. The
 * self-review ban itself lives in the trigger, because a policy cannot compare
 * the row's founder to the acting operator across the UPDATE's target row. */
drop policy if exists capital_deposits_decide_finance on app.capital_deposits;
create policy capital_deposits_decide_finance on app.capital_deposits
  for update to authenticated
  using (app.has_permission('manage_accounts'))
  with check (app.has_permission('manage_accounts'));

/* ── Table privileges ──────────────────────────────────────────────────── */

grant select, insert, update, delete on app.user_payout_methods to authenticated;
grant select, insert, update on app.capital_deposits to authenticated;

grant select, insert, update, delete on app.user_payout_methods,
  app.capital_deposits to service_role;

/* ── Storage buckets ───────────────────────────────────────────────────── */

/* Supabase-only: a stock PostgreSQL has no `storage` schema, so every statement
 * is guarded. Avatars are public (rendered in the shell); receipts are private
 * and read through a signed URL generated by the server. */
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('capital-receipts', 'capital-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update
      set public             = excluded.public,
          file_size_limit    = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

commit;
