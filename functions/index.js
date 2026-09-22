'use strict';

/* Kanjo Ops Center — Cloud Functions entry point.
 *
 * Phase 1 of the PDF-contract migration: a server-side microservice that builds
 * the merchant contract HTML and renders it to a PDF (offloading the CPU/RAM
 * cost from the field reps' mobile browsers). The frontend is intentionally not
 * wired to it yet. */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');

const { buildContractHtml, normalizeContractInput } = require('./lib/contract');
const { renderContractPdf, resetBrowser } = require('./lib/pdf');
const { persistContractPdf } = require('./lib/storage');

initializeApp();

/* Chromium is memory- and CPU-hungry, so the instance is sized for a single
   concurrent render and a warm browser is reused between invocations. */
const CALL_OPTIONS = {
    region: 'us-central1',
    memory: '2GiB',
    cpu: 1,
    timeoutSeconds: 180,
    concurrency: 1,
    maxInstances: 5,
    cors: true
};

exports.generateMerchantContract = onCall(CALL_OPTIONS, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول لإصدار العقد.');
    }

    let input;
    try {
        input = normalizeContractInput(request.data);
    } catch (err) {
        throw new HttpsError('invalid-argument', err && err.message ? err.message : 'بيانات العقد غير صحيحة.');
    }

    const startedAt = Date.now();

    let html;
    try {
        html = buildContractHtml(input);
    } catch (err) {
        logger.error('[generateMerchantContract] HTML build failed', err);
        throw new HttpsError('internal', 'تعذر تجهيز نص العقد.');
    }

    let pdf;
    try {
        pdf = await renderContractPdf(html);
    } catch (err) {
        logger.error('[generateMerchantContract] PDF render failed', err);
        resetBrowser();
        throw new HttpsError('internal', 'تعذر إنشاء ملف PDF للعقد.');
    }

    let stored;
    try {
        stored = await persistContractPdf({ buffer: pdf, input, uid: request.auth.uid });
    } catch (err) {
        logger.error('[generateMerchantContract] storage upload failed', err);
        throw new HttpsError('internal', 'تعذر حفظ ملف العقد.');
    }

    logger.info('[generateMerchantContract] contract generated', {
        merchantId: input.merchantId,
        bytes: pdf.length,
        durationMs: Date.now() - startedAt,
        path: stored.path
    });

    return {
        ok: true,
        merchantId: input.merchantId,
        merchantName: input.merchantName,
        businessType: input.businessType,
        generatedAt: new Date().toISOString(),
        ...stored
    };
});
