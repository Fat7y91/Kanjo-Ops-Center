/* Kanjo Ops — Delta sync engine (Part 1)
 * ---------------------------------------------------------------------------
 * Wraps the IndexedDB layer (kanjoIdb) with an "hydrate, then delta" strategy:
 *
 *   boot:  read cached rows from IDB  -> paint instantly, ZERO network
 *   sync:  fetch only `updatedAt > (lastSyncedAt - SKEW)`  -> a handful of docs
 *   full:  only when there is no local baseline (first run / schema change)
 *
 * It is transport-agnostic: a collection is synced only once a fetcher is
 * registered for it. A fetcher has the signature
 *     (sinceIso | null) => Promise<row[]>
 * and MUST honour `sinceIso` (return only rows newer than it, or everything
 * when null). If none is registered the store is simply hydrated, never polled.
 *
 * Triggers (all opt-in, and never while the tab is hidden):
 *   - window focus / document visibilitychange   (DEBOUNCE ms, coalesced)
 *   - a 45s heartbeat while the tab is visible
 *   - manual kanjoSync.requestSync(store)
 * The heartbeat only issues whatever the fetcher returns; by construction that
 * is a delta query, i.e. 0–1 billed reads per store when nothing changed.
 */
(function () {
    'use strict';

    const DELTA_SKEW_MS = 60000;   // 60s overlap guards against clock skew
    const HEARTBEAT_MS = 45000;    // visible-tab heartbeat
    const DEBOUNCE_MS = 5000;      // coalesce focus/visibility bursts

    const FALLBACK_KEY = 'kanjo.sync.lastSyncedAt'; // mirror for memory fallback

    const registry = new Map();    // store -> { rows: Map, lastSyncedAt, hydrated }
    const fetchers = new Map();    // store -> fetcher(sinceIso)
    let heartbeatTimer = null;
    let debounceTimer = null;
    let started = false;

    const enabled = () => !(typeof window !== 'undefined' && window.KANJO_IDB_SYNC === false);

    function entry(store) {
        if (!registry.has(store)) registry.set(store, { rows: new Map(), lastSyncedAt: null, hydrated: false });
        return registry.get(store);
    }

    /* ── Hydration ─────────────────────────────────────────────────────────── */
    async function hydrate(store) {
        const e = entry(store);
        if (e.hydrated) return Array.from(e.rows.values());
        try {
            const [rows, last] = await Promise.all([
                window.kanjoIdb.getAll(store),
                window.kanjoIdb.getMeta(window.kanjoIdb.metaKey(store))
            ]);
            (rows || []).forEach((r) => { if (r && r.id != null) e.rows.set(String(r.id), r); });
            e.lastSyncedAt = last || null;
            e.hydrated = true;
        } catch (err) {
            console.warn('[kanjoSync] hydrate failed for', store, err && err.message);
            e.hydrated = true;
        }
        return Array.from(e.rows.values());
    }

    const getRows = (store) => Array.from(entry(store).rows.values());
    const getLastSyncedAt = (store) => entry(store).lastSyncedAt;
    const size = (store) => entry(store).rows.size;

    /* ── Delta window ──────────────────────────────────────────────────────── */
    function sinceFor(store) {
        const e = entry(store);
        if (!e.lastSyncedAt) return null;                 // no baseline -> full scan
        const t = Date.parse(e.lastSyncedAt);
        if (!Number.isFinite(t)) return null;
        return new Date(t - DELTA_SKEW_MS).toISOString();
    }

    function upsert(store, rows) {
        const e = entry(store);
        (rows || []).forEach((r) => { if (r && r.id != null) e.rows.set(String(r.id), r); });
    }

    async function persist(store, rows, syncedAt) {
        const ts = syncedAt || new Date().toISOString();
        upsert(store, rows);
        try {
            await window.kanjoIdb.putAll(store, rows);
            await window.kanjoIdb.setMeta(window.kanjoIdb.metaKey(store), ts);
        } catch (err) {
            console.warn('[kanjoSync] persist failed for', store, err && err.message);
        }
        entry(store).lastSyncedAt = ts;
        return ts;
    }

    /* Record a COMPLETE full-collection load as the delta baseline. Unlike a
       delta merge this establishes `lastSyncedAt`, so following boots pay only
       for `updatedAt > since`. Callers must pass the whole collection. */
    async function captureFullLoad(store, rows) {
        await hydrate(store);
        return persist(store, rows);
    }

    /* Merge a locally-written/patched row immediately so the cache never lags
       the UI after a write (and the next delta naturally reconciles it). */
    function markWritten(store, row) {
        if (!row || row.id == null) return false;
        entry(store).rows.set(String(row.id), row);
        if (window.kanjoIdb) Promise.resolve(window.kanjoIdb.put(store, row)).catch(() => {});
        return true;
    }

    /* ── Sync ──────────────────────────────────────────────────────────────── */
    function registerFetcher(store, fn) {
        if (typeof fn === 'function') fetchers.set(store, fn);
        return fn;
    }

    async function sync(store, opts) {
        const force = opts && opts.force;
        const fetcher = fetchers.get(store);
        if (!fetcher) return { store, skipped: 'no-fetcher', count: 0 };
        if (!enabled()) return { store, skipped: 'disabled', count: 0 };
        if (!force && typeof document !== 'undefined' && document.hidden) {
            return { store, skipped: 'hidden', count: 0 };
        }
        await hydrate(store);
        const since = sinceFor(store);
        const rows = await fetcher(since);
        const syncedAt = await persist(store, rows || []);
        notify(store, (rows || []).length, syncedAt, since);
        return { store, since, count: (rows || []).length, lastSyncedAt: syncedAt };
    }

    /* Let interested views repaint after a background sync without polling. */
    function notify(store, count, lastSyncedAt, since) {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        if (typeof CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent('kanjo:synced', {
                detail: { store, count, lastSyncedAt, since, full: since == null }
            }));
        } catch (_) { /* ignore */ }
    }

    async function syncAll(opts) {
        const out = [];
        for (const store of fetchers.keys()) {
            try { out.push(await sync(store, opts)); }
            catch (err) { out.push({ store, error: err && err.message }); }
        }
        return out;
    }

    /* ── Triggers ──────────────────────────────────────────────────────────── */
    function scheduleSync(reason) {
        if (!enabled()) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            syncAll({ reason: reason || 'debounced' }).catch(() => {});
        }, DEBOUNCE_MS);
    }

    function start() {
        if (started) return;
        started = true;
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('focus', () => scheduleSync('focus'));
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) scheduleSync('visibility');
        });
        if (typeof setInterval === 'function') {
            heartbeatTimer = setInterval(() => {
                if (!document.hidden) syncAll({ reason: 'heartbeat' }).catch(() => {});
            }, HEARTBEAT_MS);
        }
    }

    function stop() {
        started = false;
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    }

    window.kanjoSync = {
        DELTA_SKEW_MS, HEARTBEAT_MS, DEBOUNCE_MS,
        hydrate, getRows, getLastSyncedAt, size, sinceFor,
        registerFetcher, sync, syncAll, markWritten, captureFullLoad,
        requestSync: (store) => (store ? sync(store, { force: true }) : syncAll({ force: true })),
        start, stop,
        _registry: registry,
        _resetForTests: () => { registry.clear(); fetchers.clear(); started = false; }
    };
})();
