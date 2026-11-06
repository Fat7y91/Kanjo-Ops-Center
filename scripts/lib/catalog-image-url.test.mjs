import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { driveFileId, resolveDisplayImageUrl, proxyImageUrl } = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/format.ts"),
);

const ID = "1mkb1BuOcNZvbrnvK2HnaA_Dv2ndve1PF";
const LH3 = `https://lh3.googleusercontent.com/d/${ID}=w1600`;

test("extracts the file id from every V1 Drive URL shape", () => {
  assert.equal(driveFileId(`https://drive.google.com/uc?export=view&id=${ID}`), ID);
  assert.equal(driveFileId(`https://drive.google.com/thumbnail?id=${ID}&sz=w1000`), ID);
  assert.equal(driveFileId(`https://drive.google.com/file/d/${ID}/view`), ID);
  assert.equal(driveFileId(ID), ID);
  assert.equal(driveFileId(""), "");
});

test("rewrites uc?export=view to the embeddable lh3 host", () => {
  assert.equal(
    resolveDisplayImageUrl(`https://drive.google.com/uc?export=view&id=${ID}`),
    LH3,
  );
});

test("rewrites thumbnail and file-view shapes to the same host", () => {
  assert.equal(
    resolveDisplayImageUrl(`https://drive.google.com/thumbnail?id=${ID}&sz=w1600`),
    LH3,
  );
  assert.equal(
    resolveDisplayImageUrl(`https://drive.google.com/file/d/${ID}/view`),
    LH3,
  );
});

test("wraps a bare Drive file id", () => {
  assert.equal(resolveDisplayImageUrl(ID), LH3);
});

test("leaves an already-normalised lh3 URL untouched", () => {
  assert.equal(resolveDisplayImageUrl(LH3), LH3);
});

test("leaves non-Drive references untouched", () => {
  const storage = "https://xyz.supabase.co/storage/v1/object/public/a.jpg";
  assert.equal(resolveDisplayImageUrl(storage), storage);

  const dataUrl = "data:image/jpeg;base64,AAAA";
  assert.equal(resolveDisplayImageUrl(dataUrl), dataUrl);
});

test("returns null for empty input", () => {
  assert.equal(resolveDisplayImageUrl(null), null);
  assert.equal(resolveDisplayImageUrl(undefined), null);
  assert.equal(resolveDisplayImageUrl("   "), null);
});

test("builds a same-origin proxy path for Drive references", () => {
  const proxied = proxyImageUrl(`https://drive.google.com/uc?export=view&id=${ID}`);
  assert.equal(
    proxied,
    `/api/image?url=${encodeURIComponent(LH3)}`,
  );
});

test("does not proxy non-Drive references", () => {
  const storage = "https://xyz.supabase.co/storage/v1/object/public/a.jpg";
  assert.equal(proxyImageUrl(storage), null);
  assert.equal(proxyImageUrl("data:image/jpeg;base64,AAAA"), null);
  assert.equal(proxyImageUrl(null), null);
});
