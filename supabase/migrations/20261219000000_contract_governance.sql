begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Signed-contract governance + merchant SSOT reconciliation.
 *
 *   manage_signed_contracts  a distinct capability to amend, reopen, terminate
 *                            or delete an already-executed contract. It is not
 *                            implied by edit/sign/cancel: those only operate on
 *                            open drafts.
 *
 * Executives (clearance >= 4) and Dr.Ahmed Fathi receive it together with
 * delete_contracts. The terminal trigger is relaxed so the state machine may
 * move an executed row back to an open state (reopen) or to cancelled
 * (terminate); the API remains the authorization gate and the money/journal
 * tables stay append-only.
 *
 * `contract_order_counts` lets the register block a permanent delete when the
 * merchant has order history on/after the contract date, while still allowing
 * a commission amendment or a termination.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  ('manage_signed_contracts', 'إدارة العقود الموقّعة', 'تعديل أو إعادة فتح أو إنهاء أو حذف العقود الموقّعة مع مزامنة ملف التاجر.', 'العقود', 41)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

/* Grant to super admins (clearance 4) and explicitly to Dr.Ahmed Fathi, whose
 * account may sit at a lower clearance in another deployment. */
insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
 cross join (values ('manage_signed_contracts'), ('delete_contracts')) as p(key)
 where u.active
   and (u.clearance_level >= 4 or u.phone = '+201040491882')
on conflict (user_id, permission_key) do nothing;

update app.users
   set auth_revision = auth_revision + 1
 where active
   and (clearance_level >= 4 or phone = '+201040491882');

/* The executed record is no longer write-once, but it is still shape-checked:
 * signed/cancelled timestamps must agree with the row status. Reopening clears
 * the signature stamp; terminating clears it and stamps the cancellation. */
create or replace function app.contract_terminal_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'signed' then
    new.signed_at := coalesce(new.signed_at, now());
    new.cancelled_at := null;
  elsif new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.signed_at := null;
  else
    new.signed_at := null;
    new.cancelled_at := null;
  end if;

  return new;
end;
$$;

drop policy if exists contracts_read_capable on app.contracts;
create policy contracts_read_capable on app.contracts
  for select to authenticated
  using (
    app.has_permission('view_contracts') or
    app.has_permission('draft_contract') or
    app.has_permission('create_contracts') or
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('sign_contract') or
    app.has_permission('sign_contracts') or
    app.has_permission('cancel_contract') or
    app.has_permission('delete_contracts') or
    app.has_permission('manage_signed_contracts')
  );

drop policy if exists contracts_update_capable on app.contracts;
create policy contracts_update_capable on app.contracts
  for update to authenticated
  using (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('sign_contract') or
    app.has_permission('sign_contracts') or
    app.has_permission('cancel_contract') or
    app.has_permission('manage_signed_contracts')
  )
  with check (
    app.has_permission('edit_contract') or
    app.has_permission('edit_contracts') or
    app.has_permission('sign_contract') or
    app.has_permission('sign_contracts') or
    app.has_permission('cancel_contract') or
    app.has_permission('manage_signed_contracts')
  );

drop policy if exists contracts_delete_capable on app.contracts;
create policy contracts_delete_capable on app.contracts
  for delete to authenticated
  using (app.has_permission('delete_contracts'));

/* One aggregate read for the whole register: the number of order logs whose
 * merchant matches and whose timestamp is at/after the contract's effective
 * date. `left join` + `count(o.id)` yields 0 for a merchant with no orders. */
create or replace function app.contract_order_counts(p_contract_ids uuid[])
returns table (contract_id uuid, order_count bigint)
language sql
stable
security definer
set search_path = app, public
as $$
  select c.id as contract_id,
         count(o.id)::bigint as order_count
    from app.contracts c
    left join app.operation_logs o
      on o.merchant_id = c.merchant_id
     and o.occurred_at >= coalesce(c.signed_at, c.created_at)
   where c.id = any(p_contract_ids)
   group by c.id;
$$;

revoke all on function app.contract_order_counts(uuid[]) from public;
grant execute on function app.contract_order_counts(uuid[]) to authenticated, service_role;

/* Data reconciliation: the executed حلواني الصردي contract stored a stale 15%
 * headline override while the merchant profile has held 10% all along. Align
 * the override (the header, Clause 5, annex and summary all derive from it) and
 * the merchant row so the profile remains the single source of truth. */
insert into app.contract_section_overrides (contract_id, section_key, content)
values ('e4c91ae6-19db-41e1-92e7-a83776d9abbd', 'commission_base', '{"rate": 10}'::jsonb)
on conflict (contract_id, section_key) do update
  set content = excluded.content;

update app.contract_commission_lines
   set commission_rate = 10
 where contract_id = 'e4c91ae6-19db-41e1-92e7-a83776d9abbd'
   and commission_rate <> 10;

update app.merchants
   set agreed_commission = 10,
       target_commission = 10,
       updated_at        = now()
 where id = 'KJ-SGHUQ4'
   and (agreed_commission is distinct from 10 or target_commission is distinct from 10);

commit;
