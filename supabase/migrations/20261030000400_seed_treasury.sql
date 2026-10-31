begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Seed the treasury ledger.
 *
 * Reference figures for the Saudi account, asserted by the final check:
 *   deposits  SAR 48,650.00  → 4,865,000 halalas
 *   expenses  SAR 39,736.31  → 3,973,631 halalas
 *   balance   SAR  8,913.69  →   891,369 halalas
 *
 * Idempotent: the seed account is looked up by IBAN and every entry by a stable
 * label, so re-running never duplicates a movement. Amounts are minor units and
 * the ledger immutability trigger guarantees these cannot be edited later.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.bank_accounts (
  bank_name, account_name, account_number, iban, country_code, currency, city_id
)
values
  ('مصرف الراجحي', 'كانجو للتجارة', '0012345678901',
   'SA0380000000608010167519', 'SA', 'SAR', null),
  ('البنك الأهلي المصري', 'كانجو للتجارة', '1002003004005',
   'EG380019000500000000263180002', 'EG', 'EGP', 'city-cairo')
on conflict (iban) do nothing;

do $$
declare
  sa_account uuid;
  eg_account uuid;
begin
  select id into sa_account from app.bank_accounts
   where iban = 'SA0380000000608010167519';
  select id into eg_account from app.bank_accounts
   where iban = 'EG380019000500000000263180002';

  if sa_account is null then
    raise exception 'Seed aborted: Saudi account not found after insert.';
  end if;

  insert into app.ledger_entries
    (account_id, kind, label, amount_minor, currency, occurred_at)
  select sa_account, v.kind, v.label, v.amount_minor, 'SAR', v.occurred_at
  from (values
    ('deposit', 'دفعة تشغيل الرياض',      3000000::bigint, timestamptz '2026-02-01 08:00:00+00'),
    ('deposit', 'دفعة تشغيل جدة',         1865000::bigint, timestamptz '2026-03-01 08:00:00+00'),
    ('expense', 'رواتب فريق الميدان',     1450025::bigint, timestamptz '2026-02-28 14:00:00+00'),
    ('expense', 'حملات تسويق',            1223606::bigint, timestamptz '2026-03-10 14:00:00+00'),
    ('expense', 'بدل انتقال',              800000::bigint, timestamptz '2026-03-18 14:00:00+00'),
    ('expense', 'لوجستيات ومستودعات',      500000::bigint, timestamptz '2026-03-25 14:00:00+00')
  ) as v(kind, label, amount_minor, occurred_at)
  where not exists (
    select 1 from app.ledger_entries e
    where e.account_id = sa_account and e.label = v.label
  );

  if eg_account is not null then
    insert into app.ledger_entries
      (account_id, kind, label, amount_minor, currency, occurred_at)
    select eg_account, v.kind, v.label, v.amount_minor, 'EGP', v.occurred_at
    from (values
      ('deposit', 'دفعة تشغيل القاهرة',  12000000::bigint, timestamptz '2026-02-02 08:00:00+00'),
      ('expense', 'رواتب فريق القاهرة',   8400000::bigint, timestamptz '2026-02-27 14:00:00+00')
    ) as v(kind, label, amount_minor, occurred_at)
    where not exists (
      select 1 from app.ledger_entries e
      where e.account_id = eg_account and e.label = v.label
    );
  end if;
end;
$$;

/* Assert the reference figures survived the write path unchanged. */
do $$
declare
  deposits bigint;
  expenses bigint;
  balance  bigint;
  sa_account uuid;
begin
  select id into sa_account from app.bank_accounts
   where iban = 'SA0380000000608010167519';

  select
    coalesce(sum(amount_minor) filter (where kind = 'deposit'), 0),
    coalesce(sum(amount_minor) filter (where kind = 'expense'), 0),
    app.account_balance(sa_account)
  into deposits, expenses, balance
  from app.ledger_entries
  where account_id = sa_account;

  if deposits <> 4865000 then
    raise exception 'Seed check failed: SAR deposits % <> 4,865,000', deposits;
  end if;
  if expenses <> 3973631 then
    raise exception 'Seed check failed: SAR expenses % <> 3,973,631', expenses;
  end if;
  if balance <> 891369 then
    raise exception 'Seed check failed: SAR balance % <> 891,369', balance;
  end if;
end;
$$;

commit;
