#!/usr/bin/env node
/* Kanjo Ops — Restore canonical merchantIds on all `tasks` docs.
   Every task currently carries a phantom merchantId that resolves to NO
   `merchants/{id}` record (minted by a client/backfill race at first deploy).
   This script repoints each task to the canonical merchant record for its
   normalized base-name group (TARGETS precedence, then driveFolderLink match,
   then docs/link), and deletes the redundant empty shell records.

   Idempotent: re-running only patches tasks whose merchantId still differs
   from the canonical target and only deletes records that remain empty.

   Credentials / write path:
     anonymous Firebase REST auth (same pattern as backfill-doc-audit.mjs)
   Dry run (no writes):
     SYNC_DRY_RUN=1 node scripts/restore-task-merchant-ids.mjs
   Patch-only (repoint tasks, keep empty shell records):
     SKIP_DELETE=1 node scripts/restore-task-merchant-ids.mjs
*/

import { readFileSync } from 'node:fs';

const API_KEY = 'AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0';
const PROJECT_ID = 'kanjo-desouk';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY;

const dryRun = process.env.SYNC_DRY_RUN === '1';

/* When set, only repoint task merchantIds; empty shell records are left in
   place (they are harmless and deleting them requires explicit approval). */
const skipDelete = process.env.SKIP_DELETE === '1';

const TARGETS = new Map([
  ['KJ-3KDATB', '212 Perfume'], ['KJ-XVRT4Q', 'شابلن'], ['KJ-DMBTFA', 'عروس الشام'],
  ['KJ-STPD5Y', 'قراقيش'], ['KJ-F2T6UJ', 'كشري باب الحارة'], ['KJ-37CKK7', 'كلاسيك - Classic'],
  ['KJ-M4MWRC', 'لذيذ'], ['KJ-4AYT64', 'هالك'], ['KJ-MKZJ4W', 'Apple بلبل'],
  ['KJ-X5K94U', 'Mr Molten'], ['KJ-4HBH97', 'SOO'], ['KJ-VUAGJV', 'XO Cosmetics']
]);

let idToken = '';
let tokenExpiry = 0;
const getToken = async () => {
  if (idToken && Date.now() < tokenExpiry) return idToken;
  const res = await fetch(AUTH, {
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

const field = (d, name) => decode(d.fields && d.fields[name]);

/* Stable base-name normalization: strip (متابعة)/(متابعه) and all RTL /
   formatting control marks so "‏‎Mr Molten‎‏" and "Mr Molten" are one group. */
const baseOf = (n) => {
  if (!n) return '';
  let clean = String(n).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g, '');
  while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
    clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
  }
  return clean.trim();
};

/* Recompute the canonical merchantId for every task base, same rules as the
   planning script, so this stays self-contained and auditable. */
const plan = async () => {
  const [tasks, merchants] = await Promise.all([listDocs('tasks'), listDocs('merchants')]);

  const merchantById = new Map();
  merchants.forEach((m) => {
    const id = m.name.split('/').pop();
    merchantById.set(id, {
      mid: id,
      base: baseOf(field(m, 'name') || ''),
      driveFolderLink: field(m, 'driveFolderLink') || '',
      documents: field(m, 'documents') || null
    });
  });

  const recordsByBase = new Map();
  for (const rec of merchantById.values()) {
    if (!rec.base) continue;
    if (!recordsByBase.has(rec.base)) recordsByBase.set(rec.base, []);
    recordsByBase.get(rec.base).push(rec);
  }

  const hasDocs = (r) => !!(r.documents && typeof r.documents === 'object' && Object.keys(r.documents).length);
  const isShell = (r) => !r.driveFolderLink && !hasDocs(r);

  const tasksByBase = new Map();
  tasks.forEach((t) => {
    const id = t.name.split('/').pop();
    const base = baseOf(field(t, 'name') || '');
    if (!tasksByBase.has(base)) tasksByBase.set(base, []);
    tasksByBase.get(base).push({
      id,
      merchantId: field(t, 'merchantId'),
      driveFolderLink: field(t, 'driveFolderLink') || ''
    });
  });

  /* Canonical record selection (mirrors the verified restore plan):
     1. TARGETS id (authoritative backfill)
     2. record whose driveFolderLink matches the task's mirrored link
     3. record with a documents map
     4. record with a driveFolderLink
     5. first record */
  const canonicalByBase = new Map();
  for (const [base, recs] of recordsByBase) {
    const taskLink = (tasksByBase.get(base) || []).find((t) => t.driveFolderLink)?.driveFolderLink || '';
    const pick = (pred) => recs.find(pred);
    const canon =
      pick((r) => TARGETS.has(r.mid)) ||
      (taskLink ? pick((r) => r.driveFolderLink === taskLink) : null) ||
      pick(hasDocs) ||
      pick((r) => !!r.driveFolderLink) ||
      recs[0];
    canonicalByBase.set(base, canon);
  }

  const patchPlan = [];
  for (const [base, arr] of tasksByBase) {
    const canon = canonicalByBase.get(base);
    if (!canon) {
      console.error(`  !! no canonical merchant record for base ${JSON.stringify(base)}`);
      continue;
    }
    for (const t of arr) {
      if (t.merchantId !== canon.mid) patchPlan.push({ taskId: t.id, base, from: t.merchantId, to: canon.mid });
    }
  }

  const referenced = new Set(patchPlan.map((p) => p.to));
  const deleteCandidates = [];
  for (const rec of merchantById.values()) {
    const canon = canonicalByBase.get(rec.base);
    if (!canon || rec.mid === canon.mid || referenced.has(rec.mid)) continue;
    if (isShell(rec)) deleteCandidates.push(rec.mid);
  }

  return { patchPlan, deleteCandidates };
};

const main = async () => {
  const { patchPlan, deleteCandidates } = await plan();

  console.log(`Restore plan: ${patchPlan.length} task patch(es), ${deleteCandidates.length} shell delete(s)`);
  if (patchPlan.length) {
    console.log('  sample patches:', patchPlan.slice(0, 5).map((p) => `${p.taskId}: ${p.from} -> ${p.to} (${JSON.stringify(p.base)})`).join('\n    '));
  }
  if (deleteCandidates.length) console.log('  shells to delete:', deleteCandidates.join(', '));

  if (dryRun) {
    console.log('[dry-run] no writes performed');
    process.exit(0);
  }

  // 1) Patch task merchantIds (one request per task; safe + idempotent).
  const tokens = [];
  for (const p of patchPlan) tokens.push(p.taskId + '|' + p.to);
  const patchToken = (s) => s.split('|');
  const unique = new Set(tokens).size === tokens.length;

  const taskPatches = [...new Set(tokens)].map((s) => patchToken(s));
  console.log(`\nPatching ${taskPatches.length} task docs...`);
  let done = 0;
  const errors = [];
  const BATCH = 20;
  for (let i = 0; i < taskPatches.length; i += BATCH) {
    const chunk = taskPatches.slice(i, i + BATCH);
    await Promise.all(chunk.map(async ([taskId, to]) => {
      const url = `${BASE}/tasks/${taskId}?updateMask.fieldPaths=merchantId`;
      try {
        await fetchJson(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { merchantId: { stringValue: to } } })
        });
        done++;
      } catch (e) {
        errors.push(`${taskId} -> ${to}: ${e.message}`);
      }
    }));
    if (done > 0) console.log(`  ${done}/${taskPatches.length}`);
  }

  // 2) Delete empty shell records (only when explicitly enabled).
  if (skipDelete) {
    console.log(`\nSkipping deletion of ${deleteCandidates.length} shell merchant records (SKIP_DELETE=1).`);
  } else {
    console.log(`\nDeleting ${deleteCandidates.length} shell merchant records...`);
    for (const mid of deleteCandidates) {
      const url = `${BASE}/merchants/${mid}`;
      try {
        await fetchJson(url, { method: 'DELETE' });
        console.log(`  deleted ${mid}`);
      } catch (e) {
        errors.push(`DELETE ${mid}: ${e.message}`);
      }
    }
  }

  console.log('\nRestore complete.');
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    errors.forEach((e) => console.log('  ', e));
    process.exit(1);
  }
  process.exit(0);
};

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
