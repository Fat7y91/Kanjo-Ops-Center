begin;

/* ─────────────────────────────────────────────────────────────────────────
 * New journal source for the fixed courier daily attendance amount.
 *
 * Kept in its own migration because PostgreSQL cannot use a freshly added
 * enum value inside the transaction that added it; the settlement-model
 * migration that consumes this value runs in the next transaction.
 * ───────────────────────────────────────────────────────────────────────── */

alter type app.journal_source add value if not exists 'courier_attendance';

commit;
