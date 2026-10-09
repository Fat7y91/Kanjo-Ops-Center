#!/usr/bin/env node
/* Kanjo Ops — one-time data patch for the "Unknown User" (غير معروف) ghost in
   the leaderboards.

   A single `merchant_products` row for "بلح شام سادة" under the Fox Team
   merchant "حلواني الصردي ( عبدالعظيم )" (KJ-SGHUQ4) was left with no author
   field at all. Both rep-name resolvers — kpi.js `kpiProductRepName` and
   catalog.js `catalogRepDisplayName` — fall back to "غير معروف" when every
   alias (added_by / addedBy / createdBy / created_by / repName) is absent, so
   this row showed up as an unowned ghost.

   Forensic trace (read-only, targeted `where` queries, 2026-10-09):
     - the surviving duplicate twin (4HDN22sx4NxTZ1gb65S7, kept by the founder
       de-dup) carries `createdBy: "سارة"`;
     - the ghost row (sJWx2I9qdFJpYFCx1Oc1) was only ever edited by سارة in the
       Black Box audit trail;
     - the merchant's task (ZzTLupTcZrll6VelvCME) is Fox Team, and سارة is a
       Fox Team rep.
   Therefore the ghost is attributed to سارة — matching its surviving twin.

   This patch writes ONLY `createdBy` on the affected row (updateMask keeps the
   footprint minimal), making it idempotent: rows that already carry any author
   field are skipped.

   Uses the app's public web API key (as the client does) with a temporary
   anonymous Firebase user to authenticate the Firestore REST write.

   Usage:
     node scripts/fix-ghost-attribution.mjs                  # real run
     SYNC_DRY_RUN=1 node scripts/fix-ghost-attribution.mjs   # dry run (no writes)
*/

const PROJECT_ID = 'kanjo-desouk';
const API_KEY = 'AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const dryRun = process.env.SYNC_DRY_RUN === '1';

/* The ghost row lives under this exact merchant; the surviving twin belongs to
   سارة (Fox Team), so that is the correct attribution. */
const TARGET = {
  collection: 'merchant_products',
  nameAr: 'بلح شام سادة',
  merchantId: 'KJ-SGHUQ4',
  rep: 'سارة'
};

/* Every alias consulted by kpi.js / catalog.js before falling back to
   "غير معروف". If any is present the row is already owned — skip it. */
const REP_NAME_FIELDS = ['added_by', 'addedBy', 'createdBy', 'created_by', 'repName'];

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
  return fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
};

const decodeValue = (v) => {
  if (!v) return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return parseFloat(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) { const o = {}; for (const [k, vv] of Object.entries(v.mapValue.fields || {})) o[k] = decodeValue(vv); return o; }
  return v;
};

/* Targeted single-field `where` query — never a collection scan. */
const runQuery = async (collectionId, fieldPath, value) => {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: value } } }
    }
  };
  const res = await fetchWithAuth(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`runQuery ${collectionId} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const rows = await res.json();
  return (rows || [])
    .filter((r) => r.document)
    .map((r) => {
      const fields = r.document.fields || {};
      const out = { id: r.document.name.split('/').pop() };
      for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
      return out;
    });
};

const patchCreatedBy = async (docId, rep) => {
  const url = `${BASE}/${TARGET.collection}/${docId}?updateMask.fieldPaths=createdBy`;
  const res = await fetchWithAuth(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { createdBy: { stringValue: rep } } })
  });
  if (!res.ok) throw new Error(`PATCH ${TARGET.collection}/${docId} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
};

const missingAttribution = (row) => REP_NAME_FIELDS.every((f) => !String(row[f] || '').trim());

const main = async () => {
  console.log(`[ghost-fix] ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN'} — project ${PROJECT_ID}`);

  const rows = await runQuery(TARGET.collection, 'name_ar', TARGET.nameAr);
  console.log(`[ghost-fix] "${TARGET.nameAr}" rows found: ${rows.length}`);

  const candidates = rows.filter((r) => r.merchantId === TARGET.merchantId);
  console.log(`[ghost-fix] under merchantId ${TARGET.merchantId}: ${candidates.length}`);

  const summary = { patched: 0, skipped: 0, failed: [] };

  for (const row of candidates) {
    if (!missingAttribution(row)) {
      summary.skipped += 1;
      console.log(`[ghost-fix] skip ${row.id} — already attributed`);
      continue;
    }
    if (dryRun) {
      console.log(`[ghost-fix] [dry-run] set createdBy="${TARGET.rep}" on ${row.id}`);
      continue;
    }
    try {
      await patchCreatedBy(row.id, TARGET.rep);
      summary.patched += 1;
      console.log(`[ghost-fix] \u2713 set createdBy="${TARGET.rep}" on ${row.id}`);
    } catch (err) {
      summary.failed.push({ id: row.id, error: String(err && err.message) });
      console.error(`[ghost-fix] \u2717 FAILED ${row.id}: ${err && err.message}`);
    }
  }

  console.log('[ghost-fix] summary:', JSON.stringify(summary, null, 2));
  process.exit(summary.failed.length > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error('[ghost-fix] fatal:', err);
  process.exit(1);
});
