/**
 * One-off backfill: shrink oversized catalog image blobs in place.
 *
 * Finds `app.catalog_image_blobs` rows above 400 KB, re-encodes them as
 * 800x800/q82 JPEG (sharp when available, wsrv.nl otherwise), retries smaller
 * when needed and rewrites the same row id with `image/jpeg`. Images are never
 * deleted and the public URL (which is the id) never changes.
 *
 * Usage:
 *   set -a && . ./.env.local && set +a
 *   node scripts/compress-catalog-images.mjs [--dry-run]
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Optional:
 * NEXT_PUBLIC_APP_URL (defaults to the production Pages host).
 */

import { createClient } from "@supabase/supabase-js";

const THRESHOLD_BYTES = 400 * 1024;
const HARD_LIMIT_BYTES = 1024 * 1024;
const CONCURRENCY = 4;
const DRY_RUN = process.argv.includes("--dry-run");

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const site = (process.env.NEXT_PUBLIC_APP_URL ?? "https://kanjo-ops-center.pages.dev")
  .trim()
  .replace(/\/+$/, "");
const client = createClient(
  env("SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let sharp = null;
try {
  sharp = (await import("sharp")).default;
  console.log("compressor: sharp (local decode)");
} catch {
  console.log("compressor: wsrv.nl (sharp unavailable)");
}

function proxyUrl(source, width, quality) {
  return `https://wsrv.nl/?url=${encodeURIComponent(source)}&w=${width}&h=${width}&fit=inside&we&output=jpg&q=${quality}`;
}

function isJpeg(bytes) {
  return bytes.length > 500 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

async function fetchSource(source) {
  const response = await fetch(source, {
    signal: AbortSignal.timeout(90_000),
    headers: { "User-Agent": "kanjo-image-backfill/1.0" },
  });
  if (!response.ok) throw new Error(`source ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchVariant(source, width, quality) {
  const response = await fetch(proxyUrl(source, width, quality), {
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`proxy ${response.status}`);
  const type = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (type !== "image/jpeg") throw new Error(`proxy type ${type}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isJpeg(bytes)) throw new Error("proxy body is not JPEG");
  return bytes;
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    return fn();
  }
}

async function compressLocally(bytes) {
  if (!sharp) return null;
  const image = sharp(bytes, { failOn: "none" }).rotate();
  let best = null;
  for (const [width, quality] of [
    [800, 82],
    [600, 75],
    [480, 70],
  ]) {
    const next = await image
      .clone()
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (!best || next.length < best.length) best = next;
    if (best.length <= 200 * 1024) break;
  }
  return best ? new Uint8Array(best) : null;
}

async function compressRemotely(source) {
  let best = await withRetry(() => fetchVariant(source, 800, 82));
  if (best.byteLength <= 300 * 1024) return best;
  for (const [width, quality] of [
    [600, 75],
    [480, 70],
  ]) {
    try {
      const next = await withRetry(() => fetchVariant(source, width, quality));
      if (next.byteLength < best.byteLength) best = next;
    } catch {
      // Keep the smallest successful variant.
    }
    if (best.byteLength <= 200 * 1024) break;
  }
  return best;
}

async function compress(source) {
  if (sharp) {
    try {
      const bytes = await compressLocally(await fetchSource(source));
      if (bytes) return bytes;
    } catch (error) {
      console.log(`  local decode failed, trying wsrv: ${error.message}`);
    }
  }
  return compressRemotely(source);
}

async function loadRows() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .schema("app")
      .from("catalog_image_blobs")
      .select("id,byte_size,content_type")
      .gt("byte_size", THRESHOLD_BYTES)
      .order("byte_size", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function save(row, bytes) {
  const payload = {
    content_type: "image/jpeg",
    data_url: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`,
    byte_size: bytes.byteLength,
  };
  const write = () =>
    client
      .schema("app")
      .from("catalog_image_blobs")
      .update(payload)
      .eq("id", row.id);
  const first = await write();
  if (first.error) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const second = await write();
    if (second.error) throw second.error;
  }
}

async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
}

const rows = await loadRows();
console.log(
  `${rows.length} blob(s) above ${Math.round(THRESHOLD_BYTES / 1024)} KB${DRY_RUN ? " (dry run)" : ""}`,
);

let shrunk = 0;
let skipped = 0;
let failed = 0;
let savedBytes = 0;

await mapLimit(rows, CONCURRENCY, async (row) => {
  const before = Number(row.byte_size);
  const source = `${site}/api/catalog/images/${encodeURIComponent(row.id)}`;
  try {
    const bytes = await compress(source);
    const after = bytes.byteLength;
    if (after >= before || after > HARD_LIMIT_BYTES) {
      skipped += 1;
      console.log(`[skip] ${row.id} ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
      return;
    }
    if (!DRY_RUN) await save(row, bytes);
    shrunk += 1;
    savedBytes += before - after;
    console.log(`[ok] ${row.id} ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
  } catch (error) {
    failed += 1;
    console.log(`[fail] ${row.id} ${Math.round(before / 1024)} KB: ${error.message}`);
  }
});

console.log(
  JSON.stringify({
    shrunk,
    skipped,
    failed,
    savedMb: Math.round((savedBytes / (1024 * 1024)) * 10) / 10,
    dryRun: DRY_RUN,
  }),
);
