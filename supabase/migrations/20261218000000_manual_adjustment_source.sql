begin;

/* Manual bonus / adjustment entries are a first-class journal source.
 * Kept in its own transaction because PostgreSQL cannot use a freshly added
 * enum value in the transaction that adds it. */

alter type app.journal_source add value if not exists 'manual_adjustment';

commit;
