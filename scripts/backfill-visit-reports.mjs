#!/usr/bin/env node
/* Kanjo Ops — backfill visit reports lost during the Oct-2026 report-write incident.
 * =================================================================================
 * Two reps filed reports on 2026-10-01 (Sara: Happy / XO Cosmetics, Mustafa:
 * ابو سعده / بن ربيع). Their surviving notification records prove the visits, but
 * the report text itself was never persisted before the write path was fixed, so
 * the entries were absent from tasks/{id}.reports and the quick-view modal.
 *
 * This restores ONE confirmed placeholder entry per notification, stamped with the
 * notification's own timestamp, so the visit is recorded on the merchant timeline.
 * The placeholder text deliberately does NOT mention any technical fault.
 *
 * Idempotent: uses FieldValue.arrayUnion with a fixed `ts`, so re-running never
 * duplicates an entry (Firestore de-duplicates identical array members).
 *
 * Credentials (same convention as the other scripts in this folder):
 *   FIREBASE_SERVICE_ACCOUNT        : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS  : path to a service-account JSON file
 *
 * Usage:
 *   node scripts/backfill-visit-reports.mjs
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = String(process.env.FIREBASE_PROJECT_ID || 'kanjo-desouk').trim();

const PLACEHOLDER = 'تم تأكيد الزيارة واحتسابها بنجاح ضمن التحديث الأخير للنظام. يرجى التكرم بإضافة أي ملاحظات هامة في تقرير جديد لضمان اكتمال سجل التاجر.';

/* Source of truth: each entry mirrors one surviving `notifications` record that
   was emitted for a report whose text is missing from the task document. `ts`
   is that notification's own creation time (epoch ms). */
const ENTRIES = [
    { taskId: '6zYif4jSwLjMXfIFItU9', name: 'سارة', team: 'Fox Team', ts: Date.parse('2026-10-01T14:47:29.521Z') },
    { taskId: 'pQlaGemEgSfXzMEnUyQb', name: 'سارة', team: 'Fox Team', ts: Date.parse('2026-10-01T14:50:10.849Z') },
    { taskId: 'rqPuFviCg89hInQZ2RGs', name: 'مصطفى', team: 'Fox Team', ts: Date.parse('2026-10-01T12:11:56.218Z') },
    { taskId: 'wxbQP8tNz8zcyRWGpwVD', name: 'مصطفى', team: 'Fox Team', ts: Date.parse('2026-10-01T12:15:58.208Z') }
];

const cairoTime = (ms) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
}).format(new Date(ms));

const reportFor = (e) => {
    const time = cairoTime(e.ts);
    const date = '2026-10-01';
    return {
        name: e.name,
        time,
        date,
        timestamp: `${date} ${time}`,
        ts: e.ts,
        contactName: '',
        contactRole: '',
        contactPhone: '',
        general: PLACEHOLDER,
        merchant: '',
        team: e.team,
        next: ''
    };
};

const initApp = () => {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId }, 'backfill-visit-reports');
    }
    return initializeApp({ credential: applicationDefault(), projectId }, 'backfill-visit-reports');
};

const app = initApp();
const db = getFirestore(app);

let failures = 0;
for (const e of ENTRIES) {
    const ref = db.collection('tasks').doc(e.taskId);
    const entry = reportFor(e);
    try {
        const before = await ref.get();
        if (!before.exists) {
            console.error(`FAIL ${e.taskId}: task document not found`);
            failures++;
            continue;
        }
        const beforeReports = before.get('reports') || [];
        await ref.update({ reports: FieldValue.arrayUnion(entry) });
        const after = await ref.get();
        const afterReports = after.get('reports') || [];
        const matches = afterReports.filter((r) => r && r.ts === e.ts && r.name === e.name);
        const added = afterReports.length - beforeReports.length;
        if (matches.length !== 1) {
            console.error(`FAIL ${e.taskId} ${e.name}: expected 1 backfilled entry, found ${matches.length}`);
            failures++;
        } else {
            console.log(`OK   ${e.taskId} "${before.get('name')}" ${e.name} → reports ${beforeReports.length}→${afterReports.length} (added ${added}), entry date=${entry.date} time=${entry.time}`);
        }
    } catch (err) {
        console.error(`FAIL ${e.taskId}:`, err && err.message ? err.message : err);
        failures++;
    }
}

if (failures) {
    console.error(`\n${failures} entr(ies) failed.`);
    process.exit(1);
}
console.log('\nAll visit reports backfilled and verified.');
process.exit(0);
