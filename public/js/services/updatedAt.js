/* Kanjo Ops — updatedAt stamping (Part 1)
 * ---------------------------------------------------------------------------
 * The delta sync engine (kanjoSync) can only fetch what changed if every write
 * carries a monotonic `updatedAt`. Rather than sprinkle the field across ~a
 * dozen call sites (and miss future ones), wrap the three Firestore write
 * primitives once, here.
 *
 * Only the hot, delta-synced collections are stamped:
 *   merchant_products, merchants, tasks
 *
 * Additive and transparent: it delegates to the original function with an
 * extra field, so return values, merge options, batch semantics and error
 * propagation are unchanged. Loaded after config/firebase.js exports the SDK
 * functions onto `window`.
 */
(function () {
    'use strict';

    const STAMPED = new Set(['merchant_products', 'merchants', 'tasks']);

    /* Resolve the collection id from a DocumentReference (.path =
       'collection/docId') or a root CollectionReference (.path = 'collection').
       Subcollection paths (3+ segments) are ignored (not delta-synced). */
    const collectionOf = (ref) => {
        if (!ref) return '';
        const path = (typeof ref.path === 'string' && ref.path) ||
            (ref._key && ref._key.path && Array.isArray(ref._key.path.segments)
                ? ref._key.path.segments.join('/') : '');
        if (!path) return '';
        const parts = String(path).split('/');
        return (parts.length === 1 || parts.length === 2) ? parts[0] : '';
    };

    const shouldStamp = (ref) => STAMPED.has(collectionOf(ref));

    const withStamp = (ref, data) => {
        if (!shouldStamp(ref) || !data || typeof data !== 'object' || Array.isArray(data)) return data;
        return Object.assign({}, data, { updatedAt: new Date().toISOString() });
    };

    const idOf = (ref) => {
        if (!ref) return '';
        if (typeof ref.id === 'string' && ref.id) return ref.id;
        const p = typeof ref.path === 'string' ? ref.path : '';
        const parts = p.split('/');
        return parts.length >= 2 ? parts[parts.length - 1] : '';
    };
    const isCollectionRef = (ref) => {
        const p = ref && typeof ref.path === 'string' ? ref.path : '';
        return p.split('/').length === 1;
    };
    /* Keep the delta-sync in-memory/IDB store warm after a local write so the
       next paint and the next boot already see it (0 extra reads). Best-effort:
       silently ignored when the sync engine is absent. */
    const notifySync = (ref, stamped) => {
        try {
            if (!window.kanjoSync || typeof window.kanjoSync.markWritten !== 'function') return;
            const col = collectionOf(ref);
            if (!col || !stamped || typeof stamped !== 'object') return;
            const id = idOf(ref);
            if (id) window.kanjoSync.markWritten(col, Object.assign({ id }, stamped));
        } catch (_) { /* ignore */ }
    };

    const wrapDataFn = (name) => {
        const orig = window[name];
        if (typeof orig !== 'function' || orig._kanjoStampWrapped) return;
        const wrapped = function (ref, data, ...rest) {
            const stamped = withStamp(ref, data);
            const result = orig.call(this, ref, stamped, ...rest);
            if (isCollectionRef(ref)) {
                /* addDoc: the new id only exists on the resolved ref. */
                return Promise.resolve(result).then((createdRef) => {
                    notifySync(createdRef || ref, stamped);
                    return createdRef;
                });
            }
            notifySync(ref, stamped);
            return result;
        };
        wrapped._kanjoStampWrapped = true;
        window[name] = wrapped;
    };

    ['setDoc', 'updateDoc', 'addDoc'].forEach(wrapDataFn);

    /* writeBatch(): intercept set/update on the returned batch so batched
       writes to the synced collections are stamped too. */
    if (typeof window.writeBatch === 'function' && !window.writeBatch._kanjoStampWrapped) {
        const origBatch = window.writeBatch;
        const wrappedBatch = function (...args) {
            const batch = origBatch.apply(this, args);
            if (!batch || batch._kanjoStampWrapped) return batch;
            ['set', 'update'].forEach((m) => {
                const orig = batch[m];
                if (typeof orig !== 'function') return;
                batch[m] = function (ref, data, ...rest) {
                    return orig.call(this, ref, withStamp(ref, data), ...rest);
                };
            });
            batch._kanjoStampWrapped = true;
            return batch;
        };
        wrappedBatch._kanjoStampWrapped = true;
        window.writeBatch = wrappedBatch;
    }

    window.kanjoStampUpdatedAt = {
        STAMPED_COLLECTIONS: Array.from(STAMPED),
        collectionOf,
        shouldStamp,
        withStamp
    };
})();
