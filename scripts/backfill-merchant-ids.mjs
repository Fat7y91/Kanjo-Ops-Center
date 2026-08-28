#!/usr/bin/env node
/* Kanjo Ops — Backfill unique merchantIds for existing `tasks` docs.
   Assigns a permanent, immutable merchantId (KJ-XXXXXX) to every merchant
   group (task docs sharing the same base-name) that still lacks one, and
   upserts the authoritative `merchants/{merchantId}` record. Idempotent and
   safe to re-run: existing IDs are reused, never regenerated, so the Google
   Drive binding stays stable across runs.

   Credentials:
     FIREBASE_SERVICE_ACCOUNT         : full service-account JSON (CI secret)
     GOOGLE_APPLICATION_CREDENTIALS   : path to a service-account JSON file
   Dry run (no writes):
     SYNC_DRY_RUN=1 node scripts/backfill-merchant-ids.mjs
*/

import { webcrypto } from 'node:crypto';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const generateMerchantId = () => {
  const rand = webcrypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < rand.length; i++) code += ALPHABET[rand[i] % ALPHABET.length];
  return 'KJ-' + code;
};

const getBaseName = (name) => {
  if (!name) return '';
  let clean = name;
  while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
    clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
  }
  return clean.trim();
};

const dryRun = process.env.SYNC_DRY_RUN === '1';

let adminApp;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  adminApp = initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  }, 'backfill-merchant-ids');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminApp = initializeApp({ credential: applicationDefault() }, 'backfill-merchant-ids');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

const db = getFirestore(adminApp);

const main = async () => {
  const allTasks = await db.collection('tasks').get();
  const groups = new Map();

  allTasks.forEach((doc) => {
    const data = doc.data() || {};
    const base = getBaseName(data.name);
    if (!base) return;
    if (!groups.has(base)) groups.set(base, { docs: [], merchantId: '' });
    const g = groups.get(base);
    g.docs.push({ ref: doc.ref, data });
    if (!g.merchantId && data.merchantId) g.merchantId = data.merchantId;
  });

  // Assign a merchantId to every group that still lacks one.
  groups.forEach((g) => {
    if (!g.merchantId) g.merchantId = generateMerchantId();
  });

  const summary = { merchants: 0, taskDocsUpdated: 0, merchantRecordsCreated: 0 };

  let batch = db.batch();
  let opCount = 0;
  const flush = async () => {
    if (opCount === 0) return;
    if (dryRun) {
      console.log(`[dry-run] would commit ${opCount} operation(s)`);
    } else {
      await batch.commit();
    }
    batch = db.batch();
    opCount = 0;
  };

  for (const [base, g] of groups) {
    summary.merchants += 1;

    // 1) Stamp merchantId onto every task doc in the group.
    for (const doc of g.docs) {
      if (doc.data.merchantId === g.merchantId) continue;
      if (dryRun) {
        console.log(`[dry-run] task ${doc.ref.id} ("${base}") -> merchantId ${g.merchantId}`);
      }
      batch.update(doc.ref, { merchantId: g.merchantId });
      opCount += 1;
      summary.taskDocsUpdated += 1;
      if (opCount >= 480) await flush();
    }

    // 2) Ensure the authoritative merchant record exists (merge-safe upsert).
    const recRef = db.collection('merchants').doc(g.merchantId);
    const recSnap = await recRef.get();
    if (!recSnap.exists) {
      if (dryRun) {
        console.log(`[dry-run] merchant record ${g.merchantId} ("${base}") -> create`);
      }
      batch.set(recRef, {
        merchantId: g.merchantId,
        name: base,
        createdAt: new Date()
      }, { merge: false });
      opCount += 1;
      summary.merchantRecordsCreated += 1;
      if (opCount >= 480) await flush();
    }
  }

  await flush();
  console.log('Backfill summary:', JSON.stringify(summary, null, 2));
  process.exit(0);
};

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
