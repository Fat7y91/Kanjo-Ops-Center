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
     primaryCategory: the vendor's business category (from tasks.cat), e.g.
                      "🍔 مطاعم وكافيهات"; the portal only strips the emoji for
                      display. Empty when the source task carries none.
     logoUrl        : a SHORT public Cloud Storage URL for the vendor logo
                      (tasks.merchantLogo). The source is a Base64 data URI,
                      which is opaque to the agency role and made every
                      `merchants` read ~10 MB, so it is uploaded to Storage once
                      (content-addressed + immutable cache) and only the short
                      URL is stored. A raw Base64 blob is NEVER written back to
                      Firestore. Empty when the source task carries none.
     contractStatusSyncedAt : server write time

   Contracted merchants that have no merchant document yet (e.g. fresh VIP
   pre-agreements, which never went through a document upload) are created so
   the portal can list them. Every other merchant is cleared back to ''.

   Credentials:
     FIREBASE_SERVICE_ACCOUNT       : full service-account JSON (CI secret)
     GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
   Environment overrides:
     FIREBASE_PROJECT_ID            (default: kanjo-desouk)
     FIREBASE_STORAGE_BUCKET        (default: <projectId>.firebasestorage.app)
   Dry run (no writes):
     SYNC_DRY_RUN=1 node scripts/sync-merchant-status.mjs
*/

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';

const projectId = String(process.env.FIREBASE_PROJECT_ID || 'kanjo-desouk').trim();
const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`).trim();

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

/* Pathological-input safety valve only. Logos are now stored in Cloud Storage,
   not on the Firestore document, so normal sizes (largest observed ~0.9 MB) are
   always kept. This cap merely stops a corrupt multi-megabyte blob from
   exhausting memory during decode; it is not a size limit for real logos. */
const MAX_LOGO_DECODE_CHARS = 6000000;
const pickLogoSource = (value) => {
  const logo = value ? String(value) : '';
  if (!logo) return '';
  if (!/^data:/i.test(logo)) return logo; // already a URL — keep it
  if (logo.length > MAX_LOGO_DECODE_CHARS) {
    console.warn(`[skip] merchantLogo too large to decode (${logo.length} chars > ${MAX_LOGO_DECODE_CHARS})`);
    return '';
  }
  return logo;
};

let adminApp;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  adminApp = initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    projectId,
    storageBucket: bucketName
  }, 'sync-merchant-status');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminApp = initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: bucketName
  }, 'sync-merchant-status');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

const db = getFirestore(adminApp);
const bucket = getStorage(adminApp).bucket(bucketName);

/* ── Logo → Cloud Storage ──────────────────────────────────────────────────
   Content-addressed and immutable: the object path and its download token are
   both derived from the source bytes, so re-running is a no-op (no churn, no
   duplicate URLs) and the browser can cache the image for a year. If anything
   fails the merchant simply keeps an empty URL (the portal shows its monogram
   fallback) — we never fall back to storing the raw Base64 blob. */
const LOGO_PATH_PREFIX = 'merchant-logos';
const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const parseDataUri = (uri) => {
  const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/is.exec(uri);
  if (!m) return null;
  return { contentType: (m[1] || 'image/jpeg').trim(), base64: m[2] || '' };
};
const logoUrlFor = (objectPath, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

const uploadLogo = async (raw) => {
  try {
    const parsed = parseDataUri(raw);
    if (!parsed) {
      console.warn('[logo] unrecognized logo format; leaving URL empty (no raw blob stored)');
      return '';
    }
    let buffer = Buffer.from(parsed.base64, 'base64');
    let contentType = parsed.contentType || 'image/jpeg';
    let ext = /png/i.test(contentType) ? 'png' : (/webp/i.test(contentType) ? 'webp' : 'jpg');
    if (!buffer.length) return '';
    /* Shrink to a card-friendly thumbnail when sharp is present; otherwise upload
       the original bytes untouched (still zero loss). */
    try {
      const sharpMod = (await import('sharp')).default;
      const resized = await sharpMod(buffer)
        .rotate()
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      if (resized && resized.length) {
        buffer = resized;
        contentType = 'image/jpeg';
        ext = 'jpg';
      }
    } catch (_) { /* sharp unavailable — keep original bytes */ }

    const hash = sha1(raw);
    const objectPath = `${LOGO_PATH_PREFIX}/${hash}.${ext}`;
    const token = sha1('kanjo-logo:' + hash).slice(0, 36);
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists && !dryRun) {
      await file.save(buffer, {
        resumable: false,
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: { firebaseStorageDownloadTokens: token }
        }
      });
      console.log(`[logo] uploaded ${objectPath} (${buffer.length} bytes)`);
    }
    return logoUrlFor(objectPath, token);
  } catch (err) {
    console.warn('[logo] upload failed; leaving URL empty instead of a raw blob:', err && err.message ? err.message : err);
    return '';
  }
};

/* Dedupe concurrent work on the same image (two merchants often share a logo). */
const LOGO_CACHE = new Map(); // raw source -> Promise<public url>
const resolveLogoUrl = (source) => {
  const raw = source ? String(source) : '';
  if (!raw) return Promise.resolve('');
  if (/^https?:\/\//i.test(raw)) return Promise.resolve(raw);
  if (!LOGO_CACHE.has(raw)) LOGO_CACHE.set(raw, uploadLogo(raw));
  return LOGO_CACHE.get(raw);
};

const main = async () => {
  const [tasksSnap, merchantsSnap, productsSnap] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('merchants').get(),
    db.collection('merchant_products').get()
  ]);

  /* ── 1) Contracted merchants, keyed by base-name. Final wins over VIP. ── */
  const contracted = new Map(); // base -> { merchantId, name, status, cat, logoSource }
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
      if (!existing.cat && t.cat) existing.cat = String(t.cat).trim();
      if (!existing.logoSource && t.merchantLogo) existing.logoSource = pickLogoSource(t.merchantLogo);
    } else {
      contracted.set(base, {
        merchantId: t.merchantId || '',
        name: base,
        status,
        cat: t.cat ? String(t.cat).trim() : '',
        logoSource: pickLogoSource(t.merchantLogo)
      });
    }
  });
  const contractedIds = new Set(
    [...contracted.values()].map((c) => c.merchantId).filter(Boolean)
  );

  /* ── 1b) Resolve every unique logo to a short Storage URL (uploads once). ── */
  await Promise.all([...contracted.values()].map(async (c) => {
    c.logoUrl = await resolveLogoUrl(c.logoSource);
  }));
  const withLogo = [...contracted.values()].filter((c) => c.logoUrl).length;
  console.log(`[logo] resolved ${withLogo}/${contracted.size} contracted logos to Storage URLs`);

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

  const summary = { contracted: contracted.size, final: 0, vip: 0, updated: 0, created: 0, cleared: 0, logos: withLogo };

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
    const logo = c.logoUrl || '';

    if (doc) {
      const m = doc.data() || {};
      const mid = String(m.merchantId || doc.id);
      const count = productCount.get(mid) || 0;
      const cat = c.cat || '';
      if (m.contractStatus !== c.status || Number(m.productCount || 0) !== count || String(m.primaryCategory || '') !== cat || String(m.logoUrl || '') !== logo) {
        write(doc.ref, { contractStatus: c.status, productCount: count, primaryCategory: cat, logoUrl: logo, contractStatusSyncedAt: new Date() });
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
        primaryCategory: c.cat || '',
        logoUrl: logo,
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
