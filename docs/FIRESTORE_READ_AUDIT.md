# Firestore Read Spike Audit — Issue #4

Status: READ-ONLY investigation completed, emergency fix applied and verified.
Scope: root-cause of the ~1.1M Firestore reads/day spike and the client-side freeze.

## Executive summary

The spike was not background polling (the app has **no** `setInterval`/visibility
poll that reads Firestore — verified) and not the unpaginated catalog snapshot
listener (that one is dormant in production). It was a **write-amplified cache
invalidation loop**: every imported-image upload and every product completion
dropped the editor's global `status == 'done'` cache, and the very next KPI
render re-read the **entire** completed set. Reads grew as
`writes × N_done`, which matches the observed exponential climb and the browser
freeze (re-rendering ~3,200 rows on every write).

## Evidence (measured against production, read-only capture)

`merchant_products` sizes at audit time:

| subset | docs |
|---|---|
| total | 6,111 |
| `status == 'pending'` | 2,940 |
| `status == 'done'` | 3,171 |
| `importSource == 'menu_excel_import'` | 515 |
| `intakeSource == 'pharmacy_inventory_intake'` | 1,918 |

Editor (`يوسف`) bootstrap, captured over the wire (single login):

```
runQuery merchant_products (status == done)     -> 3,171 docs
runQuery merchant_products (status == pending)  -> 2,940 docs
runQuery tasks                                  ->   238 docs
runQuery tasks                                  ->    31 docs
list merchants                                  ->    56 docs
runQuery monthly                                ->     4 docs
```

Simulating one write cycle (the exact sequence `kpiUploadMissingImage` performs,
executed read-only by calling the cache functions directly):

Before fix:
```
kpiInvalidateImportCaches(); renderKpiDashboard()
  -> runQuery merchant_products (status == done) -> 3,171 docs   # the leak
```

After fix:
```
kpiApplyLocalProductChange(...); kpiInvalidateImportCaches(); renderKpiDashboard()
  -> 4 docs (monthly summaries only), ZERO merchant_products re-read
```

## Root cause — file / line / query

Primary amplifier: `public/js/services/kpi.js`

- `kpi.js:1123` `kpiFetchEditorProcessedUncached` issues
  `runQuery('merchant_products', [['status','==','done']], null, {select})`
  with **no limit** — returns the editor's full completed set (~3,171 docs).
- It is memoized as `kpi:products:editor-processed` (`kpi.js:1141`).
- `kpiInvalidateImportCaches` (`kpi.js:1151`) used to include
  `invalidatePrefix('kpi:products:editor-processed')`, so it **deleted that
  multi-thousand-doc cache** on every call.

Trigger points that called it:

- `kpi.js` `kpiUploadMissingImage` (raw-image upload) — one call per uploaded
  imported product, then `renderKpiDashboard()` re-read the full set.
- `public/js/services/catalog.js:3926` `persistCatalogEnhancedUrls` — one call on
  every product completion (`status === 'done'`), then the editor's KPI board
  re-read the full set.

Net cost: `reads ≈ (imported uploads + completions) × N_done (+ N_imported_missing)`.
With ~350 editor writes/day and `N_done ≈ 3,171`, this alone reproduces ~1.1M reads.

Secondary, same class:

- `kpi.js:1073` imports the whole `importSource == 'menu_excel_import'` pool
  (~515 docs, no limit) and filters client-side; it was also invalidated on every
  upload (`kpi:products:imported-missing`).

Related but **not active** findings (documented for completeness):

- `public/js/services/catalog.js:6498` is the only unpaginated
  `onSnapshot(collection('merchant_products'))` (full ~6,111 docs). It is gated
  behind `if (!useRest)` (`catalog.js:6482`) and `useRest` is always true in
  production (`window.kanjoRest.runQuery` is always defined), so it never
  attaches today. It is a latent landmine if the REST transport is ever removed.
- `catalog.js:6433` reads all `status == 'pending'` (~2,940) on boot when
  `canViewPending`. This is a bounded **once-per-page-load** read, not
  multiplicative. Candidate for a future deferred/paginated widget load.

## Emergency fix applied

1. `kpi.js` `kpiInvalidateImportCaches` (`kpi.js:1151`) no longer invalidates
   `kpi:products:editor-processed`. A raw upload does not change the
   `status == 'done'` set at all, and a completion is merged by id, so the global
   slice must never be force-dropped.
2. New in-memory helpers (`kpi.js`): `kpiDropCachedImportedMissing`,
   `kpiPushCachedImportedUpload`, and `kpiApplyLocalProductChange`
   (`kpi.js:1182`, exported to `window`) update the loaded slices and imported
   pool at **zero reads**.
3. `kpi.js` `kpiUploadMissingImage` now calls `kpiApplyLocalProductChange` +
   `kpiPushCachedImportedUpload` instead of the blanket invalidation.
4. `catalog.js:3926` `persistCatalogEnhancedUrls` now calls
   `window.kpiApplyLocalProductChange` on completion instead of
   `kpiInvalidateImportCaches`.

The global completed set still refreshes naturally via its 60s read-cache TTL
(`KPI_READ_CACHE_TTL`), i.e. at most once per minute and only when the KPI board
is actually rendered — never once per write.

## Why strict `.limit(50)` was intentionally not applied

`kpiFetchEditorProcessedUncached` is the source of the editor's **true global
"Total Processed"** count and feeds the #3 score/rank consistency (the editor
row and the admin board must read the same denominator). Truncating it to 50 rows
would silently corrupt that total and regress fixes #1/#3. The correct emergency
fix is to stop the repeated invalidation (done above), not to paginate a
correctness-critical aggregate. If a bounded read is still desired later, it must
be paired with an aggregation `count()` for the total — tracked as a follow-up,
not part of this emergency patch.

## Verification

- `node --check public/js/services/kpi.js` / `catalog.js` — OK.
- Local browser replay (fixed files) of the exact write cycle: no
  `merchant_products` re-read (PASS).
- See `/tmp/opencode/verify-fix4.mjs` for the reproducer.

## Residual (bounded, accepted)

- Editor bootstrap reads `3,171 + 2,940` once per page load. This is bounded by
  session/TTL, independent of write volume, and required for correct totals.
- No automated background polling exists (confirmed: the only intervals are the
  local KPI tick, the catalog guide timer, and the version check — none read
  Firestore).
