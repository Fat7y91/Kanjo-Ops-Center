begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Founder-only visibility for internal courier accounts.
 *
 * ZEMBAWY is the company's own delivery arm, not a third-party courier. Its
 * ledger carries internal accounting that must not reach the wider operations
 * desk. This capability is granted only to the founders (title مؤسس) and the
 * chairman; everyone else keeps the internal courier permanently filtered out
 * of the clearinghouse list, reports, statements and adjustments.
 * ───────────────────────────────────────────────────────────────────────── */

insert into app.permissions (key, label, description, group_key, sort_order) values
  (
    'view_internal_staff_accounts',
    'عرض حسابات المناديب الداخليين',
    'الاطلاع على حسابات المناديب الداخليين مثل ZEMBAWY وتفاصيلها المحاسبية.',
    'المقاصة والعمليات',
    55
  )
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      group_key   = excluded.group_key,
      sort_order  = excluded.sort_order;

insert into app.user_permissions (user_id, permission_key)
select u.id, 'view_internal_staff_accounts'
  from app.users u
 where u.active
   and u.clearance_level >= 3
   and (
     u.title = 'مؤسس'
     or u.id = '8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b'
   )
on conflict (user_id, permission_key) do nothing;

/* Bump the revision of every user who gained (or already held) the grant so
 * active sessions rebuild their permission set on the next request. */
update app.users
   set auth_revision = auth_revision + 1
 where active
   and clearance_level >= 3
   and (
     title = 'مؤسس'
     or id = '8b837bd0-b3b5-4c0b-9b94-abc8b4f5446b'
   );

commit;
