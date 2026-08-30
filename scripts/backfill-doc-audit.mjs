#!/usr/bin/env node
/* Kanjo Ops — Backfill `documents` audit map on legacy merchant records.
   Populates the per-docType breakdown (commercial / tax / menu) that the
   admin "تدقيق ملفات التجار" widget reads, using counts provided by the
   admin team for merchants whose documents were uploaded before doc-level
   tracking existed. Idempotent: merge-safe with any existing documents map.

   Uses the app's public web API key (as the client does) with a temporary
   anonymous Firebase user to authenticate the Firestore REST writes. The
   anonymous user is scoped by the deployed security rules to merchant
   document-field updates only.

   Usage:
     node scripts/backfill-doc-audit.mjs            # real run
     SYNC_DRY_RUN=1 node scripts/backfill-doc-audit.mjs   # dry run (no writes)
*/

const PROJECT_ID = 'kanjo-desouk';
const API_KEY = 'AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const dryRun = process.env.SYNC_DRY_RUN === '1';

/* Target merchants -> uploaded document counts (from the admin team). */
const TARGETS = [
  { name: 'Cosmetics 212', docs: { tax: 2 } },
  { name: 'Perfume 212', docs: { tax: 1 } },
  { name: 'شابلن', docs: { menu: 4 } },
  { name: 'عروس الشام', docs: { commercial: 1 } },
  { name: 'قراقيش', docs: { tax: 2 } },
  { name: 'كشري باب الحارة', docs: { menu: 1 } },
  { name: 'كلاسيك - Classic', docs: { menu: 1 } },
  { name: 'لذيذ', docs: { menu: 3 } },
  { name: 'هالك', docs: { menu: 2, tax: 2 } },
  { name: 'Apple بلبل', docs: { tax: 1 } },
  { name: 'Mr Molten', docs: { tax: 3 } },
  { name: 'SOO', docs: { tax: 1 } },
  { name: 'XO Cosmetics', docs: { tax: 2 } }
];

const getBaseName = (name) => {
  if (!name) return '';
  let clean = name;
  while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
    clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
  }
  return clean.trim();
};

/* Strip Unicode directional marks (RLM/LRM/etc.) that sometimes wrap stored
   Arabic names, then normalize whitespace/case. */
const normalize = (name) =>
  String(name || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const docIdFromName = (name) => String(name || '').split('/').pop();

const asTimestamp = (iso) => ({ timestampValue: iso });

const buildDocumentsFields = (existingDocuments, targetDocs, refDate) => {
  const merged = {};
  if (existingDocuments && existingDocuments.mapValue && existingDocuments.mapValue.fields) {
    const prev = existingDocuments.mapValue.fields;
    Object.entries(prev).forEach(([k, v]) => {
      if (v && v.mapValue && v.mapValue.fields) {
        const pf = v.mapValue.fields;
        merged[k] = {
          uploaded: true,
          count: Number(pf.count && pf.count.integerValue) || 0,
          names: (pf.names && pf.names.arrayValue && pf.names.arrayValue.values || []).map((x) => (x && x.stringValue) || ''),
          lastUploadAt: (pf.lastUploadAt && pf.lastUploadAt.timestampValue) || refDate,
          lastUploadedBy: (pf.lastUploadedBy && pf.lastUploadedBy.stringValue) || ''
        };
      }
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

let idToken = '';
let tokenExpiry = 0;

const getToken = async () => {
  if (idToken && Date.now() < tokenExpiry) return idToken;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anonymous auth failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  idToken = data.idToken;
  tokenExpiry = Date.now() + ((Number(data.expiresIn) || 3600) - 60) * 1000;
  return idToken;
};

const fetchAllMerchants = async () => {
  const token = await getToken();
  const merchants = [];
  let pageToken = '';
  do {
    const url = `${BASE}/merchants?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`List merchants failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    (data.documents || []).forEach((doc) => {
      const fields = doc.fields || {};
      merchants.push({
        id: docIdFromName(doc.name),
        name: (fields.name && fields.name.stringValue) || '',
        fields
      });
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return merchants;
};

const updateMerchantDocuments = async (docId, documents) => {
  const token = await getToken();
  const url = `${BASE}/merchants/${docId}?updateMask.fieldPaths=documents`;
  const body = { fields: { documents: toMapValue(documents) } };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Update merchants/${docId} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

const main = async () => {
  console.log(`[doc-audit] ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN'} — project ${PROJECT_ID}`);

  const merchants = await fetchAllMerchants();
  console.log(`[doc-audit] fetched ${merchants.length} merchant records`);

  /* Index by normalized base name. Same-name records are backfill artifacts of
     one merchant entity, so keep every matching record (the widget may resolve
     any of them as the authoritative merchantId). */
  const byNorm = new Map();
  merchants.forEach((m) => {
    const key = normalize(getBaseName(m.name));
    if (!key) return;
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(m);
  });

  const tokenKey = (name) => normalize(getBaseName(name)).split(/\s+/).filter(Boolean).sort().join(' ');

  const summary = { matched: 0, unmatched: [], recordsUpdated: 0, failed: [] };

  for (const target of TARGETS) {
    const key = normalize(getBaseName(target.name));
    let records = byNorm.get(key) || [];

    /* Word-order fallback: e.g. stored "212 Cosmetics" vs target "Cosmetics 212". */
    if (records.length === 0) {
      const tk = tokenKey(target.name);
      records = merchants.filter((m) => m.name && tokenKey(m.name) === tk);
    }

    if (records.length === 0) {
      summary.unmatched.push(target.name);
      console.log(`[doc-audit] ✗ UNMATCHED: "${target.name}" (normalized "${key}")`);
      continue;
    }

    summary.matched += 1;

    for (const rec of records) {
      const existingDocuments = rec.fields.documents || null;
      const refDate = (rec.fields.docsUpdatedAt && rec.fields.docsUpdatedAt.timestampValue) || new Date().toISOString();
      const documents = buildDocumentsFields(existingDocuments, target.docs, refDate);

      if (dryRun) {
        console.log(`[doc-audit] [dry-run] ${rec.id} "${rec.name}" -> ${JSON.stringify(target.docs)}`);
        continue;
      }

      try {
        await updateMerchantDocuments(rec.id, documents);
        summary.recordsUpdated += 1;
        console.log(`[doc-audit] ✓ updated ${rec.id} "${rec.name}" -> ${JSON.stringify(target.docs)}`);
      } catch (err) {
        summary.failed.push({ id: rec.id, name: rec.name, error: String(err && err.message) });
        console.error(`[doc-audit] ✗ FAILED ${rec.id} "${rec.name}": ${err && err.message}`);
      }
    }
  }

  console.log('[doc-audit] summary:', JSON.stringify(summary, null, 2));
  process.exit(summary.unmatched.length > 0 || summary.failed.length > 0 ? 1 : 0);};

main().catch((err) => {
  console.error('[doc-audit] fatal:', err);
  process.exit(1);
});
