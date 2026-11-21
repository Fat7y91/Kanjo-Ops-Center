import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { projectRoot } from "./load-ts.mjs";

/**
 * Combobox open behaviour and submit wiring.
 *
 * The pickers must show the whole list on focus/click, not only after typing:
 * `immediate` is what tells Headless UI to open on focus. The submit must run
 * through a real form so the browser's default navigation can be prevented, and
 * every failure path must revert the optimistic row.
 */

const SELECT_MENUS = readFileSync(
  path.join(projectRoot, "src/components/ui/select-menus.tsx"),
  "utf8",
);
const FORM = readFileSync(
  path.join(projectRoot, "src/components/operations/operation-log-form.tsx"),
  "utf8",
);
const CREATE_FORM = readFileSync(
  path.join(projectRoot, "src/components/operations/order-create-modal.tsx"),
  "utf8",
);
const HOOK = readFileSync(
  path.join(projectRoot, "src/components/operations/use-operation-form.ts"),
  "utf8",
);
const REPOSITORY = readFileSync(
  path.join(projectRoot, "src/lib/operations/repository.ts"),
  "utf8",
);
const SERVICE = readFileSync(
  path.join(projectRoot, "src/lib/operations/service.ts"),
  "utf8",
);

test("the combobox opens its list immediately on focus", () => {
  const comboField = SELECT_MENUS.slice(SELECT_MENUS.indexOf("export function ComboField"));
  assert.ok(comboField.length > 0, "ComboField is missing");
  // A bare `immediate` prop token inside the ComboField body. The opening tag
  // cannot be matched with a simple regex because the onChange arrow contains a
  // `>` character.
  assert.match(comboField, /^\s+immediate$/m);
});

test("the combobox still filters while typing", () => {
  assert.match(SELECT_MENUS, /setQuery\(event\.target\.value\)/);
});

test("the form submits through onSubmit and prevents the default", () => {
  assert.match(CREATE_FORM, /<form[\s\S]*onSubmit=/);
  assert.match(CREATE_FORM, /event\.preventDefault\(\)/);
});

test("the submit button is a real submit control", () => {
  assert.match(CREATE_FORM, /type="submit"/);
});

test("the submit request is bounded by an abort timeout", () => {
  assert.match(HOOK, /new AbortController\(\)/);
  assert.match(HOOK, /controller\.abort\(\)/);
  assert.match(HOOK, /signal: controller\.signal/);
});

test("a failed submit removes exactly the provisional row", () => {
  const revert = HOOK.match(
    /current\.filter\(\(row\) => row\.id !== provisional\.id\)/g,
  );
  // Once for a non-ok response, once for a thrown/aborted request.
  assert.ok(revert && revert.length >= 2, "both failure paths must revert");
});

test("a failed submit surfaces an operator-facing error", () => {
  assert.match(HOOK, /submitErrorMessage\(caught\)/);
});

test("the failure toast is an alert and the success toast is a status", () => {
  assert.match(FORM, /toast toast-error[\s\S]*role="alert"/);
  assert.match(FORM, /className="toast"[\s\S]*role="status"/);
});

test("every operations query carries a deadline", () => {
  // An unbounded PostgREST call is what lets the platform kill the request and
  // surface as an aborted fetch in the browser.
  const queries = REPOSITORY.match(/\.schema\("app"\)/g) ?? [];
  const deadlines = REPOSITORY.match(/abortSignal\(AbortSignal\.timeout\(/g) ?? [];
  assert.equal(deadlines.length, queries.length);
  assert.match(REPOSITORY, /WRITE_TIMEOUT_MS/);
  assert.match(REPOSITORY, /READ_TIMEOUT_MS/);
});

test("a database timeout becomes a retryable 503", () => {
  assert.match(SERVICE, /isQueryTimeout\(error\)/);
  assert.match(SERVICE, /STORE_TIMEOUT[\s\S]*503/);
});
