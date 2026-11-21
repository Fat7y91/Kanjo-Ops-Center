/**
 * Loads a project TypeScript module from Node's test runner.
 *
 * The repository has no bundler test harness, but it already depends on the
 * `typescript` compiler. This transpiles a file to CommonJS in memory and
 * evaluates it with a resolver that understands the `@/` alias, so domain rules
 * can be tested as the app imports them (no regex over source).
 *
 * Only import-free or pure-domain modules are expected here: a file that pulls
 * in `next/*`, React or `server-only` belongs in a browser/e2e harness, not this
 * one.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const sourceRoot = path.join(projectRoot, "src");
const cache = new Map();

function resolveFile(candidate) {
  const attempts = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
  ];
  for (const attempt of attempts) {
    if (fs.existsSync(attempt) && fs.statSync(attempt).isFile()) return attempt;
  }
  return null;
}

export function loadTsModule(file) {
  const resolved = resolveFile(path.resolve(file));
  if (!resolved) throw new Error(`Cannot resolve TypeScript module: ${file}`);
  if (cache.has(resolved)) return cache.get(resolved);

  const { outputText } = ts.transpileModule(
    fs.readFileSync(resolved, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: resolved,
    },
  );

  const module = { exports: {} };
  cache.set(resolved, module.exports);

  const localRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return loadTsModule(path.join(sourceRoot, specifier.slice(2)));
    }
    if (specifier.startsWith(".")) {
      return loadTsModule(path.resolve(path.dirname(resolved), specifier));
    }
    // `server-only` is a build-time marker with no runtime exports; treat it as
    // an empty module so pure helpers in server files stay unit-testable.
    if (specifier === "server-only") {
      return {};
    }
    // Node builtins (node:fs, node:path) are needed by the asset loader; delegate
    // them to the native resolver rather than failing the whole import graph.
    if (specifier.startsWith("node:")) {
      return nativeRequire(specifier);
    }
    // Bare package specifiers (pdf-lib, fontkit, bidi-js) are real runtime
    // dependencies of the PDF engine; resolve them through Node so the engine
    // can be exercised exactly as it ships.
    try {
      return nativeRequire(specifier);
    } catch {
      throw new Error(
        `Unsupported import "${specifier}" while loading ${resolved}`,
      );
    }
  };

  new Function("exports", "require", "module", outputText)(
    module.exports,
    localRequire,
    module,
  );

  cache.set(resolved, module.exports);
  return module.exports;
}
