import type { ModuleDefinition } from "./modules";
import { CORE_MODULES } from "./module-catalog-core";
import { FINANCE_MODULES } from "./module-catalog-finance";

/**
 * Navigation catalogue.
 *
 * Data only: `modules.ts` owns the lookup rules, and the list is split into a
 * core half and a finance half so each file stays small. Order matters —
 * `firstPermittedPath` lands a fresh session on the first permitted module, and
 * the profile entry stays last on purpose.
 */
export const MODULES: readonly ModuleDefinition[] = [
  ...CORE_MODULES,
  ...FINANCE_MODULES,
];
