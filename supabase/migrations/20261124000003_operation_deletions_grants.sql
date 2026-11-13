begin;

/* The tombstone table was created with RLS enabled but without table grants,
 * so the service-role client received `42501 permission denied` and the orders
 * board read failed. Grant the two operations the server performs. */

grant select, insert on app.operation_log_deletions to service_role;

commit;
