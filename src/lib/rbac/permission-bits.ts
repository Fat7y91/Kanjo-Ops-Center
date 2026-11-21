import { PERMISSION_KEYS, type Permission } from "./permissions";

/**
 * Wire-format permission mask.
 *
 * The session cookie used to carry the full `Permission[]`: 97 strings, ~2.7 kB
 * of JSON that every page request, RSC fetch and prefetch had to parse and
 * re-validate. The same capability set fits in 13 bytes — one bit per catalogue
 * key — and encodes to 18 base64url characters.
 *
 * The bit index is the key's position in `PERMISSION_KEYS`, so catalogue order
 * is part of the wire format. `PERMISSION_MASK_VERSION` fingerprints that order
 * and is stamped into every token: a catalogue that gains, loses or reorders a
 * key invalidates existing sessions instead of silently mapping one user's bits
 * onto another user's capabilities.
 */

export const PERMISSION_MASK_BYTES = Math.ceil(PERMISSION_KEYS.length / 8);

const BIT_INDEX: ReadonlyMap<string, number> = new Map(
  PERMISSION_KEYS.map((key, index) => [key, index]),
);

/** FNV-1a over the ordered key list. Cheap, stable, and order-sensitive. */
function fingerprint(keys: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const key of keys) {
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    // Key separator, so ["ab","c"] and ["a","bc"] do not collide.
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export const PERMISSION_MASK_VERSION = fingerprint(PERMISSION_KEYS);

export function encodePermissionMask(
  permissions: readonly Permission[],
): Uint8Array {
  const bytes = new Uint8Array(PERMISSION_MASK_BYTES);
  for (const permission of permissions) {
    const bit = BIT_INDEX.get(permission);
    if (bit === undefined) continue;
    bytes[bit >> 3] |= 1 << (bit & 7);
  }
  return bytes;
}

export function isPermissionMask(bytes: Uint8Array): boolean {
  return bytes.length === PERMISSION_MASK_BYTES;
}

export function maskHasPermission(
  bytes: Uint8Array,
  permission: Permission,
): boolean {
  const bit = BIT_INDEX.get(permission);
  if (bit === undefined) return false;
  return (bytes[bit >> 3] & (1 << (bit & 7))) !== 0;
}

export function maskHasAnyPermission(
  bytes: Uint8Array,
  permissions: readonly Permission[],
): boolean {
  for (const permission of permissions) {
    if (maskHasPermission(bytes, permission)) return true;
  }
  return false;
}

/** Expands a mask back into keys. Only for boundaries that need the array. */
export function decodePermissionMask(bytes: Uint8Array): Permission[] {
  const granted: Permission[] = [];
  for (let bit = 0; bit < PERMISSION_KEYS.length; bit += 1) {
    if ((bytes[bit >> 3] & (1 << (bit & 7))) !== 0) {
      granted.push(PERMISSION_KEYS[bit]);
    }
  }
  return granted;
}
