begin;

/* Opening an Egyptian bank account moved 7,000 EGP into it, but only the SAR
 * account-opening fee was recorded. The EGP ledger therefore shows a zero
 * balance. This posts the missing opening deposit (Dr bank, Cr equity) without
 * touching the SAR withdrawal. The DO block guard makes a re-run a no-op.
 */

do $$
declare
  egp_bank uuid;
  po_user  uuid;
  v_label  text := 'رصيد افتتاحي — البنك المصري';
begin
  if exists (
    select 1 from app.schema_migrations where version = '20261130000005'
  ) then
    raise notice 'EGP opening balance already applied; skipping';
    return;
  end if;

  if exists (
    select 1 from app.journal_entries je
     where je.currency = 'EGP' and je.memo = v_label
  ) then
    raise notice 'EGP opening balance entry already present; skipping';
    return;
  end if;

  select id into egp_bank
    from app.accounts
   where code = '1000' and party_type is null
   limit 1;

  if egp_bank is null then
    raise exception
      'EGP_BANK_ACCOUNT_MISSING: chart account 1000 (EGP) is missing';
  end if;

  select id into po_user
    from app.users
   where id = '8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b';

  perform app.post_bank_movement(
    egp_bank,
    'deposit'::text,
    v_label,
    700000::bigint,
    timestamptz '2026-11-04 12:00:00+02',
    po_user,
    null::uuid
  );
end $$;

commit;
