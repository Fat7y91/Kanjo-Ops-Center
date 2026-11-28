/**
 * Reconciles a requested grant set against the capabilities the database
 * actually holds.
 *
 * `app.user_permissions.permission_key` is a foreign key into
 * `app.permissions`, so a key the catalogue does not carry cannot be written at
 * all: Postgres raises `23503` and the whole statement is rolled back. The
 * TypeScript catalogue and the seeded table are separate artefacts — the code
 * ships in one deploy, the migration runs in another — so a UI that offers a
 * capability ahead of its seed row would otherwise fail every other grant in the
 * same request with an unexplained 500.
 *
 * Resolving first turns that into a partial, explainable write: the keys the
 * catalogue holds are granted, the rest are reported back to the caller.
 */
export type CatalogueResolution<T extends string> = {
  /** Keys present in the catalogue; safe to insert as grants. */
  granted: T[];
  /** Keys the request asked for that this deployment cannot store yet. */
  missing: string[];
};

export function resolveAgainstCatalogue<T extends string>(
  requested: readonly T[],
  catalogue: Iterable<string>,
): CatalogueResolution<T> {
  const known = new Set(catalogue);
  const granted: T[] = [];
  const missing: string[] = [];

  for (const key of new Set(requested)) {
    if (known.has(key)) granted.push(key);
    else missing.push(key);
  }

  return { granted, missing };
}
