'use strict';

/* Cloud Storage persistence for generated contracts.
 *
 * Objects live under `contracts/<merchantId>/contract.pdf` in the project's
 * default Firebase Storage bucket. The path is static per merchant so that
 * regenerating a contract overwrites the previous version instead of
 * accumulating duplicate files. Reads are served through a short-lived V4
 * signed URL; if the runtime service account cannot sign blobs (missing
 * roles/iam.serviceAccountTokenCreator) we fall back to a Firebase
 * download-token URL, which is equally unguessable and revocable. */

const crypto = require('node:crypto');
const { getStorage } = require('firebase-admin/storage');

const CONTRACT_ROOT = 'contracts';
const DEFAULT_SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sanitizeSegment(value, fallback) {
    const cleaned = String(value || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .replace(/\s+/g, '_')
        .trim();
    return cleaned || fallback;
}

async function createDownloadUrl(file, bucket, ttlMs = DEFAULT_SIGNED_URL_TTL_MS) {
    const expires = Date.now() + ttlMs;
    try {
        const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires });
        return { url, kind: 'signed', expiresAt: new Date(expires).toISOString() };
    } catch (err) {
        console.warn('[storage] getSignedUrl failed; using download-token URL:', err && err.message ? err.message : err);
    }
    const token = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const encoded = encodeURIComponent(file.name);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
    return { url, kind: 'token', expiresAt: null };
}

async function persistContractPdf({ buffer, input, uid }) {
    const bucket = getStorage().bucket();
    const merchantId = sanitizeSegment(input.merchantId, 'unknown');
    const objectPath = `${CONTRACT_ROOT}/${merchantId}/contract.pdf`;
    const file = bucket.file(objectPath);

    await file.save(buffer, {
        resumable: false,
        contentType: 'application/pdf',
        metadata: {
            cacheControl: 'private, max-age=0, no-transform',
            metadata: {
                merchantId: String(input.merchantId || ''),
                merchantName: String(input.merchantName || ''),
                generatedBy: String(uid || ''),
                source: 'generateMerchantContract'
            }
        }
    });

    const { url, kind, expiresAt } = await createDownloadUrl(file, bucket);
    return {
        url,
        downloadUrlKind: kind,
        expiresAt,
        bucket: bucket.name,
        path: objectPath,
        fileName: objectPath.split('/').pop()
    };
}

module.exports = { persistContractPdf, CONTRACT_ROOT };
