#!/usr/bin/env node
/* Kanjo Ops — One-off cleanup: collapse single-variation "variable" products
 * into proper simple products.
 *
 * Problem
 * -------
 * A menu import produced variable products that contain EXACTLY ONE variation
 * (e.g. name_ar "ناجتس" + one variation "ساندوتش" @85) instead of a simple
 * product ("ساندوتش ناجتس" @85, no variations). This bloats the UI (every row
 * shows a pointless variant) and mislabels simple items in the export.
 *
 * What this utility does (per matched document)
 * ---------------------------------------------
 *   1. read the single variation { name, price },
 *   2. set `base_price` = that variation price (the schema's price field),
 *   3. set `product_type` = 'simple' (the schema equivalent of hasVariants:false),
 *   4. DELETE the whole `variations` array,
 *   5. smart-rename `name_ar`/`name_en`:
 *        "ساندوتش" -> "ساندوتش <name>"
 *        "وجبة"    -> "وجبة <name>"
 *        "ستاندرد" / "إضافة" / "اضافة" / sizes -> keep the name unchanged
 *      with a guardrail that never prepends a word the name already contains.
 *
 * Efficiency
 * ----------
 *   - exactly ONE filtered query of `merchant_products` (the Admin SDK
 *     paginates internally; reads are 1 per product, no follow-up reads),
 *   - all filtering happens in memory (variations.length === 1),
 *   - writes go through writeBatch() in chunks of 500 (Firestore hard cap).
 *
 * Safety
 * ------
 *   - DRY RUN BY DEFAULT: nothing is written unless `--apply` is passed
 *     (or SYNC_DRY_RUN=0).
 *   - Idempotent: after a run the docs no longer match (no `variations`), so a
 *     second run is a no-op.
 *   - Never deletes documents; only a targeted field update.
 *
 * Usage
 * -----
 *   # dry run (default) — the recommended first step:
 *   node scripts/cleanup-single-variant-products.mjs --merchant "Ice Square"
 *
 *   # apply the changes:
 *   node scripts/cleanup-single-variant-products.mjs --merchant "Ice Square" --apply
 *
 *   # filter by the immutable merchant id instead of the display name:
 *   node scripts/cleanup-single-variant-products.mjs --merchant-id KJ-5W5G4F --apply
 *
 * Credentials (same convention as the other scripts in this folder):
 *   FIREBASE_SERVICE_ACCOUNT        : full service-account JSON (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS  : path to a service-account JSON file
 *   SYNC_DRY_RUN=0                  : alternative to `--apply`
 */

import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { singleVariation, buildPatch } from './lib/single-variant-rules.mjs';

const args = process.argv.slice(2);
const argValue = (flag) => {
    const inline = args.find((a) => a.startsWith(flag + '='));
    if (inline) return inline.slice(flag.length + 1);
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '';
};

const MERCHANT_NAME = argValue('--merchant') || 'Ice Square';
const MERCHANT_ID = argValue('--merchant-id') || '';
const APPLY_FLAG = args.includes('--apply');
const DRY_ENV = String(process.env.SYNC_DRY_RUN || '').toLowerCase();
const DRY_RUN = APPLY_FLAG ? false : DRY_ENV ? ['1', 'true', 'yes'].includes(DRY_ENV) : true;

const BATCH_LIMIT = 500; // Firestore hard cap is 500 writes per batch.

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let app;
if (raw) {
    if (getApps().length === 0) app = initializeApp({ credential: cert(JSON.parse(raw)) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (getApps().length === 0) app = initializeApp({ credential: applicationDefault() });
} else {
    console.error('[cleanup] No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
}
const db = getFirestore(app);

const main = async () => {
    const filterLabel = MERCHANT_ID ? `merchantId=${MERCHANT_ID}` : `merchantName="${MERCHANT_NAME}"`;
    console.log(`[cleanup] target: ${filterLabel}${DRY_RUN ? ' (DRY RUN — no writes)' : ' (APPLYING)'}`);

    /* ── exactly ONE filtered query (reads = 1 per product) ── */
    const query = MERCHANT_ID
        ? db.collection('merchant_products').where('merchantId', '==', MERCHANT_ID)
        : db.collection('merchant_products').where('merchantName', '==', MERCHANT_NAME);
    const snap = await query.get();
    const docs = snap.docs;
    console.log(`[cleanup] fetched ${docs.length} product document(s)`);

    /* ── in-memory filter + transform ── */
    const targets = [];
    const byReason = { prepend: 0, keep: 0, unknown: 0 };
    const unknownNames = new Set();
    const merchantIds = new Set();
    const now = new Date();
    const deleteSentinel = FieldValue.delete();

    docs.forEach((doc) => {
        const product = doc.data() || {};
        if (product.merchantId) merchantIds.add(product.merchantId);
        const variant = singleVariation(product);
        if (!variant) return;
        const { patch, reason } = buildPatch(product, variant, now, deleteSentinel);
        byReason[reason] = (byReason[reason] || 0) + 1;
        if (reason === 'unknown') unknownNames.add(variant.name);
        targets.push({ ref: doc.ref, before: product, variant, patch });
    });

    console.log(`[cleanup] single-variation products: ${targets.length}`);
    console.log(`[cleanup]   renamed (prepended): ${byReason.prepend}`);
    console.log(`[cleanup]   kept as-is        : ${byReason.keep}`);
    if (byReason.unknown) {
        console.log(`[cleanup]   unknown variant names (kept as-is): ${byReason.unknown}`);
        console.log(`[cleanup]     ${[...unknownNames].join(' | ')}`);
    }
    if (merchantIds.size) console.log(`[cleanup] merchantId(s) in scope: ${[...merchantIds].join(', ')}`);

    if (targets.length) {
        console.log('[cleanup] sample transforms:');
        targets.slice(0, 10).forEach((t) => console.log(
            `  ${t.before.name_ar}  [${t.variant.name} @${t.variant.price}]  ->  ${t.patch.name_ar}  (base_price=${t.patch.base_price})`
        ));
    }

    if (!targets.length) {
        console.log('[cleanup] nothing to do.');
        return { scanned: docs.length, matched: 0, written: 0 };
    }
    if (DRY_RUN) {
        console.log('[cleanup] DRY RUN complete — re-run with --apply to write.');
        return { scanned: docs.length, matched: targets.length, written: 0 };
    }

    /* ── chunked writeBatch (500/batch) ── */
    let written = 0;
    for (let start = 0; start < targets.length; start += BATCH_LIMIT) {
        const chunk = targets.slice(start, start + BATCH_LIMIT);
        const batch = db.batch();
        chunk.forEach((t) => batch.update(t.ref, t.patch));
        await batch.commit();
        written += chunk.length;
        console.log(`[cleanup] committed ${written}/${targets.length}`);
    }
    console.log(`[cleanup] done — ${written} product(s) converted to simple.`);
    return { scanned: docs.length, matched: targets.length, written };
};

main().catch((err) => {
    console.error('[cleanup] failed:', err);
    process.exit(1);
});
