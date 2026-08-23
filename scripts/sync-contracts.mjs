#!/usr/bin/env node
/* Kanjo Ops — Sync batch-1 contracts into Firestore `tasks`.
   Matches tasks by merchant base-name and updates: time, cat, team, isSigned,
   achieved (and backfills createdAt when missing so the paginated realtime query
   keeps working). Idempotent and safe to re-run.

   Credentials:
     FIREBASE_SERVICE_ACCOUNT  : full service-account JSON (used in CI from the
                                 FIREBASE_SERVICE_ACCOUNT_KANJO_DESOUK secret)
     GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
   Dry run (no writes):
     SYNC_DRY_RUN=1 node scripts/sync-contracts.mjs
*/

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/* Same normalization the app uses to link follow-up tasks to their merchant. */
const getBaseName = (name) => {
    if (!name) return '';
    let clean = name;
    while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
        clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
    }
    return clean.trim();
};

/* Lenient matching: strips RTL/LTR formatting marks, normalizes Arabic letter
   variants and diacritics, and removes emoji so the batch data matches tasks
   even when the stored name differs slightly. */
const normalizeForMatch = (s) => (s || '')
    .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .trim();

const stripEmoji = (s) => (s || '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();

const dataPath = process.argv[2] || new URL('./contracts-batch-1.json', import.meta.url).pathname;
const contracts = JSON.parse(readFileSync(dataPath, 'utf8'));

const dryRun = process.env.SYNC_DRY_RUN === '1';

let adminApp;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    adminApp = initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    }, 'sync-contracts');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    adminApp = initializeApp({ credential: applicationDefault() }, 'sync-contracts');
} else {
    console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
}

const db = getFirestore(adminApp);

const keysFor = (name) => {
    const base = getBaseName(name);
    const keys = new Set([normalizeForMatch(base), normalizeForMatch(stripEmoji(base))]);
    return keys;
};

const indexTasks = (docs) => {
    const byKey = new Map();
    docs.forEach((doc) => {
        const data = doc.data() || {};
        const keys = keysFor(data.name);
        keys.forEach((k) => {
            if (!k) return;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push({ ref: doc.ref, data });
        });
    });
    return byKey;
};

const main = async () => {
    const allTasks = await db.collection('tasks').get();
    const byKey = indexTasks(allTasks.docs);

    const summary = { contracts: 0, matchedDocs: 0, updatedDocs: 0, notFound: [] };

    let batch = db.batch();
    let opCount = 0;

    const flush = async () => {
        if (opCount === 0) return;
        if (dryRun) {
            console.log(`[dry-run] would commit ${opCount} update(s)`);
        } else {
            await batch.commit();
        }
        batch = db.batch();
        opCount = 0;
    };

    for (const c of contracts) {
        summary.contracts += 1;
        const matched = new Set();
        keysFor(c.n).forEach((k) => {
            const hits = byKey.get(k);
            if (hits) hits.forEach((h) => matched.add(h));
        });
        const hits = Array.from(matched);

        if (hits.length === 0) {
            summary.notFound.push(c.n);
            continue;
        }

        const payloadBase = {
            time: c.d,
            cat: c.c,
            team: c.t,
            isSigned: c.s === true,
            achieved: Number(c.a) || 0
        };
        if (c.s === true) payloadBase.isProvisional = false;

        for (const hit of hits) {
            summary.matchedDocs += 1;
            const payload = { ...payloadBase };
            /* Backfill createdAt ONLY when missing — keeps the app's
               orderBy('createdAt','desc') pagination from hiding these tasks. */
            if (!hit.data.createdAt) {
                payload.createdAt = new Date(`${c.d}T00:00:00Z`);
            }
            if (dryRun) {
                console.log(`[dry-run] would update "${c.n}" -> task ${hit.ref.id}:`, JSON.stringify(payload));
            }
            batch.update(hit.ref, payload);
            opCount += 1;
            summary.updatedDocs += 1;
            if (opCount >= 480) await flush();
        }
    }

    await flush();
    console.log('Sync summary:', JSON.stringify(summary, null, 2));
    process.exit(summary.notFound.length === 0 ? 0 : 0);
};

main().catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
});
