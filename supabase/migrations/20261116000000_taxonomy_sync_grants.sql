begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Service-role privileges for the V1 dashboard CSV sync.
 *
 * The sync API upserts `app.taxonomy_categories` with the service-role key. The
 * earlier AI-taxonomy migration granted only SELECT on this table (the batch
 * reads the tree but never writes it). The sync both inserts new categories and
 * updates existing ones, so it needs INSERT and UPDATE.
 *
 * Least privilege: no DELETE. The sync is additive and idempotent — it never
 * removes a category the export omits, so a partial or wrong file cannot erase
 * the taxonomy.
 * ───────────────────────────────────────────────────────────────────────── */

grant insert, update on app.taxonomy_categories to service_role;

commit;
