#!/usr/bin/env node
/* Kanjo Ops — purge placeholder/test contract objects from Cloud Storage.
 * =====================================================================
 * Early integration testing left throw-away contracts in the bucket
 * (e.g. `contracts/smoke-test-contract/` and `contracts/x/`). This utility
 * deletes every object under the given prefixes so production starts clean.
 *
 * Usage:
 *   node scripts/cleanup-contract-placeholders.mjs
 *   node scripts/cleanup-contract-placeholders.mjs contracts/x/ contracts/foo/
 *
 * Credentials (same convention as the other scripts in this folder):
 *   FIREBASE_SERVICE_ACCOUNT        : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS  : path to a service-account JSON file
 *
 * Environment overrides:
 *   FIREBASE_PROJECT_ID     (default: kanjo-desouk)
 *   FIREBASE_STORAGE_BUCKET (default: <projectId>.firebasestorage.app)
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const DEFAULT_PREFIXES = ['contracts/smoke-test-contract/', 'contracts/x/'];

const projectId = String(process.env.FIREBASE_PROJECT_ID || 'kanjo-desouk').trim();
const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`).trim();

const cliPrefixes = process.argv.slice(2).filter((arg) => arg && !arg.startsWith('--'));
const prefixes = (cliPrefixes.length ? cliPrefixes : DEFAULT_PREFIXES).map((p) => (p.endsWith('/') ? p : p + '/'));

let app;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    app = initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        projectId,
        storageBucket: bucketName
    }, 'cleanup-contract-placeholders');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    app = initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket: bucketName
    }, 'cleanup-contract-placeholders');
} else {
    console.error('[cleanup] No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
}

const bucket = getStorage(app).bucket(bucketName);
let deleted = 0;

try {
    for (const prefix of prefixes) {
        const [files] = await bucket.getFiles({ prefix });
        if (!files.length) {
            console.log(`[cleanup] no objects under ${prefix}`);
            continue;
        }
        for (const file of files) {
            await file.delete();
            console.log(`[cleanup] deleted ${file.name}`);
            deleted += 1;
        }
    }
    console.log(`[cleanup] done — ${deleted} object(s) deleted from ${bucketName}`);
} catch (err) {
    console.error('[cleanup] failed:', err && err.message ? err.message : err);
    process.exit(1);
}
