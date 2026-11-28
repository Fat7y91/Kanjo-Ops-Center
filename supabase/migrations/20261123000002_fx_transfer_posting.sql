begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Manual finance FX transfer: SAR out, EGP in, one balanced journal entry.
 *
 * The finance admin captures both figures from the real bank transfer — SAR
 * deducted and EGP received — and uploads the receipt. There is no live rate
 * lookup: the two amounts are the fact, and the journal records both ledgers in
 * a single balanced entry so the voucher shows the whole movement at once.
 *
 * A single entry cannot debit EGP and credit SAR by unequal amounts, so each
 * currency clears through its own suspense account:
 *
 *   Dr البنك المصري (EGP)      egp_amount
 *   Cr وسيط تحويل العملات (EGP) egp_amount
 *   Dr وسيط تحويل العملات (SAR) sar_amount
 *   Cr بنك الرياض (SAR)         sar_amount
 *
 * The suspense pair carries the conversion difference until treasury nets it,
 * which is exactly how a multi-currency book models an exchange. Both banks
 * move by the amounts the operator entered, and the entry balances line for
 * line.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.accounts (code, name, type, normal_balance, currency, is_system)
values
  ('1090-SAR', 'وسيط تحويل العملات (ريال)', 'asset',     'debit',  'SAR', true),
  ('2090',     'وسيط تحويل العملات (جنيه)', 'liability', 'credit', 'EGP', true)
on conflict (code) do nothing;

create or replace function app.post_fx_transfer(
  p_sar_amount_minor bigint,
  p_egp_amount_minor bigint,
  p_label            text,
  p_occurred_at      timestamptz,
  p_actor            uuid,
  p_receipt_no       text    default null,
  p_storage_path     text    default null,
  p_mime_type        text    default null,
  p_size_bytes       integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

comment on function app.post_fx_transfer(bigint, bigint, text, timestamptz, uuid, text, text, text, integer) is
  'Posts a manual SAR→EGP transfer as one balanced entry across both bank ledgers, optionally attaching the transfer receipt.';

grant execute on function app.post_fx_transfer(bigint, bigint, text, timestamptz, uuid, text, text, text, integer)
  to service_role;

commit;
