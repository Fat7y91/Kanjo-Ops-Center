begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Bank accounts and the immutable money ledger.
 *
 * Balance is never stored: it is the sum of deposits minus the sum of expenses
 * over `app.ledger_entries`. That makes a wrong balance impossible without a
 * wrong entry, and an entry can never be edited or removed.
 *
 * Money is stored in minor units (integer cents/halalas) so no float rounding
 * can ever create or destroy value. The account currency decides the unit, and
 * a ledger entry inherits its account's currency, so a ledger can never mix
 * denominations.
 * ───────────────────────────────────────────────────────────────────────── */

create table app.bank_accounts (
  id             uuid        primary key default gen_random_uuid(),
  bank_name      text        not null,
  account_name   text        not null,
  account_number text        not null,
  iban           text        not null,
  country_code   char(2)     not null,
  currency       char(3)     not null,
  city_id        text,
  active         boolean     not null default true,
  created_by     uuid        references app.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint bank_accounts_country_allowed check (country_code in ('EG', 'SA')),
  constraint bank_accounts_currency_allowed check (currency in ('EGP', 'SAR')),
  constraint bank_accounts_currency_matches_country check (
    (country_code = 'EG' and currency = 'EGP') or
    (country_code = 'SA' and currency = 'SAR')
  ),
  constraint bank_accounts_iban_shape check (iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'),
  constraint bank_accounts_account_number_present
    check (length(btrim(account_number)) > 0),
  constraint bank_accounts_bank_present check (length(btrim(bank_name)) > 0)
);

comment on table app.bank_accounts is
  'Company bank accounts. Currency is derived from the country and enforced by a check.';
comment on column app.bank_accounts.city_id is
  'Firestore city document id. No FK by design: cross-database reference.';
comment on column app.bank_accounts.iban is
  'Normalized, unspaced, uppercase IBAN. Unique per currency.';

create unique index bank_accounts_iban_key
  on app.bank_accounts (iban);

create index bank_accounts_active_idx
  on app.bank_accounts (active, country_code);

/* ─────────────────────────────────────────────────────────────────────────
 * Ledger: append-only. Amounts are positive minor units; `kind` decides the
 * sign. A check cannot express "no UPDATE", so a trigger enforces immutability.
 * ───────────────────────────────────────────────────────────────────────── */
create table app.ledger_entries (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references app.bank_accounts (id) on delete restrict,
  kind         text        not null,
  label        text        not null,
  amount_minor bigint      not null,
  currency     char(3)     not null,
  occurred_at  timestamptz not null,
  recorded_by  uuid        references app.users (id) on delete set null,
  recorded_at  timestamptz not null default now(),
  constraint ledger_entries_kind_allowed check (kind in ('deposit', 'expense')),
  constraint ledger_entries_amount_positive check (amount_minor > 0),
  constraint ledger_entries_label_present check (length(btrim(label)) > 0),
  constraint ledger_entries_currency_allowed check (currency in ('EGP', 'SAR'))
);

comment on table app.ledger_entries is
  'Immutable money movements. A correction is a new opposing entry, never an update.';
comment on column app.ledger_entries.amount_minor is
  'Positive minor units (piastres/halalas). The kind column supplies the sign.';

create index ledger_entries_account_idx
  on app.ledger_entries (account_id, occurred_at desc);

create index ledger_entries_recorded_idx
  on app.ledger_entries (recorded_at desc);

/* Currency must always match the owning account. */
create function app.ledger_enforce_account_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create trigger ledger_entries_enforce_currency
before insert on app.ledger_entries
for each row execute function app.ledger_enforce_account_currency();

/* Append-only: block every UPDATE and DELETE, including for the table owner. */
create function app.ledger_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'LEDGER_IMMUTABLE: ledger entries are append-only; record a reversing entry instead'
    using errcode = '55000';
end;
$$;

create trigger ledger_entries_immutable_update
before update on app.ledger_entries
for each row execute function app.ledger_reject_mutation();

create trigger ledger_entries_immutable_delete
before delete on app.ledger_entries
for each row execute function app.ledger_reject_mutation();

/* ─────────────────────────────────────────────────────────────────────────
 * Derived balance. Every read path uses this function, so the figure can never
 * disagree with the entries behind it.
 * ───────────────────────────────────────────────────────────────────────── */
create function app.account_balance(p_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case kind when 'deposit' then amount_minor else -amount_minor end
  ), 0)::bigint
  from app.ledger_entries
  where account_id = p_account_id;
$$;

create view app.account_balances
with (security_invoker = true)
as
select
  a.id,
  a.bank_name,
  a.account_name,
  a.account_number,
  a.iban,
  a.country_code,
  a.currency,
  a.city_id,
  a.active,
  coalesce(sum(case e.kind when 'deposit' then e.amount_minor end), 0)::bigint
    as deposits_minor,
  coalesce(sum(case e.kind when 'expense' then e.amount_minor end), 0)::bigint
    as expenses_minor,
  app.account_balance(a.id) as balance_minor
from app.bank_accounts a
left join app.ledger_entries e on e.account_id = a.id
group by a.id;

comment on view app.account_balances is
  'Balance = deposits − expenses, computed from the ledger. Never a stored column.';

/* ─────────────────────────────────────────────────────────────────────────
 * Row Level Security
 * Read: view_accounts, or manage_accounts (a manager must be able to resolve
 * the account it is writing to). Write: manage_accounts only.
 * Ledger writes require the same capability as the account they hit.
 * ───────────────────────────────────────────────────────────────────────── */
alter table app.bank_accounts  enable row level security;
alter table app.ledger_entries enable row level security;

alter table app.bank_accounts  force row level security;
alter table app.ledger_entries force row level security;

create policy bank_accounts_read_capable on app.bank_accounts
  for select to authenticated
  using (
    app.has_permission('view_accounts') or
    app.has_permission('manage_accounts')
  );

create policy bank_accounts_write_capable on app.bank_accounts
  for insert to authenticated
  with check (app.has_permission('manage_accounts'));

create policy bank_accounts_update_capable on app.bank_accounts
  for update to authenticated
  using (app.has_permission('manage_accounts'))
  with check (app.has_permission('manage_accounts'));

create policy ledger_entries_read_capable on app.ledger_entries
  for select to authenticated
  using (
    app.has_permission('view_accounts') or
    app.has_permission('manage_accounts')
  );

create policy ledger_entries_insert_capable on app.ledger_entries
  for insert to authenticated
  with check (app.has_permission('manage_accounts'));

commit;
