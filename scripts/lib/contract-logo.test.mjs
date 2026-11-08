import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { sniffRasterFormat, resolveLogoDataUri } = loadTsModule(
  path.join(projectRoot, "src/lib/contracts/render/logo.ts"),
);

test("sniffRasterFormat recognises JPEG and PNG signatures", () => {
  assert.equal(sniffRasterFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(
    sniffRasterFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])),
    "png",
  );
  assert.equal(sniffRasterFormat(new Uint8Array([0x47, 0x49, 0x46])), null);
  assert.equal(sniffRasterFormat(new Uint8Array([])), null);
});

test("resolveLogoDataUri rejects empty and non-URL sources", async () => {
  assert.equal(await resolveLogoDataUri(""), "");
  assert.equal(await resolveLogoDataUri(null), "");
  assert.equal(await resolveLogoDataUri("not-a-url"), "");
});

test("resolveLogoDataUri keeps a valid JPEG/PNG data URI", async () => {
  const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  assert.equal(await resolveLogoDataUri(jpeg), jpeg);
  assert.equal(await resolveLogoDataUri("data:image/webp;base64,AAAA"), "");
});

test("resolveLogoDataUri drops remote images that are not JPEG/PNG", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([0x47, 0x49, 0x46, 0x38]), { status: 200 });
  try {
    assert.equal(await resolveLogoDataUri("https://example.com/logo.gif"), "");
  } finally {
    globalThis.fetch = original;
  }
});

test("resolveLogoDataUri embeds a remote PNG as a data URI", async () => {
  const original = globalThis.fetch;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  globalThis.fetch = async () => new Response(png, { status: 200 });
  try {
    const result = await resolveLogoDataUri("https://example.com/logo.png");
    assert.match(result, /^data:image\/png;base64,/);
  } finally {
    globalThis.fetch = original;
  }
});

test("resolveLogoDataUri degrades to empty on fetch failure", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("nope", { status: 404 });
  try {
    assert.equal(await resolveLogoDataUri("https://example.com/logo.png"), "");
  } finally {
    globalThis.fetch = original;
  }
});
