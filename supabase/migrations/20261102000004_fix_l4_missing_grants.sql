begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Repair: the three clearinghouse keys never reached existing L4 accounts.
 *
 * `20261102000003_operations_clearinghouse.sql` seeds the keys and grants them
 * to every active `clearance_level >= 3` operator, and a clean replay does
 * exactly that. What breaks it is replay order: the older
 * `20261101000000_seed_l4_new_permissions.sql` builds a temporary 49-key
 * snapshot and then runs
 *
 *   delete from app.user_permissions ... where not exists (select 1 from l4_catalogue ...)
 *
 * so replaying it against a catalogue that already holds 52 keys deletes the
 * three clearinghouse grants from every L4 account. The observed `49 / 52` in
 * the UI is exactly that state: the keys exist in `app.permissions`, the grants
 * do not.
 *
 * This migration converges an already-broken deployment. It is idempotent: the
 * grant is `on conflict do nothing`, and the revision bump is harmless on a
 * re-run. The old seed file is left untouched, because editing an applied
 * migration would change its checksum on deployments that already ran it.
 * ───────────────────────────────────────────────────────────────────────── */

/* ── 1. Re-grant the clearinghouse keys ─────────────────────────────────
 * Scoped to L3 and above, matching `seed-users.ts`: L4 gets the whole
 * catalogue via `withSupremeCatalogue`, and L3 executives receive the finance
 * baseline. `granted_by` stays NULL — the migration granted this, not an
 * operator. */
insert into app.user_permissions (user_id, permission_key)
select u.id, k.key
  from app.users u
 cross join (values
   ('log_operations'),
   ('view_clearinghouse'),
   ('settle_clearinghouse')
 ) as k(key)
 where u.active
   and u.clearance_level >= 3
on conflict (user_id, permission_key) do nothing;

/* ── 2. Force a token refresh ────────────────────────────────────────────
 * Authorization changed, so an open client must discard its 49-key token
 * instead of trusting it until expiry. The `users_touch_updated_at` trigger
 * also refreshes the snapshot revision the client reads. */
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3;

/* ── 3. Fail loudly instead of shipping another half-granted deployment ──
 * A silent 49/52 is what created this ticket: the surface looked correct in
 * code and was unusable in practice. Assert convergence before committing. */
do $$
declare
  broken record;
begin
  select u.id, u.phone, count(up.permission_key) as held
    into broken
    from app.users u
    left join app.user_permissions up
      on up.user_id = u.id
     and up.permission_key in (
       'log_operations',
       'view_clearinghouse',
       'settle_clearinghouse'
     )
   where u.active
     and u.clearance_level >= 3
   group by u.id, u.phone
  having count(up.permission_key) <> 3
   limit 1;

  if found then
    raise exception
      'CLEARINGHOUSE_GRANTS_INCOMPLETE: operator % (%) holds % of 3 clearinghouse keys',
      broken.id, broken.phone, broken.held
      using errcode = '23514';
  end if;
end;
$$;

commit;
