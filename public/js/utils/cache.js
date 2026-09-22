/**
 * Kanjo Ops Center - shared client-side read cache.
 *
 * Firestore bills every document read, and an open tab previously re-read
 * entire collections on a short interval (30s) plus through long-lived
 * onSnapshot listeners. This utility lets the app fetch a collection once,
 * keep it in memory for a bounded TTL, and deduplicate concurrent callers
 * so that opening several widgets does not multiply the number of reads.
 *
 * Usage:
 *   const rows = await window.kanjoCache.get('merchants:all', 5 * 60 * 1000, loader, force);
 *   window.kanjoCache.invalidate('merchants:all');
 */
(function () {
    const store = new Map();
    const inflight = new Map();
    const stats = { hits: 0, misses: 0, dedupes: 0, invalidations: 0, entries: 0 };

    const normalizeKey = (key) => String(key == null ? '' : key);

    const refreshStats = () => {
        stats.entries = store.size;
        return stats;
    };

    const get = (key, ttlMs, loader, force) => {
        const k = normalizeKey(key);
        const ttl = Math.max(0, Number(ttlMs) || 0);
        const now = Date.now();

        if (!force) {
            const hit = store.get(k);
            if (hit && (ttl === 0 ? true : hit.expiresAt > now)) {
                stats.hits += 1;
                return Promise.resolve(hit.value);
            }
            if (inflight.has(k)) {
                stats.dedupes += 1;
                return inflight.get(k);
            }
        }

        stats.misses += 1;
        const promise = Promise.resolve()
            .then(loader)
            .then((value) => {
                store.set(k, { value, expiresAt: Date.now() + ttl });
                refreshStats();
                return value;
            })
            .finally(() => {
                inflight.delete(k);
            });
        inflight.set(k, promise);
        return promise;
    };

    const peek = (key) => {
        const hit = store.get(normalizeKey(key));
        return hit ? hit.value : undefined;
    };

    const has = (key) => store.has(normalizeKey(key));

    const invalidate = (key) => {
        const k = normalizeKey(key);
        const existed = store.delete(k);
        if (existed) stats.invalidations += 1;
        refreshStats();
        return existed;
    };

    const invalidatePrefix = (prefix) => {
        const p = normalizeKey(prefix);
        let count = 0;
        Array.from(store.keys()).forEach((key) => {
            if (key.indexOf(p) === 0) {
                store.delete(key);
                count += 1;
            }
        });
        stats.invalidations += count;
        refreshStats();
        return count;
    };

    const clear = () => {
        const size = store.size;
        store.clear();
        stats.invalidations += size;
        refreshStats();
        return size;
    };

    window.kanjoCache = {
        get: get,
        peek: peek,
        has: has,
        invalidate: invalidate,
        invalidatePrefix: invalidatePrefix,
        clear: clear,
        stats: () => Object.assign({}, refreshStats())
    };
})();
