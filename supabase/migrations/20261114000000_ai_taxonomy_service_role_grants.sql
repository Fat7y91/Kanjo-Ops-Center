begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Service-role privileges for the AI taxonomy batch.
 *
 * `scripts/ai-taxonomy-batch.ts` runs with the service-role key. That role
 * bypasses RLS but still needs explicit table privileges. Two operations
 * failed before this migration:
 *
 *   - SELECT on app.taxonomy_categories  → 42501, the script builds its prompt
 *     from this tree.
 *   - UPDATE on app.catalog_products     → the classification write-back.
 *
 * Least privilege on purpose: the batch only reads the taxonomy, and only
 * updates the classification columns of catalog_products. It never inserts or
 * deletes, and it never touches other tables, so no broader grant is issued.
 * ───────────────────────────────────────────────────────────────────────── */

grant select on app.taxonomy_categories to service_role;

grant select, update on app.catalog_products to service_role;

commit;
