#!/usr/bin/env node
/* Kanjo Ops — One-off Merchant & Product Identity Unification
   ==========================================================
   Collapses the "same merchant, many merchantIds" split that produced duplicate
   merchant cards in the Catalog overview. Identity is resolved by normalized
   base-name (with invisible Unicode marks stripped) so every product/task that
   points at an orphan or duplicate id is re-stamped onto the canonical id.

   What it does (idempotent):
     1. Re-stamps orphan `merchant_products` buckets onto the canonical merchant
        for the 6 merchants that already have a `merchants` doc. For exact
        normalized-name duplicates introduced by the merge, merges any missing
        image URLs into the kept row, then deletes the redundant duplicate.
     2. Promotes `المصرى` (KJ-A4SAM5) and `جوستو` (KJ-RQQHPU) to canonical (creates
        the `merchants` doc) and re-stamps their secondary bucket products.
     3. Unifies duplicate-name `merchants` directory docs (caused by invisible RTL
        marks / minting races): picks the best canonical doc, merges non-empty
        metadata, re-stamps `merchant_products` + `tasks`, deletes the redundant
        docs.
     4. Re-stamps affected `tasks` onto the canonical id and cleans invisible marks
        from their names.

   Safety: writes a JSON backup of every affected document before any write, only
   deletes a product when an identical normalized name already exists, never
   deletes an image URL, and aborts if a retired merchant still has products/tasks.

   Credentials:
     FIREBASE_SERVICE_ACCOUNT       : full service-account JSON
     GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
   Env:
     FIREBASE_PROJECT_ID  (default: kanjo-desouk)
     UNIFY_DRY_RUN=1      plan + backup only, no writes
     BACKUP_PATH          (default: /tmp/merchant-unification-backup.json)
     UNIFY_SKIP_ASSERT=1  bypass the expected-count assertions (not recommended)
*/

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';

const projectId = String(process.env.FIREBASE_PROJECT_ID || 'kanjo-desouk').trim();
const dryRun = process.env.UNIFY_DRY_RUN === '1';
const skipAssert = process.env.UNIFY_SKIP_ASSERT === '1';
const BACKUP_PATH = String(process.env.BACKUP_PATH || '/tmp/merchant-unification-backup.json');

let app;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  app = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId }, 'unify-merchant-identities');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  app = initializeApp({ credential: applicationDefault(), projectId }, 'unify-merchant-identities');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}
const db = getFirestore(app);

/* ── Normalization (must match public/js/utils/helpers.js getBaseName) ── */
const INVIS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u061C]/g;
const cleanInvisible = (s) => String(s || '').replace(INVIS, '');
function getBaseName(name) {
  if (!name) return '';
  let clean = cleanInvisible(name);
  while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
    clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
  }
  return clean.trim();
}
const normKey = (s) => getBaseName(s).normalize('NFKC')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
const normProduct = (data) => normKey(String((data && (data.name_ar || data.name_en || data.name)) || ''));

/* Explicit canonical ids sanctioned for this migration, keyed by normalized
   name. The 6 existing merchants keep their product-bearing directory id; the
   two promoted names (المصرى, جوستو) are forced onto the primary bucket id and
   any pre-existing directory doc for them is folded in (fields merged, then the
   redundant doc removed). */
const FORCED_CANONICAL = Object.fromEntries([
  { id: 'KJ-6VHCEF', name: 'Marassi' },
  { id: 'KJ-UVMKKM', name: 'Sivana' },
  { id: 'KJ-QZADGM', name: 'بوابة دمشق' },
  { id: 'KJ-P9VVNX', name: 'طيب الشام' },
  { id: 'KJ-J77X6G', name: 'أسماك بحري' },
  { id: 'KJ-WWYTQF', name: 'جرين باسكت' },
  { id: 'KJ-A4SAM5', name: 'المصرى', promoted: true },
  { id: 'KJ-RQQHPU', name: 'جوستو', promoted: true }
].map((t) => [normKey(t.name), t]));

const IMG_ARRAY_FIELDS = ['rawImageUrls', 'enhancedImageUrls'];
const IMG_SCALAR_FIELDS = ['rawImageUrl', 'enhancedImageUrl', 'image_url'];
const isEmptyField = (v) => v === null || v === undefined || v === ''
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && typeof v.toDate !== 'function' && Object.keys(v).length === 0);

const unionArrays = (a, b) => {
  const out = [];
  const seen = new Set();
  for (const src of [a, b]) {
    if (!Array.isArray(src)) continue;
    for (const u of src) { const s = String(u || ''); if (s && !seen.has(s)) { seen.add(s); out.push(u); } }
  }
  return out;
};

const main = async () => {
  const [tasksSnap, merchantsSnap, productsSnap] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('merchants').get(),
    db.collection('merchant_products').get()
  ]);

  const tasks = tasksSnap.docs.map((d) => ({ ref: d.ref, id: d.id, data: d.data() || {} }));
  const merchants = merchantsSnap.docs.map((d) => ({ ref: d.ref, id: d.id, data: d.data() || {} }));
  const products = productsSnap.docs.map((d) => ({ ref: d.ref, id: d.id, data: d.data() || {} }));
  console.log(`[load] tasks=${tasks.length} merchants=${merchants.length} products=${products.length}`);

  const taskCountByMid = new Map();
  for (const t of tasks) {
    const mid = String(t.data.merchantId || '');
    if (mid) taskCountByMid.set(mid, (taskCountByMid.get(mid) || 0) + 1);
  }
  const productsByMid = new Map();
  for (const p of products) {
    const mid = String(p.data.merchantId || '');
    if (!mid) continue;
    if (!productsByMid.has(mid)) productsByMid.set(mid, []);
    productsByMid.get(mid).push(p);
  }

  /* ── Canonical merchant selection per normalized name ── */
  const byNorm = new Map();
  for (const m of merchants) {
    const nk = normKey(m.data.name || '');
    if (!byNorm.has(nk)) byNorm.set(nk, []);
    byNorm.get(nk).push(m);
  }
  const score = (m) => (taskCountByMid.get(m.id) ? 100000 : 0)
    + (m.data.contractStatus ? 1000 : 0)
    + (m.data.logoUrl ? 300 : 0)
    + ((m.data.driveFolderLink || m.data.driveFolderId) ? 100 : 0)
    + (productsByMid.get(m.id) ? productsByMid.get(m.id).length : 0);

  const canonicalOfId = new Map();          // any id -> canonical id
  const nameCanonical = new Map();          // normKey -> { id, name, existing }
  const merchantGroups = [];                // groups with a merge + deletes

  for (const [nk, list] of byNorm) {
    list.sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)));
    const force = FORCED_CANONICAL[nk];
    /* Forced canonical id (the migration's explicitly sanctioned target). */
    if (force) {
      const forcedDoc = list.find((d) => d.id === force.id) || null;
      if (forcedDoc && force.promoted) console.warn(`[force] "${nk}" promoted id ${force.id} unexpectedly already exists`);
      if (!forcedDoc && !force.promoted) {
        console.error(`[ABORT] forced canonical ${force.id} for "${nk}" not found in merchants`);
        process.exit(1);
      }
      const cleaned = force.promoted ? force.name : (cleanInvisible(forcedDoc.data.name || '').trim() || force.name);
      canonicalOfId.set(force.id, force.id);
      const merge = {};
      const deletedDocs = [];
      for (const dup of list) {
        if (dup.id === force.id) continue;
        canonicalOfId.set(dup.id, force.id);
        deletedDocs.push(dup);
        for (const [k, v] of Object.entries(dup.data)) {
          if (k === 'merchantId' || isEmptyField(v)) continue;
          if (isEmptyField(forcedDoc ? forcedDoc.data[k] : undefined) && isEmptyField(merge[k])) merge[k] = v;
        }
      }
      const existing = !!forcedDoc && !force.promoted;
      nameCanonical.set(nk, { id: force.id, name: cleaned, existing });
      merchantGroups.push({ nk, forced: true, promoted: !existing, canonical: forcedDoc, id: force.id, merge, deletedDocs, cleaned,
        needsUpdate: forcedDoc ? (Object.keys(merge).length > 0 || cleaned !== forcedDoc.data.name || String(forcedDoc.data.merchantId || '') !== force.id) : false });
      continue;
    }
    const canonical = list[0];
    const cleaned = cleanInvisible(canonical.data.name || '').trim() || canonical.data.name || '';
    canonicalOfId.set(canonical.id, canonical.id);
    const merge = {};
    const deletedDocs = [];
    for (const dup of list.slice(1)) {
      canonicalOfId.set(dup.id, canonical.id);
      deletedDocs.push(dup);
      for (const [k, v] of Object.entries(dup.data)) {
        if (k === 'merchantId' || isEmptyField(v)) continue;
        if (isEmptyField(canonical.data[k]) && isEmptyField(merge[k])) merge[k] = v;
      }
    }
    nameCanonical.set(nk, { id: canonical.id, name: cleaned, existing: true });
    merchantGroups.push({ nk, canonical, merge, deletedDocs, cleaned,
      needsUpdate: Object.keys(merge).length > 0 || cleaned !== canonical.data.name || String(canonical.data.merchantId || '') !== canonical.id });
  }

  /* Forced names with no directory doc at all (pure promotion). */
  for (const [nk, force] of Object.entries(FORCED_CANONICAL)) {
    if (nameCanonical.has(nk)) continue;
    canonicalOfId.set(force.id, force.id);
    nameCanonical.set(nk, { id: force.id, name: force.name, existing: false });
    merchantGroups.push({ nk, forced: true, promoted: true, id: force.id, name: force.name, merge: {}, deletedDocs: [] });
  }

  const existingNameIds = new Set([...nameCanonical.values()].filter((v) => v.existing).map((v) => v.id));
  const affectedNames = new Set(nameCanonical.keys());

  /* ── Plan product re-stamps + duplicate deletions ── */
  const productUpdates = new Map();     // productId -> {ref, data}
  const productDeletes = [];            // {ref, id, name}
  const keptImageMerge = new Map();     // keptProductId -> {ref, patch}
  const retiredIds = new Set();         // ids folded into a canonical (no longer referenced)

  // Group every product by its resolved canonical id (only for affected names).
  const byCanonical = new Map();        // cid -> { own: [], orphans: Map<orig,[products]> }
  let untouched = 0;
  for (const p of products) {
    const mid = String(p.data.merchantId || '');
    let cid = canonicalOfId.get(mid);
    if (!cid) {
      const nk = normKey(p.data.merchantName || '');
      if (affectedNames.has(nk)) { cid = nameCanonical.get(nk).id; if (mid) canonicalOfId.set(mid, cid); }
    }
    if (!cid) { untouched++; continue; }
    if (!byCanonical.has(cid)) byCanonical.set(cid, { own: [], orphans: new Map() });
    const g = byCanonical.get(cid);
    if (mid === cid) g.own.push(p);
    else {
      if (mid) { /* orphan id */ }
      const key = mid || '<none>';
      if (!g.orphans.has(key)) g.orphans.set(key, []);
      g.orphans.get(key).push(p);
    }
  }

  /* Every id folded into a canonical (duplicate merchant docs, orphan product
     buckets, promoted secondary buckets) is retired for task re-stamping. */
  for (const [id, cid] of canonicalOfId) if (id !== cid) retiredIds.add(id);

  // Only pre-existing canonical merchants de-duplicate exact name collisions
  // introduced by the merge; promoted merchants keep every product.
  for (const [cid, g] of byCanonical) {
    const info = [...nameCanonical.values()].find((v) => v.id === cid);
    if (!info) continue;
    const dedup = info.existing;
    const seen = new Map(); // normName -> { ref, data }
    const ownSorted = g.own.slice().sort((a, b) => a.id.localeCompare(b.id));
    if (dedup) for (const p of ownSorted) { const n = normProduct(p.data); if (!seen.has(n)) seen.set(n, p); }

    const orphanKeys = [...g.orphans.keys()].sort();
    const deletedForGroup = [];
    for (const key of orphanKeys) {
      const list = g.orphans.get(key).slice().sort((a, b) => a.id.localeCompare(b.id));
      for (const p of list) {
        const n = normProduct(p.data);
        if (dedup && seen.has(n)) {
          const kept = seen.get(n);
          // Merge any image URLs the kept row is missing before deleting.
          const patch = imagePatchFor(kept.data, p.data);
          if (patch) {
            const cur = keptImageMerge.get(kept.id) || { ref: kept.ref, patch: {} };
            Object.assign(cur.patch, patch);
            keptImageMerge.set(kept.id, cur);
            Object.assign(kept.data, patch);
          }
          productDeletes.push({ ref: p.ref, id: p.id, name: String(p.data.name_ar || p.data.name_en || ''), from: String(p.data.merchantId || ''), canonical: cid });
          deletedForGroup.push(p.id);
        } else {
          seen.set(n, p);
          productUpdates.set(p.id, { ref: p.ref, data: { merchantId: cid, merchantName: info.name } });
        }
      }
    }
    if (deletedForGroup.length) console.log(`[dedup] ${cid} "${info.name}" deleted ${deletedForGroup.length} exact-name duplicates`);
  }

  // Fold non-affected canonical ids? none.

  /* ── Plan task re-stamps ── */
  const taskUpdates = new Map();
  for (const t of tasks) {
    const cur = String(t.data.merchantId || '');
    let target = null;
    if (cur && retiredIds.has(cur)) target = canonicalOfId.get(cur);
    else if (!cur || !existingNameIds.has(cur)) {
      const nk = normKey(t.data.name || '');
      if (affectedNames.has(nk)) { const c = nameCanonical.get(nk); if (cur !== c.id) target = c.id; }
    }
    if (target) {
      const cleanedName = t.data.name && cleanInvisible(t.data.name) !== t.data.name ? cleanInvisible(t.data.name) : undefined;
      const data = { merchantId: target };
      if (cleanedName !== undefined) data.name = cleanedName;
      taskUpdates.set(t.id, { ref: t.ref, data, from: cur });
    }
  }

  /* ── Plan merchant doc updates / creates / deletes ── */
  const merchantUpdates = [];
  const merchantCreates = [];
  const merchantDeletes = [];
  for (const grp of merchantGroups) {
    if (grp.promoted) {
      merchantCreates.push({ ref: db.collection('merchants').doc(grp.id), data: { ...(grp.merge || {}), merchantId: grp.id, name: grp.name || grp.cleaned, createdAt: new Date() } });
      for (const dup of grp.deletedDocs) merchantDeletes.push({ ref: dup.ref, id: dup.id, name: dup.data.name || '', canonical: grp.id });
      continue;
    }
    if (grp.needsUpdate) {
      const data = { ...grp.merge, name: grp.cleaned, merchantId: grp.canonical.id };
      merchantUpdates.push({ ref: grp.canonical.ref, data });
    }
    for (const dup of grp.deletedDocs) merchantDeletes.push({ ref: dup.ref, id: dup.id, name: dup.data.name || '', canonical: grp.canonical.id });
  }

  /* ── Safety: retire only ids with no remaining products/tasks ── */
  const finalProductMids = new Set();
  for (const p of products) {
    if (productDeletes.find((d) => d.id === p.id)) continue;
    const upd = productUpdates.get(p.id);
    finalProductMids.add(String((upd && upd.data.merchantId) || p.data.merchantId || ''));
  }
  const finalTaskMids = new Set();
  for (const t of tasks) {
    const upd = taskUpdates.get(t.id);
    finalTaskMids.add(String((upd && upd.data.merchantId) || t.data.merchantId || ''));
  }
  const blocked = [];
  for (const del of merchantDeletes) {
    if (finalProductMids.has(del.id) || finalTaskMids.has(del.id)) blocked.push(del.id);
  }
  if (blocked.length) {
    console.error(`[ABORT] refused to delete merchant docs still referenced: ${blocked.join(', ')}`);
    process.exit(1);
  }

  /* ── Assertions on expected outcome ── */
  const EXPECTED = { 'KJ-6VHCEF': 448, 'KJ-UVMKKM': 303, 'KJ-QZADGM': 126, 'KJ-P9VVNX': 130, 'KJ-A4SAM5': 73, 'KJ-J77X6G': 69, 'KJ-WWYTQF': 66, 'KJ-RQQHPU': 30 };
  const finalCounts = new Map();
  for (const p of products) {
    if (productDeletes.find((d) => d.id === p.id)) continue;
    const upd = productUpdates.get(p.id);
    const mid = String((upd && upd.data.merchantId) || p.data.merchantId || '');
    finalCounts.set(mid, (finalCounts.get(mid) || 0) + 1);
  }
  const assertFailures = [];
  for (const [id, want] of Object.entries(EXPECTED)) {
    const got = finalCounts.get(id) || 0;
    if (got !== want) assertFailures.push(`${id}: expected ${want}, got ${got}`);
  }
  console.log('[plan] final product counts:', JSON.stringify(Object.fromEntries(Object.entries(EXPECTED).map(([id]) => [id, finalCounts.get(id) || 0]))));

  const summary = {
    productUpdates: productUpdates.size + keptImageMerge.size,
    productDeletes: productDeletes.length,
    taskUpdates: taskUpdates.size,
    merchantUpdates: merchantUpdates.length,
    merchantCreates: merchantCreates.length,
    merchantDeletes: merchantDeletes.length,
    retiredIds: retiredIds.size
  };

  if (assertFailures.length && !skipAssert) {
    console.error('[ABORT] expected-count assertions failed:');
    assertFailures.forEach((f) => console.error('   ' + f));
    console.error('   (set UNIFY_SKIP_ASSERT=1 to override)');
    process.exit(2);
  }

  /* ── Backup affected docs before any write ── */
  const backup = {
    generatedAt: new Date().toISOString(),
    projectId,
    productUpdates: [...productUpdates.values()].map((u) => ({ id: u.ref.id, before: products.find((p) => p.id === u.ref.id).data })),
    productDeletes: productDeletes.map((d) => ({ id: d.id, doc: products.find((p) => p.id === d.id).data })),
    taskUpdates: [...taskUpdates.values()].map((u) => ({ id: u.ref.id, before: tasks.find((t) => t.id === u.ref.id).data })),
    merchantUpdates: merchantUpdates.map((u) => ({ id: u.ref.id, before: merchants.find((m) => m.id === u.ref.id).data })),
    merchantCreates: merchantCreates.map((c) => ({ id: c.ref.id })),
    merchantDeletes: merchantDeletes.map((d) => ({ id: d.id, doc: merchants.find((m) => m.id === d.id).data })),
    summary
  };
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
  console.log(`[backup] wrote ${BACKUP_PATH}`);

  /* ── Execute (batched) ── */
  let ops = 0;
  let batch = db.batch();
  const flush = async () => { if (ops === 0) return; if (dryRun) { console.log(`[dry-run] would commit ${ops} op(s)`); } else { await batch.commit(); } batch = db.batch(); ops = 0; };
  const queue = (fn) => { fn(batch); ops += 1; };

  const allProductWrites = new Map();
  for (const [id, u] of productUpdates) allProductWrites.set(id, u);
  for (const [id, u] of keptImageMerge) {
    const prior = allProductWrites.get(id);
    allProductWrites.set(id, { ref: u.ref, data: Object.assign({}, prior ? prior.data : {}, u.patch) });
  }
  for (const u of allProductWrites.values()) { queue((b) => b.set(u.ref, u.data, { merge: true })); if (ops >= 400) await flush(); }
  for (const d of productDeletes) { queue((b) => b.delete(d.ref)); if (ops >= 400) await flush(); }
  for (const u of taskUpdates.values()) { queue((b) => b.set(u.ref, u.data, { merge: true })); if (ops >= 400) await flush(); }
  for (const u of merchantUpdates) { queue((b) => b.set(u.ref, u.data, { merge: true })); if (ops >= 400) await flush(); }
  for (const c of merchantCreates) { queue((b) => b.set(c.ref, c.data, { merge: true })); if (ops >= 400) await flush(); }
  for (const d of merchantDeletes) { queue((b) => b.delete(d.ref)); if (ops >= 400) await flush(); }
  await flush();

  console.log('Unification summary:', JSON.stringify({
    dryRun,
    productUpdates: allProductWrites.size,
    productDeletes: productDeletes.length,
    taskUpdates: taskUpdates.size,
    merchantUpdates: merchantUpdates.length,
    merchantCreates: merchantCreates.length,
    merchantDeletes: merchantDeletes.length,
    untouchedProducts: untouched,
    assertions: assertFailures.length ? 'FAILED' : 'ok'
  }, null, 2));
  process.exit(0);
};

/* Build a merge patch carrying only the image fields the kept row is missing,
   so deleting the redundant duplicate can never lose an image URL. */
function imagePatchFor(kept, dup) {
  const out = {};
  for (const f of IMG_ARRAY_FIELDS) {
    const merged = unionArrays(kept[f], dup[f]);
    if (merged.length !== (Array.isArray(kept[f]) ? kept[f].length : 0)) out[f] = merged;
  }
  for (const f of IMG_SCALAR_FIELDS) if (isEmptyField(kept[f]) && !isEmptyField(dup[f])) out[f] = dup[f];
  if (Array.isArray(dup.variations)) {
    const kv = Array.isArray(kept.variations) ? JSON.parse(JSON.stringify(kept.variations)) : [];
    let touched = false;
    dup.variations.forEach((dv, i) => {
      if (!dv) return;
      const match = kv.find((k) => k && k.name && dv.name && k.name === dv.name) || kv[i];
      if (match && isEmptyField(match.image_url) && !isEmptyField(dv.image_url)) { match.image_url = dv.image_url; touched = true; }
    });
    if (touched) out.variations = kv;
  }
  return Object.keys(out).length ? out : null;
}

main().catch((err) => { console.error('Unification failed:', err); process.exit(1); });
