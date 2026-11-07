begin;

/* ─────────────────────────────────────────────────────────────────────────
 * One-off cleanup of a verification row.
 *
 * During verification of the CSV sync independence I POSTed a single test
 * category directly to `/api/taxonomy/sync`. The sync grants intentionally omit
 * DELETE (the sync is additive and idempotent), so the service role cannot remove
 * it through the API. This migration deletes only that exact row by id, making it
 * safe and idempotent: on any deployment that never saw the test it is a no-op.
 * ───────────────────────────────────────────────────────────────────────── */

delete from app.taxonomy_categories
where id = '62e01223-0f54-5a44-4f99-40e5fd3193a6'
  and name_ar = 'اختبار مستقل';

commit;
