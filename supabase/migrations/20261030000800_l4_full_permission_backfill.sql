begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Level 4 is the supreme tier, so it holds the whole catalogue.
 *
 * `20261030000700_permission_catalogue_sync.sql` only backfilled the five
 * treasury keys, and only for `clearance_level >= 3`. A level 3 founder is a
 * peer of the L4 System Admin, but they are not the same rank, and an L4
 * account provisioned before the treasury keys existed can still sit below the
 * 43-key catalogue.
 *
 * This migration makes the invariant explicit for the top rank only:
 *
 *   active and clearance_level = 4  =>  every row in app.permissions granted
 *
 * It is idempotent: existing grants are left untouched, missing grants are
 * inserted, and every active L4 account has its session revision advanced so an
 * open client discards the stale 38-key token.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.user_permissions (user_id, permission_key)
select u.id, p.key
  from app.users u
  cross join app.permissions p
 where u.active
   and u.clearance_level = 4
on conflict (user_id, permission_key) do nothing;

/* Authorization changed, so every L4 session must refetch. The updated_at
 * trigger also advances the snapshot revision read by the client. */
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level = 4;

commit;
