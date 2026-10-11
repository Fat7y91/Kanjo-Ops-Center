/* Kanjo Ops — Data-Entry Menu Excel Importer
 * =====================================================================
 * Restricted to the Data-Entry operator only (PIN/Role 2468); hidden from
 * founders, admins, reps and every other role.
 *
 * The operator picks a target merchant and uploads an Arabic menu sheet. The
 * sheet is parsed ENTIRELY in the browser (SheetJS) — the raw headers are
 * `القسم`, `الصنف`, `المكونات` and the size/price pairs `الحجم ١/السعر ١` …
 * `الحجم ٣/السعر ٣` (Arabic-Indic numerals). Each row becomes a standard
 * `merchant_products` document; every size is run through the SAME alias
 * dictionary the Kanjo export uses (KANJO_ALIAS_MAPPINGS via
 * window.kanjoMapVariantToKanjo) so it is stored with its standard Dashboard
 * Template value (e.g. `ID:1 | ATTR:1 | صغير`) before it ever reaches the queue.
 *
 * Cost model: ZERO Firestore reads beyond the cached merchant picker. The new
 * products are committed with `writeBatch` in chunks of 500 and folded into the
 * already-loaded catalog caches, so nothing needs to be re-read.
 */

const MENU_IMPORT_COLLECTION = 'merchant_products';
const MENU_IMPORT_PIN = '2468';
/* Firestore caps a batch at 500 writes; the spec asks for 500 per chunk. */
const MENU_IMPORT_CHUNK = 500;
/* `pending` puts every imported row into the content editor's (Youssef) queue;
   it is the same default the rep and pharmacy create paths use. */
const MENU_IMPORT_STATUS = 'pending';
const MENU_IMPORT_SOURCE = 'menu_excel_import';
const MENU_IMPORT_HEADER_SCAN_ROWS = 15;
const MENU_IMPORT_MAX_VARIANTS = 3;

let menuImportRows = [];
let menuImportMerchantMap = {};
let menuImportBusy = false;

/* ──────────────────────────── ACCESS ───────────────────────────────── */

window.isMenuImportUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    const pin = String(u.pin == null ? (u.pinCode == null ? '' : u.pinCode) : u.pin).trim();
    if (pin) return pin === MENU_IMPORT_PIN;
    const role = String(u.role || '').toLowerCase();
    if (role) return role === 'data_entry';
    if (typeof window.isDataEntryUser === 'function' && window.isDataEntryUser()) return true;
    return false;
};

/* ──────────────────────────── HELPERS ──────────────────────────────── */

const menuEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* Eastern-Arabic (٠-٩) and Persian (۰-۹) digits -> ASCII so an Arabic-system
   export (including the ١/٢/٣ header suffixes) parses like a Latin sheet. */
const menuNormalizeDigits = (value) => String(value == null ? '' : value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const menuCellText = (value) => menuNormalizeDigits(value).replace(/\s+/g, ' ').trim();

/* Fold case, diacritics, tatweel, alef/ya/ta-marbuta forms and punctuation so
   "الحجم  ١ ", "الحجم1" and "حجم 1" all resolve to the same header token. */
const menuNormalizeHeader = (value) => menuCellText(value)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const menuNormalizeKey = (value) => menuNormalizeHeader(value).replace(/\s+/g, ' ');

const menuParsePrice = (value) => {
    const normalized = menuNormalizeDigits(value).replace(/[٫,]/g, '.').replace(/[^\d.]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
};

const menuFormatNumber = (value) => (typeof window.toArabicNumerals === 'function')
    ? window.toArabicNumerals(String(value))
    : String(value);

/* FNV-1a (32-bit) -> base36; deterministic, so the same row always maps to the
   same document id and a re-import overwrites instead of duplicating. */
const menuHashKey = (text) => {
    let hash = 0x811c9dc5;
    const value = String(text == null ? '' : text);
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
};

const menuSanitizeIdPart = (value) => String(value == null ? '' : value)
    .replace(/[\/\u0000-\u001F\u007F]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);

/* ──────────────────────── HEADER DETECTION ─────────────────────────── */

const MENU_CATEGORY_HEADERS = ['القسم', 'قسم', 'التصنيف', 'الاقسام'];
const MENU_NAME_HEADERS = ['الصنف', 'صنف', 'الاسم', 'اسم', 'المنتج', 'اسم المنتج', 'name'];
const MENU_DESCRIPTION_HEADERS = ['المكونات', 'مكونات', 'الوصف', 'وصف', 'التركيب', 'description'];

const menuHeaderRole = (raw) => {
    const token = menuNormalizeHeader(raw);
    if (!token) return null;
    if (MENU_CATEGORY_HEADERS.indexOf(token) !== -1) return { role: 'category' };
    if (MENU_NAME_HEADERS.indexOf(token) !== -1) return { role: 'name' };
    if (MENU_DESCRIPTION_HEADERS.indexOf(token) !== -1) return { role: 'description' };
    const size = /^(الحجم|حجم|size)\s*([1-9])$/.exec(token);
    if (size) return { role: 'size', index: Number(size[2]) };
    const price = /^(السعر|سعر|price)\s*([1-9])$/.exec(token);
    if (price) return { role: 'price', index: Number(price[2]) };
    return null;
};

/* Locate the header row and map role -> column index. A valid header row must
   carry the item name plus at least a category or a size column. */
const menuDetectColumns = (matrix) => {
    const limit = Math.min(matrix.length, MENU_IMPORT_HEADER_SCAN_ROWS);
    for (let r = 0; r < limit; r++) {
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const cols = { name: -1, category: -1, description: -1, sizes: {}, prices: {} };
        let hasSignal = false;
        for (let c = 0; c < row.length; c++) {
            const info = menuHeaderRole(row[c]);
            if (!info) continue;
            if (info.role === 'name' && cols.name === -1) { cols.name = c; hasSignal = true; }
            else if (info.role === 'category' && cols.category === -1) { cols.category = c; hasSignal = true; }
            else if (info.role === 'description' && cols.description === -1) { cols.description = c; }
            else if (info.role === 'size') cols.sizes[info.index] = c;
            else if (info.role === 'price') cols.prices[info.index] = c;
        }
        if (cols.name !== -1 && (cols.category !== -1 || Object.keys(cols.sizes).length)) {
            return { headerRow: r, cols };
        }
    }
    return null;
};

/* ──────────────────────── SHEET -> ROWS ────────────────────────────── */

const menuMapVariant = (sizeText) => {
    if (!sizeText) return null;
    if (typeof window.kanjoMapVariantToKanjo !== 'function') return null;
    const mapped = window.kanjoMapVariantToKanjo(sizeText, sizeText);
    return (Array.isArray(mapped) && mapped.length) ? mapped[0] : null;
};

/* Pure transform from a SheetJS matrix into importer rows. Exposed for tests. */
window.menuImportParseMatrix = (matrix) => {
    const detected = menuDetectColumns(Array.isArray(matrix) ? matrix : []);
    if (!detected) throw new Error('MENU_HEADER_NOT_FOUND');
    const { headerRow, cols } = detected;
    const rows = [];
    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const name = cols.name >= 0 ? menuCellText(row[cols.name]) : '';
        if (!name) continue;
        const category = cols.category >= 0 ? menuCellText(row[cols.category]) : '';
        const description = cols.description >= 0 ? menuCellText(row[cols.description]) : '';
        const variants = [];
        for (let i = 1; i <= MENU_IMPORT_MAX_VARIANTS; i++) {
            const sizeIdx = cols.sizes[i];
            if (sizeIdx == null) continue;
            const sizeRaw = menuCellText(row[sizeIdx]);
            if (!sizeRaw) continue;
            const priceIdx = cols.prices[i];
            const priceRaw = priceIdx == null ? '' : menuCellText(row[priceIdx]);
            const mapped = menuMapVariant(sizeRaw);
            variants.push({
                name: sizeRaw,
                price: menuParsePrice(priceRaw),
                image_url: '',
                kanjo_value: mapped ? mapped.value : '',
                kanjo_attribute: mapped ? mapped.name : ''
            });
        }
        rows.push({ rowNumber: r + 1, name, category, description, variants });
    }
    return rows;
};

const menuReadFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('MENU_FILE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
});

const menuParseSpreadsheet = async (file) => {
    if (!window.XLSX) throw new Error('XLSX_NOT_LOADED');
    const buffer = await menuReadFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) throw new Error('MENU_EMPTY_SHEET');
    const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    return window.menuImportParseMatrix(matrix);
};

/* ──────────────────────── ROWS -> DOCUMENTS ────────────────────────── */

const menuRowKey = (row) => menuNormalizeKey([
    row.name,
    row.category,
    row.variants.map((v) => v.name + '@' + v.price).join(',')
].join('|'));

const menuProductDocId = (merchantId, row) => menuSanitizeIdPart(merchantId) + '__mi-' + menuHashKey(menuRowKey(row));
const menuProductSku = (row) => 'KJ-MI-' + menuHashKey(menuRowKey(row));

/* Pure transform from parsed rows + merchant into `{ id, data }` entries ready
   for writeBatch. Exposed for tests. */
window.menuImportBuildEntries = (rows, merchant) => {
    if (!merchant || !merchant.merchantId) return [];
    const createdBy = (window.currentUser && window.currentUser.name) || '';
    return (Array.isArray(rows) ? rows : []).filter((row) => row && String(row.name || '').trim()).map((row) => {
        const variants = Array.isArray(row.variants) ? row.variants.filter((v) => v && String(v.name || '').trim()) : [];
        const isVariable = variants.length > 0;
        const data = {
            merchantId: merchant.merchantId,
            merchantName: merchant.merchantName,
            name_ar: row.name,
            name_en: row.name,
            description_ar: row.description || '',
            description_en: '',
            sku: menuProductSku(row),
            product_type: isVariable ? 'variable' : 'simple',
            base_price: isVariable ? Math.min(...variants.map((v) => Number(v.price) || 0)) : 0,
            /* `category` is the product's VENDOR TYPE (the merchant activity the
               export scopes the matcher by), NOT the menu row's section. The
               merchant's real activity wins; the sheet section is only a fallback
               when it is unknown. */
            category: String(merchant.category || '').trim() || row.category || '',
            rawImageUrl: '',
            rawImageUrls: [],
            enhancedImageUrl: '',
            enhancedImageUrls: [],
            status: MENU_IMPORT_STATUS,
            is_active: true,
            importSource: MENU_IMPORT_SOURCE,
            createdBy,
            createdAt: new Date(),
            syncedFromDraft: true
        };
        if (isVariable) {
            data.variations = variants.map((v) => ({
                name: v.name,
                price: Number(v.price) || 0,
                image_url: '',
                /* Standard Dashboard Template value resolved from the alias
                   dictionary so the size is already classified on save. */
                kanjo_value: v.kanjo_value || '',
                kanjo_attribute: v.kanjo_attribute || ''
            }));
        }
        return { id: menuProductDocId(merchant.merchantId, row), data };
    });
};

/* ──────────────────────── UI: RENDER / MODAL ───────────────────────── */

window.renderMenuImportNav = () => {
    const wrapper = document.getElementById('menuImportNavBtnWrapper');
    if (wrapper) wrapper.classList.toggle('hidden', !window.isMenuImportUser());
};

const menuPopulateMerchantSelect = () => {
    const select = document.getElementById('menuImportMerchant');
    if (!select || typeof window.listFinalizedMerchants !== 'function') return;
    const current = select.value;
    let merchants = [];
    try { merchants = window.listFinalizedMerchants() || []; } catch (err) { merchants = []; }
    menuImportMerchantMap = {};
    const entries = [];
    merchants.forEach((merchant) => {
        const id = String(merchant.merchantId || merchant.id || merchant.merchant_id || '').trim();
        const name = String(merchant.merchantName || merchant.name || id).trim();
        if (!id || !name) return;
        menuImportMerchantMap[id] = {
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
        + entries.map((e) => '<option value="' + menuEscapeHtml(e.id) + '">' + menuEscapeHtml(e.name) + '</option>').join('');
    if (current) select.value = current;
};

const menuSetStatus = (text, isError) => {
    const el = document.getElementById('menuImportStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('text-rose-600', !!isError);
    el.classList.toggle('text-slate-600', !isError);
};

const menuSetSummary = (html) => {
    const el = document.getElementById('menuImportSummary');
    if (!el) return;
    if (html) {
        el.innerHTML = html;
        el.classList.remove('hidden');
    } else {
        el.innerHTML = '';
        el.classList.add('hidden');
    }
};

const menuResetModalState = () => {
    menuImportRows = [];
    const file = document.getElementById('menuImportFile');
    if (file) file.value = '';
    const label = document.getElementById('menuImportFileName');
    if (label) label.textContent = 'اختر ملف المنيو (xlsx / xls / csv)';
    menuSetStatus('', false);
    menuSetSummary('');
};

window.openMenuImportModal = () => {
    if (!window.isMenuImportUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة لمستخدم إدخال البيانات فقط', false);
        return;
    }
    const modal = document.getElementById('menuImportModal');
    if (!modal) return;
    menuResetModalState();
    menuPopulateMerchantSelect();
    if (!Object.keys(menuImportMerchantMap).length && typeof window.ensureFinalizedMerchantsLoaded === 'function') {
        Promise.resolve(window.ensureFinalizedMerchantsLoaded())
            .then(() => menuPopulateMerchantSelect())
            .catch(() => {});
    }
    modal.classList.remove('hidden');
};

window.closeMenuImportModal = () => {
    const modal = document.getElementById('menuImportModal');
    if (modal) modal.classList.add('hidden');
};

window.onMenuImportFileChange = async (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const label = document.getElementById('menuImportFileName');
    menuSetSummary('');
    menuImportRows = [];
    if (!file) {
        if (label) label.textContent = 'اختر ملف المنيو (xlsx / xls / csv)';
        return;
    }
    if (label) label.textContent = file.name;
    menuSetStatus('جاري تحليل الملف...', false);
    try {
        const rows = await menuParseSpreadsheet(file);
        menuImportRows = rows;
        const productCount = rows.length;
        const variantCount = rows.reduce((sum, r) => sum + (r.variants ? r.variants.length : 0), 0);
        const mapped = rows.reduce((sum, r) => sum + (r.variants || []).filter((v) => v.kanjo_value).length, 0);
        menuSetStatus('تم قراءة ' + menuFormatNumber(productCount) + ' صنف', false);
        menuSetSummary(
            '<div>الأصناف: <b>' + menuFormatNumber(productCount) + '</b></div>'
            + '<div>المتغيرات: <b>' + menuFormatNumber(variantCount) + '</b></div>'
            + '<div>متغيرات مُطابَقة بمعرّف قياسي: <b>' + menuFormatNumber(mapped) + '</b></div>'
        );
    } catch (err) {
        console.error('[menu-import] parse failed:', err);
        menuSetStatus(err && err.message === 'MENU_HEADER_NOT_FOUND'
            ? 'تعذّر العثور على صف العناوين (القسم / الصنف) في الملف'
            : 'تعذّر قراءة الملف، تأكد من الصيغة', true);
    } finally {
        if (input) input.value = '';
    }
};

const menuCommitEntries = async (entries) => {
    const collectionRef = window.collection(window.db, MENU_IMPORT_COLLECTION);
    let saved = 0;
    for (let i = 0; i < entries.length; i += MENU_IMPORT_CHUNK) {
        const chunk = entries.slice(i, i + MENU_IMPORT_CHUNK);
        const batch = window.writeBatch(window.db);
        chunk.forEach((entry) => batch.set(window.doc(collectionRef, entry.id), entry.data));
        await batch.commit();
        saved += chunk.length;
        if (typeof window.catalogApplyCreatedProductLocally === 'function') {
            chunk.forEach((entry) => window.catalogApplyCreatedProductLocally(Object.assign({ id: entry.id }, entry.data)));
        }
        menuSetStatus('جاري الحفظ... ' + menuFormatNumber(saved) + ' / ' + menuFormatNumber(entries.length), false);
    }
    return saved;
};

window.runMenuImport = async () => {
    if (menuImportBusy) return;
    if (!window.isMenuImportUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة لمستخدم إدخال البيانات فقط', false);
        return;
    }
    const merchantId = ((document.getElementById('menuImportMerchant') || {}).value || '').trim();
    const merchant = menuImportMerchantMap[merchantId];
    if (!merchant) {
        if (window.showToast) window.showToast('اختر التاجر أولاً', false);
        return;
    }
    if (!menuImportRows.length) {
        if (window.showToast) window.showToast('اختر ملف المنيو أولاً', false);
        return;
    }
    const entries = window.menuImportBuildEntries(menuImportRows, merchant);
    if (!entries.length) {
        if (window.showToast) window.showToast('لا توجد أصناف صالحة للاستيراد', false);
        return;
    }
    const btn = document.getElementById('menuImportRunBtn');
    menuImportBusy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الاستيراد...'; }
    try {
        const saved = await menuCommitEntries(entries);
        menuSetStatus('تم استيراد ' + menuFormatNumber(saved) + ' منتج بنجاح', false);
        if (window.showToast) window.showToast('تم استيراد ' + menuFormatNumber(saved) + ' منتج بنجاح');
    } catch (err) {
        console.error('[menu-import] commit failed:', err);
        menuSetStatus('فشل الاستيراد، حاول مرة أخرى', true);
        if (window.showToast) window.showToast('فشل الاستيراد، حاول مرة أخرى', false);
    } finally {
        menuImportBusy = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-import"></i> استيراد المنتجات'; }
    }
};

export {};
