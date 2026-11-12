begin;

/* ─────────────────────────────────────────────────────────────────────────
 * A dedicated journal source for currency transfers.
 *
 * A finance FX transfer moves money out of the Saudi bank (SAR) and into the
 * Egyptian bank (EGP) at a manually captured rate. It must be distinguishable
 * from a manual movement and from a settlement in the voucher, so it gets its
 * own source value. Added in its own migration because a new enum value cannot
 * be used in the transaction that introduces it.
 * ───────────────────────────────────────────────────────────────────────── */

alter type app.journal_source add value if not exists 'fx_transfer';

commit;
