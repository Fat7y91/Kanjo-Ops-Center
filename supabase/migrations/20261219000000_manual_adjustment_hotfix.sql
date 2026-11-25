/* Kept outside the transaction below because a newly added enum value cannot be
 * used in the transaction that adds it. `if not exists` makes it a no-op when
 * `20261218000000_manual_adjustment_source.sql` already ran. */
alter type app.journal_source add value if not exists 'manual_adjustment';

begin;

/* Manual bonus / adjustment hotfix.
 *
 * Production was missing the posting function, the `manual_adjustment` source
 * value, and the contra accounts, so the modal failed with an opaque HTTP 500.
 * This migration is idempotent: it seeds every ledger account the posting path
 * can reference and replaces the function with a Cairo-dated default.
 */

insert into app.accounts (code, name, type, normal_balance, currency, is_system) values
  ('2100', 'التزامات المناديب', 'liability', 'credit', 'EGP', true),
  ('2200', 'تسويات مالية مستحقة', 'liability', 'credit', 'EGP', true),
  ('4900', 'إيرادات وتسويات تشغيلية أخرى', 'revenue', 'credit', 'EGP', true),
  ('5110', 'مصروف مكافآت وحوافز المناديب', 'expense', 'debit', 'EGP', true),
  ('5210', 'مصروف تسويات ومكافآت التجار', 'expense', 'debit', 'EGP', true)
on conflict (code) do nothing;

create or replace function app.post_manual_adjustment(
  p_account_id   uuid,
  p_direction    text,
  p_amount_minor bigint,
  p_entry_date   date,
  p_reason       text,
  p_actor        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct         app.accounts;
  contra_id    uuid;
  entry_id     uuid;
  reason       text;
  label        text;
  business_day date;
begin
  reason := btrim(coalesce(p_reason, ''));

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'ADJUSTMENT_AMOUNT_INVALID: المبلغ يجب أن يكون أكبر من صفر.'
      using errcode = '23514';
  end if;
  if reason = '' then
    raise exception 'ADJUSTMENT_REASON_REQUIRED: اكتب تفسيراً واضحاً للمكافأة أو التسوية.'
      using errcode = '23514';
  end if;
  if p_direction not in ('credit', 'debit') then
    raise exception 'ADJUSTMENT_DIRECTION_INVALID: نوع الحركة غير صالح (%)', p_direction
      using errcode = '23514';
  end if;

  business_day := coalesce(
    p_entry_date,
    (now() at time zone 'Africa/Cairo')::date
  );

  select * into acct from app.accounts where id = p_account_id;
  if acct.id is null then
    raise exception 'ADJUSTMENT_ACCOUNT_MISSING: لا يوجد حساب دفتر أستاذ بهذا المعرّف.'
      using errcode = '23503';
  end if;
  if acct.party_type is null then
    raise exception 'ADJUSTMENT_NOT_A_PARTY: لا يمكن تسجيل مكافأة أو تسوية على حساب مراقبة.'
      using errcode = '23514';
  end if;
  if acct.party_type not in ('merchant', 'courier') then
    raise exception 'ADJUSTMENT_PARTY_TYPE_UNSUPPORTED: نوع الطرف غير مدعوم (%)', acct.party_type
      using errcode = '23514';
  end if;

  label := 'مكافأة / تسوية: ' || reason;

  insert into app.journal_entries (
    entry_date, memo, source_type, source_id, currency, created_by
  ) values (
    business_day,
    label,
    'manual_adjustment',
    null,
    acct.currency,
    p_actor
  )
  returning id into entry_id;

  if p_direction = 'credit' then
    contra_id := app.system_account(
      case acct.party_type when 'courier' then '5110' else '5210' end
    );
    if contra_id is null then
      raise exception 'ADJUSTMENT_EXPENSE_ACCOUNT_MISSING: حساب مصروف المكافآت غير مهيأ.'
        using errcode = '23503';
    end if;

    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, contra_id, p_amount_minor, label);
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, label);
  else
    contra_id := app.system_account('4900');
    if contra_id is null then
      raise exception 'ADJUSTMENT_INCOME_ACCOUNT_MISSING: حساب إيرادات التسويات غير مهيأ.'
        using errcode = '23503';
    end if;

    insert into app.journal_lines (entry_id, account_id, debit_minor, memo)
    values (entry_id, p_account_id, p_amount_minor, label);
    insert into app.journal_lines (entry_id, account_id, credit_minor, memo)
    values (entry_id, contra_id, p_amount_minor, label);
  end if;

  return entry_id;
end;
$$;

revoke all on function app.post_manual_adjustment(uuid, text, bigint, date, text, uuid) from public;
grant execute on function app.post_manual_adjustment(uuid, text, bigint, date, text, uuid)
  to authenticated, service_role;

commit;
