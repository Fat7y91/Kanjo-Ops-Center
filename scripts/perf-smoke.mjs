/**
 * Fails when the browser payload of a route regresses.
 *
 * The CPU budget has a second half that no type check can see: how much
 * JavaScript each screen makes the browser download and parse. Phase 3 moved the
 * data reads out of the render, which cut the HTML each route returns, but it
 * also added an island per screen — so the metric that must not drift is the
 * first-load script weight per route, not the markup.
 *
 * The check compares the build output against a committed baseline and fails on
 * growth beyond a tolerance, rather than against hand-written limits: a limit
 * picked before the measurement is either meaningless or a permanent red build.
 * `--update` records a new baseline, and doing so is a reviewable diff.
 *
 * Requires `npm run build` first (`scripts/perf-smoke.mjs` reads `.next`).
 *
 * Usage:
 *   node scripts/perf-smoke.mjs [--update] [--verbose]
 *
 * Exit code is 1 on a regression, 0 when every route is within its budget.
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");
const manifestPath = path.join(nextDir, "app-build-manifest.json");
const baselinePath = path.join(root, "scripts/perf-baseline.json");
const update = process.argv.includes("--update");
const verbose = process.argv.includes("--verbose");

/** Allowed growth over the baseline before the check fails. */
const TOLERANCE = 0.05;

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

async function size(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  console.error(
    "[perf] No .next/app-build-manifest.json — run `npm run build` before this check.",
  );
  process.exit(1);
}

/** First-load script bytes for every route the build reported. */
const routes = {};
for (const [route, chunks] of Object.entries(manifest.pages ?? {})) {
  let bytes = 0;
  for (const chunk of chunks ?? []) {
    bytes += await size(path.join(nextDir, chunk.replace(/^\//, "")));
  }
  routes[route] = bytes;
}

const staticFiles = await walk(path.join(nextDir, "static"));
const total = (
  await Promise.all(staticFiles.map((file) => size(file)))
).reduce((sum, bytes) => sum + bytes, 0);

const measured = { routes, total };

if (verbose) {
  for (const [route, bytes] of Object.entries(routes).sort()) {
    console.log(`[perf] ${route}: ${kib(bytes)}`);
  }
  console.log(`[perf] all static assets: ${kib(total)}`);
}

/**
 * First-load script bytes for every route the build reported. `--update` and the
 * first run both write this same shape, so the file a reviewer diffs is exactly
 * the file the check compares against.
 */
async function record(routes, total) {
  const baseline = {
    $comment:
      "First-load script bytes per route, recorded from a production build. Update with `node scripts/perf-smoke.mjs --update`.",
    tolerance: TOLERANCE,
    routes,
    total,
  };
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(`[perf] Baseline written to ${path.relative(root, baselinePath)}.`);
}

if (update) {
  await record(routes, total);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  // No budget has been recorded yet, so this build is the first measurement.
  // Recording it beats both alternatives: a hand-picked number is meaningless,
  // and failing here would leave the pipeline red on the change that added the
  // check. CI uploads the recorded file so it can be committed, and every run
  // after that compares against it.
  await record(routes, total);
  console.log("[perf] No baseline was recorded yet; this build established it.");
  process.exit(0);
}

const allowed = (bytes) => Math.ceil(bytes * (1 + (baseline.tolerance ?? TOLERANCE)));

const problems = [];

for (const [route, bytes] of Object.entries(measured.routes)) {
  const recorded = baseline.routes?.[route];
  if (recorded === undefined) {
    // A new screen has no budget yet. It is reported, not failed: the baseline
    // update that gives it one is the reviewable step.
    if (verbose) console.log(`[perf] ${route}: new route, no baseline yet (${kib(bytes)}).`);
    continue;
  }
  if (bytes > allowed(recorded)) {
    problems.push(
      `${route}: ${kib(bytes)} first-load script, budget ${kib(recorded)} (+${kib(allowed(recorded) - recorded)} tolerance).`,
    );
  }
}

if (baseline.total !== undefined && measured.total > allowed(baseline.total)) {
  problems.push(
    `all static assets: ${kib(measured.total)}, budget ${kib(baseline.total)}.`,
  );
}

if (problems.length > 0) {
  console.error(`[perf] ${problems.length} budget regression(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nIf the growth is intended, re-record with `node scripts/perf-smoke.mjs --update` and explain it in the commit.",
  );
  process.exit(1);
}

console.log(
  `[perf] OK — ${Object.keys(measured.routes).length} routes within budget, ${kib(measured.total)} of static assets.`,
);
