/**
 * Base64 <-> bytes helpers shared by the image store and the mirror pipeline.
 *
 * Kept free of `server-only` so the parsing rules can be unit tested and reused
 * on the edge runtime (which exposes `atob`/`btoa` but not Node's Buffer).
 */

export type ParsedImageDataUrl = {
  contentType: string;
  bytes: Uint8Array;
};

const CHUNK = 0x8000;

/** Encodes bytes without spreading the whole array into `fromCharCode`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.subarray(offset, offset + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** Decodes Base64, returning null on malformed input. */
export function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Parses `data:image/...;base64,...` into a MIME type and raw bytes. */
export function parseImageDataUrl(value: string): ParsedImageDataUrl | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const bytes = base64ToBytes(match[2]);
  if (!bytes || bytes.length === 0) return null;
  return { contentType: match[1].toLowerCase(), bytes };
}

/** Builds the inline representation the blob store persists. */
export function toImageDataUrl(
  contentType: string,
  bytes: Uint8Array,
): string {
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}
