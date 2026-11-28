import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const hosted = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/images/hosted.ts"),
);
const base64 = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/images/base64.ts"),
);
const download = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/images/download.ts"),
);
const format = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/format.ts"),
);

const TARGET = "https://cdn.mafrservices.com/products/123.jpg";

function bytes(length, fill = 1) {
  return new Uint8Array(length).fill(fill);
}

function imageResponse(contentType = "image/jpeg", length = 2000) {
  return new Response(bytes(length), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

/* ── hosted detection ─────────────────────────────────────────────────── */

test("internal absolute and relative image URLs are hosted", () => {
  assert.equal(
    hosted.isHostedImageUrl(
      "https://kanjo-ops-center.pages.dev/api/catalog/images/img-abc",
    ),
    true,
  );
  assert.equal(hosted.isHostedImageUrl("/api/catalog/images/img-abc"), true);
});

test("external and inline images still need mirroring", () => {
  assert.equal(hosted.isHostedImageUrl(TARGET), false);
  assert.equal(hosted.isHostedImageUrl("data:image/jpeg;base64,AAAA"), false);
  assert.equal(hosted.needsMirroring(TARGET), true);
  assert.equal(hosted.needsMirroring(""), false);
});

test("the configured R2 public base counts as hosted", () => {
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.kanjo.example";
  try {
    assert.equal(
      hosted.isHostedImageUrl("https://cdn.kanjo.example/catalog-images/a.jpg"),
      true,
    );
    assert.equal(
      hosted.isHostedImageUrl("https://other.example/catalog-images/a.jpg"),
      false,
    );
  } finally {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  }
});

/* ── base64 ───────────────────────────────────────────────────────────── */

test("data URLs round-trip through the bytes helpers", () => {
  const source = bytes(32, 7);
  const dataUrl = base64.toImageDataUrl("image/png", source);
  const parsed = base64.parseImageDataUrl(dataUrl);
  assert.equal(parsed.contentType, "image/png");
  assert.deepEqual(Array.from(parsed.bytes), Array.from(source));
});

test("non-image and malformed data URLs are rejected", () => {
  assert.equal(base64.parseImageDataUrl("data:text/plain;base64,AAAA"), null);
  assert.equal(base64.parseImageDataUrl("https://example.com/a.jpg"), null);
});

/* ── download pipeline ────────────────────────────────────────────────── */

test("a browser-friendly JPEG downloads directly", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url, init) => {
      assert.equal(url, TARGET);
      assert.match(init.headers["User-Agent"], /Chrome/);
      return imageResponse();
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "direct");
});

test("a 403 is retried with the origin as Referer", async () => {
  const calls = [];
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url, init) => {
      calls.push(init.headers.Referer ?? null);
      if (!init.headers.Referer) {
        return new Response("forbidden", { status: 403 });
      }
      return imageResponse();
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "referer");
  assert.equal(calls.at(-1), "https://cdn.mafrservices.com/");
});

test("an HTML answer falls through to the JPEG proxy", async () => {
  const seen = [];
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url) => {
      seen.push(url);
      if (url.startsWith("https://wsrv.nl/")) return imageResponse();
      return new Response("<html>blocked</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "proxy");
  assert.ok(seen.some((url) => url.includes(encodeURIComponent(TARGET))));
});

test("a WebP is kept when the proxy is unavailable", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url) => {
      if (url.startsWith("https://wsrv.nl/")) {
        return new Response("gone", { status: 404 });
      }
      return imageResponse("image/webp");
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "direct");
  assert.equal(result.contentType, "image/webp");
});

test("too-small images fail with a size reason", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async () => imageResponse("image/jpeg", 120),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /حجم/);
});

test("every strategy failing returns a download reason", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async () => new Response("nope", { status: 404 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /تعذر/);
});

test("a 403 from every strategy reports that the source blocks downloads", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async () =>
      new Response("denied", {
        status: 403,
        headers: { "content-type": "text/html" },
      }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /يمنع/);
});

/* ── source resolution ────────────────────────────────────────────────── */

test("a signed /api/image proxy path resolves to its upstream URL", () => {
  const raw = `/api/image?url=${encodeURIComponent(TARGET)}&sig=abc123`;
  assert.equal(format.resolveDisplayImageUrl(raw), TARGET);
});

/* ── bounded storage ──────────────────────────────────────────────────── */

test("an oversized JPEG is normalised through the 800px resize proxy", async () => {
  const seen = [];
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url) => {
      seen.push(url);
      if (url.startsWith("https://wsrv.nl/")) {
        assert.match(url, /[?&]w=800(&|$)/);
        assert.match(url, /[?&]h=800(&|$)/);
        assert.match(url, /[?&]fit=inside(&|$)/);
        assert.match(url, /[?&]we(&|$)/);
        assert.match(url, /[?&]output=jpg(&|$)/);
        assert.match(url, /[?&]q=82(&|$)/);
        return imageResponse("image/jpeg", 120 * 1024);
      }
      return imageResponse("image/jpeg", 9 * 1024 * 1024);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "proxy");
  assert.equal(result.bytes.byteLength, 120 * 1024);
  assert.ok(seen.some((url) => url.includes(encodeURIComponent(TARGET))));
});

test("a PNG is re-encoded to JPEG even below the raw size target", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url) => {
      if (url.startsWith("https://wsrv.nl/")) {
        return imageResponse("image/jpeg", 90 * 1024);
      }
      return imageResponse("image/png", 300 * 1024);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "proxy");
  assert.equal(result.contentType, "image/jpeg");
});

test("a proxy result above 500 KB retries at 600x600/q75", async () => {
  let proxyCalls = 0;
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url) => {
      if (url.startsWith("https://wsrv.nl/")) {
        proxyCalls += 1;
        if (url.includes("w=600")) {
          assert.match(url, /[?&]q=75(&|$)/);
          return imageResponse("image/jpeg", 150 * 1024);
        }
        return imageResponse("image/jpeg", 600 * 1024);
      }
      return imageResponse("image/jpeg", 9 * 1024 * 1024);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "proxy");
  assert.equal(result.bytes.byteLength, 150 * 1024);
  assert.equal(proxyCalls, 2);
});

test("a proxy result above the 1 MB ceiling is rejected", async () => {
  const result = await download.downloadImage(TARGET, {
    fetchImpl: async (url) => {
      if (url.startsWith("https://wsrv.nl/")) {
        return imageResponse("image/jpeg", 2 * 1024 * 1024);
      }
      return imageResponse("image/jpeg", 9 * 1024 * 1024);
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /حجم/);
});

test("resize URLs encode the source and never enlarge", () => {
  const url = download.resizeImageUrl("https://example.com/a b.jpg?x=1&y=2");
  assert.match(
    url,
    /[?&]url=https%3A%2F%2Fexample.com%2Fa%20b.jpg%3Fx%3D1%26y%3D2(&|$)/,
  );
  assert.match(url, /[?&]we(&|$)/);
  assert.match(url, /[?&]w=800(&|$)/);
  assert.match(url, /[?&]q=82(&|$)/);
});
