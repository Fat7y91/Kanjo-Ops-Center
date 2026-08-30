#!/usr/bin/env node
/* Kanjo Ops — Fix corrupted merchant records (dedup migration).
   Retires the duplicate/wrong records for two merchants and forces the
   canonical records' documents to the exact expected state.

   شابلن (Chaplin):
     - archive duplicate KJ-DQVQW4 (points at the wrong folder)
     - archive duplicate KJ-J5R4DA (empty shell with docs, no folder)
     - canonical KJ-XVRT4Q documents = menu: 4 files, tax: 1 file
     - repoint all شابلن tasks to KJ-XVRT4Q (mirror its Drive folder)

   212 Cosmetics:
     - archive broken KJ-9Y7PN8 (points at a binned folder)
     - archive duplicate KJ-AT9WMB (extra folder for the same merchant)
     - canonical KJ-E8BMUJ documents = tax: 2 files
     - repoint all 212 Cosmetics tasks to KJ-E8BMUJ (mirror its Drive folder)

   Firestore rules: anonymous (signed-in) updates may ONLY touch
   name / driveFolderId / driveFolderLink / docsUpdatedAt / docsUpdatedBy /
   documents, and delete is admin-only. "Archive" is therefore implemented as
   a rename to an "أرشيف - " prefix (breaks base-name grouping) — the record
   data is preserved, never deleted, and it is skipped by all resolvers.

   Usage:
     DRY_RUN=1 node scripts/fix-corrupted-merchants.mjs   # plan only
     node scripts/fix-corrupted-merchants.mjs             # execute
*/

const API_KEY = 'AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0';
const PROJECT_ID = 'kanjo-desouk';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY;

const dryRun = process.env.DRY_RUN === '1';

let idToken = '';
const getToken = async () => {
  const res = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!res.ok) throw new Error(`Anonymous auth failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  idToken = (await res.json()).idToken;
  return idToken;
};

const fetchJson = async (url, opts = {}) => {
  const headers = { 'Authorization': 'Bearer ' + (await getToken()), ...(opts.headers || {}) };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

const listDocs = async (path) => {
  const out = [];
  let page = BASE + '/' + path + '?pageSize=1000';
  while (page) {
    const j = await fetchJson(page);
    (j.documents || []).forEach((d) => out.push(d));
    page = j.nextPageToken ? BASE + '/' + path + '?pageSize=1000&pageToken=' + j.nextPageToken : null;
  }
  return out;
};

const decode = (v) => {
  if (!v) return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return parseFloat(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) o[k] = decode(vv);
    return o;
  }
  if ('nullValue' in v) return null;
  return v;
};

const encode = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, vv] of Object.entries(v)) fields[k] = encode(vv);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
};

const field = (d, name) => decode(d.fields && d.fields[name]);

const baseOf = (n) => {
  if (!n) return '';
  let clean = String(n).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g, '');
  while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
    clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
  }
  return clean.trim();
};

const now = new Date();
const BY = 'system fix (dedup migration)';

const docTypeEntry = (count) => ({
  uploaded: true,
  count,
  names: [],
  lastUploadAt: now,
  lastUploadedBy: BY
});

const main = async () => {
  const [merchants, tasks] = await Promise.all([listDocs('merchants'), listDocs('tasks')]);

  const merchantById = new Map();
  merchants.forEach((m) => {
    const id = m.name.split('/').pop();
    merchantById.set(id, {
      mid: id,
      name: field(m, 'name') || '',
      base: baseOf(field(m, 'name') || ''),
      driveFolderLink: field(m, 'driveFolderLink') || '',
      driveFolderId: field(m, 'driveFolderId') || ''
    });
  });

  const getBase = (n) => baseOf(n).toLowerCase();

  /* ── Targets ─────────────────────────────────────────────── */
  const CHAPLIN_CANON = 'KJ-XVRT4Q';
  const CHAPLIN_ARCHIVE = ['KJ-DQVQW4', 'KJ-J5R4DA'];
  const COSMETICS_CANON = 'KJ-E8BMUJ';
  const COSMETICS_ARCHIVE = ['KJ-9Y7PN8', 'KJ-AT9WMB'];

  const checks = [];
  for (const mid of [CHAPLIN_CANON, ...CHAPLIN_ARCHIVE, COSMETICS_CANON, ...COSMETICS_ARCHIVE]) {
    const rec = merchantById.get(mid);
    if (!rec) throw new Error(`Target record ${mid} does not exist in merchants`);
    checks.push(`${mid} "${rec.name}"`);
  }
  console.log('Target records found:', checks.join(', '));

  const patchDoc = async (path, fields, fieldPaths) => {
    const url = `${BASE}/${path}?updateMask.fieldPaths=` + fieldPaths.map(encodeURIComponent).join('&updateMask.fieldPaths=');
    const body = { fields: {} };
    for (const [k, v] of Object.entries(fields)) body.fields[k] = encode(v);
    if (dryRun) {
      console.log(`  [dry-run] PATCH ${path} {${fieldPaths.join(', ')}}`);
      return;
    }
    await fetchJson(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  const plan = [];
  const writes = [];

  /* ── شابلن ────────────────────────────────────────────────── */
  plan.push('شابلن: archive duplicates ' + CHAPLIN_ARCHIVE.join(', ') + ', canonical ' + CHAPLIN_CANON + ' documents=menu:4,tax:1');
  const chaplinCanonRec = merchantById.get(CHAPLIN_CANON);
  for (const mid of CHAPLIN_ARCHIVE) {
    const rec = merchantById.get(mid);
    writes.push({ type: 'merchant-archive', path: `merchants/${mid}`, fields: { name: `أرشيف - ${rec.name} (${mid})` }, fieldPaths: ['name'] });
  }
  writes.push({
    type: 'merchant-docs',
    path: `merchants/${CHAPLIN_CANON}`,
    fields: { documents: { menu: docTypeEntry(4), tax: docTypeEntry(1) } },
    fieldPaths: ['documents']
  });

  /* Repoint شابلن tasks to the canonical id + mirror its folder. */
  tasks.forEach((t) => {
    const id = t.name.split('/').pop();
    const name = field(t, 'name') || '';
    if (getBase(name) !== getBase('شابلن')) return;
    const cur = field(t, 'merchantId');
    if (cur !== CHAPLIN_CANON) {
      writes.push({
        type: 'task-repoint',
        path: `tasks/${id}`,
        fields: {
          merchantId: CHAPLIN_CANON,
          driveFolderLink: chaplinCanonRec.driveFolderLink,
          driveFolderId: chaplinCanonRec.driveFolderId,
          docsUpdatedAt: now,
          docsUpdatedBy: BY
        },
        fieldPaths: ['merchantId', 'driveFolderLink', 'driveFolderId', 'docsUpdatedAt', 'docsUpdatedBy']
      });
    }
  });

  /* ── 212 Cosmetics ────────────────────────────────────────── */
  plan.push('212 Cosmetics: archive duplicates ' + COSMETICS_ARCHIVE.join(', ') + ', canonical ' + COSMETICS_CANON + ' documents=tax:2');
  const cosmeticsCanonRec = merchantById.get(COSMETICS_CANON);
  for (const mid of COSMETICS_ARCHIVE) {
    const rec = merchantById.get(mid);
    writes.push({ type: 'merchant-archive', path: `merchants/${mid}`, fields: { name: `أرشيف - ${rec.name} (${mid})` }, fieldPaths: ['name'] });
  }
  writes.push({
    type: 'merchant-docs',
    path: `merchants/${COSMETICS_CANON}`,
    fields: { documents: { tax: docTypeEntry(2) } },
    fieldPaths: ['documents']
  });

  tasks.forEach((t) => {
    const id = t.name.split('/').pop();
    const name = field(t, 'name') || '';
    if (getBase(name) !== getBase('212 Cosmetics')) return;
    const cur = field(t, 'merchantId');
    if (cur !== COSMETICS_CANON) {
      writes.push({
        type: 'task-repoint',
        path: `tasks/${id}`,
        fields: {
          merchantId: COSMETICS_CANON,
          driveFolderLink: cosmeticsCanonRec.driveFolderLink,
          driveFolderId: cosmeticsCanonRec.driveFolderId,
          docsUpdatedAt: now,
          docsUpdatedBy: BY
        },
        fieldPaths: ['merchantId', 'driveFolderLink', 'driveFolderId', 'docsUpdatedAt', 'docsUpdatedBy']
      });
    }
  });

  console.log('\nPLAN:');
  plan.forEach((p) => console.log('  -', p));
  console.log(`\n${writes.length} write(s):`);
  writes.forEach((w) => console.log(`  ${w.type} ${w.path}`));

  if (dryRun) {
    console.log('\n[dry-run] no writes performed');
    process.exit(0);
  }

  console.log('\nExecuting writes...');
  let done = 0;
  const errors = [];
  const BATCH = 10;
  for (let i = 0; i < writes.length; i += BATCH) {
    const chunk = writes.slice(i, i + BATCH);
    await Promise.all(chunk.map(async (w) => {
      try {
        await patchDoc(w.path, w.fields, w.fieldPaths);
        done++;
      } catch (e) {
        errors.push(`${w.path}: ${e.message}`);
      }
    }));
    console.log(`  ${done}/${writes.length}`);
  }

  console.log('\nMigration complete.');
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    errors.forEach((e) => console.log('  ', e));
    process.exit(1);
  }
  process.exit(0);
};

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
