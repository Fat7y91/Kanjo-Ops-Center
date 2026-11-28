import "server-only";

const encoder = new TextEncoder();

function proxySecret(): string | null {
  return (
    process.env.IMAGE_PROXY_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

export function imageProxyConfigured(): boolean {
  return Boolean(proxySecret());
}

/** Rejects non-public HTTP targets so the signed route cannot fetch internals. */
export function publicImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return null;
  }
  if (parsed.port && parsed.port !== "443") return null;

  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".") || host.startsWith("[") || host.includes(":")) {
    return null;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  if (/\.(?:local|internal|localhost)$/.test(host)) return null;
  return parsed.toString();
}

async function hmacKey(usage: "sign" | "verify"): Promise<CryptoKey | null> {
  const secret = proxySecret();
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Signs a Serper image URL into the same-origin image proxy path. */
export async function signImageProxyUrl(raw: string): Promise<string | null> {
  const url = publicImageUrl(raw);
  if (!url) return null;
  const key = await hmacKey("sign");
  if (!key) return null;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(url),
  );
  return `/api/image?url=${encodeURIComponent(url)}&sig=${toHex(signature)}`;
}

export async function verifyImageProxySignature(
  raw: string,
  signature: string,
): Promise<boolean> {
  const url = publicImageUrl(raw);
  const bytes = fromHex(signature);
  if (!url || !bytes) return false;
  const key = await hmacKey("verify");
  if (!key) return false;
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(url));
}
