begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Egypt Post payout destination.
 *
 * V1 carried four payout methods (`e_wallet`, `instapay`, `bank`, `post`).
 * V2 modelled only the first three, so every operator paid through Egypt Post
 * lost their destination during the migration review.
 *
 * `ALTER TYPE ... ADD VALUE` cannot be referenced in the same transaction that
 * adds it (PostgreSQL raises 55P04 on the expression scan), so the enum grows
 * in this file and `20261112000000_legacy_gap_resolutions.sql` widens the
 * shape constraint in the next one.
 * ───────────────────────────────────────────────────────────────────────── */

alter type app.payout_method_kind add value if not exists 'egypt_post';

commit;
