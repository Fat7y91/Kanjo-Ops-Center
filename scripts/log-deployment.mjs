#!/usr/bin/env node
/* Kanjo Ops — Black Box deployment logger (CI/CD)
 * =====================================================================
 * Writes a "System Updated" (تحديث نظام) entry into the `audit_logs`
 * collection after a successful deployment, so the founder can track the
 * actual codebase releases from inside the Black Box.
 *
 * Stored entry shape matches the live audit entries written by
 * `public/js/services/audit.js` (actionType = "deploy", entityKind = "system",
 * plus a ready-to-render `changes` diff of the commit hash and message).
 *
 * Credentials (same convention as the other scripts in this folder):
 *   FIREBASE_SERVICE_ACCOUNT        : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS  : path to a service-account JSON file
 *
 * Inputs (GitHub Actions context, with local fallbacks):
 *   GITHUB_SHA / DEPLOY_COMMIT                       commit hash   (required)
 *   DEPLOY_COMMIT_MESSAGE / GITHUB_EVENT_HEAD_COMMIT_MESSAGE / DEPLOY_MESSAGE
 *   GITHUB_REF_NAME / DEPLOY_BRANCH                  branch
 *   GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL   build the run URL
 *
 * The push actor is deliberately NOT used: every entry is attributed to
 * "د/أحمد فتحي عبر GitHub" and the commit subject is reformatted into a
 * professional English release title (see formatReleaseTitle).
 *
 * Idempotent: the entry id is derived from the commit hash, so re-running the
 * workflow for the same commit overwrites instead of duplicating the log.
 */

import { pathToFileURL } from 'node:url';

const AUDIT_COLLECTION = 'audit_logs';

/* Deployments are always attributed to the founder in the Black Box, never to
   the CI bot that actually pushed the commit. */
const DEPLOY_AUTHOR_NAME = 'د/أحمد فتحي عبر GitHub';

const firstLine = (text) =>
    String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0] || '';

/* Conventional-commit types stripped from the release title, e.g. "chore: ". */
const CONVENTIONAL_TYPES = 'feat|fix|chore|refactor|docs|style|test|perf|build|ci|revert|release';
const CONVENTIONAL_PREFIX = new RegExp(`^\\s*(?:${CONVENTIONAL_TYPES})(?:\\([^)]*\\))?!?\\s*:\\s*`, 'i');

/* Turn a raw commit subject into a professional release title:
   "chore: retire dead verify-coverage script" -> "Retire dead verify-coverage script".
   The first letter is capitalised so the English reads as a release headline. */
export function formatReleaseTitle(message) {
    const subject = firstLine(message);
    if (!subject) return 'Code update';
    const stripped = subject.replace(CONVENTIONAL_PREFIX, '').trim();
    const title = stripped || subject;
    return title.charAt(0).toUpperCase() + title.slice(1);
}

/* Pure builder so the payload can be unit-tested without any Firebase
   credentials. `timestamp` is a plain Date; the Admin SDK converts it to a
   Firestore Timestamp on write. */
export function buildDeploymentPayload(input = {}, now = new Date()) {
    const sha = String(input.sha || '').trim();
    if (!sha) throw new Error('Missing commit SHA');
    const shortSha = sha.slice(0, 7);
    const commitMessage = String(input.commitMessage || '').trim();
    const messageSummary = formatReleaseTitle(commitMessage);
    /* The real push actor (e.g. "monkeycode-global[bot]") is intentionally
       ignored: the log is always attributed to the founder. */
    const actor = DEPLOY_AUTHOR_NAME;
    const branch = String(input.branch || 'main').trim();
    const runUrl = String(input.runUrl || '').trim();

    const changes = [
        { field: 'version', label: 'الإصدار', before: '', after: shortSha },
        { field: 'message', label: 'وصف التحديث', before: '', after: messageSummary },
        { field: 'actor', label: 'بواسطة', before: '', after: actor },
        { field: 'branch', label: 'الفرع', before: '', after: branch }
    ];
    if (runUrl) changes.push({ field: 'runUrl', label: 'رابط التنفيذ', before: '', after: runUrl });

    const newData = { commit: sha, version: shortSha, message: messageSummary, actor, branch };
    if (runUrl) newData.runUrl = runUrl;

    return {
        id: 'deploy_' + shortSha,
        data: {
            timestamp: now,
            ts: now.toISOString(),
            userId: 'ci',
            userName: actor,
            userRole: 'system',
            actionType: 'deploy',
            targetEntity: 'نظام',
            targetId: shortSha,
            targetName: `الإصدار ${shortSha}`,
            entityKind: 'system',
            description: `تم تحديث النظام (الإصدار ${shortSha}) — ${messageSummary}`,
            collection: 'system',
            source: 'ci',
            previousData: null,
            newData,
            changes
        }
    };
}

/* Collect the deployment context from the environment. The push actor is not
   collected on purpose (see DEPLOY_AUTHOR_NAME). */
export function deploymentContextFromEnv(env = process.env) {
    const repo = String(env.GITHUB_REPOSITORY || '').trim();
    const runId = String(env.GITHUB_RUN_ID || '').trim();
    const serverUrl = String(env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
    return {
        sha: String(env.GITHUB_SHA || env.DEPLOY_COMMIT || '').trim(),
        commitMessage: String(
            env.DEPLOY_COMMIT_MESSAGE || env.GITHUB_EVENT_HEAD_COMMIT_MESSAGE || env.DEPLOY_MESSAGE || ''
        ).trim(),
        branch: String(env.GITHUB_REF_NAME || env.DEPLOY_BRANCH || 'main').trim(),
        runUrl: repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : ''
    };
}

async function main() {
    const env = process.env;
    const context = deploymentContextFromEnv(env);
    if (!context.sha) {
        console.error('[log-deployment] Missing commit SHA. Set GITHUB_SHA or DEPLOY_COMMIT.');
        process.exit(1);
    }

    let initializeApp;
    let cert;
    let applicationDefault;
    let getFirestore;
    try {
        ({ initializeApp, cert, applicationDefault } = await import('firebase-admin/app'));
        ({ getFirestore } = await import('firebase-admin/firestore'));
    } catch (err) {
        console.error('[log-deployment] firebase-admin is not installed. Run: npm install firebase-admin@12');
        console.error(err && err.message ? err.message : err);
        process.exit(1);
    }

    let app;
    if (env.FIREBASE_SERVICE_ACCOUNT) {
        app = initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) }, 'log-deployment');
    } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
        app = initializeApp({ credential: applicationDefault() }, 'log-deployment');
    } else {
        console.error(
            '[log-deployment] No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or ' +
            'GOOGLE_APPLICATION_CREDENTIALS.'
        );
        process.exit(1);
    }

    const db = getFirestore(app);
    const { id, data } = buildDeploymentPayload(context);
    try {
        await db.collection(AUDIT_COLLECTION).doc(id).set(data, { merge: false });
        console.log(`[log-deployment] Logged deployment ${data.targetId} → ${AUDIT_COLLECTION}/${id}`);
    } catch (err) {
        console.error('[log-deployment] Failed to write deployment log:', err && err.message ? err.message : err);
        process.exit(1);
    }
}

/* Run only when executed directly (not when imported by tests). */
const invokedDirectly = (() => {
    try {
        return import.meta.url === pathToFileURL(process.argv[1] || '').href;
    } catch (_) {
        return false;
    }
})();

if (invokedDirectly) {
    main().catch((err) => {
        console.error('[log-deployment] Unexpected failure:', err && err.message ? err.message : err);
        process.exit(1);
    });
}
