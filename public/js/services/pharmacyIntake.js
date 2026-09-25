/* Kanjo Ops — Pharmacy Inventory Intake (Phase 1)
 * =====================================================================
 * Restricted to the Data-Entry operator only (hidden from founders,
 * admins, Mahmoud and every other role). Reads a pharmacy inventory sheet
 * (Excel / CSV via SheetJS, basic pdf.js fallback), fuzzy-matches each
 * "Item Name" against the enriched medical catalog in memory (Fuse.js),
 * copies every matched catalog image into the selected pharmacy's Google
 * Drive folder through the catalog Apps Script (imageType:'copy_from_url'),
 * and write-batches the merged products into `merchant_products` so they
 * appear in the existing catalog UI exactly like a standard rep upload.
 *
 * Cost model: ZERO Firestore reads. The sheet + catalog are parsed in the
 * browser; Firestore only receives the final writeBatch.
 *
 * Phase 1 intentionally does NOT include the Founder Manual Audit UI.
 */

const PHARMACY_INTAKE_COLLECTION = 'merchant_products';
const PHARMACY_INTAKE_CATALOG_URL = 'data/Kanjo_Enriched_Medical_Catalog.json';
const PHARMACY_INTAKE_CATALOG_CACHE_KEY = 'pharmacyIntake:catalog';
const PHARMACY_INTAKE_CATALOG_TTL = 30 * 60 * 1000;
const PHARMACY_INTAKE_MATCH_THRESHOLD = 0.4;
const PHARMACY_INTAKE_PRICE_FIELDS = ['public_price', 'publicPrice', 'price', 'sellingPrice', 'current_price', 'base_price'];

/* Parsed sheet rows: [{ rowNumber, code, name, price }] */
let intakeRows = [];
/* Merged match results: [{ row, match, score, include, newImageUrl, error }] */
let intakeMatched = [];
/* In-memory catalog index (normalized entries). */
let intakeCatalogIndex = [];
/* Manual JSON override (used when the auto-fetch path is unavailable). */
let intakeCatalogOverride = null;
let intakeFuse = null;
let intakeBusy = false;
/* merchantId -> eligible merchant record, built while populating the picker. */
let intakeMerchantMap = {};

/* ──────────────────────────── ACCESS ───────────────────────────────── */

window.isPharmacyIntakeUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    /* Data-Entry-only module. Founders, admins, accounting, reps and the
       Mahmoud operator must never see or operate this widget, so any
       non-data-entry role is rejected up front. */
    const role = String(u.role || '').toLowerCase();
    if (role && role !== 'data_entry') return false;
    if (role === 'data_entry') return true;
    if (typeof window.isDataEntryUser === 'function' && window.isDataEntryUser()) return true;
    /* Last-resort fallback: the dedicated data-entry operator PIN. */
    return String(u.pin == null ? '' : u.pin) === '2468';
};

/* ──────────────────────────── HELPERS ──────────────────────────────── */

const intakeEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* Convert Eastern Arabic (٠-٩) and Persian (۰-۹) digits to ASCII so a sheet
   exported from an Arabic system still parses. */
const normalizeIntakeDigits = (value) => String(value == null ? '' : value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const parseIntakePrice = (value) => {
    const normalized = normalizeIntakeDigits(value).replace(/[^\d.]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
};

const intakeFormatNumber = (value) => {
    const text = String(value == null ? '' : value);
    return (typeof window.toArabicNumerals === 'function') ? window.toArabicNumerals(text) : text;
};

const normalizeIntakeMatchKey = (value) => String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const intakePick = (item, keys) => {
    if (!item || typeof item !== 'object') return '';
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
            return item[key];
        }
    }
    return '';
};

const readIntakeFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
});

const readIntakeFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsText(file);
});

const intakeExtractArray = (parsed) => {
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return [];
    const keys = ['products', 'items', 'data', 'results', 'catalog', 'records', 'medicines', 'drugs'];
    for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(parsed[keys[i]])) return parsed[keys[i]];
    }
    return [];
};

const generateIntakeSku = () => 'KJ-PRD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

/* ──────────────────────── SHEET PARSING ────────────────────────────── */

const INTAKE_HEADER_HINTS = {
    code: ['code', 'كود', 'الباركود', 'باركود', 'barcode', 'sku', 'id', 'الكود', 'رقم'],
    name: ['name', 'item', 'product', 'اسم', 'الصنف', 'صنف', 'المنتج', 'البيان', 'بيان', 'دواء', 'medicine'],
    price: ['price', 'سعر', 'public', 'السعر', 'الجمهور', 'جمهور']
};

const intakeCellMatches = (cell, hints) => {
    const text = normalizeIntakeDigits(cell).toLowerCase().trim();
    if (!text) return false;
    return hints.some((hint) => text.indexOf(hint) !== -1);
};

/* Find a header row in the first few rows; fall back to positional columns. */
const intakeDetectColumns = (matrix) => {
    const limit = Math.min(matrix.length, 6);
    for (let r = 0; r < limit; r++) {
        const row = matrix[r] || [];
        let codeIdx = -1;
        let nameIdx = -1;
        let priceIdx = -1;
        for (let c = 0; c < row.length; c++) {
            if (nameIdx === -1 && intakeCellMatches(row[c], INTAKE_HEADER_HINTS.name)) nameIdx = c;
            else if (priceIdx === -1 && intakeCellMatches(row[c], INTAKE_HEADER_HINTS.price)) priceIdx = c;
            else if (codeIdx === -1 && intakeCellMatches(row[c], INTAKE_HEADER_HINTS.code)) codeIdx = c;
        }
        if (nameIdx !== -1 && (priceIdx !== -1 || codeIdx !== -1)) {
            return { headerRow: r, codeIdx, nameIdx, priceIdx };
        }
    }
    return { headerRow: -1, codeIdx: 0, nameIdx: 1, priceIdx: 2 };
};

const intakeRowsFromMatrix = (matrix) => {
    if (!Array.isArray(matrix) || !matrix.length) return [];
    const cols = intakeDetectColumns(matrix);
    const start = cols.headerRow >= 0 ? cols.headerRow + 1 : 0;
    const rows = [];
    for (let r = start; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const name = String(row[cols.nameIdx] == null ? '' : row[cols.nameIdx]).trim();
        if (!name) continue;
        const code = cols.codeIdx >= 0 ? String(row[cols.codeIdx] == null ? '' : row[cols.codeIdx]).trim() : '';
        const price = cols.priceIdx >= 0 ? parseIntakePrice(row[cols.priceIdx]) : 0;
        rows.push({ rowNumber: r + 1, code, name, price });
    }
    return rows;
};

const loadPdfJs = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = () => reject(new Error('PDFJS_LOAD_FAILED'));
    document.head.appendChild(script);
});

/* Basic pdf.js text extraction: group text items into visual lines, then split
   each line into (code, name, price) using the trailing number as the price. */
const intakeParsePdf = async (file) => {
    const pdfjs = await loadPdfJs();
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buffer = await readIntakeFileAsArrayBuffer(file);
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const rows = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        const lines = [];
        let currentLine = [];
        let lastY = null;
        content.items.forEach((item) => {
            const y = Math.round((item.transform && item.transform[5]) || 0);
            if (lastY === null || Math.abs(y - lastY) <= 2) {
                currentLine.push(item.str);
            } else {
                lines.push(currentLine.join(' '));
                currentLine = [item.str];
            }
            lastY = y;
        });
        if (currentLine.length) lines.push(currentLine.join(' '));
        lines.forEach((line) => {
            const clean = line.replace(/\s+/g, ' ').trim();
            if (!clean) return;
            const match = clean.match(/^(\S+)\s+(.+?)\s+([\d.,]+)$/);
            if (match) {
                rows.push({ rowNumber: rows.length + 1, code: match[1], name: match[2].trim(), price: parseIntakePrice(match[3]) });
            } else {
                rows.push({ rowNumber: rows.length + 1, code: '', name: clean, price: 0 });
            }
        });
    }
    return rows.filter((row) => row.name);
};

window.parsePharmacyIntakeSheet = async (file) => {
    const lower = String((file && file.name) || '').toLowerCase();
    if (lower.endsWith('.pdf')) return intakeParsePdf(file);
    if (!window.XLSX) throw new Error('XLSX_NOT_LOADED');
    const buffer = await readIntakeFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return intakeRowsFromMatrix(matrix);
};

/* ──────────────────────── CATALOG INDEX ────────────────────────────── */

const intakeNormalizeCatalogItem = (item) => {
    const nameEn = String(intakePick(item, ['name_en', 'english_name', 'nameEnglish', 'name_english']) || '').trim();
    const nameAr = String(intakePick(item, ['name_ar', 'arabic_name', 'nameArabic', 'name_arabic']) || '').trim();
    const fallbackName = String(intakePick(item, ['name', 'title', 'product_name', 'productName']) || '').trim();
    return {
        name: fallbackName || nameAr || nameEn,
        name_ar: nameAr || fallbackName,
        name_en: nameEn,
        image_url: String(intakePick(item, ['image_url', 'imageUrl', 'main_image', 'mainImage', 'image', 'thumbnail', 'img', 'photo']) || '').trim(),
        category: String(intakePick(item, ['category', 'cat', 'sub_category', 'subCategory']) || '').trim(),
        sku: String(intakePick(item, ['sku', 'barcode', 'gtin', 'ean', 'code', 'id']) || '').trim(),
        /* Descriptions come from the enriched catalog only. The generic
           `description` falls back to the Arabic slot; the English slot requires
           an explicit English key. */
        description_ar: String(intakePick(item, ['description_ar', 'descriptionAr', 'description_arabic', 'descriptionArabic', 'description', 'desc', 'details', 'usage']) || '').trim(),
        description_en: String(intakePick(item, ['description_en', 'descriptionEn', 'description_english', 'descriptionEnglish']) || '').trim(),
        public_price: parseIntakePrice(intakePick(item, PHARMACY_INTAKE_PRICE_FIELDS))
    };
};

const normalizeIntakeCatalog = (parsed) => intakeExtractArray(parsed)
    .map(intakeNormalizeCatalogItem)
    .filter((item) => item.name);

const intakeGetCatalogIndex = async (force) => {
    if (intakeCatalogOverride) return intakeCatalogOverride;
    if (intakeCatalogIndex.length && !force) return intakeCatalogIndex;
    const loader = async () => {
        const url = window.KANJO_ENRICHED_CATALOG_URL || PHARMACY_INTAKE_CATALOG_URL;
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error('CATALOG_FETCH_' + response.status);
        const parsed = await response.json();
        return normalizeIntakeCatalog(parsed);
    };
    if (window.kanjoCache && typeof window.kanjoCache.get === 'function') {
        intakeCatalogIndex = await window.kanjoCache.get(
            PHARMACY_INTAKE_CATALOG_CACHE_KEY,
            PHARMACY_INTAKE_CATALOG_TTL,
            loader,
            !!force
        );
    } else {
        intakeCatalogIndex = await loader();
    }
    return intakeCatalogIndex;
};

const intakeBuildFuse = () => {
    if (!window.Fuse || !intakeCatalogIndex.length) return null;
    return new window.Fuse(intakeCatalogIndex, {
        includeScore: true,
        threshold: PHARMACY_INTAKE_MATCH_THRESHOLD,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
            { name: 'name', weight: 0.6 },
            { name: 'name_ar', weight: 0.25 },
            { name: 'name_en', weight: 0.15 }
        ]
    });
};

const intakeExactMatch = (name) => {
    const key = normalizeIntakeMatchKey(name);
    if (!key) return null;
    return intakeCatalogIndex.find((item) => normalizeIntakeMatchKey(item.name) === key) || null;
};

/* ──────────────────────── UI: RENDER / WIDGET ──────────────────────── */

/* This module handles pharmacy stock only, so the picker is restricted to the
   "صيدليات وعناية شخصية" category. Matching on the Arabic stem (rather than the
   exact decorated label) keeps it working with/without the leading emoji and
   with minor naming variations. */
const INTAKE_PHARMACY_CATEGORY_KEYWORDS = ['صيدل', 'عناية شخصية'];
const intakeIsPharmacyMerchant = (merchant) => {
    if (!merchant) return false;
    const type = String(merchant.category || merchant.cat || merchant.type || merchant.merchantType || '');
    return INTAKE_PHARMACY_CATEGORY_KEYWORDS.some((kw) => type.indexOf(kw) !== -1);
};

const intakePopulatePharmacySelect = () => {
    const select = document.getElementById('pharmacyIntakeMerchant');
    if (!select || typeof window.listFinalizedMerchants !== 'function') return;
    const current = select.value;
    let merchants = [];
    try { merchants = window.listFinalizedMerchants() || []; } catch (err) { merchants = []; }
    intakeMerchantMap = {};
    const options = [];
    merchants.forEach((merchant) => {
        /* Pharmacy-only: drop restaurants, supermarkets and every other
           category the catalog picker may return. */
        if (!intakeIsPharmacyMerchant(merchant)) return;
        /* The catalog picker returns { merchantId, merchantName, category,
           vipPreContract }; fall back to the raw Firestore keys so a shape
           change can never blank the dropdown. */
        const id = String(merchant.merchantId || merchant.id || merchant.merchant_id || '').trim();
        const name = String(merchant.merchantName || merchant.name || id).trim();
        if (!id || !name) return;
        intakeMerchantMap[id] = merchant;
        const vip = merchant.vipPreContract ? ' (VIP)' : '';
        options.push('<option value="' + intakeEscapeHtml(id) + '">' + intakeEscapeHtml(name) + vip + '</option>');
    });
    if (!options.length) {
        select.innerHTML = '<option value="">لا توجد صيدليات مؤهلة بعد</option>';
        return;
    }
    select.innerHTML = '<option value="">اختر الصيدلية...</option>' + options.join('');
    if (current) select.value = current;
};

/* The finalized-merchants read is field-masked and asynchronous. On boot the
   widget can render before the read resolves, leaving the picker empty even
   though the cache later fills (the exact regression this fixes). Re-run the
   populate step once the shared cache is ready; the load is idempotent so this
   never issues a duplicate Firestore read. */
const intakeEnsurePharmacyOptionsLoaded = () => {
    if (Array.isArray(window.finalizedMerchantsCache) && window.finalizedMerchantsCache.length) return;
    if (typeof window.ensureFinalizedMerchantsLoaded !== 'function') return;
    Promise.resolve(window.ensureFinalizedMerchantsLoaded())
        .then(() => intakePopulatePharmacySelect())
        .catch(() => {});
};

const intakeCatalogStatusText = () => {
    const el = document.getElementById('pharmacyIntakeCatalogStatus');
    if (!el) return;
    if (intakeCatalogOverride) {
        el.textContent = 'تم تحميل ' + intakeCatalogOverride.length + ' صنف من ملف يدوي';
    } else if (intakeCatalogIndex.length) {
        el.textContent = 'الكتالوج الطبي محمّل: ' + intakeCatalogIndex.length + ' صنف';
    } else {
        el.textContent = 'لم يتم تحميل الكتالوج الطبي بعد';
    }
};

window.renderPharmacyIntakeWidget = () => {
    const widget = document.getElementById('pharmacyIntakeWidget');
    if (!widget) return;
    const canUse = window.isPharmacyIntakeUser();
    widget.classList.toggle('hidden', !canUse);
    if (!canUse) return;
    intakePopulatePharmacySelect();
    intakeEnsurePharmacyOptionsLoaded();
    intakeCatalogStatusText();
};

window.onPharmacyIntakeFileChange = (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const label = document.getElementById('pharmacyIntakeFileName');
    if (label) label.textContent = file ? file.name : 'اختر ملف المخزون (xlsx / xls / csv / pdf)';
};

window.onPharmacyCatalogFileChange = async (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    const label = document.getElementById('pharmacyIntakeCatalogFileName');
    if (label) label.textContent = file.name;
    try {
        const text = await readIntakeFileAsText(file);
        const parsed = JSON.parse(text);
        const items = normalizeIntakeCatalog(parsed);
        if (!items.length) throw new Error('EMPTY_CATALOG');
        intakeCatalogOverride = items;
        intakeCatalogIndex = items;
        intakeCatalogStatusText();
        intakeFuse = intakeBuildFuse();
        window.showToast('تم تحميل الكتالوج الطبي (' + items.length + ' صنف)');
    } catch (err) {
        console.error('[pharmacy-intake] catalog file failed:', err);
        intakeCatalogOverride = null;
        intakeCatalogIndex = [];
        intakeFuse = null;
        intakeCatalogStatusText();
        window.showToast('تعذّر قراءة ملف الكتالوج', false);
    } finally {
        if (input) input.value = '';
    }
};

/* ──────────────────────── MATCHING ─────────────────────────────────── */

const intakeSetStatus = (text) => {
    const el = document.getElementById('pharmacyIntakeStatus');
    if (el) el.textContent = text || '';
};

const intakeRenderPreview = () => {
    const wrap = document.getElementById('pharmacyIntakePreviewWrap');
    const body = document.getElementById('pharmacyIntakePreviewBody');
    const summary = document.getElementById('pharmacyIntakeSummary');
    if (!wrap || !body) return;
    const matchedCount = intakeMatched.filter((m) => m.match).length;
    const imageCount = intakeMatched.filter((m) => m.match && m.match.image_url).length;
    const selectedCount = intakeMatched.filter((m) => m.include).length;
    if (summary) {
        summary.textContent = 'إجمالي ' + intakeFormatNumber(intakeRows.length)
            + ' صنف — مطابق ' + intakeFormatNumber(matchedCount)
            + ' — بصور ' + intakeFormatNumber(imageCount)
            + ' — محدد للرفع ' + intakeFormatNumber(selectedCount);
    }
    body.innerHTML = intakeMatched.map((m, index) => {
        const matchName = m.match ? intakeEscapeHtml(m.match.name) : '<span class="text-red-500">غير مطابق</span>';
        const confidence = m.match && typeof m.score === 'number'
            ? intakeFormatNumber(Math.round((1 - m.score) * 100)) + '%'
            : '—';
        const imageCell = m.newImageUrl
            ? '<span class="text-emerald-600">تم النسخ</span>'
            : (m.match && m.match.image_url
                ? '<span class="text-slate-400">جاهزة</span>'
                : '<span class="text-slate-300">لا توجد</span>');
        const errorCell = m.error ? '<div class="text-red-500">' + intakeEscapeHtml(m.error) + '</div>' : '';
        return '<tr class="border-b border-purple-50">'
            + '<td class="p-2 text-center"><input type="checkbox" class="accent-[#230535]" ' + (m.include ? 'checked' : '') + ' onchange="pharmacyIntakeToggleRow(' + index + ', this.checked)"></td>'
            + '<td class="p-2">' + intakeEscapeHtml(m.row.code) + '</td>'
            + '<td class="p-2">' + intakeEscapeHtml(m.row.name) + '</td>'
            + '<td class="p-2">' + intakeFormatNumber(m.row.price) + '</td>'
            + '<td class="p-2">' + matchName + ' <span class="text-slate-400">(' + confidence + ')</span>' + errorCell + '</td>'
            + '<td class="p-2">' + imageCell + '</td>'
            + '</tr>';
    }).join('');
    wrap.classList.remove('hidden');
    const all = document.getElementById('pharmacyIntakeSelectAll');
    if (all) all.checked = intakeMatched.length > 0 && selectedCount === intakeMatched.length;
};

window.pharmacyIntakeToggleRow = (index, checked) => {
    const m = intakeMatched[index];
    if (!m) return;
    m.include = !!checked;
    intakeRenderPreview();
};

window.pharmacyIntakeToggleAll = (checked) => {
    intakeMatched.forEach((m) => { m.include = !!checked; });
    intakeRenderPreview();
};

window.runPharmacyIntakeMatching = async () => {
    if (intakeBusy) return;
    if (!window.isPharmacyIntakeUser()) {
        window.showToast('هذه الشاشة متاحة لإدخال البيانات والإدارة فقط', false);
        return;
    }
    const merchantId = ((document.getElementById('pharmacyIntakeMerchant') || {}).value || '').trim();
    const fileInput = document.getElementById('pharmacyIntakeFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!merchantId) {
        window.showToast('اختر الصيدلية أولاً', false);
        return;
    }
    if (!file) {
        window.showToast('اختر ملف المخزون أولاً', false);
        return;
    }
    const matchBtn = document.getElementById('pharmacyIntakeMatchBtn');
    const syncBtn = document.getElementById('pharmacyIntakeSyncBtn');
    intakeBusy = true;
    if (matchBtn) matchBtn.disabled = true;
    if (syncBtn) syncBtn.disabled = true;
    intakeSetStatus('جاري تحليل الملف...');
    try {
        intakeRows = await window.parsePharmacyIntakeSheet(file);
        if (!intakeRows.length) {
            intakeMatched = [];
            intakeRenderPreview();
            window.showToast('لم يتم العثور على أصناف صالحة في الملف', false);
            return;
        }
        intakeSetStatus('جاري تحميل الكتالوج الطبي...');
        if (!intakeCatalogIndex.length) {
            try {
                await intakeGetCatalogIndex(false);
            } catch (err) {
                console.error('[pharmacy-intake] catalog load failed:', err);
                intakeCatalogStatusText();
                window.showToast('ارفع ملف الكتالوج الطبي أولاً', false);
                return;
            }
        }
        if (!intakeCatalogIndex.length) {
            intakeCatalogStatusText();
            window.showToast('ارفع ملف الكتالوج الطبي أولاً', false);
            return;
        }
        intakeSetStatus('جاري بناء فهرس المطابقة...');
        /* Let the status text paint before the synchronous Fuse index build. */
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!intakeFuse) intakeFuse = intakeBuildFuse();
        intakeMatched = intakeRows.map((row) => {
            let match = null;
            let score = null;
            if (intakeFuse) {
                const results = intakeFuse.search(row.name);
                if (results.length) {
                    match = results[0].item;
                    score = typeof results[0].score === 'number' ? results[0].score : null;
                }
            } else {
                match = intakeExactMatch(row.name);
                score = match ? 0 : null;
            }
            /* Every sheet row is imported by default: matched rows are enriched
               from the catalog, unmatched rows keep empty descriptions. */
            return { row, match, score, include: true, newImageUrl: '', error: '' };
        });
        intakeRenderPreview();
        const matchedCount = intakeMatched.filter((m) => m.match).length;
        intakeSetStatus('تم تحليل ' + intakeFormatNumber(intakeRows.length) + ' صنف، ومطابقة ' + intakeFormatNumber(matchedCount) + '. راجع ثم ارفع.');
        if (syncBtn) syncBtn.disabled = intakeMatched.length === 0;
    } catch (err) {
        console.error('[pharmacy-intake] parse failed:', err);
        window.showToast('تعذّر تحليل الملف، تأكد من الصيغة', false);
        intakeSetStatus('');
    } finally {
        intakeBusy = false;
        if (matchBtn) matchBtn.disabled = false;
    }
};

/* ──────────────────────── SYNC / BATCH WRITE ───────────────────────── */

const intakeBuildPayload = (m, merchant, newImageUrl) => {
    const catalog = m.match || null;
    const nameAr = String(m.row.name || '').trim() || (catalog ? String(catalog.name_ar || catalog.name || '').trim() : '');
    const nameEn = catalog ? (String(catalog.name_en || '').trim() || nameAr) : nameAr;
    const sku = String(m.row.code || '').trim() || (catalog ? String(catalog.sku || '').trim() : '') || generateIntakeSku();
    const category = (catalog ? String(catalog.category || '').trim() : '') || String(merchant.category || '').trim();
    const price = Number(m.row.price) || (catalog ? Number(catalog.public_price) : 0) || 0;
    /* Descriptions come from the enriched catalog for MATCHED rows only.
       UNMATCHED rows keep both description fields strictly empty. */
    return {
        merchantId: merchant.merchantId,
        merchantName: merchant.merchantName,
        name_ar: nameAr,
        name_en: nameEn,
        description_ar: catalog ? String(catalog.description_ar || '').trim() : '',
        description_en: catalog ? String(catalog.description_en || '').trim() : '',
        sku,
        product_type: 'simple',
        base_price: price,
        category,
        rawImageUrl: newImageUrl || '',
        rawImageUrls: newImageUrl ? [newImageUrl] : [],
        enhancedImageUrl: '',
        enhancedImageUrls: [],
        status: 'pending',
        is_active: true,
        intakeSource: 'pharmacy_inventory_intake',
        rawSourceImageUrl: catalog ? String(catalog.image_url || '') : '',
        createdBy: (window.currentUser && window.currentUser.name) || '',
        createdAt: new Date(),
        syncedFromDraft: true
    };
};

const intakeCommitBatches = async (payloads) => {
    const collectionRef = window.collection(window.db, PHARMACY_INTAKE_COLLECTION);
    let saved = 0;
    for (let i = 0; i < payloads.length; i += 400) {
        const chunk = payloads.slice(i, i + 400);
        const batch = window.writeBatch(window.db);
        chunk.forEach((payload) => batch.set(window.doc(collectionRef), payload));
        await batch.commit();
        saved += chunk.length;
    }
    return saved;
};

window.syncPharmacyIntakeProducts = async () => {
    if (intakeBusy) return;
    if (!window.isPharmacyIntakeUser()) {
        window.showToast('هذه الشاشة متاحة لإدخال البيانات والإدارة فقط', false);
        return;
    }
    const merchantId = ((document.getElementById('pharmacyIntakeMerchant') || {}).value || '').trim();
    const merchant = intakeMerchantMap[merchantId] || (window._catalogMerchantMap && window._catalogMerchantMap[merchantId]);
    const selected = intakeMatched.filter((m) => m.include);
    if (!merchant) {
        window.showToast('اختر الصيدلية أولاً', false);
        return;
    }
    if (!selected.length) {
        window.showToast('لا توجد أصناف محددة للرفع', false);
        return;
    }
    const matchBtn = document.getElementById('pharmacyIntakeMatchBtn');
    const syncBtn = document.getElementById('pharmacyIntakeSyncBtn');
    intakeBusy = true;
    if (matchBtn) matchBtn.disabled = true;
    if (syncBtn) { syncBtn.disabled = true; syncBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري النسخ...'; }
    let copied = 0;
    let copyFailed = 0;
    try {
        const payloads = [];
        for (let i = 0; i < selected.length; i++) {
            const m = selected[i];
            intakeSetStatus('نسخ الصور ' + intakeFormatNumber(i + 1) + ' / ' + intakeFormatNumber(selected.length) + '...');
            let newImageUrl = '';
            const sourceUrl = (m.match && m.match.image_url) ? m.match.image_url : '';
            if (sourceUrl) {
                try {
                    const fileName = 'pharmacy-' + (String(m.row.code || '').trim() || (i + 1)) + '.jpg';
                    newImageUrl = await window.copyCatalogImageFromUrl(sourceUrl, fileName, merchant.merchantName);
                    m.newImageUrl = newImageUrl;
                    m.error = '';
                    copied++;
                } catch (err) {
                    console.error('[pharmacy-intake] image copy failed:', err);
                    m.error = 'تعذّر نسخ الصورة';
                    copyFailed++;
                }
            }
            payloads.push(intakeBuildPayload(m, merchant, newImageUrl));
            if (i % 5 === 0 || i === selected.length - 1) intakeRenderPreview();
        }
        intakeSetStatus('حفظ ' + intakeFormatNumber(payloads.length) + ' منتج...');
        const saved = await intakeCommitBatches(payloads);
        if (typeof window.kpiInvalidateProductCache === 'function') window.kpiInvalidateProductCache();
        intakeSetStatus('تم حفظ ' + intakeFormatNumber(saved) + ' منتج'
            + (copied ? ' — نُسخت ' + intakeFormatNumber(copied) + ' صورة' : '')
            + (copyFailed ? ' — فشل ' + intakeFormatNumber(copyFailed) + ' صورة' : '') + '.');
        window.showToast('تم رفع ' + intakeFormatNumber(saved) + ' منتج بنجاح');
    } catch (err) {
        console.error('[pharmacy-intake] sync failed:', err);
        intakeSetStatus('فشل الرفع، حاول مرة أخرى.');
        window.showToast('فشل رفع المخزون، حاول مرة أخرى', false);
    } finally {
        intakeBusy = false;
        if (matchBtn) matchBtn.disabled = false;
        if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> رفع ونسخ الصور'; }
    }
};
