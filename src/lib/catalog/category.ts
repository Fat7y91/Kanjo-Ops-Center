/**
 * Category key helpers.
 *
 * Taxonomy categories are identified by `${vendorTypeId}-${categoryId}` on the
 * client but by a numeric id on the server, so the draft queue needs a single
 * place to translate between the two representations.
 */

export function categoryIdFromKey(
  key: string | null | undefined,
): number | null {
  if (!key) return null;
  const segments = key.split("-");
  const id = Number(segments[segments.length - 1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
