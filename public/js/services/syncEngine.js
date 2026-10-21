/* Kanjo Ops — Delta sync engine (live, quota-safe)
 * ---------------------------------------------------------------------------
 * Wraps the IndexedDB layer (kanjoIdb) with a "hydrate, then delta" strategy:
 *
 *   boot:  paint cached rows from IDB (ZERO network)
 *   sync:  fetch only `updatedAt > (lastSyncedAt - SKEW)` -> changed docs only
 *   full:  exactly ONCE per empty cache, via ensureBaseline(); never per render
 *
 * It is transport-agnostic: a collection is synced only once a fetcher is
 * registered for it. A fetcher has the signature
 *     (sinceIso) => Promise<row[]>
 * and MUST honour `sinceIso` (return only rows newer than it). It is never
 * called with null: the engine refuses to turn "no baseline" into a full scan.
 *
 * Live triggers (opt-in, never while the tab is hidden):
 *   - 15s visible-tab heartbeat (jittered)
 *   - window focus / document visibilitychange (2s debounce, coalesced)
 *   - manual kanjoSync.requestSync(store)
 *
 * Cross-tab: only the tab that wins a navigator.locks lease polls. Every other
 * tab receives the applied rows over BroadcastChannel, so 3-5 open tabs cost
 * the same number of Firestore queries as one.
 */
(function () {
    'use strict';

    const DEFAULT_CONFIG = {
        DELTA_SKEW_MS: 15000,      // overlap guards against client clock skew
        HEARTBEAT_MS: 15000,       // visible-tab live heartbeat
        DEBOUNCE_MS: 2000,         // coalesce focus/visibility bursts
        JITTER_MS: 3000,           // spread clients so they don't poll together
        MAX_BACKOFF_MS: 300000,    // 5 minutes
        LEADER_LOCK: 'kanjo-delta-poll',
        LEADER_LEASE_MS: 20000,
        CHANNEL: 'kanjo-sync'
    };

    const config = Object.assign({}, DEFAULT_CONFIG, window.kanjoSyncConfig || {});
    window.kanjoSyncConfig = config;

    const FALLBACK_KEY = 'kanjo.sync.lastSyncedAt'; // legacy mirror (unused)
    const LEASE_KEY = 'kanjo.sync.leaderLease';

    const registry = new Map();     // store -> { rows: Map, lastSyncedAt, hydrated, ... }
    const fetchers = new Map();     // store -> fetcher(sinceIso)
    const baselineLoaders = new Map(); // store -> one-shot full loader
    const baselinePromises = new Map();
    let heartbeatTimer = null;
    let debounceTimer = null;
    let started = false;
    let channel = null;
    const tabId = 'tab-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);

    const now = () => Date.now();
    const enabled = () => !(typeof window !== 'undefined' && window.KANJO_IDB_SYNC === false);

    function entry(store) {
        if (!registry.has(store)) {
            registry.set(store, {
                rows: new Map(),
                lastSyncedAt: null,
                hydrated: false,
                deltaQueries: 0,
                rowsRead: 0,
                lastError: null,
                failCount: 0,
                backoffUntil: 0,
                lastSyncedBy: ''
            });
        }
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
        if (!e.lastSyncedAt) return null;
        const t = Date.parse(e.lastSyncedAt);
        if (!Number.isFinite(t)) return null;
        return new Date(Math.max(0, t - config.DELTA_SKEW_MS)).toISOString();
    }

    function timestampOf(row) {
        if (!row || typeof row !== 'object') return 0;
        const raw = row.updatedAt || row.updated_at || row.createdAt || row.created_at;
        if (!raw) return 0;
        if (typeof raw === 'number') return raw;
        if (raw && typeof raw.toMillis === 'function') {
            try { return raw.toMillis(); } catch (_) { /* ignore */ }
        }
        if (raw && typeof raw.toDate === 'function') {
            try { return raw.toDate().getTime(); } catch (_) { /* ignore */ }
        }
        if (raw instanceof Date) return raw.getTime();
        if (typeof raw === 'object' && raw.seconds != null) return Number(raw.seconds) * 1000;
        const ms = Date.parse(String(raw));
        return Number.isFinite(ms) ? ms : 0;
    }

    function upsert(store, rows) {
        const e = entry(store);
        (rows || []).forEach((r) => { if (r && r.id != null) e.rows.set(String(r.id), r); });
    }

    async function persist(store, rows, syncedAt) {
        const ts = syncedAt || new Date().toISOString();
        upsert(store, rows);
        try {
            await window.kanjoIdb.putAll(store, rows || []);
            await window.kanjoIdb.setMeta(window.kanjoIdb.metaKey(store), ts);
        } catch (err) {
            console.warn('[kanjoSync] persist failed for', store, err && err.message);
        }
        entry(store).lastSyncedAt = ts;
        return ts;
    }

    /* Record a COMPLETE full-collection load as the delta baseline. Only called
       by ensureBaseline() (once per empty cache) or an explicit admin rebuild. */
    async function captureFullLoad(store, rows) {
        await hydrate(store);
        return persist(store, rows);
    }

    /* Merge a locally-written/patched row immediately so the cache never lags
       the UI after a write, and tell the other tabs right away. */
    function markWritten(store, row) {
        if (!row || row.id == null) return false;
        const e = entry(store);
        const key = String(row.id);
        const prev = e.rows.get(key);
        if (prev && timestampOf(prev) > timestampOf(row)) return false;
        /* Merge, never replace: the stamping wrapper reports partial patches
           (setDoc/updateDoc data), and replacing would drop the cached fields
           the UI still needs (name, status, images...). */
        const merged = prev ? Object.assign({}, prev, row) : row;
        e.rows.set(key, merged);
        if (window.kanjoIdb) Promise.resolve(window.kanjoIdb.put(store, merged)).catch(() => {});
        broadcastApplied(store, [merged], null, tabId);
        return true;
    }

    /* ── Baseline ──────────────────────────────────────────────────────────── */
    /* Register the one-shot loader that may read the whole collection. It is
       invoked ONLY when IDB has no rows for this store. Concurrent callers
       share a single promise, so N boot consumers still pay for one read. */
    function registerBaselineLoader(store, loader) {
        if (typeof loader === 'function') baselineLoaders.set(store, loader);
    }

    async function ensureBaseline(store, loaderOverride) {
        await hydrate(store);
        const e = entry(store);
        if (e.rows.size > 0) {
            if (!e.lastSyncedAt) {
                let max = 0;
                for (const row of e.rows.values()) max = Math.max(max, timestampOf(row));
                e.lastSyncedAt = max > 0 ? new Date(max).toISOString() : new Date(0).toISOString();
                try { await window.kanjoIdb.setMeta(window.kanjoIdb.metaKey(store), e.lastSyncedAt); } catch (_) { /* ignore */ }
                console.warn('[kanjoSync] recovered missing baseline timestamp for', store, 'from cached rows');
            }
            return { rows: Array.from(e.rows.values()), source: 'idb' };
        }
        const loader = loaderOverride || baselineLoaders.get(store);
        if (typeof loader !== 'function') return { rows: [], source: 'none' };
        if (!baselinePromises.has(store)) {
            const p = Promise.resolve()
                .then(() => loader())
                .then(async (rows) => {
                    const clean = Array.isArray(rows) ? rows.filter((r) => r && r.id != null) : [];
                    await captureFullLoad(store, clean);
                    console.log('[kanjoSync] baseline captured for', store, '(' + clean.length + ' rows)');
                    return { rows: clean, source: 'full' };
                })
                .finally(() => { baselinePromises.delete(store); });
            baselinePromises.set(store, p);
        }
        return baselinePromises.get(store);
    }

    /* ── Delta fetch ───────────────────────────────────────────────────────── */
    function registerFetcher(store, fn) {
        if (typeof fn === 'function') fetchers.set(store, fn);
        return fn;
    }

    function changedRows(store, rows) {
        const e = entry(store);
        const changed = [];
        (rows || []).forEach((row) => {
            if (!row || row.id == null) return;
            const key = String(row.id);
            const prev = e.rows.get(key);
            if (!prev) { changed.push(row); return; }
            const nextTs = timestampOf(row);
            const prevTs = timestampOf(prev);
            if (nextTs > prevTs) changed.push(row);
            else if (nextTs === prevTs && !sameRow(prev, row)) changed.push(row);
        });
        return changed;
    }

    function sameRow(a, b) {
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
    }

    function noteFailure(store, err) {
        const e = entry(store);
        e.lastError = (err && err.message) || String(err || 'sync failed');
        e.failCount += 1;
        const delay = Math.min(config.MAX_BACKOFF_MS, config.HEARTBEAT_MS * Math.pow(2, Math.min(e.failCount, 6)));
        e.backoffUntil = now() + delay;
        console.warn('[kanjoSync] delta failed for', store, '- retrying in', delay, 'ms:', e.lastError);
    }

    function noteSuccess(store) {
        const e = entry(store);
        e.failCount = 0;
        e.backoffUntil = 0;
        e.lastError = null;
    }

    async function sync(store, opts) {
        const force = opts && opts.force;
        const fetcher = fetchers.get(store);
        if (!fetcher) return { store, skipped: 'no-fetcher', count: 0 };
        if (!enabled()) return { store, skipped: 'disabled', count: 0 };
        if (!force && typeof document !== 'undefined' && document.hidden) {
            return { store, skipped: 'hidden', count: 0 };
        }
        const e = entry(store);
        if (!force && e.backoffUntil && now() < e.backoffUntil) {
            return { store, skipped: 'backoff', count: 0 };
        }
        await hydrate(store);
        const since = sinceFor(store);
        if (!since) return { store, skipped: 'no-baseline', count: 0 };
        let rows;
        try {
            e.deltaQueries += 1;
            rows = await fetcher(since);
        } catch (err) {
            noteFailure(store, err);
            return { store, error: e.lastError, count: 0 };
        }
        const changed = changedRows(store, rows || []);
        const syncedAt = new Date().toISOString();
        await persist(store, changed, syncedAt);
        e.rowsRead += (rows || []).length;
        e.lastSyncedBy = tabId;
        noteSuccess(store);
        notify(store, changed, syncedAt, since, (rows || []).length);
        if (changed.length) broadcastApplied(store, changed, syncedAt, tabId);
        return { store, since, count: changed.length, fetched: (rows || []).length, lastSyncedAt: syncedAt };
    }

    /* ── Events ────────────────────────────────────────────────────────────── */
    function notify(store, rows, lastSyncedAt, since, fetched) {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        if (typeof CustomEvent !== 'function') return;
        const changedIds = (rows || []).map((r) => String(r && r.id)).filter(Boolean);
        try {
            window.dispatchEvent(new CustomEvent('kanjo:synced', {
                detail: {
                    store,
                    rows: rows || [],
                    changedIds,
                    count: (rows || []).length,
                    fetched: typeof fetched === 'number' ? fetched : (rows || []).length,
                    lastSyncedAt,
                    since,
                    full: since == null
                }
            }));
        } catch (_) { /* ignore */ }
    }

    /* ── Cross-tab leader + broadcast ──────────────────────────────────────── */
    function ensureChannel() {
        if (channel || typeof BroadcastChannel !== 'function') return channel;
        try {
            channel = new BroadcastChannel(config.CHANNEL);
            channel.onmessage = (event) => {
                const msg = event && event.data;
                if (!msg || msg.type !== 'applied' || msg.tab === tabId || !msg.store) return;
                const rows = Array.isArray(msg.rows) ? msg.rows : [];
                if (!rows.length) return;
                const syncedAt = msg.syncedAt || new Date().toISOString();
                persist(msg.store, rows, syncedAt)
                    .then(() => notify(msg.store, rows, syncedAt, msg.since || null, rows.length))
                    .catch(() => { /* ignore */ });
            };
        } catch (err) {
            console.warn('[kanjoSync] BroadcastChannel unavailable:', err && err.message);
            channel = null;
        }
        return channel;
    }

    function broadcastApplied(store, rows, syncedAt, fromTab) {
        if (!rows || !rows.length) return;
        const ch = ensureChannel();
        if (!ch) return;
        /* Chunk large bursts (bulk import) so one message never balloons. */
        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
            try {
                ch.postMessage({
                    type: 'applied',
                    tab: fromTab || tabId,
                    store,
                    rows: rows.slice(i, i + CHUNK),
                    syncedAt: syncedAt || new Date().toISOString()
                });
            } catch (_) { /* ignore */ }
        }
    }

    function readLease() {
        try {
            const raw = localStorage.getItem(LEASE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && parsed.owner ? parsed : null;
        } catch (_) { return null; }
    }

    function writeLease() {
        try {
            localStorage.setItem(LEASE_KEY, JSON.stringify({ owner: tabId, until: now() + config.LEADER_LEASE_MS }));
            return true;
        } catch (_) { return false; }
    }

    /* Run `fn` only if this tab is the poller. navigator.locks is per-tick
       (released immediately), so any visible tab can take the next tick while
       exactly one poll happens across all tabs. */
    async function withLeader(fn) {
        if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
            try {
                let ran = false;
                await navigator.locks.request(config.LEADER_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
                    if (!lock) return;
                    ran = true;
                    await fn();
                });
                return ran;
            } catch (err) {
                console.warn('[kanjoSync] lock request failed; using lease fallback:', err && err.message);
            }
        }
        const lease = readLease();
        if (lease && lease.owner !== tabId && now() < Number(lease.until)) return false;
        if (!writeLease()) return false;
        await fn();
        return true;
    }

    async function syncAll(opts) {
        const out = [];
        for (const store of fetchers.keys()) {
            try { out.push(await sync(store, opts)); }
            catch (err) { out.push({ store, error: err && err.message }); }
        }
        return out;
    }

    function runLeaderSync(reason) {
        return withLeader(() => syncAll({ reason: reason || 'heartbeat' })).catch(() => false);
    }

    /* ── Triggers ──────────────────────────────────────────────────────────── */
    function scheduleSync(reason) {
        if (!enabled()) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            runLeaderSync(reason || 'debounced');
        }, config.DEBOUNCE_MS);
    }

    let heartbeatCount = 0;
    function start() {
        if (started) return;
        started = true;
        ensureChannel();
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('focus', () => scheduleSync('focus'));
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) scheduleSync('visibility');
        });
        if (typeof setInterval === 'function') {
            heartbeatTimer = setInterval(() => {
                if (document.hidden) return;
                heartbeatCount += 1;
                if (heartbeatCount % 8 === 0) {
                    /* Periodic jitter: prevents a fleet of clients from polling
                       on the exact same second indefinitely. */
                    const jitter = Math.floor(Math.random() * config.JITTER_MS);
                    setTimeout(() => runLeaderSync('heartbeat'), jitter);
                    return;
                }
                runLeaderSync('heartbeat');
            }, config.HEARTBEAT_MS);
        }
    }

    function stop() {
        started = false;
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        try { if (channel) channel.close(); } catch (_) { /* ignore */ }
        channel = null;
    }

    function stats() {
        const out = {};
        registry.forEach((e, store) => {
            out[store] = {
                rows: e.rows.size,
                lastSyncedAt: e.lastSyncedAt,
                deltaQueries: e.deltaQueries,
                rowsRead: e.rowsRead,
                lastError: e.lastError,
                failCount: e.failCount,
                backoffUntil: e.backoffUntil,
                lastSyncedBy: e.lastSyncedBy
            };
        });
        return { tabId, leader: config.LEADER_LOCK, stores: out };
    }

    window.kanjoSync = {
        DELTA_SKEW_MS: config.DELTA_SKEW_MS,
        HEARTBEAT_MS: config.HEARTBEAT_MS,
        DEBOUNCE_MS: config.DEBOUNCE_MS,
        config,
        hydrate, getRows, getLastSyncedAt, size, sinceFor,
        registerFetcher, registerBaselineLoader, ensureBaseline, captureFullLoad,
        sync, syncAll, markWritten, notify, stats,
        requestSync: (store, opts) => (store
            ? sync(store, Object.assign({ force: true }, opts || {}))
            : syncAll(Object.assign({ force: true }, opts || {}))),
        start, stop,
        _registry: registry,
        _fetchers: fetchers,
        _resetForTests: () => { registry.clear(); fetchers.clear(); baselineLoaders.clear(); baselinePromises.clear(); started = false; }
    };
})();
