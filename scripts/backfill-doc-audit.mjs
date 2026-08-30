#!/usr/bin/env node
/* Kanjo Ops — Backfill `documents` audit map keyed by exact merchantId.
   The admin "تدقيق ملفات التجار" widget resolves each merchant's id from the
   finalized task's `merchantId` field. Several merchants had documents tracked
   only under legacy merchant records whose id differs from the task id, so the
   banner persisted. This script writes the per-docType breakdown (commercial /
   tax / menu) directly to `merchants/{merchantId}` using the exact task
   merchantId, creating the authoritative merchant record when it is missing
   (carrying over the task's name and Drive folder binding). Idempotent.

   Uses the app's public web API key (as the client does) with a temporary
   anonymous Firebase user to authenticate the Firestore REST writes.

   Usage:
     node scripts/backfill-doc-audit.mjs                  # real run
     SYNC_DRY_RUN=1 node scripts/backfill-doc-audit.mjs   # dry run (no writes)
*/

const PROJECT_ID = 'kanjo-desouk';
const API_KEY = 'AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const dryRun = process.env.SYNC_DRY_RUN === '1';

/* Exact merchantId targets -> uploaded document counts. The merchantIds are the
   ones stamped on the finalized tasks (what the audit widget resolves). */
const TARGETS = [
  { merchantId: 'KJ-3KDATB', name: '212 Perfume', docs: { tax: 1 } },
  { merchantId: 'KJ-DQVQW4', name: 'شابلن', docs: { menu: 4 } },
  { merchantId: 'KJ-DMBTFA', name: 'عروس الشام', docs: { commercial: 1 } },
  { merchantId: 'KJ-STPD5Y', name: 'قراقيش', docs: { tax: 2 } },
  { merchantId: 'KJ-F2T6UJ', name: 'كشري باب الحارة', docs: { menu: 1 } },
  { merchantId: 'KJ-37CKK7', name: 'كلاسيك - Classic', docs: { menu: 1 } },
  { merchantId: 'KJ-M4MWRC', name: 'لذيذ', docs: { menu: 3 } },
  { merchantId: 'KJ-4AYT64', name: 'هالك', docs: { menu: 2, tax: 2 } },
  { merchantId: 'KJ-MKZJ4W', name: 'Apple بلبل', docs: { tax: 1 } },
  { merchantId: 'KJ-X5K94U', name: 'Mr Molten', docs: { tax: 3 } },
  { merchantId: 'KJ-4HBH97', name: 'SOO', docs: { tax: 1 } },
  { merchantId: 'KJ-VUAGJV', name: 'XO Cosmetics', docs: { tax: 2 } }
];

const getBaseName = (name) => {
  if (!name) return '';
  let clean = name;
  while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
    clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
  }
  return clean.trim();
};

const nowIso = () => new Date().toISOString();

const toMapValue = (obj) => ({
  mapValue: {
    fields: Object.entries(obj).reduce((acc, [k, v]) => {
      if (v === true) acc[k] = { booleanValue: true };
      else if (Number.isInteger(v)) acc[k] = { integerValue: String(v) };
      else if (Array.isArray(v)) acc[k] = { arrayValue: { values: v.map((x) => ({ stringValue: String(x) })) } };
      else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) acc[k] = { timestampValue: v };
      else if (v && typeof v === 'object') acc[k] = toMapValue(v);
      else acc[k] = { stringValue: String(v) };
      return acc;
    }, {})
  }
});

const buildDocumentsFields = (existingDocuments, targetDocs, refDate) => {
  const merged = {};
  if (existingDocuments && existingDocuments.mapValue && existingDocuments.mapValue.fields) {
    Object.entries(existingDocuments.mapValue.fields).forEach(([k, v]) => {
      if (!v || !v.mapValue || !v.mapValue.fields) return;
      const pf = v.mapValue.fields;
      merged[k] = {
        uploaded: true,
        count: Number(pf.count && pf.count.integerValue) || 0,
        names: (pf.names && pf.names.arrayValue && pf.names.arrayValue.values || []).map((x) => (x && x.stringValue) || ''),
        lastUploadAt: (pf.lastUploadAt && pf.lastUploadAt.timestampValue) || refDate,
        lastUploadedBy: (pf.lastUploadedBy && pf.lastUploadedBy.stringValue) || ''
      };
    });
  }
  Object.entries(targetDocs).forEach(([docType, count]) => {
    merged[docType] = {
      uploaded: true,
      count,
      names: [],
      lastUploadAt: refDate,
      lastUploadedBy: 'backfill (legacy doc audit)'
    };
  });
  return merged;
};

let idToken = '';
let tokenExpiry = 0;

const getToken = async () => {
  if (idToken && Date.now() < tokenExpiry) return idToken;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!res.ok) throw new Error(`Anonymous auth failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  idToken = data.idToken;
  tokenExpiry = Date.now() + ((Number(data.expiresIn) || 3600) - 60) * 1000;
  return idToken;
};

const fetchWithAuth = async (url, options = {}) => {
  const token = await getToken();
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  return res;
};

const getMerchant = async (merchantId) => {
  const res = await fetchWithAuth(`${BASE}/merchants/${merchantId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET merchants/${merchantId} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).fields || {};
};

/* Pull the first task carrying this merchantId (used when creating a missing
   authoritative record) to carry over name + Drive folder binding. */
const getTaskForMerchant = async (merchantId) => {
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'tasks' }],
      where: { fieldFilter: { field: { fieldPath: 'merchantId' }, op: 'EQUAL', value: { stringValue: merchantId } } },
      limit: 1
    }
  };
  const res = await fetchWithAuth(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  if (!res.ok) throw new Error(`Query tasks for ${merchantId} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const doc = (data || []).find((r) => r.document);
  if (!doc) return null;
  const f = (doc.document.fields || {});
  return {
    name: (f.name && f.name.stringValue) || '',
    driveFolderId: (f.driveFolderId && f.driveFolderId.stringValue) || '',
    driveFolderLink: (f.driveFolderLink && f.driveFolderLink.stringValue) || '',
    docsUpdatedAt: (f.docsUpdatedAt && f.docsUpdatedAt.timestampValue) || '',
    docsUpdatedBy: (f.docsUpdatedBy && f.docsUpdatedBy.stringValue) || ''
  };
};

const updateDocumentsOnly = async (merchantId, documents) => {
  const url = `${BASE}/merchants/${merchantId}?updateMask.fieldPaths=documents`;
  const res = await fetchWithAuth(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { documents: toMapValue(documents) } })
  });
  if (!res.ok) throw new Error(`PATCH merchants/${merchantId} documents failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
};

const createMerchant = async (merchantId, name, task, documents) => {
  const now = nowIso();
  const refDate = (task && task.docsUpdatedAt) || now;
  const fields = {
    merchantId: { stringValue: merchantId },
    name: { stringValue: name || (task && task.name) || '' },
    createdAt: { timestampValue: now },
    docsUpdatedAt: { timestampValue: refDate },
    docsUpdatedBy: { stringValue: (task && task.docsUpdatedBy) || 'backfill (legacy doc audit)' },
    documents: toMapValue(documents)
  };
  if (task && task.driveFolderLink) fields.driveFolderLink = { stringValue: task.driveFolderLink };
  if (task && task.driveFolderId) fields.driveFolderId = { stringValue: task.driveFolderId };
  const res = await fetchWithAuth(`${BASE}/merchants/${merchantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`CREATE merchants/${merchantId} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
};

const main = async () => {
  console.log(`[doc-audit] ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN'} — project ${PROJECT_ID}`);

  const summary = { created: 0, updated: 0, unchanged: 0, failed: [] };

  for (const target of TARGETS) {
    const task = await getTaskForMerchant(target.merchantId);
    const existing = await getMerchant(target.merchantId);
    const refDate = (existing && existing.docsUpdatedAt && existing.docsUpdatedAt.timestampValue)
      || (task && task.docsUpdatedAt)
      || nowIso();
    const documents = buildDocumentsFields(existing ? existing.documents : null, target.docs, refDate);

    if (dryRun) {
      const verb = existing ? 'update' : 'create';
      console.log(`[doc-audit] [dry-run] ${verb} ${target.merchantId} "${target.name}" -> ${JSON.stringify(target.docs)}`);
      continue;
    }

    try {
      if (existing) {
        await updateDocumentsOnly(target.merchantId, documents);
        summary.updated += 1;
        console.log(`[doc-audit] ✓ updated ${target.merchantId} "${target.name}" -> ${JSON.stringify(target.docs)}`);
      } else {
        await createMerchant(target.merchantId, target.name, task, documents);
        summary.created += 1;
        console.log(`[doc-audit] ✓ created ${target.merchantId} "${target.name}" -> ${JSON.stringify(target.docs)}`);
      }
    } catch (err) {
      summary.failed.push({ merchantId: target.merchantId, name: target.name, error: String(err && err.message) });
      console.error(`[doc-audit] ✗ FAILED ${target.merchantId} "${target.name}": ${err && err.message}`);
    }
  }

  console.log('[doc-audit] summary:', JSON.stringify(summary, null, 2));
  process.exit(summary.failed.length > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error('[doc-audit] fatal:', err);
  process.exit(1);
});
