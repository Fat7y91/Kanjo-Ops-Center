#!/usr/bin/env node
/* Kanjo Ops — Denormalize each merchant's contract status + mapped product
   count onto the `merchants` collection.

   Why: the isolated marketing-agency portal may only read `merchants` and
   `merchant_products` (see firestore.rules `isMarketingAgency`). The real
   contract state lives on operational `tasks` — `isSigned === true` with
   `achieved > 0` means a final agreement, `vipPreContract === true` means an
   under-contract VIP pre-agreement. This job copies a minimal, safe summary
   onto each merchant document so the portal can filter and group vendors with
   zero operational-data exposure and without any rules change.

   Derived fields written onto `merchants/{id}`:
     contractStatus : 'final' | 'vip' | ''
     productCount   : number of `merchant_products` mapped to the merchant
     contractStatusSyncedAt : server write time

   Contracted merchants that have no merchant document yet (e.g. fresh VIP
   pre-agreements, which never went through a document upload) are created so
   the portal can list them. Every other merchant is cleared back to ''.

   Credentials:
     FIREBASE_SERVICE_ACCOUNT       : full service-account JSON (CI secret)
     GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
   Dry run (no writes):
     SYNC_DRY_RUN=1 node scripts/sync-merchant-status.mjs
*/

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/* Must match public/js/utils/helpers.js `getBaseName` exactly so the join is
   stable across the app. */
const getBaseName = (name) => {
  if (!name) return '';
  let clean = String(name).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g, '');
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
  }, 'sync-merchant-status');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminApp = initializeApp({ credential: applicationDefault() }, 'sync-merchant-status');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

const db = getFirestore(adminApp);

const main = async () => {
  const [tasksSnap, merchantsSnap, productsSnap] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('merchants').get(),
    db.collection('merchant_products').get()
  ]);

  /* ── 1) Contracted merchants, keyed by base-name. Final wins over VIP. ── */
  const contracted = new Map(); // base -> { merchantId, name, status }
  tasksSnap.forEach((doc) => {
    const t = doc.data() || {};
    const base = getBaseName(t.name);
    if (!base) return;
    const achieved = Number(t.achieved) || 0;
    const isFinal = t.isSigned === true && achieved > 0;
    const isVip = t.vipPreContract === true;
    if (!isFinal && !isVip) return;
    const status = isFinal ? 'final' : 'vip';
    const existing = contracted.get(base);
    if (existing) {
      if (status === 'final') existing.status = 'final';
      if (!existing.merchantId && t.merchantId) existing.merchantId = t.merchantId;
    } else {
      contracted.set(base, { merchantId: t.merchantId || '', name: base, status });
    }
  });
  const contractedIds = new Set(
    [...contracted.values()].map((c) => c.merchantId).filter(Boolean)
  );

  /* ── 2) Mapped product count per merchantId. ── */
  const productCount = new Map();
  productsSnap.forEach((doc) => {
    const mid = String((doc.data() || {}).merchantId || '');
    if (!mid) return;
    productCount.set(mid, (productCount.get(mid) || 0) + 1);
  });

  /* ── 3) Index existing merchant docs by id and base-name. ── */
  const byId = new Map();
  const byBase = new Map();
  merchantsSnap.forEach((doc) => {
    const m = doc.data() || {};
    if (m.merchantId) byId.set(String(m.merchantId), doc);
    const base = getBaseName(m.name);
    if (base) byBase.set(base, doc);
  });

  const summary = { contracted: contracted.size, final: 0, vip: 0, updated: 0, created: 0, cleared: 0 };

  let batch = db.batch();
  let opCount = 0;
  const flush = async () => {
    if (opCount === 0) return;
    if (dryRun) console.log(`[dry-run] would commit ${opCount} operation(s)`);
    else await batch.commit();
    batch = db.batch();
    opCount = 0;
  };
  const write = (ref, payload) => {
    batch.set(ref, payload, { merge: true });
    opCount += 1;
  };

  /* ── 4) Upsert contractStatus + productCount for every contracted merchant. ── */
  for (const [base, c] of contracted) {
    summary[c.status] += 1;
    const doc = (c.merchantId && byId.get(c.merchantId)) || byBase.get(base) || null;

    if (doc) {
      const m = doc.data() || {};
      const mid = String(m.merchantId || doc.id);
      const count = productCount.get(mid) || 0;
      if (m.contractStatus !== c.status || Number(m.productCount || 0) !== count) {
        write(doc.ref, { contractStatus: c.status, productCount: count, contractStatusSyncedAt: new Date() });
        summary.updated += 1;
        if (opCount >= 480) await flush();
      }
    } else if (c.merchantId) {
      /* No record yet (typical for VIP pre-agreements). Create a minimal one
         so the read-only portal can list the vendor. */
      const count = productCount.get(c.merchantId) || 0;
      const ref = db.collection('merchants').doc(c.merchantId);
      write(ref, {
        merchantId: c.merchantId,
        name: c.name,
        contractStatus: c.status,
        productCount: count,
        contractStatusSyncedAt: new Date(),
        createdAt: new Date()
      });
      summary.created += 1;
      if (opCount >= 480) await flush();
    }
  }

  /* ── 5) Clear stale status on anything no longer contracted. ── */
  for (const doc of merchantsSnap.docs) {
    const m = doc.data() || {};
    if (!m.contractStatus) continue;
    const base = getBaseName(m.name);
    const mid = m.merchantId ? String(m.merchantId) : '';
    if (contracted.has(base) || (mid && contractedIds.has(mid))) continue;
    write(doc.ref, { contractStatus: '', contractStatusSyncedAt: new Date() });
    summary.cleared += 1;
    if (opCount >= 480) await flush();
  }

  await flush();
  console.log('Merchant status sync summary:', JSON.stringify(summary, null, 2));
  process.exit(0);
};

main().catch((err) => {
  console.error('Merchant status sync failed:', err);
  process.exit(1);
});
