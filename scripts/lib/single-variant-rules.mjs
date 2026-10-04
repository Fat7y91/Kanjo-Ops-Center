/* Pure, dependency-free rules for collapsing a single-variation "variable"
 * product into a proper simple product. Kept separate from the Firestore script
 * so it can be unit-tested without the Admin SDK.
 *
 * Schema note (kanjo `merchant_products`):
 *   - the variant array field is `variations` (each { name, price, ... }),
 *   - the product price field is `base_price` (there is no top-level `price`),
 *   - the simple/variable flag is `product_type` ('simple' | 'variable'). */

export const normalizeAr = (value) => String(value == null ? '' : value)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u0624]/g, '\u0648')
    .replace(/[\u0626]/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const PREPEND_RULES = [
    { key: normalizeAr('ساندوتش'), token: 'ساندوتش ' },
    { key: normalizeAr('وجبة'), token: 'وجبة ' }
];

/* Names that add nothing to the product name when they are the only variation. */
const KEEP_KEYS = new Set([
    normalizeAr('ستاندرد'), normalizeAr('إضافة'), normalizeAr('اضافة'), normalizeAr('اضافه'),
    normalizeAr('صغير'), normalizeAr('وسط'), normalizeAr('كبير'),
    normalizeAr('نص'), normalizeAr('ربع'), normalizeAr('كيلو'),
    normalizeAr('XL'), normalizeAr('XXL'), normalizeAr('L'), normalizeAr('M'), normalizeAr('S')
]);

export const containsToken = (name, token) => {
    const hay = normalizeAr(name);
    const needle = normalizeAr(token);
    return !!hay && !!needle && hay.indexOf(needle) !== -1;
};

/* Returns { name, reason } where reason is 'prepend' | 'keep' | 'unknown'. */
export const renameForVariant = (originalName, variantName) => {
    const name = String(originalName == null ? '' : originalName).trim();
    if (!name) return { name: '', reason: 'keep' };
    const variantKey = normalizeAr(variantName);
    const rule = PREPEND_RULES.find((r) => r.key === variantKey);
    if (rule) {
        /* Guardrail: never duplicate a word the product already contains. */
        if (containsToken(name, rule.token)) return { name, reason: 'keep' };
        return { name: rule.token + name, reason: 'prepend' };
    }
    if (KEEP_KEYS.has(variantKey)) return { name, reason: 'keep' };
    return { name, reason: 'unknown' };
};

/* Returns { name, price } for a product with exactly one variation, else null. */
export const singleVariation = (product) => {
    const variations = product && product.variations;
    if (!Array.isArray(variations) || variations.length !== 1) return null;
    const variant = variations[0] || {};
    const name = String(variant.name == null ? '' : variant.name).trim();
    if (!name) return null;
    return { name, price: Number(variant.price) };
};

/* Builds the Firestore update payload. `deleteSentinel` is FieldValue.delete()
   injected by the caller so this module stays dependency-free. */
export const buildPatch = (product, variant, now, deleteSentinel) => {
    const originalAr = String(product.name_ar == null ? '' : product.name_ar).trim();
    const originalEn = String(product.name_en == null ? '' : product.name_en).trim();
    const baseName = originalAr || originalEn;
    const renamed = renameForVariant(baseName, variant.name);
    const price = Number.isFinite(variant.price) ? variant.price : (Number(product.base_price) || 0);

    let nameAr = originalAr;
    let nameEn = originalEn;
    if (originalAr) {
        nameAr = renamed.name;
        /* Mirror the rename onto name_en only when it is empty or a copy of
           name_ar (as menu imports write them); otherwise leave it untouched. */
        if (!originalEn || normalizeAr(originalEn) === normalizeAr(originalAr)) nameEn = renamed.name;
    } else if (originalEn) {
        nameEn = renamed.name;
    }

    const patch = {
        name_ar: nameAr,
        name_en: nameEn,
        base_price: price,
        product_type: 'simple',
        variations: deleteSentinel,
        singleVariantMergedFrom: variant.name,
        singleVariantMergedAt: now,
        singleVariantMergedBy: 'cleanup-single-variant',
        updatedAt: now
    };
    return { patch, reason: renamed.reason };
};
