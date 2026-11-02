#!/usr/bin/env node
/* Kanjo Ops — immutable payroll KPI snapshots (September + October 2026).
 * ======================================================================
 * The live KPI engine derives a month from the mutable `merchant_products`
 * collection (bucket = `createdAt`, images credited to the product's creator).
 * That made already-paid historical figures drift and left the media editor's
 * work uncounted. Payroll must therefore stop reading derivations and start
 * reading a frozen, audited record.
 *
 * This script writes exactly ONE document per month plus one child per rep into
 * `payroll_snapshots`, using `create()` — never `set()`/`merge`. A month that is
 * already locked can never be overwritten; a second run fails loudly. There is
 * no delete path anywhere in this file. Corrections must be issued as a new
 * `-r2` revision, preserving the original.
 *
 * Layout:
 *   payroll_snapshots/{YYYY-MM}              ← month header (locked, hashed)
 *   payroll_snapshots/{YYYY-MM}/reps/{repId} ← per-rep frozen metrics
 *
 * Rollover contract stored on the October header: every operational output
 * dated on/after 2026-11-01, and any surplus above a locked baseline, belongs to
 * 2026-11. Dashboards must subtract the locked October baseline before
 * attributing November activity.
 *
 * Credentials (same convention as every other script in this folder):
 *   FIREBASE_SERVICE_ACCOUNT        : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS  : path to a service-account JSON file
 *
 * Usage:
 *   SYNC_DRY_RUN=1 node scripts/seed-payroll-snapshots.mjs   # plan only, no creds
 *   node scripts/seed-payroll-snapshots.mjs                  # apply (create-only)
 */

import { createHash } from 'node:crypto';

const PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || 'kanjo-desouk').trim();
const DRY_RUN = ['1', 'true'].includes(String(process.env.SYNC_DRY_RUN || '').toLowerCase());
const COLLECTION = 'payroll_snapshots';
const METRIC_VERSION = 1;
const ROLLOVER_CUTOFF = '2026-11-01T00:00:00+02:00';
const ROLLOVER_MONTH = '2026-11';

/* Mirrors kpiRepId() in public/js/services/kpi.js so a snapshot id and a live
   KPI id always resolve to the same key. */
const kpiRepId = (name) => {
    const clean = String(name || '').trim().replace(/[\/\s]+/g, '_').replace(/[^\u0600-\u06FFa-zA-Z0-9_.-]/g, '');
    return clean || 'unknown';
};

/* ─────────────────────────────────────────────────────────────────────────────
   SOURCE OF TRUTH — these numbers are contractual. Do not "recalculate" them.
   September = what was actually paid from the physical Excel sheet.
   October   = founder override after manual reconciliation of the
               `createdAt`→`updatedAt` time-travel bug and the missing legacy
               image edits.
   ──────────────────────────────────────────────────────────────────────────── */
const SNAPSHOTS = [
    {
        month: '2026-09',
        source: 'excel_manual',
        note: 'المرتبات الفعلية المدفوعة من شيت الإكسيل اليدوي — لا تُعاد الحسبة.',
        /* Historical Excel figures are the legal record. No rollover contract:
           the month was already closed before the bug was understood. */
        rollover: null,
        reps: [
            { name: 'سارة', team: 'Fox Team', products: 1321, vendors: 23, photos: 767 },
            { name: 'مصطفى', team: 'Fox Team', products: 985, vendors: 17, photos: 985 },
            { name: 'أحمد جمعه', team: 'Power Team', products: 806, vendors: 20, photos: 614 },
            { name: 'يوسف', team: 'Power Team', products: 37, vendors: 1, photos: 2768 }
        ]
    },
    {
        month: '2026-10',
        source: 'founder_override',
        note: 'تسوية يدوية معتمدة من المؤسس: أرقام أكتوبر الحية + الصور المستردة من خلل سبتمبر.',
        /* October is the FIRST month with a forward-looking contract: anything
           beyond these baselines (or anything dated in November) rolls over. */
        rollover: { cutoff: ROLLOVER_CUTOFF, surplusRollsTo: ROLLOVER_MONTH },
        reps: [
            { name: 'سارة', team: 'Fox Team', products: 1527, vendors: 14, photos: 2043 },
            { name: 'مصطفى', team: 'Fox Team', products: 1326, vendors: 7, photos: 1546 },
            { name: 'أحمد جمعه', team: 'Power Team', products: 492, vendors: 4, photos: 655 },
            { name: 'يوسف', team: 'Power Team', products: 0, vendors: 0, photos: 2730 },
            { name: 'Mahmoud Elgamel', team: 'Operations', products: 0, vendors: 0, photos: 0 }
        ]
    }
];

const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assertCount = (value, field, label) => {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${label}: ${field} must be a non-negative integer, got ${JSON.stringify(value)}`);
    }
};

/* Build the exact document bodies up-front so the hash covers every value that
   can never change after the lock. */
const buildPlan = () => SNAPSHOTS.map((snap) => {
    const reps = snap.reps.map((rep) => {
        assertCount(rep.products, 'products', `${snap.month}/${rep.name}`);
        assertCount(rep.vendors, 'vendors', `${snap.month}/${rep.name}`);
        assertCount(rep.photos, 'photos', `${snap.month}/${rep.name}`);
        return {
            repId: kpiRepId(rep.name),
            repName: String(rep.name),
            team: String(rep.team || ''),
            metrics: {
                products: rep.products,
                vendors: rep.vendors,
                photos: rep.photos
            },
            /* Frozen baseline used by the rollover rule to compute surplus. */
            baseline: { products: rep.products, vendors: rep.vendors, photos: rep.photos }
        };
    });

    const totals = reps.reduce((acc, r) => {
        acc.products += r.metrics.products;
        acc.vendors += r.metrics.vendors;
        acc.photos += r.metrics.photos;
        return acc;
    }, { products: 0, vendors: 0, photos: 0 });

    const evidence = { month: snap.month, source: snap.source, metricVersion: METRIC_VERSION, reps };

    return {
        month: snap.month,
        header: {
            month: snap.month,
            locked: true,
            source: snap.source,
            note: snap.note,
            metricVersion: METRIC_VERSION,
            repCount: reps.length,
            totals,
            rollover: snap.rollover,
            evidenceHash: sha256(evidence),
            /* Recorded for audit; the hash above is what actually pins content. */
            lockedBy: 'scripts/seed-payroll-snapshots.mjs',
            lockedAt: new Date().toISOString()
        },
        reps
    };
});

const printPlan = (plan) => {
    for (const month of plan) {
        console.log(`\n${month.month}  (${month.header.source})  hash=${month.header.evidenceHash.slice(0, 16)}…`);
        for (const rep of month.reps) {
            const m = rep.metrics;
            console.log(`  ${rep.repId.padEnd(18)} products=${String(m.products).padStart(5)}  vendors=${String(m.vendors).padStart(3)}  photos=${String(m.photos).padStart(5)}  # ${rep.repName}`);
        }
        const t = month.header.totals;
        console.log(`  ${'TOTAL'.padEnd(18)} products=${String(t.products).padStart(5)}  vendors=${String(t.vendors).padStart(3)}  photos=${String(t.photos).padStart(5)}`);
    }
};

const isAlreadyExists = (err) => err && (
    err.code === 6
    || err.code === 'already-exists'
    || /ALREADY_EXISTS|already exists/i.test(String(err.message || ''))
);

const main = async () => {
    const plan = buildPlan();
    printPlan(plan);

    if (DRY_RUN) {
        console.log('\nDRY RUN — no credentials used, no writes performed.');
        return 0;
    }

    let app;
    /* Imported lazily so a dry run works even when firebase-admin is not
       installed (e.g. a bare checkout before `npm install`). */
    let initializeApp, cert, applicationDefault, getFirestore;
    try {
        ({ initializeApp, cert, applicationDefault } = await import('firebase-admin/app'));
        ({ getFirestore } = await import('firebase-admin/firestore'));
    } catch (err) {
        console.error('firebase-admin is required for a real run. Install it with `npm install firebase-admin@12`.');
        console.error(err && err.message ? err.message : err);
        return 2;
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        app = initializeApp({
            credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
            projectId: PROJECT_ID
        }, 'seed-payroll-snapshots');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, 'seed-payroll-snapshots');
    } else {
        console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
        return 2;
    }
    const db = getFirestore(app);

    let failures = 0;
    for (const month of plan) {
        const headerRef = db.collection(COLLECTION).doc(month.month);
        try {
            /* create() → Firestore rejects the write if the month is already
               locked. This is the only guard that survives the Admin SDK's
               rules bypass, so it is never relaxed to set()/merge(). */
            await headerRef.create(month.header);
            console.log(`OK   ${month.month} header locked`);
        } catch (err) {
            if (isAlreadyExists(err)) {
                console.error(`FAIL ${month.month} is already locked — refusing to overwrite it (versions are immutable).`);
            } else {
                console.error(`FAIL ${month.month} header:`, err && err.message ? err.message : err);
            }
            failures++;
            continue;
        }

        for (const rep of month.reps) {
            const ref = headerRef.collection('reps').doc(rep.repId);
            try {
                await ref.create(rep);
                console.log(`OK   ${month.month}/reps/${rep.repId} frozen`);
            } catch (err) {
                console.error(`FAIL ${month.month}/reps/${rep.repId}:`, err && err.message ? err.message : err);
                failures++;
            }
        }

        /* Read back and verify every number against the plan. A snapshot that
           does not read back exactly is not allowed to exist silently. */
        const storedHeader = await headerRef.get();
        const storedReps = await headerRef.collection('reps').get();
        const byId = new Map(storedReps.docs.map((d) => [d.id, d.data() || {}]));
        if (!storedHeader.exists || storedHeader.get('locked') !== true
            || storedHeader.get('evidenceHash') !== month.header.evidenceHash) {
            console.error(`FAIL ${month.month}: header read-back mismatch`);
            failures++;
            continue;
        }
        for (const rep of month.reps) {
            const got = byId.get(rep.repId);
            const equal = got
                && got.metrics
                && got.metrics.products === rep.metrics.products
                && got.metrics.vendors === rep.metrics.vendors
                && got.metrics.photos === rep.metrics.photos;
            if (!equal) {
                console.error(`FAIL ${month.month}/reps/${rep.repId}: read-back mismatch`);
                failures++;
            }
        }
        console.log(`OK   ${month.month} verified (${storedReps.size}/${month.reps.length} reps)`);
    }

    if (failures) {
        console.error(`\n${failures} operation(s) failed. Nothing was overwritten.`);
        return 1;
    }
    console.log('\nAll payroll snapshots are locked and verified.');
    return 0;
};

main().then((code) => process.exit(code)).catch((err) => {
    console.error('Fatal:', err && err.message ? err.message : err);
    process.exit(1);
});
