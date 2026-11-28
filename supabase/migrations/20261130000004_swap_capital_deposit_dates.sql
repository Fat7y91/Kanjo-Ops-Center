begin;

/* The legacy capital-deposit import parsed Excel dates with a US locale, which
 * swapped day and month whenever the parsed day was 12 or lower. Swapping the
 * two fields back restores the intended date; the monthly reason labels then
 * agree with the corrected month. The seven 550 SAR rows are the November
 * payment, but their labels were generated from the mis-parsed month, so they
 * are relabelled explicitly. The DO block guard makes a manual re-run a no-op.
 */

do $$
begin
  if exists (
    select 1 from app.schema_migrations where version = '20261130000004'
  ) then
    raise notice 'capital deposit date swap already applied; skipping';
    return;
  end if;

  update app.capital_deposits
     set reason = 'دفعة شهر نوفمبر'
   where currency = 'SAR'
     and amount_minor = 55000
     and deposit_date in ('2026-01-11', '2026-02-11', '2026-06-11');

  update app.capital_deposits
     set deposit_date = make_date(
       extract(year from deposit_date)::int,
       extract(day from deposit_date)::int,
       extract(month from deposit_date)::int
     )
   where extract(day from deposit_date) <= 12;
end $$;

commit;
