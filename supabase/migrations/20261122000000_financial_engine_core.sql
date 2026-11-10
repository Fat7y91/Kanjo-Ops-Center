begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Core financial engine: chart of accounts + double-entry journal.
 *
 * Design rules:
 *   - Money is integer minor units. A float can never create or destroy value.
 *   - Balances are derived (`sum(debit) − sum(credit)`), never stored.
 *   - Journal entries and lines are append-only. A correction is a reversing
 *     entry, never an update.
 *   - Every entry must balance to zero in its currency. This is enforced by a
 *     deferred constraint trigger, so an unbalanced transaction cannot commit.
 *   - A party (merchant / courier / bank) gets lazy sub-accounts under a system
 *     control account, so the ledger is one tree with no duplicate roles.
 *
 * Idempotent: guarded enum creation, `if not exists` tables/indexes, and
 * drop-then-create for every trigger/policy/function.
 * ───────────────────────────────────────────────────────────────────────── */

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type app.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
  end if;
  if not exists (select 1 from pg_type where typname = 'normal_balance') then
    create type app.normal_balance as enum ('debit', 'credit');
  end if;
  if not exists (select 1 from pg_type where typname = 'party_type') then
    create type app.party_type as enum ('merchant', 'courier', 'bank', 'customer');
  end if;
  if not exists (select 1 from pg_type where typname = 'journal_source') then
    create type app.journal_source as enum (
      'operation', 'merchant_settlement', 'courier_payout',
      'coupon_budget', 'capital', 'manual', 'opening', 'reversal'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'journal_status') then
    create type app.journal_status as enum ('posted', 'reversed');
  end if;
end;
$$;

/* ── 1. Chart of accounts ───────────────────────────────────────────────── */

create table if not exists app.accounts (
  id             uuid        primary key default gen_random_uuid(),
  code           text        not null unique,
  name           text        not null,
  type           app.account_type   not null,
  normal_balance app.normal_balance not null,
  currency       char(3)     not null default 'EGP',
  party_type     app.party_type,
  party_id       text,
  is_system      boolean     not null default false,
  active         boolean     not null default true,
  parent_id      uuid        references app.accounts (id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint accounts_currency_allowed check (currency in ('EGP', 'SAR')),
  constraint accounts_party_pair check ((party_type is null) = (party_id is null)),
  constraint accounts_system_has_no_party check (not is_system or party_type is null)
);

/* A party may hold several roles at once (merchant receivable *and* payable),
 * so uniqueness is per control account, not per party globally. */
create unique index if not exists accounts_party_key
  on app.accounts (parent_id, party_type, party_id, currency)
  where party_type is not null;

create index if not exists accounts_type_idx on app.accounts (type, active);

insert into app.accounts (code, name, type, normal_balance, currency, is_system) values
  ('1000', 'البنك',                         'asset',     'debit',  'EGP', true),
  ('1010', 'النقدية بالخزينة',              'asset',     'debit',  'EGP', true),
  ('1100', 'مستحقات التجار',                'asset',     'debit',  'EGP', true),
  ('1200', 'مستحقات المناديب',              'asset',     'debit',  'EGP', true),
  ('2000', 'التزامات التجار',               'liability', 'credit', 'EGP', true),
  ('2100', 'التزامات المناديب',             'liability', 'credit', 'EGP', true),
  ('2400', 'أرصدة محافظ العملاء',           'liability', 'credit', 'EGP', true),
  ('3000', 'حقوق الملكية',                  'equity',    'credit', 'EGP', true),
  ('4000', 'إيراد العمولة',                 'revenue',   'credit', 'EGP', true),
  ('4100', 'إيراد التوصيل',                 'revenue',   'credit', 'EGP', true),
  ('5000', 'مصروف الكوبونات',               'expense',   'debit',  'EGP', true),
  ('5100', 'مصروف أرباح المناديب',          'expense',   'debit',  'EGP', true),
  ('5200', 'مصروف الكاش باك',               'expense',   'debit',  'EGP', true),
  ('5300', 'مصروف استرداد المحفظة',         'expense',   'debit',  'EGP', true),
  ('9999', 'حساب معلّق',                    'asset',     'debit',  'EGP', true)
on conflict (code) do nothing;

comment on table app.accounts is
  'Chart of accounts. Party sub-accounts hang under a system control account by parent_id.';
comment on column app.accounts.normal_balance is
  'The side that increases the account. Used to report natural balances.';

/* ── 2. Journal header ──────────────────────────────────────────────────── */

create table if not exists app.journal_entries (
  id                uuid         primary key default gen_random_uuid(),
  entry_no          bigint       generated always as identity unique,
  entry_date        date         not null default current_date,
  memo              text         not null default '',
  source_type       app.journal_source not null,
  source_id         text,
  currency          char(3)      not null default 'EGP',
  status            app.journal_status not null default 'posted',
  reverses_entry_id uuid         references app.journal_entries (id) on delete restrict,
  created_by        uuid         references app.users (id) on delete set null,
  created_at        timestamptz  not null default now(),
  constraint journal_entries_currency_allowed check (currency in ('EGP', 'SAR')),
  constraint journal_entries_reversal_shape check (
    (source_type = 'reversal') = (reverses_entry_id is not null)
  )
);

/* Idempotency: one posted entry per source record. Logging the same order can
 * never post its journal twice. */
create unique index if not exists journal_entries_source_key
  on app.journal_entries (source_type, source_id)
  where source_id is not null;

create index if not exists journal_entries_date_idx
  on app.journal_entries (entry_date desc, entry_no desc);

/* ── 3. Journal lines ───────────────────────────────────────────────────── */

create table if not exists app.journal_lines (
  id           uuid   primary key default gen_random_uuid(),
  entry_id     uuid   not null references app.journal_entries (id) on delete cascade,
  account_id   uuid   not null references app.accounts (id) on delete restrict,
  debit_minor  bigint not null default 0,
  credit_minor bigint not null default 0,
  memo         text   not null default '',
  constraint journal_lines_non_negative check (debit_minor >= 0 and credit_minor >= 0),
  constraint journal_lines_exactly_one check (
    (debit_minor > 0 and credit_minor = 0) or
    (credit_minor > 0 and debit_minor = 0)
  )
);

create index if not exists journal_lines_entry_idx on app.journal_lines (entry_id);
create index if not exists journal_lines_account_idx on app.journal_lines (account_id);

comment on table app.journal_lines is
  'Debit/credit legs of a journal entry. Append-only; each line is exactly one side.';

/* ── 4. Balance enforcement (deferred, at commit) ───────────────────────── */

create or replace function app.journal_entry_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
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

drop trigger if exists journal_lines_balanced on app.journal_lines;
create constraint trigger journal_lines_balanced
after insert or update or delete on app.journal_lines
deferrable initially deferred
for each row execute function app.journal_entry_balanced();

/* ── 5. Append-only guards ──────────────────────────────────────────────── */

create or replace function app.journal_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'JOURNAL_IMMUTABLE: journal rows are append-only; post a reversing entry instead'
    using errcode = '55000';
end;
$$;

drop trigger if exists journal_entries_immutable_update on app.journal_entries;
create trigger journal_entries_immutable_update
before update on app.journal_entries
for each row execute function app.journal_reject_mutation();

drop trigger if exists journal_entries_immutable_delete on app.journal_entries;
create trigger journal_entries_immutable_delete
before delete on app.journal_entries
for each row execute function app.journal_reject_mutation();

drop trigger if exists journal_lines_immutable_update on app.journal_lines;
create trigger journal_lines_immutable_update
before update on app.journal_lines
for each row execute function app.journal_reject_mutation();

drop trigger if exists journal_lines_immutable_delete on app.journal_lines;
create trigger journal_lines_immutable_delete
before delete on app.journal_lines
for each row execute function app.journal_reject_mutation();

/* ── 6. Derived balances ────────────────────────────────────────────────── */

create or replace view app.journal_account_balances
with (security_invoker = true)
as
select
  a.id,
  a.code,
  a.name,
  a.type,
  a.currency,
  a.party_type,
  a.party_id,
  a.active,
  coalesce(sum(l.debit_minor), 0)::bigint  as debit_total_minor,
  coalesce(sum(l.credit_minor), 0)::bigint as credit_total_minor,
  (coalesce(sum(l.debit_minor), 0) - coalesce(sum(l.credit_minor), 0))::bigint
    as balance_minor
from app.accounts a
left join app.journal_lines l on l.account_id = a.id
group by a.id;

comment on view app.journal_account_balances is
  'Balance = debits − credits, computed from the journal. Never a stored column.';

/* ── 7. Party sub-account helper ────────────────────────────────────────── */

create or replace function app.party_account(
  p_parent_code text,
  p_party_type  app.party_type,
  p_party_id    text,
  p_name        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function app.system_account(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from app.accounts
   where code = p_code and party_type is null
   limit 1;
$$;

/* ── 8. Receipts ────────────────────────────────────────────────────────── */

create table if not exists app.transaction_receipts (
  id           uuid        primary key default gen_random_uuid(),
  entry_id     uuid        not null references app.journal_entries (id) on delete restrict,
  receipt_no   text        not null,
  storage_path text        not null,
  mime_type    text        not null,
  size_bytes   integer     not null,
  uploaded_by  uuid        references app.users (id) on delete set null,
  uploaded_at  timestamptz not null default now(),
  constraint transaction_receipts_size_non_negative check (size_bytes >= 0),
  constraint transaction_receipts_no_present check (length(btrim(receipt_no)) > 0)
);

create unique index if not exists transaction_receipts_no_key
  on app.transaction_receipts (receipt_no);

create index if not exists transaction_receipts_entry_idx
  on app.transaction_receipts (entry_id);

comment on table app.transaction_receipts is
  'Receipt attached to a journal entry. Visible wherever that entry is, without duplicating the file.';

/* ── 9. Row Level Security ──────────────────────────────────────────────── */

alter table app.accounts             enable row level security;
alter table app.journal_entries      enable row level security;
alter table app.journal_lines        enable row level security;
alter table app.transaction_receipts enable row level security;

alter table app.accounts             force row level security;
alter table app.journal_entries      force row level security;
alter table app.journal_lines        force row level security;
alter table app.transaction_receipts force row level security;

drop policy if exists accounts_read_capable on app.accounts;
create policy accounts_read_capable on app.accounts
  for select to authenticated
  using (
    app.has_permission('view_journal') or
    app.has_permission('view_accounts') or
    app.has_permission('manage_accounts')
  );

drop policy if exists journal_entries_read_capable on app.journal_entries;
create policy journal_entries_read_capable on app.journal_entries
  for select to authenticated
  using (
    app.has_permission('view_journal') or
    app.has_permission('view_accounts')
  );

drop policy if exists journal_lines_read_capable on app.journal_lines;
create policy journal_lines_read_capable on app.journal_lines
  for select to authenticated
  using (
    app.has_permission('view_journal') or
    app.has_permission('view_accounts')
  );

drop policy if exists transaction_receipts_read_capable on app.transaction_receipts;
create policy transaction_receipts_read_capable on app.transaction_receipts
  for select to authenticated
  using (
    app.has_permission('view_journal') or
    app.has_permission('view_clearinghouse')
  );

/* Journal writes are posted by SECURITY DEFINER functions, never by a client.
 * A manual posting capability is explicit and separate. */
drop policy if exists journal_entries_insert_capable on app.journal_entries;
create policy journal_entries_insert_capable on app.journal_entries
  for insert to authenticated
  with check (app.has_permission('post_journal_entries'));

drop policy if exists journal_lines_insert_capable on app.journal_lines;
create policy journal_lines_insert_capable on app.journal_lines
  for insert to authenticated
  with check (app.has_permission('post_journal_entries'));

drop policy if exists transaction_receipts_insert_capable on app.transaction_receipts;
create policy transaction_receipts_insert_capable on app.transaction_receipts
  for insert to authenticated
  with check (
    app.has_permission('post_journal_entries') or
    app.has_permission('settle_clearinghouse')
  );

commit;
