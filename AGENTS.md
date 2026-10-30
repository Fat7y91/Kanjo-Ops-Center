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

## 5. Design system enforcement

**DESIGN SYSTEM ENFORCEMENT:** Never use native `<button>`, `<input>`, `<select>`, or raw Tailwind dropdowns. You MUST import and use the Headless UI primitives from `src/components/ui/` for all future UI development.

| Need | Import |
|---|---|
| Action / submit | `Button` from `@/components/ui/button` |
| Row or context actions | `DropdownMenu` from `@/components/ui/dropdown-menu` |
| Section switcher | `Tabs` from `@/components/ui/tabs` |
| Text, textarea, checkbox, switch | `TextField`, `TextAreaField`, `CheckboxField`, `ToggleField` from `@/components/ui/form-inputs` |
| Select / searchable picker | `SelectMenu`, `ComboField` from `@/components/ui/select-menus` |

New primitives belong in `src/components/ui/` and must stay under the 300-line limit. Brand styling lives inside each primitive via Headless UI `data-*` attributes, so call sites never hand-roll purple/gold classes.

## 6. Production UI, no architectural copy

The DOM is for the end user. Never render architectural explanations, implementation notes, stack names, env var names, security mechanism descriptions, or placeholder/"dummy" paragraphs inside React components. UI copy is limited to labels, values, states, and actions. Rationale, trade-offs and backend mechanics belong in `ARCHITECTURE.md`, code comments, or commit messages. If a reviewer would ask "why is this text in the product?", delete it.

## Verification

Every refactor commit must pass:

```
npm run typecheck
npm run build
```
