#!/usr/bin/env node
/* Kanjo Ops — Provision Firebase Auth custom claims for enterprise RBAC.
 *
 * The dashboard keeps its anonymous sign-in + client PIN UX. This script is
 * the trusted half: it binds each device's ANONYMOUS auth UID to the matching
 * PIN identity by writing custom claims that firestore.rules can enforce.
 *
 * Claims written:
 *   kanjoRole    admin | founder | accounting | rep | data_entry
 *   kanjoTeam    'Fox Team' | 'Power Team' | ''
 *   kanjoName    the Arabic display name (must match the PIN identity)
 *   kanjoRepId   kpiRepId(kanjoName) — mirrors public/js/services/kpi.js
 *   kanjoOps     true for the Operations Manager (name contains محمود)
 *   kanjoContent true for the content/image editor (name contains يوسف/yousef)
 *
 * Credentials (same convention as the other scripts):
 *   FIREBASE_SERVICE_ACCOUNT       : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS : path to a service-account JSON file
 *
 * Usage:
 *   node scripts/set-auth-claims.mjs --list
 *       List auth users with current claims + any enrollment hint.
 *
 *   node scripts/set-auth-claims.mjs --auto
 *       Apply claims for every uid that registered an enrollment hint through
 *       the dashboard (collection `enrollment_requests`, docId == uid).
 *
 *   node scripts/set-auth-claims.mjs --apply roles.json
 *       Apply an explicit map: { "<uid>": { "role": "...", "team": "...",
 *       "name": "..." }, ... }.
 *
 *   node scripts/set-auth-claims.mjs --enforce
 *   node scripts/set-auth-claims.mjs --unenforce
 *       Flip the migration switch app_security/config.enforceRbac.
 *
 *   node scripts/set-auth-claims.mjs --verify
 *       Print how many UIDs carry kanjoRole claims. Exits non-zero (refusing)
 *       when zero are provisioned, to make accidental mass-lockout impossible.
 *
 *   SYNC_DRY_RUN=1 node scripts/set-auth-claims.mjs --auto
 *       Show what would change without writing.
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const VALID_ROLES = ['admin', 'founder', 'accounting', 'rep', 'data_entry'];

const dryRun = process.env.SYNC_DRY_RUN === '1';
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : '';
};

let adminApp;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  adminApp = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'set-auth-claims');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminApp = initializeApp({ credential: applicationDefault() }, 'set-auth-claims');
} else {
  console.error('No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

const auth = getAuth(adminApp);
const db = getFirestore(adminApp);

// Mirror of public/js/services/kpi.js kpiRepId().
const kpiRepId = (name) => {
  const clean = String(name || '').trim().replace(/[\/\s]+/g, '_').replace(/[^\u0600-\u06FFa-zA-Z0-9_.-]/g, '');
  return clean || 'unknown';
};

const isOpsName = (name) => String(name || '').includes('محمود');

const isContentName = (name) => {
  const raw = String(name || '');
  const lower = raw.toLowerCase();
  return raw.includes('يوسف') || lower.includes('youssef') || lower.includes('yousef');
};

const buildClaims = (identity) => {
  const role = String(identity && identity.role || '').trim();
  const name = String(identity && identity.name || '').trim();
  const team = String(identity && identity.team || '').trim();
  if (!VALID_ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  if (!name) throw new Error('missing name');
  return {
    kanjoRole: role,
    kanjoTeam: team,
    kanjoName: name,
    kanjoRepId: kpiRepId(name),
    kanjoOps: isOpsName(name),
    kanjoContent: isContentName(name)
  };
};

const listUsers = async () => {
  const rows = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    res.users.forEach((u) => rows.push({
      uid: u.uid,
      provider: (u.providerData || []).map((p) => p.providerId).join(',') || 'anonymous',
      createdAt: u.metadata && u.metadata.creationTime,
      claims: u.customClaims || {}
    }));
    pageToken = res.pageToken;
  } while (pageToken);

  const hints = new Map();
  const hintSnap = await db.collection('enrollment_requests').get();
  hintSnap.forEach((d) => hints.set(d.id, d.data() || {}));

  console.log(`Auth users: ${rows.length}\n`);
  rows.forEach((r) => {
    const h = hints.get(r.uid);
    const hint = h ? ` | hint: ${h.name || '?'} / ${h.role || '?'} / ${h.team || ''}` : '';
    const claim = r.claims.kanjoRole ? ` | claims: ${r.claims.kanjoRole} / ${r.claims.kanjoName || ''}` : '';
    console.log(`${r.uid}  [${r.provider}]  ${r.createdAt || ''}${claim}${hint}`);
  });
};

/* Safety gate: refuse to enforce when nothing has been provisioned. Flipping
   enforceRbac with zero kanjoRole claims turns every signed-in session into an
   unclaimed legacy session, which the strict rules deny -> total lockout. */
/* Diagnostic: report the migration switch and provisioning coverage. */
const statusReport = async () => {
  const cfg = await db.collection('app_security').doc('config').get();
  const enforced = cfg.exists && cfg.data() && cfg.data().enforceRbac === true;
  const hintSnap = await db.collection('enrollment_requests').get();
  let claimed = 0;
  let total = 0;
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    total += res.users.length;
    res.users.forEach((u) => {
      if (u.customClaims && u.customClaims.kanjoRole) claimed += 1;
    });
    pageToken = res.pageToken;
  } while (pageToken);
  console.log(`app_security/config exists : ${cfg.exists}`);
  console.log(`enforceRbac                : ${enforced}`);
  console.log(`auth users                 : ${total}`);
  console.log(`users with kanjoRole claim : ${claimed}`);
  console.log(`enrollment hints           : ${hintSnap.size}`);
};

/* Read-only probe: run the exact production queries and surface any missing
   composite-index errors (Firestore returns the console create-index URL). */
const queryCheck = async () => {
  const probes = [
    { label: 'tasks orderBy(time desc) [manager]', run: () => db.collection('tasks').orderBy('time', 'desc').limit(1).get() }
  ];
  ['Fox Team', 'Power Team'].forEach((team) => {
    probes.push({
      label: `tasks where(team==${team}) orderBy(time desc) [rep]`,
      run: () => db.collection('tasks').where('team', '==', team).orderBy('time', 'desc').limit(1).get()
    });
  });
  ['added_by', 'createdBy'].forEach((field) => {
    probes.push({
      label: `merchant_products where(${field}==سارة)`,
      run: () => db.collection('merchant_products').where(field, '==', 'سارة').limit(1).get()
    });
  });
  for (const probe of probes) {
    try {
      await probe.run();
      console.log(`OK   ${probe.label}`);
    } catch (err) {
      console.log(`FAIL ${probe.label}`);
      console.log(`     ${err && err.message ? err.message : err}`);
    }
  }
};

/* Read-only probe of the KPI/time data: which rep_kpis docs exist, what
   historical time they carry, and how many daily_stats docs are under each.
   Confirms whether "0 time" is missing data or a read/binding problem. */
const kpiStatus = async () => {
  const parents = await db.collection('rep_kpis').get();
  console.log(`rep_kpis docs: ${parents.size}`);
  for (const doc of parents.docs) {
    const data = doc.data() || {};
    let days = 0;
    let activeSeconds = 0;
    let imageEditSeconds = 0;
    try {
      const stats = await db.collection('rep_kpis').doc(doc.id).collection('daily_stats').get();
      days = stats.size;
      stats.forEach((s) => {
        const d = s.data() || {};
        activeSeconds += Math.max(0, Number(d.activeSeconds) || 0);
        imageEditSeconds += Math.max(0, Number(d.imageEditSeconds) || 0);
      });
    } catch (err) {
      console.log(`  ${doc.id}: daily_stats read failed: ${err && err.message ? err.message : err}`);
    }
    const h = Math.round((Number(data.historicalSeconds) || 0) / 3600 * 10) / 10;
    const a = Math.round(activeSeconds / 3600 * 10) / 10;
    const e = Math.round(imageEditSeconds / 3600 * 10) / 10;
    console.log(`  ${doc.id} | team=${data.team || '(none)'} | name=${data.repName || '?'} | historical=${h}h | active=${a}h | imageEdit=${e}h | days=${days}`);
  }
};

const verifyClaims = async () => {
  let claimed = 0;
  let total = 0;
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    total += res.users.length;
    res.users.forEach((u) => {
      if (u.customClaims && u.customClaims.kanjoRole) claimed += 1;
    });
    pageToken = res.pageToken;
  } while (pageToken);
  console.log(`Users with kanjoRole claims: ${claimed}/${total}`);
  if (claimed === 0) {
    console.error('Refusing to enforce: no UIDs carry kanjoRole claims. Enforcing now would lock out every session.');
    process.exit(1);
  }
};

const applyIdentity = async (uid, identity) => {
  let claims;
  try {
    claims = buildClaims(identity);
  } catch (err) {
    console.warn(`skip ${uid}: ${err.message}`);
    return false;
  }
  if (dryRun) {
    console.log(`[dry-run] ${uid} <- ${JSON.stringify(claims)}`);
    return true;
  }
  await auth.setCustomUserClaims(uid, claims);
  console.log(`ok  ${uid} <- ${claims.kanjoRole} / ${claims.kanjoName}`);
  return true;
};

const applyAuto = async () => {
  const snap = await db.collection('enrollment_requests').get();
  if (snap.empty) {
    console.log('No enrollment hints found. Have each user log in once, or use --apply roles.json.');
    return;
  }
  let applied = 0;
  for (const d of snap.docs) {
    const hint = d.data() || {};
    if (await applyIdentity(d.id, hint)) applied += 1;
  }
  console.log(`\nDone. ${applied}/${snap.size} claim sets ${dryRun ? '(dry-run)' : 'written'}.`);
  console.log('Users must refresh/re-login so their ID token picks up the new claims.');
};

const applyFile = async (path) => {
  if (!path) {
    console.error('Usage: node scripts/set-auth-claims.mjs --apply roles.json');
    process.exit(1);
  }
  const map = JSON.parse(readFileSync(path, 'utf8'));
  let applied = 0;
  for (const [uid, identity] of Object.entries(map)) {
    if (await applyIdentity(uid, identity)) applied += 1;
  }
  console.log(`\nDone. ${applied}/${Object.keys(map).length} claim sets ${dryRun ? '(dry-run)' : 'written'}.`);
};

const setEnforce = async (enabled) => {
  if (dryRun) {
    console.log(`[dry-run] app_security/config.enforceRbac = ${enabled}`);
    return;
  }
  await db.collection('app_security').doc('config').set(
    { enforceRbac: enabled, updatedAt: new Date() },
    { merge: true }
  );
  console.log(`app_security/config.enforceRbac = ${enabled}`);
  if (enabled) {
    console.log('Strict RBAC is now live. Verify every role before logging out of the console session.');
  }
};

const main = async () => {
  if (flag('--list')) return listUsers();
  if (flag('--status')) return statusReport();
  if (flag('--querycheck')) return queryCheck();
  if (flag('--kpi-status')) return kpiStatus();
  if (flag('--verify')) return verifyClaims();
  if (flag('--enforce')) return setEnforce(true);
  if (flag('--unenforce')) return setEnforce(false);
  /* --auto is checked before --apply so `--auto --apply` (no file) means
     "write claims from the enrollment hints", not the file importer. */
  if (flag('--auto')) return applyAuto();
  if (flag('--apply')) return applyFile(valueOf('--apply'));
  console.log('Nothing to do. Use --list, --auto, --apply <file>, --enforce or --unenforce.');
};

main().catch((err) => {
  console.error('set-auth-claims failed:', err);
  process.exit(1);
});
