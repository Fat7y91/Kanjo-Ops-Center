import {
  encodePermissionMask,
  isPermissionMask,
  maskHasAnyPermission,
  PERMISSION_MASK_VERSION,
} from "@/lib/rbac/permission-bits";
import { isPermission, type Permission } from "@/lib/rbac/permissions";

export const SESSION_COOKIE = "kanjo_v2_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * Decoded session.
 *
 * `mask` is the base64url permission bitset from
 * `@/lib/rbac/permission-bits`, not the 97-key array it replaced. Callers must
 * not decode it themselves — use `sessionHasAny`.
 */
export type SessionPayload = {
  sub: string;
  mask: string;
  rev: number;
  iat: number;
  exp: number;
};

/** Wire body: `p` is the mask, `pv` the permission-catalogue fingerprint. */
type SessionTokenBody = {
  sub: string;
  p: string;
  pv: number;
  rev: number;
  iat: number;
  exp: number;
};

const DEVELOPMENT_SECRET =
  "kanjo-v2-development-only-session-secret";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a value of at least 16 characters.",
    );
  }

  return DEVELOPMENT_SECRET;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decodes base64url into bytes that Web Crypto accepts as a `BufferSource`.
 *
 * The return type is pinned to `Uint8Array<ArrayBuffer>` rather than the default
 * `Uint8Array<ArrayBufferLike>`: a `Uint8Array` may be backed by a
 * `SharedArrayBuffer`, and `crypto.subtle.verify()` requires a view it can
 * address synchronously. `new Uint8Array(length)` allocates an `ArrayBuffer`
 * here, so the narrow type is what the code actually produces — and it keeps
 * the value assignable to `BufferSource` on the library versions where the
 * default widened.
 */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * The HMAC key is derived from a constant secret, so it is imported once per
 * isolate instead of on every middleware/session verification. On the Edge
 * runtime `crypto.subtle.importKey` is the single most expensive part of the
 * auth hot path, and importing a stable key repeatedly was a measurable CPU
 * cost on every page request.
 */
let cachedSigningKey: CryptoKey | null = null;
let cachedSecret: string | null = null;

async function signingKey(): Promise<CryptoKey> {
  const secret = sessionSecret();
  if (cachedSigningKey && cachedSecret === secret) return cachedSigningKey;

  cachedSigningKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  cachedSecret = secret;
  return cachedSigningKey;
}

export async function createSessionToken(
  userId: string,
  permissions: readonly Permission[],
  revision: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenBody = {
    sub: userId,
    p: toBase64Url(encodePermissionMask(permissions)),
    pv: PERMISSION_MASK_VERSION,
    rev: revision,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };

  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(body),
  );

  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;

    const parsed: unknown = JSON.parse(
      decoder.decode(fromBase64Url(body)),
    );
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Partial<SessionTokenBody> & { perms?: unknown };
    if (
      typeof candidate.sub !== "string" ||
      typeof candidate.rev !== "number" ||
      typeof candidate.exp !== "number"
    ) {
      return null;
    }

    if (candidate.exp <= Math.floor(Date.now() / 1000)) return null;

    const mask = readMask(candidate);
    if (!mask) return null;

    return {
      sub: candidate.sub,
      mask,
      rev: candidate.rev,
      iat: typeof candidate.iat === "number" ? candidate.iat : 0,
      exp: candidate.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the permission mask off a decoded body.
 *
 * Returns `null` when the mask was produced by a different permission
 * catalogue: bits are positional, so replaying a stale mask would grant a
 * capability the user was never given. Rejecting the token forces a re-login,
 * which is the only safe outcome.
 */
function readMask(
  candidate: Partial<SessionTokenBody> & { perms?: unknown },
): string | null {
  if (typeof candidate.p === "string") {
    if (candidate.pv !== PERMISSION_MASK_VERSION) return null;
    return isPermissionMask(fromBase64Url(candidate.p)) ? candidate.p : null;
  }

  // Tokens minted before the mask migration carried the full key array.
  // Accepted only until the last of them ages out (SESSION_MAX_AGE_SECONDS).
  if (Array.isArray(candidate.perms) && candidate.perms.every(isPermission)) {
    return toBase64Url(encodePermissionMask(candidate.perms));
  }

  return null;
}

/** Permission check for the request hot path. Allocates no key array. */
export function sessionHasAny(
  payload: SessionPayload,
  permissions: readonly Permission[],
): boolean {
  try {
    return maskHasAnyPermission(fromBase64Url(payload.mask), permissions);
  } catch {
    return false;
  }
}
