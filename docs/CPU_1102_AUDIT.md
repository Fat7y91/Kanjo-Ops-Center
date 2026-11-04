# Cloudflare Error 1102 — Worker CPU Exhaustion Audit

**Branch:** `feat/v2-enterprise-architecture`
**Date:** 2026-11-04
**Status:** Phase 0 implemented; Phases 1–5 planned
**Scope:** every server-rendered route, `middleware.ts`, `/api/session`, and the
client shell that drives them.

---

## 1. Summary

Error 1102 is Cloudflare's "Worker exceeded CPU time" fault. It is not a spike
or a capacity problem: it is the predictable result of an architecture that
renders every page from scratch, on every request, in an Edge isolate, with no
cache anywhere in the stack, and re-reads the same authorization data six times
per render.

Measured floor cost — with **zero** network or database I/O — is **23–61 ms of
CPU per page request** and **390 ms for a cold isolate**. Any real data read,
any JSON serialization, and any bundle parse is added on top. Under a Free-plan
10 ms limit this fails constantly; under 30 s it fails whenever a request
coincides with a cold start, an RBAC read, or a burst of prefetches. The client
shell amplifies each page view into roughly **31 Worker invocations per idle
minute** per tab.

Phase 0 removes the amplification and shrinks the per-request auth payload by
99%. It is a stop-the-bleeding change, not the fix: the structural causes are
RC-1 (Edge-only runtime) and RC-2 (no caching), which Phase 2 and Phase 3
address.

---

## 2. Measured baseline

### 2.1 Method

1. `npm run build` (≈58 s), then `next start` in production mode.
2. Minted a real HMAC session cookie for `u-owner` (97 permissions) with a
   throwaway script that reuses the signature in `src/lib/auth/session.ts`, so
   every measurement took the same auth path as a real user.
3. Sampled `utime + stime` from `/proc/<pid>/stat` around each request to get
   server-side CPU, excluding network wait.
4. Recorded the first request after isolate start separately as the cold path.
5. Inspected `.next/server/middleware-manifest.json` for per-function Edge
   bundle size (77 functions).

### 2.2 Warm CPU per request (no I/O, permission check only)

| Route | CPU / request |
|---|---|
| `/overview` | 61 ms |
| `/agent-kpi` | 45 ms |
| `/admin/permissions` | 42 ms |
| `/field-ops` | 36 ms |
| `/merchants` | 36 ms |
| `/catalog` | 30 ms |
| `/cities` | 30 ms |
| `/payroll` | 27 ms |
| `/accounts` | 25 ms |
| `/marketing` | 23 ms |
| `GET /api/session` | 3 ms |
| **Cold start, first request** | **390 ms** |

These are floor values. They measure React rendering, module evaluation and the
permission pipeline — nothing else. Production requests add Supabase round trips
and payload serialization on top of them.

### 2.3 Request amplification (idle tab, no user interaction)

| Source | Worker invocations / min |
|---|---|
| Sidebar `prefetch` (19 module routes) | 19 on mount, repeated per navigation |
| Table/row `prefetch` | 1 per visible row, on mount |
| `session-provider` 5 s poll | 12 |
| — of which RBAC graph reads | 6 |
| **Total, idle** | **≈ 31 / min / tab** |

### 2.4 Edge bundle sizes

77 middleware-manifest functions. Average **904 KB**, worst **1,817 KB**
(`/overview`, of which 441 KB is `page.js`). `recharts` and `leaflet` are
present in the *server* bundle, and `firebase-admin` is a production dependency
of an Edge-only app. Isolate cold start has to evaluate this before the first
byte of HTML is produced.

### 2.5 Configuration survey

| Signal | Count |
|---|---|
| `export const runtime = "edge"` | 80 files |
| `export const runtime = "nodejs"` | 0 files |
| `export const dynamic = "force-dynamic"` | 79 files |
| `unstable_cache` / `revalidate` / ISR | 0 |
| Static routes | 1 (`/_not-found`) |
| `new Intl.*` constructed per call | 35 sites |
| `structuredClone` of store arrays | 6 stores |
| Session cookie value | 2,732 bytes |

---

## 3. Root causes

### RC-1 — The entire application is pinned to the Edge runtime

`next-on-pages` requires every route it deploys to be Edge-rendered, so all 80
server files declare `runtime = "edge"` and none declare `nodejs`. This has two
costs:

* **Bundle.** Edge isolates receive the function bundle plus its dependency
  graph; a Node server shares one long-lived process across requests. Edge
  bundle size therefore shows up directly as cold-start CPU.
* **No long-lived process.** Module-scope caches, connection pools and
  `Map`s are per-isolate and disappear without warning, so every optimisation
  that depends on process memory is unreliable here.

This is the single largest structural cause and cannot be fixed by trimming
code: it requires moving SSR off the Edge runtime (Phase 2).

### RC-2 — Nothing is cached, at any layer

There is no ISR, no `unstable_cache`, no `revalidate`, and no HTTP
`Cache-Control` on any HTML response. 79 routes are `force-dynamic`. Every
navigation is a full server render, and every prefetch is a full server render
that is then thrown away.

A dashboard whose data changes hourly is being rendered per request, per tab,
per prefetch.

### RC-3 — The client shell multiplies every page view

Two independent mechanisms:

* **`prefetch` on links.** The sidebar declares `prefetch` on all 19 module
  links, so mounting the shell renders and streams 19 module pages. Merchant and
  city lists declare `prefetch` per row, so a table of 50 rows issues 50
  renders on mount. On dynamic routes `prefetch` forces the full RSC payload,
  not just a loading boundary.
* **A 5-second session poll.** `session-provider.tsx` revalidates
  `/api/session` every 5 s per tab, and that route re-reads the user and the
  RBAC revision. Twelve requests a minute, six RBAC graph reads a minute, for a
  signal that changes a handful of times a day.

Neither mechanism is user-initiated. Together they turn one user reading one
page into a permanent load source.

### RC-4 — Six RBAC reads per page render

`getServerSession()` calls **both** `loadRbacSnapshot()` and `getRbacRevision()`.
Each performs three queries, and `getRbacRevision()` re-materialises the whole
permission graph to compute a revision number. That is six SQL statements before
a page does any work of its own; individual pages then add two to nine more.

The revision exists only to detect "did permissions change since this cookie was
minted", yet it is computed by rebuilding the data it is supposed to guard.

Additionally `listUsers`, `getRbacRevision` and `listAssignableManagers` are not
memoised, so a page that needs two of them pays up to three times for the same
rows.

### RC-5 — CPU-heavy JavaScript in the render path

* `biDatasetSchema.parse()` validates the **entire** BI payload inside render
  (`src/lib/bi/dataset.ts:252`). Zod parsing is the most expensive per-byte
  operation in the codebase and it runs on every request.
* `structuredClone` deep-copies whole store arrays in six seed stores before the
  page even starts serializing.
* `new Intl.*` is constructed per call at 35 sites instead of being hoisted to
  module scope, where formatters are designed to live.
* `globalThis` seed stores are re-hydrated in every new isolate (cold-start
  cost) and are incorrect under concurrency: a write in one isolate is invisible
  to the next.
* An O(n²) loop in `buildBoard` (`src/lib/field-ops/board.ts:72-77`).

### RC-6 — Bundle bloat

`/overview` ships 1,817 KB to its Edge function (441 KB of it `page.js`).
`recharts` and `leaflet` — browser charting and mapping libraries — are in the
server bundle, and `firebase-admin` is a production dependency of an app that
runs exclusively on Edge.

---

## 4. Remediation plan

### Phase 0 — Stop the bleeding (implemented)

| Change | Effect |
|---|---|
| Removed `prefetch` from sidebar, merchant/city lists and row actions | 19–50 speculative renders per mount → 0 |
| Removed the 5 s session poll; focus/visibility floor at 5 min, `BroadcastChannel` bypasses it | 12 requests/min/tab → ≤ 0.2, and only while visible |
| Session permissions encoded as a 97-bit mask | cookie 2,732 B → 179 B; no 97-key array parsed per request |
| `Cache-Control: private, no-store, max-age=0, must-revalidate` + `Vary: Cookie` on `/api/session` | a per-user response can never be stored or shared |
| Token body no longer re-serialises a permission list on rotation | `Set-Cookie` 5,725 B → 179 B |

Details:

* `src/lib/rbac/permission-bits.ts` — bit layout, catalogue fingerprint,
  encode/decode/test. The bit index is the key's position in `PERMISSION_KEYS`,
  so a catalogue edit invalidates existing tokens instead of remapping one
  user's grant onto a different capability.
* `src/lib/auth/session.ts` — the wire body becomes
  `{ sub, p, pv, rev, iat, exp }`; `SessionPayload.mask` replaces
  `SessionPayload.perms`; `sessionHasAny()` is the only supported permission
  check on a decoded session. Tokens minted before the change are still
  accepted (their array is re-encoded on read) until they age out after
  `SESSION_MAX_AGE_SECONDS`, after which that branch can be deleted.
* `src/middleware.ts` — one bitmask test per accepted permission instead of
  `Array.includes` across 97 strings.

Expected effect: it removes the idle-load class of 1102 entirely and takes the
cost of parsing and validating a 2.7 kB permission array off every request. It
does **not** fix RC-1, RC-2 or RC-4, so page cost stays in the 23–61 ms range.

### Phase 1 — One RBAC read per request (implemented)

| Change | Effect |
|---|---|
| `app.rbac_session(uuid)` returns profile, capability keys, city scope and revision as one jsonb document | session resolution **6 queries → 1**, on every render |
| `app.rbac_revision()` returns the revision as a scalar | removes the full graph rebuild that existed only to produce one number |
| `getUserById()` rides the same function | city manager list **3N → N**; admin detail **3 → 1**; login **6 → 1** |
| `listUsers()` / `listAssignableManagers()` memoised per request | a render that resolves the roster twice pays once |

Details:

* `supabase/migrations/20261107000000_rbac_session_read.sql` — both functions.
  The revision keeps its exact meaning (newest `updated_at` / `granted_at`
  across profiles, grants and scope, floored to whole seconds), so cookies
  minted before the migration stay valid and no session is invalidated by the
  upgrade. `rbac_session` is `security definer` and revokes the `PUBLIC` grant
  that default creates, because its payload is another operator's
  authorization data; only the service role may call it.
* `src/lib/rbac/session-snapshot.ts` — the single read. A deployment whose code
  runs ahead of the migration falls back to the previous three-query path when
  PostgREST reports the function absent (the same `isMissingSchemaObject`
  triage every other repository uses), so the app degrades to Phase 0 cost
  instead of failing.
* `src/lib/rbac/snapshot-cache.ts` — request-scoped memo over React `cache()`.
  Deliberately not a module-level map: an isolate serves many requests, and a
  map there would keep serving a revoked grant.
* `getRbacRevision()` is **not** memoised. `POST /api/admin/users` and the PATCH
  routes read it *after* committing, and a memoised read would stamp the
  pre-write revision into the response — a stale `rev` makes the client treat
  its own update as already applied. It is one scalar query now, so the memo
  would save nothing anyway.

Measured per-request statement counts, before → after:

| Request | Before | After |
|---|---|---|
| Any page render (session only) | 6 | **1** |
| `/api/admin/users` GET | 12 | **5** |
| `/admin/permissions` | 12 | **5** |
| `/cities/[id]` with N managers | 12 + 3N | **N + 4** |
| `POST /login` | 6 | **1** |

The roster read (`listUsers`) is still three queries plus an in-memory join; it
is rare, and folding it into SQL is Phase 3 work.

### Phase 2 — Move SSR off the Edge runtime

**Option A (recommended): Node host behind the Cloudflare CDN.** Cloudflare
keeps TLS, WAF, DDoS and caching; rendering happens in a long-lived Node process
where module-scope caches and database pools actually work. No CPU ceiling on
render.

**Option B: `@opennextjs/cloudflare`.** Stay on Workers with Node APIs and an
incremental cache. Keeps the platform story and the CPU ceiling, adds a build
step. Viable if staying on Workers is a hard requirement.

The decision is blocked on the account's real CPU limit (§7).

### Phase 3 — Cache the static shell

With rendering off Edge, caching becomes possible again:

* Drop `force-dynamic` from the 77 routes that do not need it; keep it on `[id]`
  detail routes and `/admin`.
* Add `Cache-Control` with `s-maxage` + `stale-while-revalidate` to HTML
  responses.
* Put data reads behind `unstable_cache`, keyed by user scope.

### Phase 4 — Bundle and data diet

Hoist `Intl` formatters to module scope; validate BI payloads once at the data
boundary instead of per render; remove `structuredClone` from seed stores; fix
the O(n²) `buildBoard`; drop `firebase-admin` from the runtime dependency graph;
lazy-load `recharts` and `leaflet` so they never enter a server bundle.

### Phase 5 — Guardrails

* `scripts/check-bundle-budget.mjs` — fail the build when any Edge function
  exceeds a fixed budget.
* `scripts/check-runtime-usage.mjs` — fail when `runtime = "edge"` or
  `force-dynamic` appears outside an allowlist.
* `scripts/perf-smoke.mjs` — measure per-route CPU in CI and fail on regression.

---

## 5. Verification

Every phase is gated on:

```
npm run typecheck
npm run build
```

Phase 0 additionally requires, against a production build:

1. `curl -sI /api/session` returns `Cache-Control: private, no-store, …` and
   `Vary: Cookie`.
2. The `kanjo_v2_session` `Set-Cookie` header is under 300 bytes.
3. Loading a page issues no module-route requests until a link is
   hovered or clicked.
4. An idle tab issues no `/api/session` requests for five minutes.
5. Warm CPU per route is re-measured and compared against §2.2.

---

## 6. Consequences and trade-offs

* **Module switches are no longer pre-warmed.** The shell fetches on click. On a
  dynamic, permission-scoped workspace that is the correct trade: the prefetch
  was paying full render cost for pages most users never open.
* **Permission changes propagate within five minutes** of a tab gaining focus,
  or immediately across tabs via `BroadcastChannel`. This replaces the 5 s poll.
* **Permission catalogue edits force a re-login.** The mask is positional, so
  the fingerprint carried in the token makes a changed catalogue fail closed
  rather than silently granting the wrong capability.

---

## 7. Open questions

1. **What is the account's actual CPU limit?** Free is 10 ms; paid is 30 s. The
   ordering of the phases is the same either way, but the urgency of Phase 2
   depends on the answer.
2. **Is Supabase configured in production?** Every figure in §2.2 is an
   I/O-free floor. If production reads from seed stores those numbers are
   already representative; if it reads from Supabase, add round-trip time and
   serialization to each of them.
3. **No `wrangler.toml` in the repository.** Deployment configuration lives
   outside the repo, so runtime limits cannot be asserted from source.

