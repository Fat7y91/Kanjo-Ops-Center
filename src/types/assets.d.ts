/**
 * Ambient declarations for assets imported for their side effect only.
 *
 * `import "./globals.css"` has no module to resolve to, and TypeScript treats a
 * side-effect import as opaque *by default*: nothing to check, nothing to
 * report. That default is not guaranteed — enabling
 * `noUncheckedSideEffectImports` (which editors have started turning on, and
 * which the Next.js team calls out in `next/types/global.d.ts`) turns every
 * unresolved stylesheet import into TS2882, so the same tree type-checks in CI
 * and fails in the IDE.
 *
 * Declaring the pattern here makes the resolution explicit instead of relying
 * on a compiler default, so the answer is the same wherever the check runs.
 * CSS *modules* (`*.module.css`) keep the typed `default` export Next declares;
 * this file only covers the side-effect case.
 */
declare module "*.css";

/** Non-code assets referenced by URL. */
declare module "*.svg" {
  const src: string;
  export default src;
}
