/**
 * AES-GCM sealing for marketing platform credentials.
 *
 * `app.marketing_platform_settings.api_key_ciphertext` is only ever written
 * through this module, so the column never holds plaintext. The key is derived
 * from `SESSION_SECRET`, which the deployment already treats as a server-only
 * secret. Web Crypto is available on both the Edge runtime and Node 20+, so the
 * same code path serves every route.
 *
 * Envelope format: base64(iv ‖ ciphertext), with a 12-byte random IV per write.
 */
const IV_BYTES = 12;

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 16) {
    throw new Error("Marketing secret box requires SESSION_SECRET.");
  }
  return value;
}

async function key(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret()),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function sealCredentials(
  credentials: Readonly<Record<string, string>>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), encoded),
  );
  const envelope = new Uint8Array(iv.length + ciphertext.length);
  envelope.set(iv);
  envelope.set(ciphertext, iv.length);
  return toBase64(envelope);
}

/** Returns `{}` for an empty column or an envelope this deployment cannot open. */
export async function openCredentials(
  sealed: string | null,
): Promise<Record<string, string>> {
  if (!sealed) return {};
  try {
    const envelope = fromBase64(sealed);
    const iv = envelope.slice(0, IV_BYTES);
    const ciphertext = envelope.slice(IV_BYTES);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await key(),
      ciphertext,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}
