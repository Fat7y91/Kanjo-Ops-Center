#!/usr/bin/env node
/* Kanjo Ops — one-off KPI monthly-summary backfill.
 *
 * Rebuilds rep_kpis/{repId}/monthly/{YYYY-MM} for every KPI-tracked rep so a
 * historical month (e.g. September 2026, whose summaries were overwritten by the
 * former single-document storage) once again powers the team leaderboard and the
 * rep's "1 of X" ranking.
 *
 * Why a VM: the leaderboard summary is produced by the SAME code the browser
 * runs (public/js/services/kpi.js). Re-implementing the scoring in Node would
 * risk publishing numbers that disagree with the dashboard. Instead we load the
 * real script into a sandbox, back window.kanjoRest with the Admin SDK, and let
 * kpiBuildReport() compute and publish the month through its normal path.
 *
 * Credentials:
 *   FIREBASE_SERVICE_ACCOUNT       : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
 *
 * Usage:
 *   node scripts/backfill-kpi-month.mjs 2026-09
 *   SYNC_DRY_RUN=1 node scripts/backfill-kpi-month.mjs 2026-09   # no writes
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const dryRun = ['1', 'true'].includes(String(process.env.SYNC_DRY_RUN || '').toLowerCase());
const monthArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) || '2026-09';
if (!/^\d{4}-\d{2}$/.test(monthArg)) {
  console.error('Usage: node scripts/backfill-kpi-month.mjs YYYY-MM');
  process.exit(1);
}

let adminApp;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  adminApp = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'backfill-kpi-month');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminApp = initializeApp({ credential: applicationDefault() }, 'backfill-kpi-month');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}
const db = getFirestore(adminApp);

/* Walk a Firestore path: even indices are collections, odd indices documents. */
const refFromSegments = (segments) => {
  let ref = db;
  segments.forEach((seg, i) => {
    ref = (i % 2 === 0) ? ref.collection(String(seg)) : ref.doc(String(seg));
  });
  return ref;
};
const docsToItems = (snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

/* CRITICAL-SECTION guard: this script must never delete. It only merge-writes
   the monthly summary documents. */
const writeLog = [];
const pendingWrites = [];
const kanjoRest = {
  async runQuery(collectionId) {
    return docsToItems(await db.collection(collectionId).get());
  },
  async list(segments) {
    return docsToItems(await refFromSegments(segments).get());
  },
  async getDocument(segments) {
    const snap = await refFromSegments(segments).get();
    return snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
  },
  patch(segments, data) {
    const path = segments.join('/');
    writeLog.push({ path, data });
    if (dryRun) return Promise.resolve(true);
    const p = refFromSegments(segments).set(data, { merge: true }).then(() => true);
    pendingWrites.push(p);
    return p;
  }
};

/* Pull the canonical payroll roster straight from the app's constants so the
   two never drift. constants.js is an ES module with a build-time import, so we
   only lift the literal array out of the text. */
const constantsSrc = readFileSync(join(REPO, 'public/js/config/constants.js'), 'utf8');
const payrollMatch = constantsSrc.match(/const KANJO_REP_PAYROLL = (\[[\s\S]*?\]);/);
if (!payrollMatch) {
  console.error('Could not find KANJO_REP_PAYROLL in constants.js');
  process.exit(1);
}
const KANJO_REP_PAYROLL = vm.runInNewContext('(' + payrollMatch[1] + ')', {});

const kpiSrc = readFileSync(join(REPO, 'public/js/services/kpi.js'), 'utf8');

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  JSON, Math, Date, Number, String, Boolean, Object, Array, Map, Set, Promise, RegExp, Error, Intl,
  navigator: { onLine: true },
  document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {}, readyState: 'complete' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};
sandbox.window = {
  users: {},
  currentUser: { name: 'Backfill (Admin)', role: 'admin', team: '' },
  KANJO_REP_PAYROLL,
  _kpiReportMonth: monthArg,
  _kpiReportMonthUserSet: true,
  kanjoCache: {
    get: (_key, _ttl, loader) => Promise.resolve().then(loader),
    invalidate: () => {},
    invalidatePrefix: () => {}
  },
  kanjoRest,
  isFieldRepUser: () => false,
  isKpiTrackedUser: () => false,
  canViewKpiDashboard: () => true,
  /* The Admin SDK path is never taken: every read goes through kanjoRest. */
  getDoc: () => { throw new Error('SDK getDoc is not available in the backfill'); },
  getDocs: () => { throw new Error('SDK getDocs is not available in the backfill'); },
  doc: () => { throw new Error('SDK doc is not available in the backfill'); },
  collection: () => { throw new Error('SDK collection is not available in the backfill'); },
  query: () => { throw new Error('SDK query is not available in the backfill'); },
  where: () => { throw new Error('SDK where is not available in the backfill'); }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(kpiSrc, sandbox, { filename: 'kpi.js' });

if (vm.runInContext('typeof kpiBuildReport', sandbox) !== 'function') {
  console.error('kpiBuildReport was not found in kpi.js — aborting.');
  process.exit(1);
}

console.log('Backfill month: ' + monthArg + (dryRun ? ' (DRY RUN — no writes)' : ''));

const report = await vm.runInContext('kpiBuildReport(' + JSON.stringify(monthArg) + ')', sandbox);
/* Let the fire-and-forget publish microtasks register before draining them. */
await new Promise((resolve) => setImmediate(resolve));
await Promise.all(pendingWrites);

const rows = Array.isArray(report && report.rows) ? report.rows : [];
console.log('Reps in report: ' + rows.length + ' | period: ' + (report && report.period));
rows
  .slice()
  .sort((a, b) => (b.kanjoScore || 0) - (a.kanjoScore || 0))
  .forEach((r) => {
    console.log('  ' + r.repId + ' | products=' + r.totalProducts
      + ' seconds=' + r.totalSeconds
      + ' withImage=' + r.withImage
      + ' validRatio=' + Number(r.validRatioRaw || 0).toFixed(3)
      + ' imageRatio=' + Number(r.imageRatioRaw || 0).toFixed(3)
      + ' avgDesc=' + Number(r.avgDescriptionLength || 0).toFixed(1)
      + ' score=' + Number(r.kanjoScore || 0).toFixed(2)
      + (r.isEditor ? ' (editor)' : ''));
  });
console.log('Writes planned: ' + writeLog.length + (dryRun ? ' (skipped)' : ''));
writeLog.forEach((w) => console.log('  -> ' + w.path + ' @' + monthArg));
console.log('Backfill complete for ' + monthArg + '.');
