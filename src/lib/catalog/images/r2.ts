import "server-only";

import { optionalEnv } from "@/lib/db/env";

import { sha256Hex } from "./hash";
import { amzDate, signAwsV4 } from "./sigv4";

/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Only the operations the catalog needs are implemented: `HEAD` to reuse an
 * already-mirrored object and `PUT` to store a new one. Credentials are read
 * lazily, so a deployment without R2 simply reports `isR2Configured() === false`
 * and the mirror workflow falls back to the internal blob store.
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function getR2Config(): R2Config | null {
  const accountId = optionalEnv("R2_ACCOUNT_ID");
  const accessKeyId = optionalEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = optionalEnv("R2_SECRET_ACCESS_KEY");
  const bucket = optionalEnv("R2_BUCKET");
  const publicBaseUrl = optionalEnv("R2_PUBLIC_BASE_URL");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function objectPath(config: R2Config, key: string): string {
  return `/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`;
}

function endpoint(config: R2Config): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com`;
}

/** Public URL for an object key, or null when R2 is not configured. */
export function r2ObjectUrl(key: string): string | null {
  const config = getR2Config();
  if (!config) return null;
  return `${config.publicBaseUrl}/${encodeKey(key)}`;
}

async function signedFetch(
  config: R2Config,
  method: "HEAD" | "PUT",
  key: string,
  body: Uint8Array | null,
  contentType: string | null,
): Promise<Response> {
  const payloadHash = body ? await sha256Hex(body) : EMPTY_SHA256;
  const date = new Date();
  const stamp = amzDate(date);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const signedHeaders: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  };
  const { authorization } = await signAwsV4({
    method,
    path: objectPath(config, key),
    query: "",
    headers: signedHeaders,
    payloadHash,
    region: "auto",
    service: "s3",
    amzDate: stamp,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  const headers: Record<string, string> = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  };
  if (contentType) headers["Content-Type"] = contentType;
  if (method === "PUT") {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  return fetch(`${endpoint(config)}${objectPath(config, key)}`, {
    method,
    headers,
    body: body ? (body as unknown as BodyInit) : undefined,
  });
}

/** True when the object already exists in the bucket. */
export async function headR2Object(key: string): Promise<boolean> {
  const config = getR2Config();
  if (!config) return false;
  const response = await signedFetch(config, "HEAD", key, null, null);
  return response.ok;
}

/**
 * Uploads bytes and returns their public URL.
 *
 * `Cache-Control` is immutable because the key is the source hash: the same key
 * always describes the same source reference.
 */
export async function putR2Object(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const config = getR2Config();
  if (!config) throw new Error("R2_NOT_CONFIGURED");

  const response = await signedFetch(config, "PUT", key, bytes, contentType);
  if (!response.ok) {
    throw new Error(`R2_PUT_FAILED:${response.status}`);
  }
  return `${config.publicBaseUrl}/${encodeKey(key)}`;
}
