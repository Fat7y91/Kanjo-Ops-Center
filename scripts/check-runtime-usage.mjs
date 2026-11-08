/**
 * Fails when a route stops being cheap to run.
 *
 * The CPU budget in `docs/CPU_1102_AUDIT.md` is the product of two things that
 * are cheap to *lose* and expensive to notice: every request entry point running
 * on the edge runtime, every data screen opting out of full-route caching, and no
 * server graph leaking into a browser bundle. None of those are type errors, and
 * all of them survive review — so they are checked here.
 *
 * Checks, offline:
 *
 *   1. every `page.tsx` / `route.ts` under `src/app` declares
 *      `export const runtime = "edge"`;
 *   2. every one of them pins its caching intent with `dynamic` or `revalidate`,
 *      so a data screen cannot silently start serving a cached render;
 *   3. no module marked `"use client"` reaches a module marked `server-only`,
 *      directly or through a chain of value imports — that would pull the server
 *      graph, and its imports, into the browser bundle.
 *
 * Usage:
 *   node scripts/check-runtime-usage.mjs [--verbose]
 *
 * Exit code is 1 on any violation, 0 when the tree is aligned.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const appDir = path.join(srcDir, "app");
const verbose = process.argv.includes("--verbose");

const SERVER_ONLY = /(?:^|\n)\s*(?:import|require)\s*\(?\s*["']server-only["']/;
const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;
const USE_SERVER = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/;
const RUNTIME_EDGE = /export\s+const\s+runtime\s*=\s*["']edge["']/;
const CACHING_PINNED =
  /export\s+const\s+(?:dynamic\s*=|revalidate\s*=)/;

/** Every file under `dir`, depth first. */
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

/**
 * Import specifiers, both `from "x"` and side-effect `import "x"`.
 *
 * `import type` / `export type` are skipped: they are erased at compile time and
 * pull nothing into the bundle, so a client module may name a server type
 * without shipping the server graph. Inline `{ type Foo, Bar }` still counts,
 * because `Bar` is a value import.
 */
function importSpecifiers(source) {
  const specifiers = [];
  const withClause =
    /(?:^|\n)[ \t]*(?:import|export)\s+([\s\S]*?)\bfrom\s+["']([^"']+)["']/g;
  let match;
  while ((match = withClause.exec(source)) !== null) {
    if (/^type\b/.test(match[1].trim())) continue;
    specifiers.push(match[2]);
  }

  const sideEffect = /(?:^|\n)[ \t]*import\s+["']([^"']+)["']/g;
  while ((match = sideEffect.exec(source)) !== null) specifiers.push(match[1]);

  return specifiers;
}

/** Absolute candidate path for an import, or null for a bare package. */
function candidatePath(specifier, fromFile) {
  if (specifier.startsWith("@/")) return path.join(srcDir, specifier.slice(2));
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return null;
}

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveModule(candidate, known) {
  for (const extension of EXTENSIONS) {
    const full = candidate + extension;
    if (known.has(full)) return full;
  }
  return null;
}

const relative = (file) => path.relative(root, file);

const problems = new Set();

const appFiles = (await walk(appDir)).filter((file) =>
  /\.(?:ts|tsx)$/.test(file),
);

for (const file of appFiles) {
  const isEntryPoint = /\/(?:page|route)\.(?:ts|tsx)$/.test(file);
  if (!isEntryPoint) continue;

  const source = await readFile(file, "utf8");

  if (!RUNTIME_EDGE.test(source)) {
    problems.add(
      `${relative(file)}: missing \`export const runtime = "edge"\` — this entry point would run on the Node runtime.`,
    );
  }

  if (!CACHING_PINNED.test(source)) {
    problems.add(
      `${relative(file)}: missing \`export const dynamic\` or \`export const revalidate\` — caching is implied rather than chosen.`,
    );
  }
}

// The whole `src` tree, so an import chain can be resolved to a real file.
const allFiles = await walk(srcDir);
const known = new Set(allFiles);
const sources = new Map();
for (const file of allFiles) {
  if (/\.(?:ts|tsx)$/.test(file)) {
    sources.set(file, await readFile(file, "utf8"));
  }
}

const serverOnly = new Set(
  [...sources].filter(([, source]) => SERVER_ONLY.test(source)).map(([file]) => file),
);

const serverActions = new Set(
  [...sources].filter(([, source]) => USE_SERVER.test(source)).map(([file]) => file),
);

/** Value-import edges, resolved to real files. `import type` is not an edge. */
const graph = new Map();
for (const [file, source] of sources) {
  const edges = [];
  // A `"use server"` module is replaced by a reference in the client bundle:
  // importing one is the intended way to call a server action, and its own
  // imports never reach the browser. It ends the walk instead of extending it.
  if (!serverActions.has(file)) {
    for (const specifier of importSpecifiers(source)) {
      const candidate = candidatePath(specifier, file);
      if (!candidate) continue;
      const resolved = resolveModule(candidate, known);
      if (resolved) edges.push(resolved);
    }
  }
  graph.set(file, edges);
}

/**
 * Shortest chain from a client module to a `server-only` module, or null.
 *
 * A direct-import check is not enough. A shared helper that re-exports one value
 * from a store drags the whole server graph into the browser bundle just as
 * surely as importing it directly, and it reads as a harmless import at the call
 * site — which is exactly how one shipped before this rule existed.
 */
function serverOnlyChain(start) {
  const queue = [[start]];
  const seen = new Set([start]);

  while (queue.length > 0) {
    const pathSoFar = queue.shift();
    const current = pathSoFar[pathSoFar.length - 1];

    for (const next of graph.get(current) ?? []) {
      // Server actions are callable from the browser but never bundled into it.
      if (serverActions.has(next)) continue;
      if (serverOnly.has(next)) return [...pathSoFar, next];
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...pathSoFar, next]);
    }
  }

  return null;
}

for (const [file, source] of sources) {
  if (!USE_CLIENT.test(source)) continue;

  const chain = serverOnlyChain(file);
  if (chain) {
    problems.add(
      `${relative(file)}: client module reaches a server-only module — ${chain.map(relative).join(" → ")}.`,
    );
  }
}

if (verbose) {
  console.log(
    `[runtime] ${appFiles.length} app modules, ${sources.size} TypeScript modules, ${serverOnly.size} server-only modules.`,
  );
}

if (problems.size > 0) {
  console.error(`[runtime] ${problems.size} violation(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nSee docs/CPU_1102_AUDIT.md for why each of these is part of the CPU budget.",
  );
  process.exit(1);
}

console.log(
  `[runtime] OK — ${appFiles.length} app modules carry the edge runtime, a caching decision and no server graph.`,
);
