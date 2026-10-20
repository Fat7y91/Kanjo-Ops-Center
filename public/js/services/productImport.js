/* Kanjo Ops — Standardized Merchant-Product Excel Importer
 * =====================================================================
 * Data-Entry operator tool (UAM permission `canImportProductsExcel`,
 * default-granted to the `data_entry` role / PIN 2468).
 *
 * The operator picks a target merchant AND the rep who owns the effort, then
 * uploads the standardized sheet. Parsing happens ENTIRELY in the browser
 * (SheetJS) and the sheet is validated as a WHOLE: one mandatory failure
 * (missing name, missing/invalid price, half-filled variation) rejects every
 * row with a clear per-row error list before anything is written.
 *
 * Fixed template columns:
 *   الصنف | الوصف | الكود | السعر | الحجم ١ | السعر ١ | الحجم ٢ | السعر ٢ |
 *   الحجم ٣ | السعر ٣ | رابط الصورة
 *
 * Cost model: ZERO Firestore reads beyond the cached merchant picker. Rows are
 * committed with `writeBatch` in chunks of 500 and folded into the already
 * loaded catalog caches, so nothing needs to be re-read.
 *
 * Attribution: `createdBy` / `addedBy` are set to the selected rep, so the
 * effort (and payroll/catalog grouping) lands on the right person even though
 * the data-entry operator performed the upload.
 */

const PRODUCT_IMPORT_COLLECTION = 'merchant_products';
const PRODUCT_IMPORT_CHUNK = 500;
const PRODUCT_IMPORT_STATUS = 'pending';
const PRODUCT_IMPORT_SOURCE = 'product_excel_import';
const PRODUCT_IMPORT_HEADER_SCAN_ROWS = 15;
const PRODUCT_IMPORT_MAX_VARIANTS = 3;

const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
    'الصنف', 'الوصف', 'الكود', 'السعر',
    'الحجم ١', 'السعر ١', 'الحجم ٢', 'السعر ٢', 'الحجم ٣', 'السعر ٣',
    'رابط الصورة'
];

let productImportRows = [];
let productImportMerchantMap = {};
let productImportBusy = false;

/* ──────────────────────────── ACCESS ───────────────────────────────── */

window.isProductImportUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    const pin = String(u.pin == null ? (u.pinCode == null ? '' : u.pinCode) : u.pin).trim();
    /* Default ON for the Data-Entry operator (PIN/role), while an explicit UAM
       toggle (true OR false) always wins inside `kanjoCan`. */
    const role = String(u.role || '').toLowerCase();
    const legacy = (pin === '2468') || (role === 'data_entry');
    return (typeof window.kanjoCan === 'function')
        ? window.kanjoCan('canImportProductsExcel', legacy)
        : legacy;
};

/* ──────────────────────────── HELPERS ──────────────────────────────── */

const productEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const productNormalizeDigits = (value) => String(value == null ? '' : value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const productCellText = (value) => productNormalizeDigits(value).replace(/\s+/g, ' ').trim();

const productNormalizeHeader = (value) => productCellText(value)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const productNormalizeKey = (value) => productNormalizeHeader(value).replace(/\s+/g, ' ');

/* Returns a finite number, or null when the cell carries no usable number.
   `0` is a real price (free item); an EMPTY cell is a missing price. */
const productParsePrice = (value) => {
    const raw = productCellText(value);
    if (!raw) return null;
    const normalized = raw.replace(/[٫,]/g, '.').replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '.' || normalized === '-') return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
};

const productFormatNumber = (value) => (typeof window.toArabicNumerals === 'function')
    ? window.toArabicNumerals(String(value))
    : String(value);

/* FNV-1a (32-bit) -> base36; deterministic, so re-importing the same sheet
   overwrites the same documents instead of duplicating them. */
const productHashKey = (text) => {
    let hash = 0x811c9dc5;
    const value = String(text == null ? '' : text);
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
};

const productSanitizeIdPart = (value) => String(value == null ? '' : value)
    .replace(/[\/\u0000-\u001F\u007F]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);

/* ──────────────────────── HEADER DETECTION ─────────────────────────── */

const PRODUCT_NAME_HEADERS = ['الصنف', 'اسم المنتج', 'المنتج', 'الاسم', 'name'];
const PRODUCT_DESCRIPTION_HEADERS = ['الوصف', 'وصف', 'المكونات', 'التركيب', 'description'];
const PRODUCT_CODE_HEADERS = ['الكود', 'كود', 'sku', 'باركود', 'barcode'];
const PRODUCT_PRICE_HEADERS = ['السعر', 'سعر', 'price'];
const PRODUCT_IMAGE_HEADERS = ['رابط الصورة', 'الصورة', 'image', 'image url'];

const productHeaderRole = (raw) => {
    const token = productNormalizeHeader(raw);
    if (!token) return null;
    if (PRODUCT_NAME_HEADERS.indexOf(token) !== -1) return { role: 'name' };
    if (PRODUCT_DESCRIPTION_HEADERS.indexOf(token) !== -1) return { role: 'description' };
    if (PRODUCT_CODE_HEADERS.indexOf(token) !== -1) return { role: 'code' };
    if (PRODUCT_IMAGE_HEADERS.indexOf(token) !== -1) return { role: 'image' };
    if (PRODUCT_PRICE_HEADERS.indexOf(token) !== -1) return { role: 'price' };
    const size = /^(الحجم|حجم|size)\s*([1-9])$/.exec(token);
    if (size) return { role: 'size', index: Number(size[2]) };
    const price = /^(السعر|سعر|price)\s*([1-9])$/.exec(token);
    if (price) return { role: 'price', index: Number(price[2]) };
    return null;
};

/* Locate the header row and map role -> column index. A valid standardized
   sheet must expose the item name AND a price column (base or variation). */
const productDetectColumns = (matrix) => {
    const limit = Math.min(matrix.length, PRODUCT_IMPORT_HEADER_SCAN_ROWS);
    for (let r = 0; r < limit; r++) {
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const cols = { name: -1, description: -1, code: -1, image: -1, price: -1, sizes: {}, prices: {} };
        let hasPrice = false;
        for (let c = 0; c < row.length; c++) {
            const info = productHeaderRole(row[c]);
            if (!info) continue;
            if (info.role === 'name' && cols.name === -1) cols.name = c;
            else if (info.role === 'description' && cols.description === -1) cols.description = c;
            else if (info.role === 'code' && cols.code === -1) cols.code = c;
            else if (info.role === 'image' && cols.image === -1) cols.image = c;
            else if (info.role === 'price' && cols.price === -1) { cols.price = c; hasPrice = true; }
            else if (info.role === 'size') cols.sizes[info.index] = c;
            else if (info.role === 'price') { cols.prices[info.index] = c; hasPrice = true; }
        }
        if (cols.name !== -1 && hasPrice) return { headerRow: r, cols };
    }
    return null;
};

/* ──────────────────────── SHEET -> ROWS ────────────────────────────── */

const productMapVariant = (sizeText) => {
    if (!sizeText) return null;
    if (typeof window.kanjoMapVariantToKanjo !== 'function') return null;
    const mapped = window.kanjoMapVariantToKanjo(sizeText, sizeText);
    return (Array.isArray(mapped) && mapped.length) ? mapped[0] : null;
};

const productIsBlankRow = (row) => !(Array.isArray(row) ? row : [])
    .some((cell) => productCellText(cell) !== '');

/* Pure transform from a SheetJS matrix into validated importer rows.
   Returns `{ rows, errors, headerRow }`; `errors` is empty only when EVERY
   row passed (the whole sheet is rejected otherwise). */
window.productImportParseMatrix = (matrix) => {
    const safeMatrix = Array.isArray(matrix) ? matrix : [];
    const detected = productDetectColumns(safeMatrix);
    if (!detected) {
        return {
            rows: [],
            headerRow: -1,
            errors: [{ row: 0, message: 'تعذّر العثور على صف العناوين. يجب أن يحتوي الملف على عمودي «الصنف» و«السعر».' }]
        };
    }
    const { headerRow, cols } = detected;
    const rows = [];
    for (let r = headerRow + 1; r < safeMatrix.length; r++) {
        const raw = Array.isArray(safeMatrix[r]) ? safeMatrix[r] : [];
        if (productIsBlankRow(raw)) continue;
        const rowNumber = r + 1;
        const name = cols.name >= 0 ? productCellText(raw[cols.name]) : '';
        const description = cols.description >= 0 ? productCellText(raw[cols.description]) : '';
        const code = cols.code >= 0 ? productCellText(raw[cols.code]) : '';
        const imageUrl = cols.image >= 0 ? productCellText(raw[cols.image]) : '';
        const priceRaw = cols.price >= 0 ? productCellText(raw[cols.price]) : '';
        const variations = [];
        for (let i = 1; i <= PRODUCT_IMPORT_MAX_VARIANTS; i++) {
            const sizeIdx = cols.sizes[i];
            if (sizeIdx == null) continue;
            const sizeRaw = productCellText(raw[sizeIdx]);
            const priceIdx = cols.prices[i];
            const variantPriceRaw = priceIdx == null ? '' : productCellText(raw[priceIdx]);
            if (!sizeRaw && !variantPriceRaw) continue;
            const mapped = productMapVariant(sizeRaw);
            variations.push({
                index: i,
                name: sizeRaw,
                priceRaw: variantPriceRaw,
                price: productParsePrice(variantPriceRaw),
                image_url: '',
                kanjo_value: mapped ? mapped.value : '',
                kanjo_attribute: mapped ? mapped.name : ''
            });
        }
        rows.push({
            rowNumber,
            name,
            description,
            code,
            imageUrl,
            priceRaw,
            price: productParsePrice(priceRaw),
            variations
        });
    }
    const errors = [];
    rows.forEach((row) => {
        const rowErrors = [];
        const rowVariations = Array.isArray(row.variations) ? row.variations : [];
        if (!row.name) rowErrors.push('الصنف مطلوب');
        let validVariations = 0;
        rowVariations.forEach((variation) => {
            const ordinal = productFormatNumber(variation.index);
            if (!variation.name) rowErrors.push('اسم الحجم ' + ordinal + ' مطلوب عند إدخال سعر');
            if (!variation.priceRaw) {
                if (variation.name) rowErrors.push('سعر الحجم ' + ordinal + ' مطلوب');
            } else if (variation.price == null) {
                rowErrors.push('سعر الحجم ' + ordinal + ' غير صالح');
            } else if (variation.price < 0) {
                rowErrors.push('سعر الحجم ' + ordinal + ' لا يمكن أن يكون سالباً');
            } else if (variation.name) {
                validVariations += 1;
            }
        });
        /* A product must carry a price: either the base price or at least one
           fully-priced variation. */
        if (row.priceRaw) {
            if (row.price == null) rowErrors.push('السعر غير صالح');
            else if (row.price < 0) rowErrors.push('السعر لا يمكن أن يكون سالباً');
        } else if (!validVariations && !rowVariations.length) {
            rowErrors.push('السعر مطلوب');
        }
        rowErrors.forEach((message) => errors.push({ row: row.rowNumber, message }));
    });
    return { rows, errors, headerRow: headerRow + 1 };
};

const productReadFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('PRODUCT_FILE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
});

const productParseSpreadsheet = async (file) => {
    if (!window.XLSX) throw new Error('XLSX_NOT_LOADED');
    const buffer = await productReadFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) throw new Error('PRODUCT_EMPTY_SHEET');
    const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    return window.productImportParseMatrix(matrix);
};

/* ──────────────────────── ROWS -> DOCUMENTS ────────────────────────── */

const productRowKey = (row) => productNormalizeKey([
    row.name,
    row.code,
    row.variations.map((v) => v.name + '@' + (v.price == null ? '' : v.price)).join(',')
].join('|'));

const productDocId = (merchantId, row) => productSanitizeIdPart(merchantId) + '__pi-' + productHashKey(productRowKey(row));
const productSku = (row) => 'KJ-PX-' + productHashKey(productRowKey(row));

/* Pure transform from parsed rows + merchant + rep into `{ id, data }`
   entries ready for writeBatch. */
window.productImportBuildEntries = (rows, merchant, repName) => {
    if (!merchant || !merchant.merchantId) return [];
    const owner = String(repName || '').trim();
    const now = new Date().toISOString();
    return (Array.isArray(rows) ? rows : [])
        .filter((row) => row && String(row.name || '').trim())
        .map((row) => {
            const variations = (Array.isArray(row.variations) ? row.variations : [])
                .filter((v) => v && String(v.name || '').trim() && v.price != null && v.price >= 0);
            const isVariable = variations.length > 0;
            const basePrice = isVariable
                ? Math.min.apply(null, variations.map((v) => Number(v.price)))
                : Number(row.price);
            const code = String(row.code || '').trim();
            const data = {
                merchantId: merchant.merchantId,
                merchantName: merchant.merchantName,
                name: row.name,
                name_ar: row.name,
                name_en: '',
                description_ar: row.description || '',
                description_en: '',
                sku: code || productSku(row),
                product_type: isVariable ? 'variable' : 'simple',
                base_price: Number.isFinite(basePrice) ? basePrice : 0,
                /* `category` must stay the merchant activity for the
                   vendor-scoped export matcher. */
                category: String(merchant.category || '').trim(),
                rawImageUrl: row.imageUrl || '',
                rawImageUrls: row.imageUrl ? [row.imageUrl] : [],
                enhancedImageUrl: '',
                enhancedImageUrls: [],
                status: PRODUCT_IMPORT_STATUS,
                is_active: true,
                importSource: PRODUCT_IMPORT_SOURCE,
                createdBy: owner,
                addedBy: owner,
                createdAt: now,
                updatedAt: now,
                syncedFromDraft: true
            };
            if (code) data.barcode = code;
            if (isVariable) {
                data.variations = variations.map((v) => ({
                    name: v.name,
                    price: Number(v.price),
                    image_url: v.image_url || '',
                    /* Standard Dashboard Template value resolved from the same
                       alias dictionary the export/import pipeline uses. */
                    kanjo_value: v.kanjo_value || '',
                    kanjo_attribute: v.kanjo_attribute || ''
                }));
            }
            return { id: productDocId(merchant.merchantId, row), data };
        });
};

/* ──────────────────────── TEMPLATE DOWNLOAD ────────────────────────── */

const productTemplateInstructions = [
    ['عمود', 'إلزامي؟', 'الشرح'],
    ['الصنف', 'نعم', 'اسم المنتج كما سيظهر في الكتالوج.'],
    ['السعر', 'نعم للمنتج البسيط', 'سعر المنتج. مطلوب إذا لم يكن للمنتج أحجام.'],
    ['الحجم ١ / السعر ١', 'نعم عند استخدام الحجم', 'الحجم وسعره. إذا كتبت الحجم فيجب كتابة السعر، والعكس صحيح.'],
    ['الوصف / الكود / رابط الصورة', 'لا', 'اختياري. اتركه فارغاً إذا لم يتوفر.'],
    ['', '', ''],
    ['ملاحظة', '', 'أي خطأ في صف واحد يرفض الملف بالكامل ولا يتم استيراد أي منتج.'],
    ['ملاحظة', '', 'السعر 0 مسموح (منتج مجاني)، أما الخلية الفارغة فتُعد سعراً ناقصاً.']
];

window.downloadProductImportTemplate = () => {
    if (!window.XLSX) {
        if (window.showToast) window.showToast('مكتبة إكسل غير محمّلة، حدّث الصفحة', false);
        return;
    }
    try {
        const workbook = window.XLSX.utils.book_new();
        const sampleRows = [
            PRODUCT_IMPORT_TEMPLATE_HEADERS,
            ['مندي لحم', 'أرز بسمتي مع اللحم', 'SKU-001', '', 'ربع', '120', 'نصف', '220', 'كامل', '400', ''],
            ['مياه معدنية', 'زجاجة 600 مل', 'SKU-002', '5', '', '', '', '', '', '', '']
        ];
        const sheet = window.XLSX.utils.aoa_to_sheet(sampleRows);
        sheet['!cols'] = PRODUCT_IMPORT_TEMPLATE_HEADERS.map((header, idx) => ({
            wch: idx === 1 ? 28 : (idx === 10 ? 32 : 14)
        }));
        window.XLSX.utils.book_append_sheet(workbook, sheet, 'المنتجات');
        const help = window.XLSX.utils.aoa_to_sheet(productTemplateInstructions);
        help['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 70 }];
        window.XLSX.utils.book_append_sheet(workbook, help, 'التعليمات');
        window.XLSX.writeFile(workbook, 'قالب-استيراد-المنتجات.xlsx');
    } catch (err) {
        console.error('[product-import] template failed:', err);
        if (window.showToast) window.showToast('تعذّر إنشاء القالب', false);
    }
};

/* ──────────────────────── UI: RENDER / MODAL ───────────────────────── */

window.renderProductImportNav = () => {
    const wrapper = document.getElementById('productImportNavBtnWrapper');
    if (wrapper) wrapper.classList.toggle('hidden', !window.isProductImportUser());
};

const productPopulateMerchantSelect = () => {
    const select = document.getElementById('productImportMerchant');
    if (!select || typeof window.listFinalizedMerchants !== 'function') return;
    const current = select.value;
    let merchants = [];
    try { merchants = window.listFinalizedMerchants() || []; } catch (err) { merchants = []; }
    productImportMerchantMap = {};
    const entries = [];
    merchants.forEach((merchant) => {
        const id = String(merchant.merchantId || merchant.id || merchant.merchant_id || '').trim();
        const name = String(merchant.merchantName || merchant.name || id).trim();
        if (!id || !name) return;
        productImportMerchantMap[id] = {
            merchantId: id,
            merchantName: name,
            category: merchant.category || merchant.cat || ''
        };
        entries.push({ id, name });
    });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    if (!entries.length) {
        select.innerHTML = '<option value="">لا توجد تجار مؤهلون بعد</option>';
        return;
    }
    select.innerHTML = '<option value="">اختر التاجر...</option>'
        + entries.map((e) => '<option value="' + productEscapeHtml(e.id) + '">' + productEscapeHtml(e.name) + '</option>').join('');
    if (current) select.value = current;
};

const productPopulateRepSelect = () => {
    const select = document.getElementById('productImportRep');
    if (!select) return;
    const current = select.value;
    const names = [];
    const roster = (window.users && typeof window.users === 'object') ? window.users : {};
    Object.keys(roster).forEach((pin) => {
        const user = roster[pin];
        if (!user || String(user.role || '') !== 'rep') return;
        const name = String(user.name || '').trim();
        if (name && names.indexOf(name) === -1) names.push(name);
    });
    names.sort((a, b) => a.localeCompare(b, 'ar'));
    if (!names.length) {
        select.innerHTML = '<option value="">لا يوجد مناديب</option>';
        return;
    }
    select.innerHTML = '<option value="">اختر المندوب صاحب المجهود...</option>'
        + names.map((name) => '<option value="' + productEscapeHtml(name) + '">' + productEscapeHtml(name) + '</option>').join('');
    if (current) select.value = current;
};

const productSetStatus = (text, isError) => {
    const el = document.getElementById('productImportStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('text-rose-600', !!isError);
    el.classList.toggle('text-slate-600', !isError);
};

const productSetSummary = (html) => {
    const el = document.getElementById('productImportSummary');
    if (!el) return;
    if (html) {
        el.innerHTML = html;
        el.classList.remove('hidden');
    } else {
        el.innerHTML = '';
        el.classList.add('hidden');
    }
};

const productSetErrors = (errors) => {
    const el = document.getElementById('productImportErrors');
    if (!el) return;
    const list = Array.isArray(errors) ? errors : [];
    if (!list.length) {
        el.innerHTML = '';
        el.classList.add('hidden');
        return;
    }
    el.innerHTML = '<div class="font-black text-rose-700 mb-1">تم رفض الملف بالكامل — '
        + productFormatNumber(list.length) + ' خطأ:</div>'
        + '<ul class="list-disc pr-5 space-y-0.5">'
        + list.slice(0, 50).map((err) => '<li>'
            + (err.row ? 'سطر ' + productFormatNumber(err.row) + ': ' : '')
            + productEscapeHtml(err.message) + '</li>').join('')
        + '</ul>'
        + (list.length > 50
            ? '<div class="mt-1 text-slate-500">و' + productFormatNumber(list.length - 50) + ' خطأ إضافي...</div>'
            : '');
    el.classList.remove('hidden');
};

const productSetRunEnabled = (enabled) => {
    const btn = document.getElementById('productImportRunBtn');
    if (btn) btn.disabled = !enabled;
};

const productResetModalState = () => {
    productImportRows = [];
    const file = document.getElementById('productImportFile');
    if (file) file.value = '';
    const label = document.getElementById('productImportFileName');
    if (label) label.textContent = 'اختر ملف المنتجات (xlsx / xls)';
    productSetStatus('', false);
    productSetSummary('');
    productSetErrors([]);
    productSetRunEnabled(false);
};

window.openProductImportModal = () => {
    if (!window.isProductImportUser()) {
        if (window.showToast) window.showToast('هذه الشاشة غير مصرّح لك بها', false);
        return;
    }
    const modal = document.getElementById('productImportModal');
    if (!modal) return;
    productResetModalState();
    productPopulateMerchantSelect();
    productPopulateRepSelect();
    if (!Object.keys(productImportMerchantMap).length && typeof window.ensureFinalizedMerchantsLoaded === 'function') {
        Promise.resolve(window.ensureFinalizedMerchantsLoaded())
            .then(() => productPopulateMerchantSelect())
            .catch(() => {});
    }
    modal.classList.remove('hidden');
};

window.closeProductImportModal = () => {
    const modal = document.getElementById('productImportModal');
    if (modal) modal.classList.add('hidden');
};

window.onProductImportFileChange = async (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const label = document.getElementById('productImportFileName');
    productSetSummary('');
    productSetErrors([]);
    productImportRows = [];
    productSetRunEnabled(false);
    if (!file) {
        if (label) label.textContent = 'اختر ملف المنتجات (xlsx / xls)';
        return;
    }
    if (label) label.textContent = file.name;
    productSetStatus('جاري تحليل الملف...', false);
    try {
        const result = await productParseSpreadsheet(file);
        const rows = (result && result.rows) || [];
        const errors = (result && result.errors) || [];
        if (errors.length) {
            /* Whole-sheet rejection: no partial imports. */
            productImportRows = [];
            productSetStatus('الملف مرفوض — صحّح الأخطاء ثم أعد المحاولة', true);
            productSetSummary('');
            productSetErrors(errors);
            return;
        }
        productImportRows = rows;
        const productCount = rows.length;
        const variantCount = rows.reduce((sum, r) => sum + (r.variations ? r.variations.length : 0), 0);
        const mapped = rows.reduce((sum, r) => sum + (r.variations || []).filter((v) => v.kanjo_value).length, 0);
        productSetStatus('تم قراءة ' + productFormatNumber(productCount) + ' منتج — الملف صالح للاستيراد', false);
        productSetSummary(
            '<div>المنتجات: <b>' + productFormatNumber(productCount) + '</b></div>'
            + '<div>الأحجام: <b>' + productFormatNumber(variantCount) + '</b></div>'
            + '<div>أحجام مُطابَقة بمعرّف قياسي: <b>' + productFormatNumber(mapped) + '</b></div>'
        );
        productSetRunEnabled(productCount > 0);
    } catch (err) {
        console.error('[product-import] parse failed:', err);
        productSetStatus(err && err.message === 'XLSX_NOT_LOADED'
            ? 'مكتبة إكسل غير محمّلة، حدّث الصفحة'
            : 'تعذّر قراءة الملف، تأكد من الصيغة', true);
    } finally {
        if (input) input.value = '';
    }
};

const productCommitEntries = async (entries) => {
    const collectionRef = window.collection(window.db, PRODUCT_IMPORT_COLLECTION);
    let saved = 0;
    for (let i = 0; i < entries.length; i += PRODUCT_IMPORT_CHUNK) {
        const chunk = entries.slice(i, i + PRODUCT_IMPORT_CHUNK);
        const batch = window.writeBatch(window.db);
        chunk.forEach((entry) => batch.set(window.doc(collectionRef, entry.id), entry.data));
        await batch.commit();
        saved += chunk.length;
        if (typeof window.catalogApplyCreatedProductLocally === 'function') {
            chunk.forEach((entry) => window.catalogApplyCreatedProductLocally(
                Object.assign({ id: entry.id }, entry.data), { silent: true }
            ));
        }
        productSetStatus('جاري الحفظ... ' + productFormatNumber(saved) + ' / ' + productFormatNumber(entries.length), false);
    }
    return saved;
};

window.runProductImport = async () => {
    if (productImportBusy) return;
    if (!window.isProductImportUser()) {
        if (window.showToast) window.showToast('هذه الشاشة غير مصرّح لك بها', false);
        return;
    }
    const merchantId = ((document.getElementById('productImportMerchant') || {}).value || '').trim();
    const merchant = productImportMerchantMap[merchantId];
    if (!merchant) {
        if (window.showToast) window.showToast('اختر التاجر أولاً', false);
        return;
    }
    const repName = ((document.getElementById('productImportRep') || {}).value || '').trim();
    if (!repName) {
        if (window.showToast) window.showToast('اختر المندوب صاحب المجهود', false);
        return;
    }
    if (!productImportRows.length) {
        if (window.showToast) window.showToast('اختر ملف المنتجات الصالح أولاً', false);
        return;
    }
    const entries = window.productImportBuildEntries(productImportRows, merchant, repName);
    if (!entries.length) {
        if (window.showToast) window.showToast('لا توجد منتجات صالحة للاستيراد', false);
        return;
    }
    const btn = document.getElementById('productImportRunBtn');
    productImportBusy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الاستيراد...'; }
    try {
        const saved = await productCommitEntries(entries);
        productSetStatus('تم استيراد ' + productFormatNumber(saved) + ' منتج بنجاح باسم ' + repName, false);
        if (typeof window.renderCatalogWidgets === 'function') {
            try { window.renderCatalogWidgets(); } catch (_) { /* ignore */ }
        }
        if (window.showToast) window.showToast('تم استيراد ' + productFormatNumber(saved) + ' منتج بنجاح');
    } catch (err) {
        console.error('[product-import] commit failed:', err);
        productSetStatus('فشل الاستيراد، حاول مرة أخرى', true);
        if (window.showToast) window.showToast('فشل الاستيراد، حاول مرة أخرى', false);
    } finally {
        productImportBusy = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> استيراد المنتجات'; }
    }
};

export {};
