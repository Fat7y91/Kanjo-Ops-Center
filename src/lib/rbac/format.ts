import { isPermission, permissionDefinition } from "./permissions";

/**
 * Operator-facing sentence for a grant that was not stored.
 *
 * Capability keys are identifiers the roster never shows: the modal labels every
 * checkbox from the catalogue, so a partial write is reported with the same
 * wording the operator just clicked. A key that is not in the catalogue falls
 * back to its raw form rather than disappearing from the message.
 */
export function describeSkippedPermissions(
  keys: readonly string[],
): string | null {
  if (keys.length === 0) return null;

  const labels = keys.map((key) =>
    isPermission(key) ? permissionDefinition(key).label : key,
  );
  return `تم حفظ بقية التغييرات. لم تُمنح: ${labels.join("، ")}.`;
}
