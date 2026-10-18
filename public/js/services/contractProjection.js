/* Kanjo Ops — Lightweight contract projection (Part 1)
 * ---------------------------------------------------------------------------
 * The Contracts Manager only needs a handful of fields per signed merchant, yet
 * it used to wait for the full ~15 MB task archive (which embeds Base64 logos)
 * before it could paint. This module persists a ~45 KB projection in IndexedDB:
 *
 *     { id: <base name>, base, name, team, achieved, isSigned, cat, time,
 *       signedAt, merchantId, taskId, updatedAt }
 *
 * It is a pure paint-ahead cache: it issues ZERO Firestore reads, never blocks
 * the archive, and is refreshed from `tasksMemory` after a full archive load.
 * The serial baseline itself lives in export.js, so no serial is ever derived
 * from a partial projection.
 */
(function () {
    'use strict';

    const STORE = 'contract_projection';
    const META_KEY = 'contracts:projectionAt:v1';
    const SAVE_DEBOUNCE_MS = 1500;

    let cache = [];
    let hydrated = false;
    let readyPromise = null;
    let saveTimer = null;

    const baseOf = (task) => {
        if (!task) return '';
        return window.getBaseName ? window.getBaseName(task.name) : String(task.name || '').trim();
    };

    const signingKey = (task) => String(
        (task && (task.signedAt || task.contractSignedAt || task.time || task.createdAt || task.created_at)) || ''
    );

    /* One row per unique signed merchant, mirroring the exact dedupe used by
       buildUniqueSignedMerchants (follow-up preference, then max achieved). */
    const buildRows = (tasks) => {
        const uniqueMap = new Map();
        (tasks || []).forEach((task) => {
            if (!task || task.isSigned !== true || Number(task.achieved) <= 0) return;
            const base = baseOf(task);
            if (!base) return;
            const existing = uniqueMap.get(base);
            if (!existing) {
                uniqueMap.set(base, task);
                return;
            }
            const existingFollowUp = existing.name !== base;
            const newFollowUp = task.name !== base;
            const existingAchieved = Number(existing.achieved) || 0;
            const newAchieved = Number(task.achieved) || 0;
            if (existingFollowUp && !newFollowUp) uniqueMap.set(base, task);
            else if (!existingFollowUp && newFollowUp) { /* keep existing */ }
            else if (newAchieved > existingAchieved) uniqueMap.set(base, task);
        });

        return Array.from(uniqueMap.entries()).map(([base, task]) => ({
            id: base,
            base,
            name: task.name || base,
            team: task.team || '',
            achieved: Number(task.achieved) || 0,
            isSigned: true,
            cat: task.cat || '',
            time: task.time || '',
            signedAt: signingKey(task),
            merchantId: task.merchantId || task.merchant_id || '',
            taskId: task.id || '',
            updatedAt: task.updatedAt || ''
        })).sort((a, b) => String(a.base).localeCompare(String(b.base), 'ar'));
    };

    const hydrate = async () => {
        if (hydrated) return cache;
        try {
            if (window.kanjoIdb && typeof window.kanjoIdb.getAll === 'function') {
                const rows = await window.kanjoIdb.getAll(STORE);
                /* A save may have landed while this read was in flight; never
                   overwrite fresher in-memory rows with the older snapshot. */
                if (!hydrated) {
                    cache = (rows || []).filter((r) => r && r.id)
                        .sort((a, b) => String(a.base || a.id).localeCompare(String(b.base || b.id), 'ar'));
                }
            }
        } catch (err) {
            console.warn('[contracts] projection hydrate failed:', err && err.message);
            if (!hydrated) cache = [];
        }
        hydrated = true;
        return cache;
    };

    const ready = () => {
        if (!readyPromise) readyPromise = hydrate();
        return readyPromise;
    };

    const get = () => (Array.isArray(cache) ? cache : []);

    const save = async (tasks) => {
        const rows = buildRows(tasks);
        cache = rows;
        hydrated = true;
        try {
            if (window.kanjoIdb && typeof window.kanjoIdb.replaceAll === 'function') {
                await window.kanjoIdb.replaceAll(STORE, rows);
                await window.kanjoIdb.setMeta(META_KEY, new Date().toISOString());
            }
        } catch (err) {
            console.warn('[contracts] projection save failed:', err && err.message);
        }
        return rows;
    };

    /* Coalesce a burst of task changes into one small local write. */
    const scheduleSave = (tasks) => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            save(tasks).catch(() => {});
        }, SAVE_DEBOUNCE_MS);
    };

    window.koContractProjection = {
        STORE,
        META_KEY,
        buildRows,
        hydrate,
        ready,
        get,
        saveFromTasks: save,
        scheduleSave,
        _resetForTests: () => {
            cache = [];
            hydrated = false;
            readyPromise = null;
            if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        }
    };

    /* Warm the projection at boot (single ~45 KB IDB read, no network) so the
       Contracts Manager can paint from `get()` on its very first open. */
    ready();
})();
