import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const moduleUrl = pathToFileURL(
  path.join(root, "src/lib/errors/connection.ts"),
).href;

const { isConnectionError } = await import(moduleUrl);

test("RSC severed stream is a connection error", () => {
  assert.equal(isConnectionError(new Error("Connection closed.")), true);
});

test("browser fetch failures are connection errors", () => {
  assert.equal(isConnectionError(new TypeError("Failed to fetch")), true);
  assert.equal(isConnectionError(new Error("NetworkError when attempting to fetch")), true);
  assert.equal(isConnectionError(new Error("Load failed")), true);
});

test("aborts and timeouts are connection errors", () => {
  const abort = new Error("The operation was aborted.");
  abort.name = "AbortError";
  assert.equal(isConnectionError(abort), true);

  const timeout = new Error("timed out");
  timeout.name = "TimeoutError";
  assert.equal(isConnectionError(timeout), true);
});

test("wrapped transport errors are found through cause", () => {
  const wrapper = new Error("upload failed", {
    cause: new TypeError("Failed to fetch"),
  });
  assert.equal(isConnectionError(wrapper), true);
});

test("plain rendering defects are not connection errors", () => {
  assert.equal(isConnectionError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isConnectionError(new Error("useSession must be used inside <SessionProvider>.")), false);
  assert.equal(isConnectionError(null), false);
  assert.equal(isConnectionError(undefined), false);
});
