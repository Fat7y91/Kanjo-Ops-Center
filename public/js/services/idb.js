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
 * Schema (db `kanjo_idb_v1`, v2):
 *   store  merchant_products  keyPath id
 *   store  merchants          keyPath id
 *   store  tasks              keyPath id
 *   store  kanjo_meta         keyPath key   -> { key, value } (lastSyncedAt etc.)
 *
 * NOTE: DB_VERSION was bumped 1 -> 2. Clients that opened v1 BEFORE the
 * `merchants`/`tasks` stores were added kept a v1 database WITHOUT those object
 * stores; the browser never fires `onupgradeneeded` for an equal version, so
 * `putAll('merchants', ...)` threw "One of the specified object stores was not
 * found" and silently degraded to the in-memory fallback. Raising the version
 * guarantees a single upgrade pass that creates every missing store in place.
 */
(function () {
    'use strict';

    const DB_NAME = 'kanjo_idb_v1';
    const DB_VERSION = 2;
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
            async remove(store, key) { const m = maps[store]; if (!m) return false; return m.delete(String(key)); },
            async getMeta(key) { return Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : null; },
            async setMeta(key, value) { meta[key] = value; return true; },
            close() { /* nothing to close */ }
        };
    }

    function markBroken(reason) {
        if (!memFallback) memFallback = makeMemoryFallback(reason);
        return memFallback;
    }

    /* ── Real IndexedDB open / upgrade (self-healing) ──────────────────────── */
    const ALL_STORES = DATA_STORES.concat([META_STORE]);

    /* Create any missing object stores inside an upgrade transaction. */
    function ensureStores(db) {
        DATA_STORES.forEach((s) => {
            if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    }

    function missingStores(db) {
        return ALL_STORES.filter((s) => !db.objectStoreNames.contains(s));
    }

    /* Open at an explicit version (creating missing stores during the upgrade)
       or, with `null`, at the current version WITHOUT triggering an upgrade. */
    function openAt(version) {
        return new Promise((resolve, reject) => {
            let req;
            try {
                req = (version == null) ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
            } catch (err) { reject(err); return; }
            req.onupgradeneeded = () => { try { ensureStores(req.result); } catch (_) { /* ignore */ } };
            req.onsuccess = () => {
                const opened = req.result;
                /* Release our handle if another tab upgrades the schema, so we
                   never block its upgrade (and vice-versa). */
                opened.onversionchange = () => { try { opened.close(); } catch (_) { /* ignore */ } };
                resolve(opened);
            };
            req.onerror = () => reject(req.error || new Error('idb open failed'));
            req.onblocked = () => reject(new Error('idb blocked'));
        });
    }

    function deleteDatabase() {
        return new Promise((resolve) => {
            let req;
            try { req = indexedDB.deleteDatabase(DB_NAME); }
            catch (_) { resolve(false); return; }
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            req.onblocked = () => resolve(false);
        });
    }

    /* Self-healing open.
       Historic clients can hold a database whose version already equals (or
       exceeds) DB_VERSION but whose object stores are MISSING — an early build
       created the schema partially, and the browser never fires
       `onupgradeneeded` for an equal version. That produced
       "One of the specified object stores was not found", silently degraded to
       the VOLATILE in-memory fallback, and forced a full ~7.9k-collection
       download on EVERY reload. We now:
         1. open WITHOUT a version to discover the real version + stores;
         2. if a store is missing, reopen at (realVersion + 1) so a single
            upgrade pass creates exactly the missing stores — no VersionError;
         3. as a last resort, delete + recreate the database cleanly.
       Only a genuinely unavailable/blocked IndexedDB falls back to memory. */
    async function openReal() {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
            throw new Error('indexedDB unavailable');
        }
        let db = await openAt(null);
        if (!missingStores(db).length) return db;
        const nextVersion = (db.version || 1) + 1;
        console.warn('[kanjoIdb] missing object stores; self-repairing schema at version ' + nextVersion);
        try { db.close(); } catch (_) { /* ignore */ }
        db = await openAt(nextVersion);
        if (!missingStores(db).length) return db;
        console.warn('[kanjoIdb] schema repair incomplete; recreating database');
        try { db.close(); } catch (_) { /* ignore */ }
        await deleteDatabase();
        db = await openAt(DB_VERSION);
        if (!missingStores(db).length) return db;
        try { db.close(); } catch (_) { /* ignore */ }
        throw new Error('idb schema could not be repaired');
    }

    /* Drop the cached connection and re-run the self-healing open. Used to
       recover from a transaction-time NotFoundError (schema changed under us). */
    async function resetConnection() {
        try {
            const d = dbPromise ? await dbPromise : null;
            if (d && d.kind !== 'memory' && typeof d.close === 'function') d.close();
        } catch (_) { /* ignore */ }
        dbPromise = null;
        memFallback = null;
        return db();
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

    /* ── Transaction helpers (so a self-heal retry is a one-liner) ─────────── */
    function writeRows(d, store, rows) {
        return new Promise((resolve, reject) => {
            const t = tx(d, [store], 'readwrite');
            const os = t.objectStore(store);
            let n = 0;
            (rows || []).forEach((r) => { if (r && r.id != null) { os.put(r); n++; } });
            t.oncomplete = () => resolve(n);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('idb abort'));
        });
    }

    function readCursor(d, store) {
        return new Promise((resolve, reject) => {
            const t = tx(d, [store], 'readonly');
            const out = [];
            const req = t.objectStore(store).openCursor();
            req.onsuccess = () => {
                const cur = req.result;
                if (cur) { out.push(cur.value); cur.continue(); } else resolve(out);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /* Run `runner(db)`; on a transaction-time NotFoundError (the schema missing
       a store under us) repair the connection once and retry before degrading. */
    async function runWithRepair(d, opName, runner) {
        if (d.kind === 'memory') return { d, result: await runner(d) };
        try {
            return { d, result: await runner(d) };
        } catch (err) {
            if (err && err.name === 'NotFoundError') {
                console.warn('[kanjoIdb] ' + opName + ' hit a missing store; self-repairing connection');
                const repaired = await resetConnection().catch(() => null);
                if (repaired && repaired.kind !== 'memory') {
                    try { return { d: repaired, result: await runner(repaired) }; }
                    catch (_) { /* fall through */ }
                }
            }
            throw err;
        }
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
            const { result } = await runWithRepair(d, 'putAll', (conn) => writeRows(conn, store, rows));
            return result;
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
            const { result } = await runWithRepair(d, 'getAll', (conn) => readCursor(conn, store));
            return result;
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

    async function remove(store, key) {
        const d = await db();
        if (d.kind === 'memory') return d.remove(store, key);
        try {
            return await new Promise((resolve, reject) => {
                const t = tx(d, [store], 'readwrite');
                t.objectStore(store).delete(key);
                t.oncomplete = () => resolve(true);
                t.onerror = () => reject(t.error);
                t.onabort = () => reject(t.error || new Error('idb abort'));
            });
        } catch (err) {
            console.warn('[kanjoIdb] remove failed, switching to memory:', err && err.message);
            return markBroken(err && err.message).remove(store, key);
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
        remove,
        getMeta,
        setMeta,
        isFallback: () => !!memFallback,
        resetForTests: () => { dbPromise = null; memFallback = null; }
    };
})();
