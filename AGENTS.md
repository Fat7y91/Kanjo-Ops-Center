# Kanjo V2.0 — Architecture Rules

These rules are mandatory for every task on `feat/v2-enterprise-architecture`.

## 1. Small files, single responsibility

- Hard limit: **250-300 lines** per `.ts` / `.tsx` file. Generated data files are the only exception, and must live under `src/lib/**/data/`.
- Each file does exactly one thing. Layout, state, business logic, and API access live in separate modules.
- Proactively split a file **before** adding a feature to it if it is already near the limit.

## 2. Directory conventions

| Concern | Location |
|---|---|
| Page containers (server) | `src/app/**/page.tsx` |
| UI sub-components | `src/components/<domain>/` |
| View state + handlers | `src/components/<domain>/use-*.ts` |
| Formatting / pure helpers | `src/lib/<domain>/format.ts` |
| Domain logic | `src/lib/<domain>/<domain>.ts` |
| Persistence / I/O | `src/lib/<domain>/client.ts` |
| Types | `src/lib/<domain>/types.ts` |

## 3. CSS modularity

- Never append unrelated rules to `src/app/globals.css`. It is a manifest of `@import` statements plus global resets only.
- Domain styles go in `src/styles/<domain>.css`, imported once from `globals.css` in dependency order.
- Tokens stay in `src/styles/tokens.css` and must load first.
- Move each `@media` block together with the section that owns its selectors.

## 4. Refactor before extend

When a task touches a file over the limit, the first commit must be a pure extraction with no behavior change, verified by `npm run typecheck` and `npm run build`. Feature work follows in a separate commit.

## Verification

Every refactor commit must pass:

```
npm run typecheck
npm run build
```
