#!/usr/bin/env node
/* One-off, merge-only maintenance task: zero `activeSeconds` on a single day's
   daily_stats documents.

   Written to clean up the midnight-rollover spillover where a tab left open
   across local midnight flushed the previous day's accumulated active time
   into the new day (2026-09-30 -> 2026-10-01). The tracker itself is fixed in
   public/js/services/kpi.js; this script removes the already-written corrupt
   value.

   Safety:
     - never deletes a document,
     - merges ONLY `activeSeconds` (plus an audit timestamp) so counts and
       every other field on the doc are preserved,
     - supports SYNC_DRY_RUN=1 to report without writing.

   Usage:
     node scripts/reset-kpi-day-active.mjs [YYYY-MM-DD]
   Environment:
     FIREBASE_SERVICE_ACCOUNT  service-account JSON (string)
     SYNC_DRY_RUN=1            report only, no writes */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dateArg = process.argv[2] || '2026-10-01';
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.SYNC_DRY_RUN || '').toLowerCase());

if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error('Invalid date (expected YYYY-MM-DD):', dateArg);
    process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set');
    process.exit(1);
}
const serviceAccount = JSON.parse(raw);
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const main = async () => {
    console.log(`Reset activeSeconds for day ${dateArg}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
    const reps = await db.collection('rep_kpis').get();
    let scanned = 0;
    let touched = 0;
    for (const rep of reps.docs) {
        const ref = db.doc(`rep_kpis/${rep.id}/daily_stats/${dateArg}`);
        const snap = await ref.get();
        scanned++;
        if (!snap.exists) continue;
        const before = Math.max(0, Number((snap.data() || {}).activeSeconds) || 0);
        if (before === 0) continue;
        if (DRY_RUN) {
            console.log(`  -> rep_kpis/${rep.id}/daily_stats/${dateArg}  activeSeconds ${before} -> 0`);
        } else {
            await ref.set({ activeSeconds: 0, rolloverResetAt: new Date() }, { merge: true });
            console.log(`  -> rep_kpis/${rep.id}/daily_stats/${dateArg}  activeSeconds ${before} -> 0 (written)`);
        }
        touched++;
    }
    console.log(`Reps scanned: ${scanned} | docs ${DRY_RUN ? 'to reset' : 'reset'}: ${touched}`);
    console.log(`Reset complete for ${dateArg}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
