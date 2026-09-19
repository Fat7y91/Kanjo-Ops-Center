/* Kanjo Ops — server-side aggregate summaries (P1.4)
 *
 * The dashboard historically derived every global metric by iterating the full
 * tasks map / product list on the client (O(N) per render). At 5+ cities that
 * iteration becomes the bottleneck. Firestore can compute count/sum/average on
 * the SERVER, so we expose a small cached-summary layer that returns those
 * totals without shipping every document to the browser.
 *
 * Design:
 *   - The aggregation functions are imported LAZILY from the same firebase
 *     module version the app already uses (firebase.js). If the deployment's
 *     SDK build does not expose them (or the CDN is unreachable) the module
 *     degrades to nulls and every caller falls back to its local computation.
 *   - Every result is cached in memory with a TTL, and identical in-flight
 *     requests are de-duplicated, so a burst of renders triggers at most one
 *     server round-trip.
 *   - No new Firestore collection/rules are required: these are read-only
 *     aggregation queries over existing collections.
 *
 * Public API (window.kanjoAggregates):
 *   getTaskTotals({ team, force })      -> { total, signed, provisional, sums... }
 *   getCollectionCount(name, opts)      -> number | null
 *   getServerSummary({ team, force })   -> { generatedAt, tasks, merchants, ... }
 *   localTaskTotals()                   -> fallback totals from window.tasksMemory
 *   invalidate(prefix) / invalidateAll()
 */

const FIREBASE_MODULE_URL = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
const DEFAULT_TTL_MS = 60 * 1000;

const cache = new Map();
const inFlight = new Map();
let apiPromise = null;

/* Circuit breaker: once Firestore rejects an aggregation as unindexed or
   precondition-failed, stop issuing server aggregates for the rest of the
   session and serve every summary from the local fallback. This prevents the
   repeated failing RPCs that can drag the Firestore transport into offline
   mode, and it guarantees a summary can never reject and halt the render. */
let serverAggregationDisabled = false;

const isIndexOrPreconditionError = (err) => {
    const code = String((err && err.code) || '').toLowerCase();
    const msg = String((err && err.message) || '') + ' ' + String((err && err.details) || '');
    return code === 'failed-precondition'
        || code === 'permission-denied'
        || /requires an index/i.test(msg);
};

const now = () => Date.now();

const loadAggregationApi = () => {
    if (apiPromise) return apiPromise;
    apiPromise = import(FIREBASE_MODULE_URL)
        .then((mod) => ({
            getCountFromServer: mod.getCountFromServer,
            getAggregateFromServer: mod.getAggregateFromServer,
            sum: mod.sum,
            average: mod.average
        }))
        .catch((err) => {
            console.warn('[aggregates] server aggregation API unavailable; using local fallback:', err && err.message);
            return null;
        });
    return apiPromise;
};

const cacheGet = (key) => {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) { cache.delete(key); return undefined; }
    return entry.value;
};

const cacheSet = (key, value, ttlMs) => {
    cache.set(key, { value: value, expiresAt: now() + (ttlMs || DEFAULT_TTL_MS) });
    return value;
};

/* Collapse concurrent identical requests into one server round-trip. */
const dedupe = (key, factory) => {
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = Promise.resolve()
        .then(factory)
        .finally(() => { inFlight.delete(key); });
    inFlight.set(key, promise);
    return promise;
};

const buildQuery = (collectionName, filters) => {
    const parts = [window.collection(window.db, collectionName)];
    (filters || []).forEach((pair) => parts.push(window.where(pair[0], pair[1], pair[2])));
    return window.query.apply(null, parts);
};

const safeCount = async (collectionName, filters) => {
    const api = await loadAggregationApi();
    if (!api || typeof api.getCountFromServer !== 'function') return null;
    if (serverAggregationDisabled) return null;
    try {
        const snap = await api.getCountFromServer(buildQuery(collectionName, filters));
        const data = snap.data();
        return (data && typeof data.count === 'number') ? data.count : null;
    } catch (err) {
        if (isIndexOrPreconditionError(err)) serverAggregationDisabled = true;
        console.warn('[aggregates] count(' + collectionName + ') failed:', err && err.message);
        return null;
    }
};

const safeAggregate = async (collectionName, filters, specFactory) => {
    const api = await loadAggregationApi();
    if (!api || typeof api.getAggregateFromServer !== 'function') return null;
    let spec = null;
    try {
        spec = specFactory(api);
    } catch (err) {
        spec = null;
    }
    if (!spec) return null;
    if (serverAggregationDisabled) return null;
    try {
        const snap = await api.getAggregateFromServer(buildQuery(collectionName, filters), spec);
        return snap.data();
    } catch (err) {
        if (isIndexOrPreconditionError(err)) serverAggregationDisabled = true;
        console.warn('[aggregates] aggregate(' + collectionName + ') failed:', err && err.message);
        return null;
    }
};

const localTaskTotals = () => {
    const memory = window.tasksMemory;
    const totals = { total: 0, signed: 0, provisional: 0 };
    if (!memory || typeof memory.forEach !== 'function') return totals;
    memory.forEach((task) => {
        totals.total++;
        if (task && task.isSigned) totals.signed++;
        if (task && task.isProvisional) totals.provisional++;
    });
    return totals;
};

const getTaskTotals = async (options) => {
    const opts = options || {};
    const team = opts.team || null;
    const key = 'tasks:' + (team || '*');
    if (!opts.force) {
        const hit = cacheGet(key);
        if (hit !== undefined) return hit;
    }
    return dedupe(key, async () => {
        const baseFilters = team ? [['team', '==', team]] : [];
        const results = await Promise.all([
            safeCount('tasks', baseFilters),
            safeCount('tasks', baseFilters.concat([['isSigned', '==', true]])),
            safeCount('tasks', baseFilters.concat([['isProvisional', '==', true]])),
            safeAggregate('tasks', baseFilters, (api) => (
                (typeof api.sum === 'function' && typeof api.average === 'function')
                    ? {
                        targetSum: api.sum('target'),
                        achievedSum: api.sum('achieved'),
                        targetAvg: api.average('target'),
                        achievedAvg: api.average('achieved')
                    }
                    : null
            ))
        ]);
        const fallback = localTaskTotals();
        const sums = results[3];
        const totals = {
            total: results[0] !== null ? results[0] : fallback.total,
            signed: results[1] !== null ? results[1] : fallback.signed,
            provisional: results[2] !== null ? results[2] : fallback.provisional,
            targetSum: sums && sums.targetSum != null ? sums.targetSum : null,
            achievedSum: sums && sums.achievedSum != null ? sums.achievedSum : null,
            targetAvg: sums && sums.targetAvg != null ? sums.targetAvg : null,
            achievedAvg: sums && sums.achievedAvg != null ? sums.achievedAvg : null,
            source: results[0] !== null ? 'server' : 'local'
        };
        return cacheSet(key, totals);
    });
};

const getCollectionCount = async (collectionName, options) => {
    const opts = options || {};
    const filters = opts.filters || [];
    const key = 'count:' + collectionName + ':' + JSON.stringify(filters);
    if (!opts.force) {
        const hit = cacheGet(key);
        if (hit !== undefined) return hit;
    }
    return dedupe(key, async () => {
        const value = await safeCount(collectionName, filters);
        if (value !== null) cacheSet(key, value, opts.ttlMs);
        return value;
    });
};

const getServerSummary = async (options) => {
    const opts = options || {};
    const team = opts.team || null;
    const key = 'summary:' + (team || '*');
    if (!opts.force) {
        const hit = cacheGet(key);
        if (hit !== undefined) return hit;
    }
    return dedupe(key, async () => {
        let summary;
        try {
            const results = await Promise.all([
                getTaskTotals({ team: team, force: opts.force }),
                getCollectionCount('merchants', { force: opts.force }),
                getCollectionCount('merchant_products', { force: opts.force }),
                getCollectionCount('financial_profiles', { force: opts.force })
            ]);
            summary = {
                generatedAt: now(),
                team: team,
                tasks: results[0],
                merchants: results[1],
                products: results[2],
                financialProfiles: results[3]
            };
        } catch (err) {
            /* Never reject: a failed summary must not halt the dashboard render. */
            console.warn('[aggregates] server summary failed; using local fallback:', err && err.message);
            const localTotals = localTaskTotals();
            summary = {
                generatedAt: now(),
                team: team,
                tasks: {
                    total: localTotals.total,
                    signed: localTotals.signed,
                    provisional: localTotals.provisional,
                    targetSum: null,
                    achievedSum: null,
                    targetAvg: null,
                    achievedAvg: null,
                    source: 'local'
                },
                merchants: null,
                products: null,
                financialProfiles: null
            };
        }
        cacheSet(key, summary);
        window.kanjoServerSummary = summary;
        try {
            window.dispatchEvent(new CustomEvent('kanjo:summary', { detail: summary }));
        } catch (err) { /* CustomEvent unsupported — non-fatal */ }
        return summary;
    });
};

window.kanjoAggregates = {
    getTaskTotals: getTaskTotals,
    getCollectionCount: getCollectionCount,
    getServerSummary: getServerSummary,
    localTaskTotals: localTaskTotals,
    invalidate: (prefix) => {
        if (!prefix) { cache.clear(); return; }
        Array.from(cache.keys()).forEach((key) => {
            if (key.indexOf(prefix) === 0) cache.delete(key);
        });
    },
    invalidateAll: () => cache.clear()
};

export { };
