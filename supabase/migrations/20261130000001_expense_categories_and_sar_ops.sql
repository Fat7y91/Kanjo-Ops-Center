begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Expense categories on bank movements, and the two finance capabilities.
 *
 * `expense_category_id` lets an EGP expense carry the same analytical bucket as
 * the SAR expense table. `post_bank_movement` gains the category argument and
 * refuses an expense without an active category, so the reporting tree can
 * never receive an unclassified row.
 *
 * The capability rows are inserted here (the generated catalogue reads them
 * back); the grants to named operators are applied by
 * `scripts/grant-finance-permissions.mjs`, not by the migration, so the same
 * script can be re-run on an existing deployment.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('manage_expense_categories', 'إدارة البنود', 'إضافة بنود المصروفات وتعديلها في شجرة البنود التحليلية.', 'المالية', 111),
  ('operate_sar_bank', 'تشغيل البنك السعودي', 'تسجيل الإيداعات والمصروفات على حساب البنك السعودي (ريال).', 'الحسابات البنكية', 112)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* ── 1. Category on the journal header ───────────────────────────────────── */

alter table app.journal_entries
  add column if not exists expense_category_id uuid
    references app.expense_categories (id) on delete restrict;

create index if not exists journal_entries_expense_category_idx
  on app.journal_entries (expense_category_id)
  where expense_category_id is not null;

comment on column app.journal_entries.expense_category_id is
  'Analytical expense bucket for an EGP bank expense. Null for deposits and non-expense entries.';

/* ── 2. Bank movement accepts the category ───────────────────────────────── */

drop function if exists app.post_bank_movement(uuid, text, text, bigint, timestamptz, uuid);

create or replace function app.post_bank_movement(
  p_account_id   uuid,
  p_kind         text,
  p_label        text,
  p_amount_minor bigint,
  p_occurred_at  timestamptz,
  p_actor        uuid,
  p_category_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_kind = 'expense' and (
    p_category_id is null or not exists (
      select 1 from app.expense_categories c
       where c.id = p_category_id and c.active
    )
  ) then
    raise exception 'BANK_MOVEMENT_CATEGORY_REQUIRED: an expense needs an active category'
      using errcode = '23514';
  end if;

  insert into app.journal_entries (
    entry_date, memo, source_type, currency, created_by, expense_category_id
  )
  values (
    coalesce(p_occurred_at, now())::date,
    coalesce(nullif(btrim(p_label), ''), 'حركة بنكية'),
    'manual',
    'EGP',
    p_actor,
    case when p_kind = 'expense' then p_category_id else null end
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

grant execute on function app.post_bank_movement(uuid, text, text, bigint, timestamptz, uuid, uuid)
  to service_role;

commit;
