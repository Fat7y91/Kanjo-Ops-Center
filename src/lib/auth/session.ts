import { isPermission, type Permission } from "@/lib/rbac/permissions";

export const SESSION_COOKIE = "kanjo_v2_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type SessionPayload = {
  sub: string;
  perms: Permission[];
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

function fromBase64Url(value: string): Uint8Array {
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

async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  userId: string,
  permissions: readonly Permission[],
  revision: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    perms: [...permissions],
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

    const candidate = parsed as Partial<SessionPayload>;
    if (
      typeof candidate.sub !== "string" ||
      typeof candidate.rev !== "number" ||
      typeof candidate.exp !== "number" ||
      !Array.isArray(candidate.perms) ||
      !candidate.perms.every(isPermission)
    ) {
      return null;
    }

    if (candidate.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      sub: candidate.sub,
      perms: candidate.perms,
      rev: candidate.rev,
      iat: typeof candidate.iat === "number" ? candidate.iat : 0,
      exp: candidate.exp,
    };
  } catch {
    return null;
  }
}
