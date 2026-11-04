/**
 * Maps a session actor id onto a `uuid` foreign key.
 *
 * Several tables reference `app.users(id)`, but seeded/demo actors (`u-*`) are
 * not rows there. Recording an unattributed write is correct; rejecting it
 * because the id is not a uuid would drop real data.
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID.test(value));
}

export function actorIdOrNull(actorId: string | null | undefined): string | null {
  return actorId && UUID.test(actorId) ? actorId : null;
}
