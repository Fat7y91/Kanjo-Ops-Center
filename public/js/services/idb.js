/* Kanjo Ops — IndexedDB persistence layer (Part 1)
 * ---------------------------------------------------------------------------
 * Durable, offline-first cache for the three hot, read-expensive collections:
 *   merchant_products, merchants, tasks
 *
 * Design goals:
 *   - Zero Firestore reads by itself. It only stores/reads locally.
 *   - Graceful degradation: if IndexedDB is missing or blocked (private mode,
 *     quota, Safari quirks) every method transparently falls back to an
 *     in-memory Map with the SAME async API, so callers never branch.
 *   - Additive only: nothing here mutates app DOM or existing globals.
 *
 * Schema (db `kanjo_idb_v1`, v1):
 *   store  merchant_products  keyPath id
 *   store  merchants          keyPath id
 *   store  tasks              keyPath id
 *   store  kanjo_meta         keyPath key   -> { key, value } (lastSyncedAt etc.)
 */
(function () {
    'use strict';

    const DB_NAME = 'kanjo_idb_v1';
    const DB_VERSION = 1;
    const META_STORE = 'kanjo_meta';
    const DATA_STORES = ['merchant_products', 'merchants', 'tasks'];

    let dbPromise = null;
    let memFallback = null; // set if IDB is unavailable/broken

    const metaKey = (k) => 'lastSyncedAt:' + k;

    /* ── In-memory fallback (same async surface as the IDB path) ───────────── */
    function makeMemoryFallback(reason) {
        const maps = {};
        const meta = {};
        DATA_STORES.forEach((s) => { maps[s] = new Map(); });
        return {
            kind: 'memory',
            reason: reason || 'unavailable',
            async putAll(store, rows) {
                const m = maps[store] || (maps[store] = new Map());
                let n = 0;
                (rows || []).forEach((r) => { if (r && r.id != null) { m.set(String(r.id), r); n++; } });
                return n;
            },
            async put(store, row) {
                if (!row || row.id == null) return false;
                const m = maps[store] || (maps[store] = new Map());
                m.set(String(row.id), row);
                return true;
            },
            async getAll(store) { return Array.from((maps[store] || new Map()).values()); },
            async count(store) { return (maps[store] || new Map()).size; },
            async clear(store) { maps[store] = new Map(); },
            async getMeta(key) { return Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : null; },
            async setMeta(key, value) { meta[key] = value; return true; },
            close() { /* nothing to close */ }
        };
    }

    function markBroken(reason) {
        if (!memFallback) memFallback = makeMemoryFallback(reason);
        return memFallback;
    }

    /* ── Real IndexedDB open / upgrade ─────────────────────────────────────── */
    function openReal() {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
            return Promise.reject(new Error('indexedDB unavailable'));
        }
        return new Promise((resolve, reject) => {
            let req;
            try {
                req = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (err) { reject(err); return; }
            req.onupgradeneeded = () => {
                const db = req.result;
                DATA_STORES.forEach((s) => {
                    if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
                });
                if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('idb open failed'));
            req.onblocked = () => reject(new Error('idb blocked'));
        });
    }

    function tx(db, stores, mode) {
        return db.transaction(stores, mode);
    }

    function reqToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /* ── Public API ────────────────────────────────────────────────────────── */
    async function db() {
        if (memFallback) return markBroken(memFallback.reason);
        if (!dbPromise) {
            dbPromise = openReal().catch((err) => {
                console.warn('[kanjoIdb] falling back to memory store:', err && err.message);
                return markBroken(err && err.message);
            });
        }
        return dbPromise;
    }

    async function putAll(store, rows) {
        const d = await db();
        if (d.kind === 'memory') return d.putAll(store, rows);
        try {
            return await new Promise((resolve, reject) => {
                const t = tx(d, [store], 'readwrite');
                const os = t.objectStore(store);
                let n = 0;
                (rows || []).forEach((r) => { if (r && r.id != null) { os.put(r); n++; } });
                t.oncomplete = () => resolve(n);
                t.onerror = () => reject(t.error);
                t.onabort = () => reject(t.error || new Error('idb abort'));
            });
        } catch (err) {
            console.warn('[kanjoIdb] putAll failed, switching to memory:', err && err.message);
            return markBroken(err && err.message).putAll(store, rows);
        }
    }

    async function put(store, row) {
        if (!row || row.id == null) return false;
        return (await putAll(store, [row])) > 0;
    }

    async function getAll(store) {
        const d = await db();
        if (d.kind === 'memory') return d.getAll(store);
        try {
            return await new Promise((resolve, reject) => {
                const t = tx(d, [store], 'readonly');
                const out = [];
                const req = t.objectStore(store).openCursor();
                req.onsuccess = () => {
                    const cur = req.result;
                    if (cur) { out.push(cur.value); cur.continue(); } else resolve(out);
                };
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            console.warn('[kanjoIdb] getAll failed, switching to memory:', err && err.message);
            return markBroken(err && err.message).getAll(store);
        }
    }

    async function count(store) {
        const d = await db();
        if (d.kind === 'memory') return d.count(store);
        try {
            return await new Promise((resolve, reject) => {
                const t = tx(d, [store], 'readonly');
                const req = t.objectStore(store).count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            return markBroken(err && err.message).count(store);
        }
    }

    async function clear(store) {
        const d = await db();
        if (d.kind === 'memory') return d.clear(store);
        try {
            await new Promise((resolve, reject) => {
                const t = tx(d, [store], 'readwrite');
                t.objectStore(store).clear();
                t.oncomplete = () => resolve(true);
                t.onerror = () => reject(t.error);
            });
            return true;
        } catch (err) {
            return markBroken(err && err.message).clear(store);
        }
    }

    async function getMeta(key) {
        const d = await db();
        if (d.kind === 'memory') return d.getMeta(key);
        try {
            const row = await reqToPromise(tx(d, [META_STORE], 'readonly').objectStore(META_STORE).get(key));
            return row ? row.value : null;
        } catch (err) {
            return markBroken(err && err.message).getMeta(key);
        }
    }

    async function setMeta(key, value) {
        const d = await db();
        if (d.kind === 'memory') return d.setMeta(key, value);
        try {
            await new Promise((resolve, reject) => {
                const t = tx(d, [META_STORE], 'readwrite');
                t.objectStore(META_STORE).put({ key, value });
                t.oncomplete = () => resolve(true);
                t.onerror = () => reject(t.error);
            });
            return true;
        } catch (err) {
            return markBroken(err && err.message).setMeta(key, value);
        }
    }

    window.kanjoIdb = {
        DB_NAME,
        DB_VERSION,
        DATA_STORES,
        metaKey,
        putAll,
        put,
        getAll,
        count,
        clear,
        getMeta,
        setMeta,
        isFallback: () => !!memFallback,
        resetForTests: () => { dbPromise = null; memFallback = null; }
    };
})();
