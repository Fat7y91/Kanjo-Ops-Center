/**
 * Minimal AWS Signature Version 4 signer.
 *
 * Cloudflare R2 speaks the S3 API, so a signed PUT/HEAD is all we need to copy
 * an image into the bucket. The algorithm is implemented with Web Crypto so it
 * runs unchanged on the edge runtime, and it is kept free of `server-only` so
 * the official AWS test vector can pin it in `scripts/lib/sigv4.test.mjs`.
 */

const encoder = new TextEncoder();

export type AwsSignInput = {
  method: string;
  /** Already URL-encoded path, including the bucket. */
  path: string;
  /** Canonical query string; empty when there is none. */
  query: string;
  /** Headers to sign. Keys are normalised to lowercase before signing. */
  headers: Record<string, string>;
  /** Hex SHA-256 of the request body (empty-body hash for HEAD/GET). */
  payloadHash: string;
  region: string;
  service: string;
  /** ISO-8601 basic format: YYYYMMDDTHHMMSSZ. */
  amzDate: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type AwsSignature = {
  authorization: string;
  signedHeaders: string;
  signature: string;
  canonicalRequest: string;
};

export function hex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(
  input: string | Uint8Array,
): Promise<string> {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function normaliseHeaders(
  headers: Record<string, string>,
): { canonical: string; signed: string } {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const canonical = entries
    .map(([name, value]) => `${name}:${value.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  return {
    canonical,
    signed: entries.map(([name]) => name).join(";"),
  };
}

/** Computes the Authorization header for a request. Pure and deterministic. */
export async function signAwsV4(
  input: AwsSignInput,
): Promise<AwsSignature> {
  const dateStamp = input.amzDate.slice(0, 8);
  const { canonical: canonicalHeaders, signed: signedHeaders } =
    normaliseHeaders(input.headers);

  const canonicalRequest = [
    input.method.toUpperCase(),
    input.path,
    input.query,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = await hmac(
    encoder.encode(`AWS4${input.secretAccessKey}`),
    dateStamp,
  );
  const regionKey = await hmac(dateKey, input.region);
  const serviceKey = await hmac(regionKey, input.service);
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signedHeaders,
    signature,
    canonicalRequest,
  };
}

/** Formats a Date as `YYYYMMDDTHHMMSSZ`. */
export function amzDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
