import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const sig = loadTsModule(
  path.join(projectRoot, "src/lib/catalog/images/sigv4.ts"),
);

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

test("sha256Hex matches the empty-string digest", async () => {
  assert.equal(await sig.sha256Hex(""), EMPTY_SHA256);
});

/**
 * Official AWS SigV4 `get-vanilla` test vector. If this signature matches, the
 * canonical request, string-to-sign and key derivation are all correct, which
 * is what the R2 PUT/HEAD calls depend on.
 */
test("signs the AWS get-vanilla vector", async () => {
  const result = await sig.signAwsV4({
    method: "GET",
    path: "/",
    query: "",
    headers: {
      host: "example.amazonaws.com",
      "x-amz-date": "20150830T123600Z",
    },
    payloadHash: EMPTY_SHA256,
    region: "us-east-1",
    service: "service",
    amzDate: "20150830T123600Z",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  });

  assert.equal(result.signedHeaders, "host;x-amz-date");
  assert.equal(
    result.signature,
    "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
  );
  assert.match(
    result.authorization,
    /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request, SignedHeaders=host;x-amz-date, Signature=/,
  );
});

test("amzDate formats a Date as basic ISO-8601", () => {
  assert.equal(
    sig.amzDate(new Date("2015-08-30T12:36:00.000Z")),
    "20150830T123600Z",
  );
});
