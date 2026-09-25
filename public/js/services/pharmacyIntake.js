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
/* One run-state document per pharmacy (`pharmacy_intake_runs/{merchantId}`).
   It records the document ids the last run targeted so an interrupted/partial
   intake can be reconciled and re-uploaded without duplicating rows. */
const PHARMACY_INTAKE_RUNS_COLLECTION = 'pharmacy_intake_runs';
const PHARMACY_INTAKE_CATALOG_URL = 'data/Kanjo_Enriched_Medical_Catalog.json';
const PHARMACY_INTAKE_CATALOG_CACHE_KEY = 'pharmacyIntake:catalog';
const PHARMACY_INTAKE_CATALOG_TTL = 30 * 60 * 1000;
const PHARMACY_INTAKE_MATCH_THRESHOLD = 0.4;
/* Rows normalized per macrotask while parsing the uploaded catalog. Bounded so
   a 14k+ item JSON never blocks the main thread long enough to freeze the tab. */
const PHARMACY_INTAKE_PARSE_CHUNK_SIZE = 1000;
/* Sheet rows fuzzy-matched per macrotask. Kept small because each row runs a
   Fuse.js search over the whole catalog and is the heavier phase. */
const PHARMACY_INTAKE_MATCH_CHUNK_SIZE = 50;
const PHARMACY_INTAKE_PRICE_FIELDS = [
    'public_price', 'publicPrice', 'price', 'sellingPrice', 'current_price', 'base_price',
    'السعر (EGP)', 'السعر', 'سعر', 'سعر الجمهور', 'الجمهور', 'السعر للجمهور'
];

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

/* Canonicalize an object key so Arabic and English headers that differ only by
   case, diacritics, tatweel, alef/ya/ta-marbuta form, punctuation or a
   parenthetical qualifier resolve to the same token:
     "كود المنتج (SKU)" -> "كود المنتج"
     "السعر (EGP)"      -> "السعر"
     "رابط الصورة (Drive)" -> "رابط الصورة" */
const intakeNormalizeKey = (key) => String(key == null ? '' : key)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\(（\[][^)）\]]*[\)）\]]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const intakeBuildKeyIndex = (item) => {
    const index = new Map();
    if (!item || typeof item !== 'object') return index;
    Object.keys(item).forEach((rawKey) => {
        const norm = intakeNormalizeKey(rawKey);
        if (norm && !index.has(norm)) index.set(norm, item[rawKey]);
    });
    return index;
};

/* Pick a field by normalized key, so Arabic headers map to the internal schema
   without hard-coding one exact spelling. */
const intakePickFromIndex = (index, keys) => {
    for (let i = 0; i < keys.length; i++) {
        const norm = intakeNormalizeKey(keys[i]);
        if (!norm || !index.has(norm)) continue;
        const value = index.get(norm);
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
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

/* Keys commonly used to wrap the product list in an enriched-catalog export.
   Checked first so a labelled `products` array always wins over a random array
   found deeper in the JSON. */
const INTAKE_CATALOG_ARRAY_KEYS = [
    'products', 'items', 'data', 'results', 'catalog', 'records', 'medicines',
    'drugs', 'catalog_items', 'catalogItems', 'enriched_catalog', 'enrichedCatalog',
    'product_list', 'productList', 'list', 'rows', 'entries'
];

/* A plain object counts as a catalog item when it carries at least one
   name/description-like field — this is how we tell a real product array apart
   from unrelated arrays (errors, tags, pagination, …). */
const INTAKE_CATALOG_ITEM_HINTS = [
    'name', 'name_ar', 'name_en', 'arabic_name', 'english_name', 'item_name', 'itemName',
    'title', 'product_name', 'productName', 'drug_name', 'commercial_name', 'trade_name',
    'description', 'description_ar', 'description_en', 'image_url', 'imageUrl', 'sku', 'barcode',
    'اسم المنتج', 'الاسم', 'اسم', 'الصنف', 'المنتج', 'الوصف', 'القسم',
    'كود المنتج', 'كود', 'السعر', 'رابط الصورة'
];
/* Wrapper keys some exports use around each product ({ product: {...} }). */
const INTAKE_CATALOG_WRAPPER_KEYS = ['product', 'item', 'data', 'attributes', 'fields', 'value'];
const intakeHasDirectCatalogField = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const index = intakeBuildKeyIndex(value);
    return INTAKE_CATALOG_ITEM_HINTS.some((hint) => {
        const norm = intakeNormalizeKey(hint);
        if (!norm || !index.has(norm)) return false;
        const fieldValue = index.get(norm);
        return fieldValue !== undefined && fieldValue !== null && String(fieldValue).trim() !== '';
    });
};
const intakeLooksLikeCatalogItem = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return false;
    if (intakeHasDirectCatalogField(value)) return true;
    for (let i = 0; i < INTAKE_CATALOG_WRAPPER_KEYS.length; i++) {
        const inner = value[INTAKE_CATALOG_WRAPPER_KEYS[i]];
        if (inner && typeof inner === 'object' && !Array.isArray(inner) && intakeLooksLikeCatalogItem(inner, depth + 1)) return true;
    }
    return false;
};
const intakeIsCatalogArray = (value) => Array.isArray(value)
    && value.length > 0
    && value.some(intakeLooksLikeCatalogItem);

/* Robust extractor for the manually uploaded catalog JSON. Accepts:
   - a root Array of products;
   - an object wrapping the list under a known key (products/items/data/…);
   - a nested wrapper (e.g. { data: { products: [...] } });
   - a dictionary of products keyed by id/SKU;
   - any array of product-shaped objects found while walking the tree. */
const intakeExtractArray = (parsed, depth = 0) => {
    if (!parsed || typeof parsed !== 'object' || depth > 5) return [];
    if (Array.isArray(parsed)) return parsed;

    /* 1. Known wrapper keys holding the products array directly. */
    for (let i = 0; i < INTAKE_CATALOG_ARRAY_KEYS.length; i++) {
        const value = parsed[INTAKE_CATALOG_ARRAY_KEYS[i]];
        if (intakeIsCatalogArray(value)) return value;
    }
    /* 2. Known wrapper keys holding another wrapper object. */
    for (let i = 0; i < INTAKE_CATALOG_ARRAY_KEYS.length; i++) {
        const value = parsed[INTAKE_CATALOG_ARRAY_KEYS[i]];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nested = intakeExtractArray(value, depth + 1);
            if (nested.length) return nested;
        }
    }
    /* 3. A single product object at the root. */
    if (intakeLooksLikeCatalogItem(parsed)) return [parsed];
    /* 4. A dictionary of products keyed by id/SKU (most values are items). */
    const values = Object.values(parsed);
    const objectValues = values.filter((v) => v && typeof v === 'object' && !Array.isArray(v));
    if (objectValues.length && objectValues.filter(intakeLooksLikeCatalogItem).length >= Math.max(1, Math.ceil(objectValues.length / 2))) {
        return objectValues;
    }
    /* 5. Last resort: depth-first search for any product-shaped array. */
    for (let i = 0; i < values.length; i++) {
        if (intakeIsCatalogArray(values[i])) return values[i];
    }
    for (let i = 0; i < objectValues.length; i++) {
        const nested = intakeExtractArray(objectValues[i], depth + 1);
        if (nested.length) return nested;
    }
    return [];
};

/* ──────────────────────── SHEET PARSING ────────────────────────────── */

/* Canonical vendor-sheet columns. Headers are compared after
   `intakeNormalizeKey`, so `الكود`, `كود المنتج (SKU)` and `Barcode` all resolve
   to `code`, while `السعر`, `سعر الجمهور` and `Public Price` resolve to
   `price`. This is what lets an Arabic or English export map to the internal
   schema without positional guessing. */
const INTAKE_COLUMN_ALIASES = {
    code: [
        'code', 'sku', 'barcode', 'id', 'item code', 'product code', 'item id',
        'كود', 'الكود', 'كود المنتج', 'كود المنتج (SKU)', 'الباركود', 'باركود', 'رقم الصنف', 'رقم'
    ],
    name: [
        'name', 'item', 'item name', 'product', 'product name', 'title',
        'اسم', 'الاسم', 'اسم المنتج', 'الصنف', 'صنف', 'المنتج', 'البيان', 'بيان', 'دواء', 'medicine'
    ],
    price: [
        'price', 'public price', 'selling price', 'current price', 'base price',
        'سعر', 'السعر', 'سعر الجمهور', 'السعر للجمهور', 'الجمهور', 'جمهور', 'السعر (EGP)'
    ]
};

/* normalized alias -> canonical field (first alias wins). Built once. */
const intakeColumnAliasIndex = (() => {
    const index = new Map();
    Object.keys(INTAKE_COLUMN_ALIASES).forEach((field) => {
        INTAKE_COLUMN_ALIASES[field].forEach((alias) => {
            const norm = intakeNormalizeKey(alias);
            if (norm && !index.has(norm)) index.set(norm, field);
        });
    });
    return index;
})();

/* Map one header cell to a canonical field: exact normalized alias first, then
   a substring fallback (e.g. `السعر بعد الخصم` -> price). The fallback prefers
   the longest alias so `سعر الجمهور` cannot be shadowed by `سعر`. */
const intakeHeaderField = (cell) => {
    const norm = intakeNormalizeKey(cell);
    if (!norm) return '';
    if (intakeColumnAliasIndex.has(norm)) return intakeColumnAliasIndex.get(norm);
    let bestField = '';
    let bestLength = 0;
    intakeColumnAliasIndex.forEach((field, alias) => {
        if (alias.length > bestLength && norm.indexOf(alias) !== -1) {
            bestField = field;
            bestLength = alias.length;
        }
    });
    return bestField;
};

/* Find a header row in the first few rows and resolve each column to a
   canonical field; fall back to positional (code, name, price). */
const intakeDetectColumns = (matrix) => {
    const limit = Math.min(matrix.length, 8);
    for (let r = 0; r < limit; r++) {
        const row = matrix[r] || [];
        const found = { code: -1, name: -1, price: -1 };
        for (let c = 0; c < row.length; c++) {
            const field = intakeHeaderField(row[c]);
            if (field && found[field] === -1) found[field] = c;
        }
        if (found.name !== -1 && (found.price !== -1 || found.code !== -1)) {
            return { headerRow: r, codeIdx: found.code, nameIdx: found.name, priceIdx: found.price };
        }
    }
    return { headerRow: -1, codeIdx: 0, nameIdx: 1, priceIdx: 2 };
};

/* Convert the sheet matrix into clean JSON rows keyed by the internal schema.
   Rows without a mappable name are dropped here so the chunked matcher never
   has to touch them. */
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

/* Convert an Excel/CSV file into clean JSON rows fully in memory via SheetJS.
   CSV is parsed from text (SheetJS handles it more reliably than from a byte
   array); every other SheetJS-readable format goes through the array path. The
   intermediate matrix never touches the DOM — only the final row objects are
   handed to the chunked matcher. */
const intakeParseSpreadsheet = async (file) => {
    if (!window.XLSX) throw new Error('XLSX_NOT_LOADED');
    const lower = String((file && file.name) || '').toLowerCase();
    const type = String((file && file.type) || '').toLowerCase();
    const isCsv = lower.endsWith('.csv') || type.indexOf('csv') !== -1;
    const workbook = isCsv
        ? window.XLSX.read(await readIntakeFileAsText(file), { type: 'string' })
        : window.XLSX.read(await readIntakeFileAsArrayBuffer(file), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    return intakeRowsFromMatrix(matrix);
};

const loadPdfJs = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = () => reject(new Error('PDFJS_LOAD_FAILED'));
    document.head.appendChild(script);
});

/* Fallback only: PDF has no tabular structure to read, so pdf.js text items are
   grouped into visual lines and split heuristically. Slower and less reliable
   than Excel/CSV; the UI warns the operator to prefer a spreadsheet. */
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

/* Public entry: convert a vendor sheet into clean JSON rows. Excel/CSV use the
   fast in-memory SheetJS path; PDF falls back to text extraction. */
window.parsePharmacyIntakeSheet = async (file) => {
    const lower = String((file && file.name) || '').toLowerCase();
    const type = String((file && file.type) || '').toLowerCase();
    if (lower.endsWith('.pdf') || type.indexOf('pdf') !== -1) return intakeParsePdf(file);
    return intakeParseSpreadsheet(file);
};

/* Descriptive alias for callers that want the explicit JSON conversion step. */
window.parsePharmacyIntakeSheetToJson = window.parsePharmacyIntakeSheet;

/* ──────────────────────── CATALOG INDEX ────────────────────────────── */

/* Some exports wrap each product, e.g. { product: {...} } or { item: {...} }.
   Descend into the wrapper when the outer object is not itself an item. */
const intakeUnwrapCatalogItem = (item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    if (intakeHasDirectCatalogField(item)) return item;
    for (let i = 0; i < INTAKE_CATALOG_WRAPPER_KEYS.length; i++) {
        const inner = item[INTAKE_CATALOG_WRAPPER_KEYS[i]];
        if (inner && typeof inner === 'object' && !Array.isArray(inner)) return intakeUnwrapCatalogItem(inner);
    }
    return item;
};

/* Last-resort name when an export uses an unknown header: take the first
   non-empty scalar value that is not a URL or a bare number. Prevents a valid
   product array from collapsing to "usable items: 0" over a single missing
   header. */
const intakeFallbackName = (item) => {
    const values = Object.values(item || {});
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined || value === null || typeof value === 'object') continue;
        const text = String(value).trim();
        if (!text) continue;
        if (/^https?:\/\//i.test(text)) continue;
        if (/^data:/i.test(text)) continue;
        if (/^\d+([.,]\d+)?$/.test(text)) continue;
        return text;
    }
    return '';
};

const intakeNormalizeCatalogItem = (rawItem) => {
    const item = intakeUnwrapCatalogItem(rawItem);
    const index = intakeBuildKeyIndex(item);
    const nameEn = String(intakePickFromIndex(index, ['name_en', 'english_name', 'nameEnglish', 'name_english']) || '').trim();
    const nameAr = String(intakePickFromIndex(index, ['name_ar', 'arabic_name', 'nameArabic', 'name_arabic', 'اسم المنتج', 'الاسم', 'اسم', 'الصنف', 'المنتج']) || '').trim();
    const fallbackName = String(intakePickFromIndex(index, ['name', 'title', 'product_name', 'productName', 'item_name', 'itemName', 'product_title', 'productTitle', 'drug_name', 'drugName', 'commercial_name', 'trade_name']) || '').trim();
    const resolvedName = fallbackName || nameAr || nameEn || String(intakeFallbackName(item)).trim();
    return {
        name: resolvedName,
        name_ar: nameAr || fallbackName || resolvedName,
        name_en: nameEn,
        image_url: String(intakePickFromIndex(index, ['image_url', 'imageUrl', 'main_image', 'mainImage', 'image', 'thumbnail', 'img', 'photo', 'رابط الصورة (Drive)', 'رابط الصورة', 'الصورة']) || '').trim(),
        category: String(intakePickFromIndex(index, ['category', 'cat', 'sub_category', 'subCategory', 'القسم', 'قسم', 'التصنيف']) || '').trim(),
        sku: String(intakePickFromIndex(index, ['sku', 'barcode', 'gtin', 'ean', 'code', 'id', 'كود المنتج (SKU)', 'كود المنتج', 'الكود', 'كود', 'الباركود', 'باركود']) || '').trim(),
        /* Descriptions come from the enriched catalog only. The generic
           `description`/`الوصف` falls back to the Arabic slot; the English slot
           requires an explicit English key. */
        description_ar: String(intakePickFromIndex(index, ['description_ar', 'descriptionAr', 'description_arabic', 'descriptionArabic', 'description', 'desc', 'details', 'usage', 'الوصف', 'وصف', 'البيان', 'التفاصيل']) || '').trim(),
        description_en: String(intakePickFromIndex(index, ['description_en', 'descriptionEn', 'description_english', 'descriptionEnglish']) || '').trim(),
        public_price: parseIntakePrice(intakePickFromIndex(index, PHARMACY_INTAKE_PRICE_FIELDS))
    };
};

const normalizeIntakeCatalog = (parsed) => intakeExtractArray(parsed)
    .map(intakeNormalizeCatalogItem)
    .filter((item) => item.name);

/* Yield back to the browser so pending paints/input events are processed
   between parse chunks. requestAnimationFrame keeps the progress bar smooth
   where available; setTimeout(0) is the fallback for background tabs. */
const intakeYieldToBrowser = () => new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve());
    } else {
        setTimeout(resolve, 0);
    }
});

/* Normalize a large catalog array in bounded chunks, reporting progress after
   each chunk. Returns the usable items (those with a resolved name). */
const intakeNormalizeCatalogChunked = async (extracted, onProgress) => {
    const items = [];
    const total = Array.isArray(extracted) ? extracted.length : 0;
    const chunkSize = PHARMACY_INTAKE_PARSE_CHUNK_SIZE;
    for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize, total);
        for (let i = start; i < end; i++) {
            const normalized = intakeNormalizeCatalogItem(extracted[i]);
            if (normalized.name) items.push(normalized);
        }
        if (typeof onProgress === 'function') onProgress(end, total);
        await intakeYieldToBrowser();
    }
    return items;
};

/* Rough shape summary used only for console diagnostics when a catalog file is
   uploaded, so an unexpected structure can be identified without re-reading the
   whole (multi-MB) file by hand. */
const intakeDescribeStructure = (parsed) => {
    if (parsed === null) return 'null';
    if (Array.isArray(parsed)) return 'array[' + parsed.length + ']';
    if (typeof parsed !== 'object') return typeof parsed;
    const keys = Object.keys(parsed);
    const preview = keys.slice(0, 12).map((key) => {
        const value = parsed[key];
        if (Array.isArray(value)) return key + ':array[' + value.length + ']';
        if (value && typeof value === 'object') return key + ':object{' + Object.keys(value).slice(0, 6).join(',') + '}';
        return key + ':' + typeof value;
    });
    return 'object{' + (preview.join(', ') || 'empty') + '}' + (keys.length > 12 ? ' (+' + (keys.length - 12) + ' more keys)' : '');
};

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

/* ── Catalog parse progress UI ── */
const intakeSetCatalogStatusMessage = (text) => {
    const el = document.getElementById('pharmacyIntakeCatalogStatus');
    if (el) el.textContent = text || '';
};

const intakeSetCatalogProgress = (processed, total, label) => {
    const wrap = document.getElementById('pharmacyIntakeCatalogProgressWrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const pct = total > 0 ? Math.min(100, Math.floor((processed / total) * 100)) : 0;
    const bar = document.getElementById('pharmacyIntakeCatalogProgressBar');
    const pctEl = document.getElementById('pharmacyIntakeCatalogProgressPct');
    const textEl = document.getElementById('pharmacyIntakeCatalogProgressText');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (textEl) {
        const base = label || 'جاري تحليل الكتالوج الطبي';
        const counts = total > 0
            ? ' (' + processed.toLocaleString('en-US') + ' / ' + total.toLocaleString('en-US') + ' منتج)'
            : '';
        textEl.textContent = base + ': ' + pct + '%' + counts;
    }
};

const intakeHideCatalogProgress = () => {
    const wrap = document.getElementById('pharmacyIntakeCatalogProgressWrap');
    if (wrap) wrap.classList.add('hidden');
};

window.onPharmacyCatalogFileChange = async (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    const label = document.getElementById('pharmacyIntakeCatalogFileName');
    if (label) label.textContent = file.name;
    try {
        intakeSetCatalogProgress(0, 0, 'جاري قراءة ملف الكتالوج');
        intakeSetCatalogStatusMessage('جاري قراءة ملف الكتالوج...');
        const text = await readIntakeFileAsText(file);
        const parsed = JSON.parse(text);
        /* Extract the product list defensively, then normalize in async chunks. */
        const extracted = intakeExtractArray(parsed);
        intakeSetCatalogProgress(0, extracted.length, 'جاري تحليل الكتالوج الطبي');
        intakeSetCatalogStatusMessage('جاري تحليل الكتالوج الطبي...');
        const items = await intakeNormalizeCatalogChunked(extracted, (processed, total) => {
            intakeSetCatalogProgress(processed, total, 'جاري تحليل الكتالوج الطبي');
        });
        console.log(
            '[pharmacy-intake] catalog structure: ' + intakeDescribeStructure(parsed)
            + ' | detected rows: ' + extracted.length
            + ' | usable items: ' + items.length
        );
        /* Only reject when nothing could be mapped at all — a partial mapping is
           still usable, so never fail the whole file over a few blank rows. */
        if (!items.length) {
            if (extracted.length) {
                const sampleKeys = Object.keys(intakeUnwrapCatalogItem(extracted[0]) || {}).slice(0, 25).join(', ');
                console.warn('[pharmacy-intake] detected ' + extracted.length + ' rows but none could be mapped. First row keys:', sampleKeys);
            } else {
                console.warn('[pharmacy-intake] no product array detected in the JSON root.');
            }
            throw new Error('EMPTY_CATALOG');
        }
        if (items.length !== extracted.length) {
            console.warn('[pharmacy-intake] ' + (extracted.length - items.length) + ' row(s) skipped (no mappable name).');
        }
        intakeCatalogOverride = items;
        intakeCatalogIndex = items;
        /* Build the Fuse search index next; yield once so the "indexing"
           message paints before the synchronous index build blocks the thread. */
        intakeSetCatalogProgress(items.length, items.length, 'جاري تجهيز فهرس البحث');
        intakeSetCatalogStatusMessage('جاري تجهيز فهرس البحث...');
        await intakeYieldToBrowser();
        intakeFuse = intakeBuildFuse();
        intakeCatalogStatusText();
        intakeHideCatalogProgress();
        window.showToast('تم تحميل الكتالوج الطبي (' + items.length + ' صنف)');
    } catch (err) {
        console.error('[pharmacy-intake] catalog file failed:', err);
        intakeCatalogOverride = null;
        intakeCatalogIndex = [];
        intakeFuse = null;
        intakeHideCatalogProgress();
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

/* Progress UI for the fuzzy-matching phase (batch analysis of sheet rows). */
const intakeSetMatchProgress = (processed, total, label) => {
    const wrap = document.getElementById('pharmacyIntakeMatchProgressWrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const pct = total > 0 ? Math.min(100, Math.floor((processed / total) * 100)) : 0;
    const bar = document.getElementById('pharmacyIntakeMatchProgressBar');
    const pctEl = document.getElementById('pharmacyIntakeMatchProgressPct');
    const textEl = document.getElementById('pharmacyIntakeMatchProgressText');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (textEl) {
        const base = label || 'جاري مطابقة الأصناف';
        const counts = total > 0
            ? ' (' + processed.toLocaleString('en-US') + ' / ' + total.toLocaleString('en-US') + ' صنف)'
            : '';
        textEl.textContent = base + ': ' + pct + '%' + counts;
    }
};

const intakeHideMatchProgress = () => {
    const wrap = document.getElementById('pharmacyIntakeMatchProgressWrap');
    if (wrap) wrap.classList.add('hidden');
};

/* Match a single sheet row against the catalog (Fuse when available, exact
   fallback otherwise). Every row is imported by default; matched rows are
   enriched from the catalog and unmatched rows keep empty descriptions. */
const intakeMatchRow = (row) => {
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
    return { row, match, score, include: true, newImageUrl: '', error: '' };
};

/* Fuzzy-match the sheet in bounded async chunks, yielding to the browser after
   each chunk and reporting progress so the tab never freezes. */
const intakeMatchRowsChunked = async (rows, onProgress) => {
    const results = [];
    const total = Array.isArray(rows) ? rows.length : 0;
    const chunkSize = PHARMACY_INTAKE_MATCH_CHUNK_SIZE;
    for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize, total);
        for (let i = start; i < end; i++) {
            results.push(intakeMatchRow(rows[i]));
        }
        if (typeof onProgress === 'function') onProgress(end, total);
        await intakeYieldToBrowser();
    }
    return results;
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

/* Drop any preview left over from a previous file, so a new sheet is converted
   entirely in memory and only the final matched rows are painted. */
const intakeClearPreview = () => {
    intakeMatched = [];
    const body = document.getElementById('pharmacyIntakePreviewBody');
    if (body) body.innerHTML = '';
    const wrap = document.getElementById('pharmacyIntakePreviewWrap');
    if (wrap) wrap.classList.add('hidden');
    const summary = document.getElementById('pharmacyIntakeSummary');
    if (summary) summary.textContent = '';
    const all = document.getElementById('pharmacyIntakeSelectAll');
    if (all) all.checked = false;
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
        window.showToast('هذه الشاشة متاحة لإدخال البيانات فقط', false);
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
    const isPdf = (() => {
        const lower = String((file && file.name) || '').toLowerCase();
        const type = String((file && file.type) || '').toLowerCase();
        return lower.endsWith('.pdf') || type.indexOf('pdf') !== -1;
    })();
    intakeBusy = true;
    if (matchBtn) matchBtn.disabled = true;
    if (syncBtn) syncBtn.disabled = true;
    /* Clear any preview from a previous file before converting the new one, so
       stale rows never linger while the sheet is parsed in memory. */
    intakeClearPreview();
    intakeSetStatus(isPdf ? 'جاري استخراج البيانات من ملف PDF...' : 'جاري تحويل الشيت إلى بيانات...');
    intakeSetMatchProgress(0, 0, isPdf ? 'جاري استخراج بيانات PDF' : 'جاري قراءة ملف المخزون');
    try {
        intakeRows = await window.parsePharmacyIntakeSheet(file);
        if (!intakeRows.length) {
            intakeMatched = [];
            intakeRenderPreview();
            window.showToast('لم يتم العثور على أصناف صالحة في الملف', false);
            return;
        }
        if (isPdf) {
            window.showToast('تم استخراج البيانات من ملف PDF؛ يُفضّل استخدام Excel/CSV لدقة أعلى', false);
        }
        intakeSetStatus('جاري تحميل الكتالوج الطبي...');
        intakeSetMatchProgress(0, 0, 'جاري تحميل الكتالوج الطبي');
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
        intakeSetMatchProgress(0, 0, 'جاري بناء فهرس المطابقة');
        /* Let the status text paint before the synchronous Fuse index build. */
        await intakeYieldToBrowser();
        if (!intakeFuse) intakeFuse = intakeBuildFuse();
        /* Fuzzy-match each row in bounded async chunks so the main thread stays
           responsive during the heavier matching phase. */
        intakeMatched = await intakeMatchRowsChunked(intakeRows, (processed, total) => {
            intakeSetMatchProgress(processed, total, 'جاري مطابقة الأصناف');
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
        intakeHideMatchProgress();
        if (matchBtn) matchBtn.disabled = false;
    }
};

/* ──────────────────────── SYNC / BATCH WRITE ───────────────────────── */

/* ─────────────────── IDEMPOTENT RUN RECONCILIATION ───────────────────
   The original sync was all-or-nothing: it copied every image first and only
   then wrote Firestore, so a session timeout mid-run lost the whole batch and
   left orphaned Drive files. Re-running used random document ids, which
   duplicated every row. The functions below make a re-upload safe:

     - `intakeProductDocId` derives a STABLE id from the pharmacy + vendor SKU
       (or item name), so the same sheet always targets the same documents;
     - `pharmacy_intake_runs/{merchantId}` records the ids of the last run, so
       an interrupted attempt is detectable and its partial rows are reconciled;
     - stale ids (present last run, gone from this sheet) are swept afterwards.
   All run-state I/O is best-effort: if the collection is not yet permitted the
   intake still works, because stable ids alone already prevent duplicates. */

/* FNV-1a (32-bit) → base36. Stable and dependency-free, unlike
   Math.random/Date.now, so the same row maps to the same id on every device. */
const intakeHashKey = (text) => {
    let hash = 0x811c9dc5;
    const value = String(text == null ? '' : text);
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
};

/* Firestore document ids forbid `/` and control characters; trim so a
   pathological SKU can never overflow the id limit. */
const intakeSanitizeIdPart = (value) => String(value == null ? '' : value)
    .replace(/[\/\u0000-\u001F\u007F]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);

/* Stable product id: `<merchantId>__<sku|name-hash>`. Re-uploading the same
   sheet overwrites the same documents instead of creating duplicates. */
const intakeProductDocId = (merchantId, m) => {
    const row = (m && m.row) || {};
    const catalog = (m && m.match) || null;
    const sku = String(row.code || '').trim() || (catalog ? String(catalog.sku || '').trim() : '');
    const key = sku
        ? 'sku-' + intakeSanitizeIdPart(sku)
        : 'nm-' + intakeHashKey(normalizeIntakeMatchKey(row.name || (catalog && catalog.name) || ''));
    return intakeSanitizeIdPart(merchantId) + '__' + key;
};

/* Deterministic SKU fallback for rows without a vendor code, so a re-upload
   keeps the same SKU instead of minting a new random one. */
const intakeStableSku = (m) => {
    const row = (m && m.row) || {};
    const catalog = (m && m.match) || null;
    const explicit = String(row.code || '').trim() || (catalog ? String(catalog.sku || '').trim() : '');
    if (explicit) return explicit;
    return 'KJ-PI-' + intakeHashKey(normalizeIntakeMatchKey(row.name || (catalog && catalog.name) || ''));
};

const intakeRunDocRef = (merchantId) => window.doc(
    window.db,
    PHARMACY_INTAKE_RUNS_COLLECTION,
    intakeSanitizeIdPart(merchantId)
);

/* Read the last run state for a pharmacy. REST-first (transport-independent),
   SDK fallback. A missing document is a normal "never ran" outcome. */
const intakeReadRunState = async (merchantId) => {
    if (!merchantId || !window.db) return null;
    try {
        if (window.kanjoRest && typeof window.kanjoRest.getDocument === 'function') {
            return await window.kanjoRest.getDocument([PHARMACY_INTAKE_RUNS_COLLECTION, intakeSanitizeIdPart(merchantId)]);
        }
        const snap = await window.getDoc(intakeRunDocRef(merchantId));
        return snap && snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null;
    } catch (err) {
        console.warn('[pharmacy-intake] run-state read failed:', err);
        return null;
    }
};

/* Persist run state. Best-effort (see section note): a failure is logged and
   never surfaced, because stable ids already guarantee no duplication. */
const intakeWriteRunState = async (merchant, state) => {
    if (!merchant || !merchant.merchantId || !window.db) return false;
    const data = Object.assign({
        merchantId: merchant.merchantId,
        merchantName: merchant.merchantName,
        version: 1,
        updatedAt: new Date()
    }, state);
    try {
        if (window.kanjoRest && typeof window.kanjoRest.patch === 'function') {
            await window.kanjoRest.patch([PHARMACY_INTAKE_RUNS_COLLECTION, intakeSanitizeIdPart(merchant.merchantId)], data);
            return true;
        }
        await window.setDoc(intakeRunDocRef(merchant.merchantId), data, { merge: true });
        return true;
    } catch (err) {
        console.warn('[pharmacy-intake] run-state write failed:', err);
        return false;
    }
};

/* Delete intake documents from a previous run of the SAME pharmacy that are
   absent from the current sheet. Scoped by construction (ids come from this
   merchant's own run state) and audited like any other bulk sweep. */
const intakeDeleteStaleDocs = async (ids) => {
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    if (!unique.length) return 0;
    let deleted = 0;
    for (let i = 0; i < unique.length; i += 400) {
        const chunk = unique.slice(i, i + 400);
        const batch = window.writeBatch(window.db);
        chunk.forEach((id) => batch.delete(window.doc(window.db, PHARMACY_INTAKE_COLLECTION, id)));
        await batch.commit();
        deleted += chunk.length;
    }
    if (typeof window.kanjoAuditDelete === 'function') {
        window.kanjoAuditDelete({
            collectionId: PHARMACY_INTAKE_COLLECTION,
            id: '',
            name: intakeFormatNumber(deleted) + ' صنف',
            description: 'تنظيف ' + intakeFormatNumber(deleted) + ' صنف قديم/يتيم عند إعادة رفع مخزون الصيدلية'
        });
    }
    return deleted;
};

/* Device-local cache of copied images: `docId -> { sourceUrl, driveUrl }`. It
   lets a restarted run reuse images it already copied instead of pushing a
   second copy into the pharmacy's Drive folder. Purely an optimisation, stored
   in localStorage so it costs no Firestore reads/writes. */
const PHARMACY_INTAKE_IMAGE_CACHE_PREFIX = 'pharmacyIntake:imageCache:';

const intakeImageCacheKey = (merchantId) => PHARMACY_INTAKE_IMAGE_CACHE_PREFIX + intakeSanitizeIdPart(merchantId);

const intakeLoadImageCache = (merchantId) => {
    try {
        const raw = localStorage.getItem(intakeImageCacheKey(merchantId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (err) {
        return {};
    }
};

const intakeSaveImageCache = (merchantId, cache) => {
    try {
        localStorage.setItem(intakeImageCacheKey(merchantId), JSON.stringify(cache));
    } catch (err) {
        /* Quota exceeded — drop the cache; it is only an optimisation. */
        try { localStorage.removeItem(intakeImageCacheKey(merchantId)); } catch (_) {}
    }
};

const intakeBuildPayload = (m, merchant, newImageUrl, runId) => {
    const row = (m && m.row) || {};
    const catalog = (m && m.match) || null;
    /* The vendor sheet name is the Arabic slot; fall back to the matched catalog
       name when the sheet row is blank. Always a string, never undefined. */
    const nameAr = String(row.name || '').trim()
        || (catalog ? String(catalog.name_ar || catalog.name || '').trim() : '')
        || '';
    const nameEn = (catalog ? String(catalog.name_en || '').trim() : '') || nameAr;
    const sku = intakeStableSku(m);
    const category = (catalog ? String(catalog.category || '').trim() : '') || String(merchant.category || '').trim();
    const price = Number(row.price) || (catalog ? Number(catalog.public_price) : 0) || 0;
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
        intakeRunId: runId || '',
        intakeRunAt: new Date(),
        syncedFromDraft: true
    };
};

/* Write `{ id, data }` entries in 400-write chunks. Documents are addressed by
   their deterministic id, so an existing row is overwritten in place. */
const intakeCommitBatches = async (entries) => {
    const collectionRef = window.collection(window.db, PHARMACY_INTAKE_COLLECTION);
    let saved = 0;
    for (let i = 0; i < entries.length; i += 400) {
        const chunk = entries.slice(i, i + 400);
        const batch = window.writeBatch(window.db);
        chunk.forEach((entry) => batch.set(window.doc(collectionRef, entry.id), entry.data));
        await batch.commit();
        saved += chunk.length;
    }
    return saved;
};

window.syncPharmacyIntakeProducts = async () => {
    if (intakeBusy) return;
    if (!window.isPharmacyIntakeUser()) {
        window.showToast('هذه الشاشة متاحة لإدخال البيانات فقط', false);
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
        const runId = 'pi-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

        /* Collapse the selection onto deterministic ids (last row wins for a
           duplicated SKU/name) so the batch never writes the same doc twice. */
        const byId = new Map();
        selected.forEach((m) => byId.set(intakeProductDocId(merchantId, m), m));
        const plan = [];
        byId.forEach((m, docId) => plan.push({ m, docId }));

        /* Recover the previous run for this pharmacy (one read). A run that was
           interrupted is flagged to the operator, then healed by the stable ids
           below instead of being duplicated. */
        const priorState = await intakeReadRunState(merchantId);
        const priorIds = (priorState && Array.isArray(priorState.docIds)) ? priorState.docIds : [];
        if (priorState && priorState.status === 'in_progress' && priorIds.length) {
            intakeSetStatus('تم رصد محاولة سابقة غير مكتملة، سيتم تحديث أصنافها بدل تكرارها...');
        }

        /* Persist the intended ids BEFORE the (long) image-copy phase, so an
           interruption during copying is still detectable and reconcilable. */
        await intakeWriteRunState(merchant, {
            status: 'in_progress',
            runId,
            startedAt: new Date(),
            expectedCount: plan.length,
            writtenCount: 0,
            docIds: plan.map((item) => item.docId)
        });

        const entries = [];
        const imageCache = intakeLoadImageCache(merchantId);
        let cacheDirty = false;
        let reused = 0;
        for (let i = 0; i < plan.length; i++) {
            const m = plan[i].m;
            const docId = plan[i].docId;
            intakeSetStatus('نسخ الصور ' + intakeFormatNumber(i + 1) + ' / ' + intakeFormatNumber(plan.length) + '...');
            let newImageUrl = '';
            const sourceUrl = (m.match && m.match.image_url) ? m.match.image_url : '';
            const cached = imageCache[docId];
            if (sourceUrl && cached && cached.sourceUrl === sourceUrl && cached.driveUrl) {
                /* Already copied by an earlier (possibly interrupted) run: reuse it
                   instead of pushing a duplicate image into the Drive folder. */
                newImageUrl = cached.driveUrl;
                m.newImageUrl = newImageUrl;
                m.error = '';
                reused++;
            } else if (sourceUrl) {
                try {
                    /* Stable file name derived from the deterministic doc id, so a
                       re-run targets the same Drive file instead of piling up
                       duplicate copies where the Apps Script supports it. */
                    const fileName = 'pharmacy-' + docId + '.jpg';
                    newImageUrl = await window.copyCatalogImageFromUrl(sourceUrl, fileName, merchant.merchantName);
                    m.newImageUrl = newImageUrl;
                    m.error = '';
                    imageCache[docId] = { sourceUrl, driveUrl: newImageUrl };
                    cacheDirty = true;
                    copied++;
                } catch (err) {
                    console.error('[pharmacy-intake] image copy failed:', err);
                    m.error = 'تعذّر نسخ الصورة';
                    copyFailed++;
                }
            }
            entries.push({ id: docId, data: intakeBuildPayload(m, merchant, newImageUrl, runId) });
            if (cacheDirty && (i % 10 === 0 || i === plan.length - 1)) {
                intakeSaveImageCache(merchantId, imageCache);
                cacheDirty = false;
            }
            if (i % 5 === 0 || i === plan.length - 1) intakeRenderPreview();
        }
        intakeSaveImageCache(merchantId, imageCache);

        intakeSetStatus('حفظ ' + intakeFormatNumber(entries.length) + ' منتج...');
        const saved = await intakeCommitBatches(entries);

        /* Sweep rows that existed in the previous run but are gone from this
           sheet, so a re-upload fully replaces the pharmacy's intake data. */
        const currentIds = new Set(entries.map((entry) => entry.id));
        const staleIds = priorIds.filter((id) => id && !currentIds.has(id));
        let removed = 0;
        if (staleIds.length) {
            intakeSetStatus('تنظيف ' + intakeFormatNumber(staleIds.length) + ' صنف قديم...');
            try {
                removed = await intakeDeleteStaleDocs(staleIds);
            } catch (err) {
                console.warn('[pharmacy-intake] stale cleanup failed:', err);
            }
        }

        await intakeWriteRunState(merchant, {
            status: 'completed',
            runId,
            completedAt: new Date(),
            expectedCount: entries.length,
            writtenCount: saved,
            docIds: entries.map((entry) => entry.id)
        });

        if (typeof window.kpiInvalidateProductCache === 'function') window.kpiInvalidateProductCache();
        intakeSetStatus('تم حفظ ' + intakeFormatNumber(saved) + ' منتج'
            + (copied ? ' — نُسخت ' + intakeFormatNumber(copied) + ' صورة' : '')
            + (reused ? ' — أُعيد استخدام ' + intakeFormatNumber(reused) + ' صورة' : '')
            + (copyFailed ? ' — فشل ' + intakeFormatNumber(copyFailed) + ' صورة' : '')
            + (removed ? ' — حُذف ' + intakeFormatNumber(removed) + ' صنف قديم' : '') + '.');
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

/* ────────────────────── RECOVERY / DIAGNOSTICS ─────────────────────── */

/* Read the last run state for a pharmacy (console/support use). */
window.pharmacyIntakeRunStatus = (merchantId) => {
    const mid = String(merchantId || '').trim()
        || ((document.getElementById('pharmacyIntakeMerchant') || {}).value || '').trim();
    if (!mid) return Promise.resolve(null);
    return intakeReadRunState(mid);
};

/* Purge every document written by the last run of a pharmacy. Recovers an
   interrupted intake (partial Firestore rows) and clears the run pointer so a
   fresh upload starts clean. */
window.cleanupOrphanedPharmacyIntake = async (merchantId) => {
    if (!window.isPharmacyIntakeUser()) {
        window.showToast('هذه الشاشة متاحة لإدخال البيانات فقط', false);
        return 0;
    }
    const mid = String(merchantId || '').trim()
        || ((document.getElementById('pharmacyIntakeMerchant') || {}).value || '').trim();
    if (!mid) {
        window.showToast('اختر الصيدلية أولاً', false);
        return 0;
    }
    const state = await intakeReadRunState(mid);
    const ids = (state && Array.isArray(state.docIds)) ? state.docIds : [];
    if (!ids.length) {
        window.showToast('لا توجد بيانات سابقة لتنظيفها', false);
        return 0;
    }
    const deleted = await intakeDeleteStaleDocs(ids);
    try {
        await intakeWriteRunState({ merchantId: mid, merchantName: (state && state.merchantName) || '' }, {
            status: 'cleaned',
            cleanedAt: new Date(),
            docIds: []
        });
    } catch (err) {
        console.warn('[pharmacy-intake] run-state clear failed:', err);
    }
    if (typeof window.kpiInvalidateProductCache === 'function') window.kpiInvalidateProductCache();
    window.showToast('تم تنظيف ' + intakeFormatNumber(deleted) + ' صنف');
    return deleted;
};

/* UI wrapper: confirms before the destructive sweep. */
window.confirmCleanupOrphanedPharmacyIntake = () => {
    if (!window.isPharmacyIntakeUser()) {
        window.showToast('هذه الشاشة متاحة لإدخال البيانات فقط', false);
        return;
    }
    const ok = window.confirm('سيتم حذف كل أصناف آخر محاولة إدخال لهذه الصيدلية من قاعدة البيانات. هل أنت متأكد؟');
    if (ok) window.cleanupOrphanedPharmacyIntake();
};
