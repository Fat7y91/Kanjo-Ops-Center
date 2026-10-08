/* Kanjo Ops — Product Cataloging Pipeline */

const CATALOG_COLLECTION = 'merchant_products';
const CATALOG_GAS_URL = 'https://script.google.com/macros/s/AKfycbzuhM_6hVjfAEUvWmLkLRKCKGunp_h1DRy722Sz5AIWiLpxgLElOgad5W0TcUz0RHhg/exec';
/* Previous active deployment of the SAME Apps Script project. A republished or
   temporarily-unpublished deployment answers uploads with a hard HTTP 404, so
   this is kept as an automatic failover: one dead endpoint must never block a
   founder/rep image upload. It shares the same Drive root and payload schema. */
const CATALOG_GAS_URL_LEGACY = 'https://script.google.com/macros/s/AKfycbzWid4xw-1Vo4y3gNwUPSs9SYYYVEZMVCZyeilNiNyRCkgfLWSjj9s3WmpvX1G4Octv/exec';
const CATALOG_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const CATALOG_DRAFTS_KEY = 'kanjo_drafts';

/* Data-entry ingestion sources. Products written by these pipelines belong to
   the data-entry operator, NOT to a field rep, so they must never enter a rep's
   "expected images" denominator (see kpi.js). */
const CATALOG_MENU_IMPORT_SOURCE = 'menu_excel_import';
const CATALOG_PHARMACY_INTAKE_SOURCE = 'pharmacy_inventory_intake';

/* Tag describing HOW the media editor completed an image task. Persisted on the
   product (`edit_type`) so the analytics breakdown can split the editor's
   processed total into its three real streams. */
const CATALOG_EDIT_TYPE_FROM_SCRATCH = 'from_scratch';
const CATALOG_EDIT_TYPE_AI = 'ai_edit';
const CATALOG_EDIT_TYPE_DIRECT = 'direct_approval';

/* Explicit field mask for every catalog list/query read. A mask is an
   allow-list, so this deliberately lists every field any catalog widget,
   export, or search path reads. Unknown/absent field paths are ignored by
   Firestore, so it is safe to be generous here — what matters is that
   description/image/base64-style blobs we never render in a list are not
   downloaded for every one of the thousands of merchant_products docs. */
const CATALOG_LIST_FIELDS = [
    'name', 'name_ar', 'name_en', 'description_ar', 'description_en',
    'base_price', 'price', 'category', 'sku', 'product_type', 'status',
    'variations', 'image_url', 'imageUrl',
    'rawImageUrl', 'rawImageUrls', 'enhancedImageUrl', 'enhancedImageUrls',
    'deleteRequested', 'deleteRequestedBy',
    'merchantId', 'merchantName', 'merchant_name',
    'createdBy', 'created_by', 'createdAt', 'updatedAt', 'updatedBy',
    'addedBy', 'added_by', 'repName', 'intakeSource', 'importSource',
    'image_locked_by', 'image_locked_by_name', 'image_locked_at', 'image_uploaded_by',
    'edit_type', 'edited_by', 'edited_at',
    'kanjo_id', 'barcode', 'score', 'uploaded_at'
];

/* ─── REST-first writes ───
   Field reps work on strict mobile networks where the SDK streaming transport
   is trapped offline, so updateDoc/setDoc/addDoc/deleteDoc hang and the modal
   reports "فشل حفظ التعديلات". These helpers write straight to the Firestore
   REST API with the Auth Bearer token and only set the SDK as a last resort.
   Each returns true (delete/create: the result) when REST handled the call, or
   false/null when no REST helper is available so the caller can use the SDK. */
const catalogRestMerge = async (segments, data) => {
    if (!window.kanjoRest || typeof window.kanjoRest.patch !== 'function') return false;
    await window.kanjoRest.patch(segments, data);
    return true;
};
const catalogRestCreate = async (collectionId, data) => {
    if (!window.kanjoRest || typeof window.kanjoRest.create !== 'function') return null;
    return window.kanjoRest.create(collectionId, data);
};
const catalogRestDelete = async (segments) => {
    if (!window.kanjoRest || typeof window.kanjoRest.remove !== 'function') return false;
    await window.kanjoRest.remove(segments);
    return true;
};

/* The signed-in operator's PIN. Stored on the session identity at PIN login
   (auth.js) and preserved across claims reconciliation; falls back to a reverse
   lookup in the canonical users table by name for restored/claims-only sessions.
   Used as the concurrency lock token (`image_locked_by`). */
const catalogCurrentUserPin = () => {
    const u = window.currentUser || {};
    const direct = String(u.pin || u.pinCode || '').trim();
    if (direct) return direct;
    const users = window.users || {};
    const name = String(u.name || '').trim();
    const keys = Object.keys(users);
    for (let i = 0; i < keys.length; i++) {
        if (users[keys[i]] && String(users[keys[i]].name || '') === name) return String(keys[i]);
    }
    return '';
};
window.catalogCurrentUserPin = catalogCurrentUserPin;

/* A data-entry/imported product (menu Excel import or pharmacy intake). These
   are attributed to the data-entry operator and are deliberately excluded from
   a field rep's product/image denominator. */
const catalogIsImportedProduct = (p) => !!p && (
    String(p.importSource || '').trim() === CATALOG_MENU_IMPORT_SOURCE
    || String(p.intakeSource || '').trim() === CATALOG_PHARMACY_INTAKE_SOURCE
);
window.catalogIsImportedProduct = catalogIsImportedProduct;

window.merchantProductsCache = window.merchantProductsCache || [];
window.repCatalogProductsCache = window.repCatalogProductsCache || [];
window.catalogDeleteRequestsCache = window.catalogDeleteRequestsCache || [];
window.allCatalogProductsCache = window.allCatalogProductsCache || [];
window._catalogSelectedRep = window._catalogSelectedRep || '';
window._catalogEnhancedUploads = window._catalogEnhancedUploads || {};
window._catalogEditingProduct = null;

const catalogEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.isCatalogRepUser = () => !!(window.currentUser && window.currentUser.role === 'rep' && window.currentUser.role !== 'data_entry');

window.isCatalogContentUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    const name = String(u.name || '');
    const lower = name.toLowerCase();
    return name.includes('يوسف') || lower.includes('youssef') || lower.includes('yousef');
};

window.isCatalogAdminUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    return u.role === 'admin' || u.role === 'founder' || (typeof window.canManageContracts === 'function' && window.canManageContracts());
};

window.isMahmoudUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    return String(u.name || '').includes('محمود');
};

window.isCatalogFounderUser = () => !!(window.currentUser && window.currentUser.role === 'founder');

/* Product review & audit role (مراجعة وتدقيق المنتجات): may read and UPDATE
   every product across all catalogs, but never create or delete. This helper is
   the single client-side switch for the audit capability; the product editor
   grants them the same form the field reps use, backed by a server rule that
   allows update only. */
window.isProductAuditUser = () => !!(window.currentUser && window.currentUser.role === 'product_audit');

/* Who may open the product editor: field reps (their own drafts/list) and the
   audit team (any product). Adding a product is gated separately below so
   extending this to the audit role never granted create rights. */
window.canEditCatalogProducts = () => window.isCatalogRepUser() || window.isProductAuditUser();

/* Who may ADD a brand-new product. The product-audit team may add products for
   any merchant (to cover items the delivery agents missed) and edit them +
   their variants, but never delete. Field reps keep their existing create flow. */
window.canCreateCatalogProducts = () => window.isCatalogRepUser() || window.isProductAuditUser();

window.isDesoukOpsManager = () => {
    if (typeof window.isMahmoudOpsUser === 'function') return !!window.isMahmoudOpsUser();
    return !!window.isMahmoudUser();
};

window.canViewAllCatalogProducts = () => !!(window.isCatalogFounderUser() || window.isMahmoudUser() || window.isDesoukOpsManager() || window.isProductAuditUser());

window.isDataEntryUser = () => !!(window.currentUser && window.currentUser.role === 'data_entry');

window.canUseStagingCatalog = () => !!window.isDataEntryUser();

/* Ordered, de-duplicated, syntactically-valid Apps Script endpoints the upload
   pipeline may use. `window.KANJO_CATALOG_SCRIPT_URL` (runtime config) wins,
   then the current deployment, then the legacy one as an automatic failover. */
const catalogGasEndpoints = () => {
    const seen = new Set();
    return [window.KANJO_CATALOG_SCRIPT_URL, CATALOG_GAS_URL, CATALOG_GAS_URL_LEGACY]
        .map((u) => String(u || '').trim())
        .filter((u) => {
            if (!u || seen.has(u)) return false;
            if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u)) return false;
            seen.add(u);
            return true;
        });
};

const catalogDriveFileId = (value) => {
    const s = String(value || '');
    if (!s) return '';
    const idMatch = s.match(/[?&]id=([^&]+)/);
    if (idMatch && idMatch[1]) return decodeURIComponent(idMatch[1]);
    const dMatch = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch && dMatch[1]) return dMatch[1];
    if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
    return '';
};

const catalogDriveViewUrl = (fileIdOrUrl) => {
    const id = catalogDriveFileId(fileIdOrUrl);
    return id ? ('https://drive.google.com/uc?export=view&id=' + id) : '';
};

const catalogDriveDownloadUrl = (fileIdOrUrl) => {
    const id = catalogDriveFileId(fileIdOrUrl);
    if (id) return 'https://drive.google.com/uc?export=download&id=' + id;
    return String(fileIdOrUrl || '').replace('export=view', 'export=download');
};

const catalogDirectImageUrl = (urlOrId) => catalogDriveViewUrl(urlOrId) || String(urlOrId || '');

const catalogDriveThumbnailUrl = (fileIdOrUrl) => {
    const id = catalogDriveFileId(fileIdOrUrl);
    return id ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w200-h200') : '';
};

const catalogMerchantDomId = (name) => 'm-' + encodeURIComponent(String(name || 'unknown')).replace(/[^a-zA-Z0-9]/g, '_');

const compressImage = (file, maxDimension = 1000, quality = 0.7) => new Promise((resolve, reject) => {
    if (!file) {
        reject(new Error('NO_FILE'));
        return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
        img.onload = () => {
            let width = img.width || maxDimension;
            let height = img.height || maxDimension;
            if (width >= height && width > maxDimension) {
                height = Math.round(height * (maxDimension / width));
                width = maxDimension;
            } else if (height > maxDimension) {
                width = Math.round(width * (maxDimension / height));
                height = maxDimension;
            }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, width);
            canvas.height = Math.max(1, height);
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('CANVAS_FAILED'));
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
                resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (err) {
                reject(err);
            }
        };
        img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
});

/* Always compress before uploading. We deliberately DO NOT fall back to sending
   the original raw file: uploading multi-megabyte base64 payloads is the #1 cause
   of uploads dying midway on weak mobile connections. This is enforced uniformly
   for EVERY user — including the media editor — so the app stays lightweight and
   uploads stay fast on mobile data. */
const CATALOG_IMAGE_MAX_DIMENSION = 1000;
const CATALOG_IMAGE_QUALITY = 0.7;

const compressCatalogImage = async (file) => {
    if (!file) throw new Error('NO_FILE');
    try {
        const result = await compressImage(file, CATALOG_IMAGE_MAX_DIMENSION, CATALOG_IMAGE_QUALITY);
        if (result && String(result).indexOf('data:image') === 0) return result;
    } catch (err) {
        console.warn('[catalog] compression failed, retrying at reduced size:', err && err.message ? err.message : err);
    }
    const fallback = await compressImage(file, 800, CATALOG_IMAGE_QUALITY);
    if (fallback && String(fallback).indexOf('data:image') === 0) return fallback;
    throw new Error('COMPRESS_FAILED');
};

const catalogJpegFileName = (name, fallback) => {
    const base = String(name || fallback || 'image').replace(/\.[^.]+$/, '');
    return (base || fallback || 'image') + '.jpg';
};

const CATALOG_UPLOAD_TIMEOUT_MS = 60000;
const CATALOG_UPLOAD_MAX_ATTEMPTS = 3;
const CATALOG_UPLOAD_BASE_BACKOFF_MS = 1000;
/* Contention (LockService BUSY, execution-quota, transient execution errors)
   arrives as an HTTP 200 JSON body from Apps Script's ContentService, so it is
   easy to mistake for a hard failure and surface to the user. The script lock
   can be held for up to ~2 minutes by a concurrent upload, so these are retried
   on a longer schedule — 1s -> 2s -> 4s -> 8s (capped) — and the user never has
   to press upload again. */
const CATALOG_UPLOAD_CONTENTION_MAX_ATTEMPTS = 5;
const CATALOG_UPLOAD_CONTENTION_MAX_BACKOFF_MS = 8000;

const catalogUploadSleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* Single HTTP attempt with a hard timeout so a stalled connection can never hang
   the whole "Sync All" batch. Returns { ok, result, status } or throws on a
   retryable network/timeout error.
   Content-Type is set explicitly to text/plain: it is a CORS "simple request"
   (no OPTIONS preflight), which is what the Apps Script /exec endpoint accepts.
   Do not switch this to application/json — that triggers a preflight the GAS
   web app does not answer. */
const catalogUploadAttempt = async (url, payload) => {
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timedOut = false;
    const timer = controller ? setTimeout(() => { timedOut = true; controller.abort(); }, CATALOG_UPLOAD_TIMEOUT_MS) : null;
    try {
        const response = await fetch(url, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: payload,
            signal: controller ? controller.signal : undefined
        });
        const text = await response.text();
        let result = null;
        try { result = JSON.parse(text); } catch (_) { result = null; }
        return { ok: response.ok, status: response.status, result };
    } catch (err) {
        const wrapped = new Error(timedOut ? 'UPLOAD_TIMEOUT' : ((err && err.message) || 'UPLOAD_NETWORK_ERROR'));
        wrapped.retryable = true;
        wrapped.cause = err;
        throw wrapped;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const catalogUploadRetryDelay = (attempt, contention = false) => {
    const ceiling = contention
        ? CATALOG_UPLOAD_CONTENTION_MAX_BACKOFF_MS
        : CATALOG_UPLOAD_BASE_BACKOFF_MS * Math.pow(2, CATALOG_UPLOAD_MAX_ATTEMPTS - 1);
    const base = Math.min(ceiling, CATALOG_UPLOAD_BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 400);
    return base + jitter;
};

/* Classify one Apps Script response. ContentService always answers HTTP 200,
   so a body that is not `{status:'success'}` (BUSY script lock, quota exceeded,
   a transient execution error, or an unparseable error page) is a *contention*
   failure that must be retried — not a hard 4xx that should abort the upload.
   Returns `null` for a successful body, otherwise a tagged Error. */
const catalogGasResponseError = (ok, status, result) => {
    if (ok && result && result.status === 'success') return null;
    const err = new Error((result && result.message) || ('GAS_HTTP_' + status));
    /* HTTP 200 with a non-success body == GAS-level contention. */
    err.contention = !!ok;
    err.retryable = err.contention || status === 429 || status >= 500 || status === 0;
    return err;
};

/* Run one Apps Script endpoint through the retry/backoff envelope. On success
   `opts.mapResult(result)` yields the caller's value (a Drive URL); a success
   body without a usable URL is treated as transient contention, exactly as
   before. Hard routing failures (404/410/401/403) propagate so the caller can
   fail over to the backup deployment. */
const catalogGasPostToEndpoint = async (url, payload, opts) => {
    let lastError = null;
    for (let attempt = 1; attempt <= CATALOG_UPLOAD_CONTENTION_MAX_ATTEMPTS; attempt++) {
        try {
            const { ok, status, result } = await catalogUploadAttempt(url, payload);
            if (ok && result && result.status === 'success') {
                const mapped = opts.mapResult(result);
                if (mapped) return mapped;
            }
            /* A 200 without a usable URL is still transient GAS contention. */
            throw catalogGasResponseError(ok, status, result)
                || Object.assign(new Error((result && result.message) || 'GAS API Error'), { retryable: true, contention: true });
        } catch (error) {
            lastError = error;
            const maxAttempts = error.contention ? CATALOG_UPLOAD_CONTENTION_MAX_ATTEMPTS : CATALOG_UPLOAD_MAX_ATTEMPTS;
            const canRetry = !!error.retryable && attempt < maxAttempts;
            if (!canRetry) {
                /* Tag with the attempt so the failover layer logs the exact
                   "GAS Upload Failed (attempt N)" line only once, for the final
                   endpoint that actually fails. */
                error.attempt = attempt;
                throw error;
            }
            const wait = catalogUploadRetryDelay(attempt, !!error.contention);
            console.warn('[catalog] ' + opts.retryLog + ' attempt ' + attempt + ' failed (' + (error.message || error) + '); retrying in ' + wait + 'ms');
            await catalogUploadSleep(wait);
        }
    }
    throw lastError || new Error('UPLOAD_FAILED');
};

/* Post to the first live Apps Script endpoint. A dead/unpublished deployment
   answers with a hard 404 (the founder-upload failure), so routing errors
   automatically retry the request against the next candidate endpoint. */
const catalogGasPostWithFailover = async (payload, opts) => {
    const endpoints = catalogGasEndpoints();
    if (!endpoints.length) throw new Error('NO_GAS_URL');
    let lastError = null;
    for (let i = 0; i < endpoints.length; i++) {
        try {
            return await catalogGasPostToEndpoint(endpoints[i], payload, opts);
        } catch (error) {
            lastError = error;
            const routing = /^GAS_HTTP_(404|410|401|403)$/.test(String((error && error.message) || ''));
            if (routing && i < endpoints.length - 1) {
                console.warn('[catalog] ' + opts.retryLog + ' endpoint unavailable (' + error.message + '); failing over to the backup GAS deployment');
                continue;
            }
            console.error(opts.tag + ' Failed (attempt ' + (error.attempt || 1) + '):', error);
            throw error;
        }
    }
    throw lastError || new Error('UPLOAD_FAILED');
};

const catalogDriveResultUrl = (result) => catalogDriveViewUrl(result && (result.id || result.url));

async function uploadCatalogImageToGas(base64Data, fileName, merchantName, imageType) {
    const raw = String(base64Data || '');
    const base64Content = raw.includes(',') ? raw.split(',')[1] : raw;
    const mimeMatch = raw.match(/data:(.*?);/);
    const mimeType = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
    const payload = JSON.stringify({
        merchantName: merchantName || 'Unknown',
        imageType: imageType || 'raw',
        fileName: fileName || 'image.jpg',
        fileContent: base64Content,
        mimeType: mimeType
    });
    return catalogGasPostWithFailover(payload, {
        tag: 'GAS Upload',
        retryLog: 'upload',
        mapResult: catalogDriveResultUrl
    });
}

/* Shared raw-image upload used by the manager KPI preview's "missing image"
   fixer. Reuses the exact same compression + Google Apps Script storage path
   as the catalog so every uploaded file lands in the standard raw-images
   folder with the merchant context intact. */
window.uploadCatalogRawImage = async (file, merchantName) => {
    if (!file) throw new Error('NO_FILE');
    if (!String(file.type || '').startsWith('image/')) throw new Error('NOT_IMAGE');
    if (file.size > CATALOG_MAX_IMAGE_BYTES) throw new Error('TOO_LARGE');
    const base64 = await compressCatalogImage(file);
    const fileName = catalogJpegFileName('raw-' + Date.now(), 'raw.jpg');
    return uploadCatalogImageToGas(base64, fileName, merchantName || 'Unknown', 'raw');
};

/* Ask the catalog Google Apps Script to copy an EXISTING Master Catalog image
   into the selected pharmacy's Drive folder (imageType: 'copy_from_url') and
   return the NEW Drive view URL. Used by the Pharmacy Inventory Intake engine so
   the pharmacy owns its own copy instead of hot-linking the master catalog.
   Reuses the same timeout/retry/backoff envelope and endpoint failover as
   `uploadCatalogImageToGas`. */
window.copyCatalogImageFromUrl = async (sourceUrl, fileName, merchantName) => {
    const url = String(sourceUrl || '').trim();
    if (!url) throw new Error('NO_SOURCE_URL');
    const payload = JSON.stringify({
        merchantName: merchantName || 'Unknown',
        imageType: 'copy_from_url',
        sourceUrl: url,
        fileName: fileName || 'image.jpg'
    });
    return catalogGasPostWithFailover(payload, {
        tag: 'GAS Copy',
        retryLog: 'image copy',
        mapResult: catalogDriveResultUrl
    });
};

const listFinalizedMerchants = () => {
    const map = new Map();
    /* Cross-team collaboration: this picker intentionally lists eligible
       merchants from EVERY team so reps/data-entry can help each other enter
       catalog data. Eligibility is the final agreement (isSigned && achieved>0)
       OR the admin-granted VIP pre-contract flag, which lets reps stage products
       for a merchant still under negotiation. The VIP flag never implies a final
       contract or a commission — it is sales/visibility only. */
    const taskSource = (window.allTasksCache && window.allTasksCache.length)
        ? window.allTasksCache
        : Array.from((window.tasksMemory || new Map()).values());
    /* Reps/data-entry skip the full archive, so eligible merchants are supplied
       by lightweight field-masked reads (window.finalizedMerchantsCache). Merge
       them in — the baseName dedupe below keeps a single entry per merchant. */
    const source = (Array.isArray(window.finalizedMerchantsCache) && window.finalizedMerchantsCache.length)
        ? taskSource.concat(window.finalizedMerchantsCache)
        : taskSource;
    source.forEach((t) => {
        if (!t) return;
        const achieved = Number(t.achieved) || 0;
        const finalized = t.isSigned === true && achieved > 0;
        const vipPreContract = t.vipPreContract === true;
        if (!finalized && !vipPreContract) return;
        const baseName = window.getBaseName ? window.getBaseName(t.name) : String(t.name || '');
        if (!baseName) return;
        if (map.has(baseName)) {
            if (vipPreContract) map.get(baseName).vipPreContract = true;
            return;
        }
        const mid = (window.findMerchantIdForBase && window.findMerchantIdForBase(baseName)) || t.merchantId || baseName;
        const rec = window.merchantsById && window.merchantsById.get(mid);
        const recCat = rec && String(rec.cat || rec.category || '').trim();
        const taskCat = (t.cat && t.cat !== 'متابعة' && t.cat !== 'متابعه') ? t.cat : '';
        const cat = ((recCat && recCat !== 'متابعة' && recCat !== 'متابعه') ? recCat : '') || taskCat;
        map.set(baseName, {
            merchantId: mid,
            merchantName: baseName,
            category: cat,
            team: t.team || '',
            vipPreContract
        });
    });
    return Array.from(map.values()).sort((a, b) => String(a.merchantName).localeCompare(String(b.merchantName), 'ar'));
};
/* Exposed for the Pharmacy Inventory Intake module (`services/pharmacyIntake.js`)
   so its pharmacy picker reuses the exact same eligibility rules as the catalog. */
window.listFinalizedMerchants = listFinalizedMerchants;

const resolveMerchantCategory = (merchant) => {
    const isRealCat = (value) => {
        const cat = String(value || '').trim();
        return cat && cat !== 'متابعة' && cat !== 'متابعه' ? cat : '';
    };
    if (merchant) {
        const fromMerchant = isRealCat(merchant.category);
        if (fromMerchant) return fromMerchant;
    }
    const baseName = merchant && merchant.merchantName;
    if (baseName && window.merchantsById) {
        for (const rec of window.merchantsById.values()) {
            if (!rec || rec.archived === true || !rec.name) continue;
            const recBase = window.getBaseName ? window.getBaseName(rec.name) : String(rec.name || '');
            if (recBase !== baseName) continue;
            const recCat = isRealCat(rec.cat || rec.category);
            if (recCat) return recCat;
        }
    }
    if (baseName) {
        const taskSource = (window.allTasksCache && window.allTasksCache.length)
            ? window.allTasksCache
            : Array.from((window.tasksMemory || new Map()).values());
        for (const t of taskSource) {
            const tBase = window.getBaseName ? window.getBaseName(t.name) : String(t.name || '');
            if (tBase !== baseName) continue;
            const taskCat = isRealCat(t.cat);
            if (taskCat) return taskCat;
        }
    }
    return '';
};

const formatCsvRow = (values) => values.map((val) => '"' + String(val !== undefined && val !== null ? val : '').replace(/[\r\n]+/g, ' - ').replace(/"/g, '""') + '"').join(';');

const catalogRawImageUrls = (p) => {
    const source = (Array.isArray(p && p.rawImageUrls) && p.rawImageUrls.length)
        ? p.rawImageUrls
        : ((p && p.rawImageUrl) ? [p.rawImageUrl] : []);
    return source.map((u) => catalogDirectImageUrl(u)).filter(Boolean);
};

const catalogEnhancedImageUrls = (p) => {
    const source = (Array.isArray(p && p.enhancedImageUrls) && p.enhancedImageUrls.length)
        ? p.enhancedImageUrls
        : ((p && p.enhancedImageUrl) ? [p.enhancedImageUrl] : []);
    return source.map((u) => catalogDirectImageUrl(u)).filter(Boolean);
};

const getCatalogEnhancedLocal = (productId, length, seedUrls) => {
    const store = window._catalogEnhancedUploads || {};
    let current = Array.isArray(store[productId]) ? store[productId].slice() : null;
    /* Seed from the product's already-saved enhanced images so a re-upload of a
       single slot never drops the other (already existing) enhanced images. */
    if (!current) current = Array.isArray(seedUrls) ? seedUrls.map((u) => u || '') : [];
    while (current.length < length) current.push('');
    if (current.length > length) current = current.slice(0, length);
    store[productId] = current;
    window._catalogEnhancedUploads = store;
    return current;
};

const mapCatalogProductToExportRow = (p) => ({
    product_key: (p && p.id) || '',
    product_type: p.product_type || '',
    sku: p.sku || '',
    name_en: p.name_en || '',
    name_ar: p.name_ar || '',
    description_en: p.description_en || '',
    description_ar: p.description_ar || '',
    base_price: Number(p.base_price) || 0,
    main_image_url: catalogEnhancedImageUrls(p)[0] || catalogRawImageUrls(p)[0] || '',
    category: p.category || '',
    status: 'active'
});

let catalogVariationSeq = 0;

window.addCatalogVariationRow = (name, price, imageUrl) => {
    const list = document.getElementById('catalogVariationsList');
    if (!list) return;
    const id = 'catalogVar-' + (++catalogVariationSeq);
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center catalog-variation-row';
    row.id = id;
    const preview = imageUrl ? catalogEscapeHtml(catalogDirectImageUrl(imageUrl) || imageUrl) : '';
    row.innerHTML = `<input type="text" class="catalog-variation-name flex-1 min-w-0 p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-[#230535]" placeholder="الحجم (وسط، كبير) / اللون" value="${catalogEscapeHtml(name || '')}">
        <input type="number" min="0" step="0.01" class="catalog-variation-price w-24 p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-[#230535]" placeholder="السعر" value="${catalogEscapeHtml(price == null ? '' : price)}">
        <input type="file" id="${id}-img" accept="image/*" class="catalog-variation-image-input sr-only" aria-label="صورة الخيار - الكاميرا أو معرض الصور">
        <label for="${id}-img" title="صورة الخيار (اختياري)" class="catalog-variation-image-btn shrink-0 w-11 h-11 rounded-xl border-2 border-dashed border-[#FFD700] grid place-items-center overflow-hidden cursor-pointer bg-white text-[#230535] hover:bg-[#FFD700]/10 transition">
            ${preview ? `<img src="${preview}" class="w-full h-full object-cover" alt="" onerror="this.style.display='none'">` : '<i class="fa-regular fa-image"></i>'}
        </label>
        <button type="button" onclick="removeCatalogVariationRow('${id}')" class="shrink-0 w-10 h-10 rounded-xl bg-red-50 text-red-500 font-black hover:bg-red-100">×</button>`;
    row.dataset.existingImageUrl = imageUrl ? String(imageUrl) : '';
    list.appendChild(row);
    const input = row.querySelector('.catalog-variation-image-input');
    if (input) input.addEventListener('change', (e) => window.onCatalogVariationImageChange(e, id));
};

window.onCatalogVariationImageChange = (event, rowId) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const row = document.getElementById(rowId);
    if (!row) return;
    if (!file || !String(file.type || '').startsWith('image/')) {
        if (input) input.value = '';
        return;
    }
    if (file.size > CATALOG_MAX_IMAGE_BYTES) {
        if (window.showToast) window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);
        if (input) input.value = '';
        return;
    }
    if (row._variantPreviewUrl) URL.revokeObjectURL(row._variantPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    row._variantImageFile = file;
    row._variantPreviewUrl = previewUrl;
    row.dataset.existingImageUrl = '';
    const btn = row.querySelector('.catalog-variation-image-btn');
    if (btn) btn.innerHTML = `<img src="${previewUrl}" class="w-full h-full object-cover" alt="">`;
};

window.removeCatalogVariationRow = (id) => {
    const el = document.getElementById(id);
    if (el) {
        if (el._variantPreviewUrl) URL.revokeObjectURL(el._variantPreviewUrl);
        el.remove();
    }
};

window.showCatalogVariableGuide = () => {
    const modal = document.getElementById('catalogVariableGuideModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const btn = document.getElementById('catalogVariableGuideContinueBtn');
    if (!btn) return;
    if (window._catalogGuideTimer) {
        clearInterval(window._catalogGuideTimer);
        window._catalogGuideTimer = null;
    }
    let remaining = 3;
    btn.disabled = true;
    btn.textContent = 'فهمت ذلك، استمرار (' + remaining + ')';
    window._catalogGuideTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(window._catalogGuideTimer);
            window._catalogGuideTimer = null;
            btn.disabled = false;
            btn.textContent = 'فهمت ذلك، استمرار';
        } else {
            btn.textContent = 'فهمت ذلك، استمرار (' + remaining + ')';
        }
    }, 1000);
};

window.closeCatalogVariableGuide = () => {
    const modal = document.getElementById('catalogVariableGuideModal');
    if (modal) modal.classList.add('hidden');
    if (window._catalogGuideTimer) {
        clearInterval(window._catalogGuideTimer);
        window._catalogGuideTimer = null;
    }
};

window.onCatalogProductTypeChange = () => {
    const typeEl = document.getElementById('catalogProductType');
    const section = document.getElementById('catalogVariationsSection');
    const list = document.getElementById('catalogVariationsList');
    const priceWrap = document.getElementById('catalogBasePriceWrap');
    const priceEl = document.getElementById('catalogBasePrice');
    const isVariable = !!(typeEl && typeEl.value === 'variable');
    if (section) section.classList.toggle('hidden', !isVariable);
    if (priceWrap) priceWrap.classList.toggle('hidden', isVariable);
    if (priceEl) {
        if (isVariable) priceEl.removeAttribute('required');
        else priceEl.setAttribute('required', 'required');
    }
    if (isVariable && list && list.children.length === 0) window.addCatalogVariationRow();
    if (isVariable && !window._catalogEditingProduct) {
        window.showCatalogVariableGuide();
    }
};

const resetCatalogVariations = () => {
    const list = document.getElementById('catalogVariationsList');
    if (list) {
        Array.from(list.children).forEach((row) => {
            if (row._variantPreviewUrl) URL.revokeObjectURL(row._variantPreviewUrl);
        });
        list.innerHTML = '';
    }
    catalogVariationSeq = 0;
    window.onCatalogProductTypeChange();
};

const collectCatalogVariations = () => {
    const rows = document.querySelectorAll('#catalogVariationsList .catalog-variation-row');
    const items = [];
    rows.forEach((row) => {
        const name = String((row.querySelector('.catalog-variation-name') || {}).value || '').trim();
        const priceRaw = String((row.querySelector('.catalog-variation-price') || {}).value || '').trim();
        /* Read the attached file straight off the input element as the
           authoritative source. `row._variantImageFile` is only a cache set by
           the change handler; if that handler is ever missed (e.g. a
           pre-rendered row whose binding was lost), the file would otherwise be
           silently dropped while the rest of the product still saves. */
        const imageInput = row.querySelector('.catalog-variation-image-input');
        const inputImageFile = (imageInput && imageInput.files && imageInput.files[0]) || null;
        items.push({
            name,
            priceRaw,
            price: Number(priceRaw),
            imageFile: inputImageFile || row._variantImageFile || null,
            existingImageUrl: String(row.dataset.existingImageUrl || '')
        });
    });
    return items;
};

/* ─── Searchable merchant combobox (Fuse.js fuzzy search) ───
   Replaces the native <select> in "إضافة منتج للكتالوج", which was unusable
   with hundreds of merchants. The chosen merchantId is written to the hidden
   #catalogMerchantSelect input (same id), so every existing consumer that
   reads `.value` keeps working unchanged. Matching runs entirely on the
   already-loaded finalized-merchants array — zero Firestore reads. */
let _catalogMerchantFuse = null;
let _catalogMerchantFuseSig = '';

const fillCatalogMerchantOptions = (extraMerchant) => {
    const merchants = listFinalizedMerchants();
    window._catalogMerchantMap = {};
    merchants.forEach((m) => { window._catalogMerchantMap[m.merchantId] = m; });
    if (extraMerchant && extraMerchant.merchantId && !window._catalogMerchantMap[extraMerchant.merchantId]) {
        merchants.unshift(extraMerchant);
        window._catalogMerchantMap[extraMerchant.merchantId] = extraMerchant;
    }
    window._catalogMerchantList = merchants;
    /* Invalidate the Fuse index so the combobox rebinds to the new list. */
    _catalogMerchantFuse = null;
    _catalogMerchantFuseSig = '';
    /* Defensive legacy path: if a real <select> is ever present, keep filling
       it. The shipped markup uses a hidden input + custom combobox. */
    const select = document.getElementById('catalogMerchantSelect');
    if (select && select.tagName === 'SELECT') {
        if (merchants.length === 0) {
            select.innerHTML = '<option value="">لا يوجد تجار متعاقدون أو تحت التعاقد (VIP)</option>';
        } else {
            select.innerHTML = '<option value="">اختر التاجر...</option>' + merchants.map((m) => {
                const id = catalogEscapeHtml(m.merchantId);
                const name = catalogEscapeHtml(m.merchantName);
                const marker = m.vipPreContract ? ' — تحت التعاقد (VIP)' : '';
                return `<option value="${id}">${name}${marker}</option>`;
            }).join('');
        }
    }
    setCatalogMerchantInputLabel();
};

/* Repopulate the merchant picker in place once the lightweight finalized
   merchants read resolves (no-op when the modal is closed). */
window.refreshCatalogMerchantOptions = () => {
    if (document.getElementById('catalogMerchantSelect')) fillCatalogMerchantOptions();
};

/* How many fuzzy matches to render at once (keeps the popup snappy). */
const CATALOG_MERCHANT_MAX_RESULTS = 50;

/* Normalize Arabic and strip punctuation/dots so "ش. اولاد رجب" matches the
   normalized index used for fuzzy matching. */
const catalogMerchantSearchText = (name) => normalizeArabicSearchText(name);

const catalogMerchantListSignature = (list) => (list || [])
    .map((m) => m.merchantId + ':' + m.merchantName + (m.vipPreContract ? ':vip' : '')).join('|');

/* Build (or reuse) the Fuse index over the in-memory merchant list. */
const rebuildCatalogMerchantFuse = (list) => {
    const sig = catalogMerchantListSignature(list);
    if (_catalogMerchantFuse && _catalogMerchantFuseSig === sig) return _catalogMerchantFuse;
    _catalogMerchantFuseSig = sig;
    if (!window.Fuse || !(list || []).length) {
        _catalogMerchantFuse = null;
        return null;
    }
    const index = (list || []).map((m) => ({ ...m, _search: catalogMerchantSearchText(m.merchantName) }));
    _catalogMerchantFuse = new window.Fuse(index, {
        keys: ['_search'],
        threshold: 0.4,
        distance: 200,
        ignoreLocation: true,
        minMatchCharLength: 1,
        includeScore: true
    });
    return _catalogMerchantFuse;
};

/* Fuzzy-match the typed query against the merchants; empty query lists the
   first merchants so the popup is never blank. Falls back to an in-memory
   substring scan when Fuse.js failed to load. */
const catalogMerchantMatch = (query) => {
    const list = window._catalogMerchantList || [];
    if (!list.length) return [];
    const raw = String(query || '').trim();
    if (!raw) return list.slice(0, CATALOG_MERCHANT_MAX_RESULTS);
    const normalized = catalogMerchantSearchText(raw);
    const fuse = rebuildCatalogMerchantFuse(list);
    if (!fuse) {
        return list.filter((m) => catalogMerchantSearchText(m.merchantName).includes(normalized))
            .slice(0, CATALOG_MERCHANT_MAX_RESULTS);
    }
    return fuse.search(normalized).slice(0, CATALOG_MERCHANT_MAX_RESULTS).map((r) => r.item);
};

/* Park the results list on <body> (absolute) so the modal's scroll container
   can never clip it. */
const positionCatalogMerchantSearchList = () => {
    const input = document.getElementById('catalogMerchantSearchInput');
    const box = document.getElementById('catalogMerchantSearchList');
    if (!input || !box || box.classList.contains('hidden')) return;
    const rect = input.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportOffsetLeft = vv ? vv.offsetLeft : 0;
    const viewportOffsetTop = vv ? vv.offsetTop : 0;
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const gutter = 8;
    const width = Math.max(180, Math.min(rect.width, viewportWidth - gutter * 2));
    const clampedLeft = Math.max(viewportOffsetLeft + gutter, Math.min(rect.left, viewportOffsetLeft + viewportWidth - width - gutter));
    const boxHeight = box.offsetHeight || 0;
    const viewportBottom = viewportOffsetTop + viewportHeight;
    const spaceBelow = viewportBottom - rect.bottom;
    const spaceAbove = rect.top - viewportOffsetTop;
    const openAbove = (spaceBelow < boxHeight + 12) && (spaceAbove > spaceBelow);
    const available = openAbove ? (spaceAbove - 6) : (spaceBelow - 6);
    const topDoc = (openAbove ? rect.top - boxHeight - 6 : rect.bottom + 6) + scrollY;
    box.style.position = 'absolute';
    box.style.width = width + 'px';
    box.style.left = (clampedLeft + scrollX) + 'px';
    box.style.top = Math.max(viewportOffsetTop + scrollY + 4, topDoc) + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    box.style.maxHeight = Math.max(120, Math.min(288, available)) + 'px';
    box.style.zIndex = '9999';
};
window.positionCatalogMerchantSearchList = positionCatalogMerchantSearchList;

const hideCatalogMerchantSearchList = () => {
    const box = document.getElementById('catalogMerchantSearchList');
    window._catalogMerchantActiveIndex = -1;
    const input = document.getElementById('catalogMerchantSearchInput');
    if (input) input.setAttribute('aria-expanded', 'false');
    if (!box) return;
    box.classList.add('hidden');
    box.innerHTML = '';
};
window.hideCatalogMerchantSearchList = hideCatalogMerchantSearchList;

/* Reflect the hidden input's selected merchant on the visible search input. */
const setCatalogMerchantInputLabel = () => {
    const input = document.getElementById('catalogMerchantSearchInput');
    const select = document.getElementById('catalogMerchantSelect');
    const clearBtn = document.getElementById('catalogMerchantSearchClear');
    if (!input || !select) return;
    const id = String(select.value || '');
    const merchant = (window._catalogMerchantMap && window._catalogMerchantMap[id]) || null;
    input.value = merchant ? merchant.merchantName : '';
    if (clearBtn) clearBtn.classList.toggle('hidden', !id);
};
window.setCatalogMerchantInputLabel = setCatalogMerchantInputLabel;

const renderCatalogMerchantSearchList = () => {
    const input = document.getElementById('catalogMerchantSearchInput');
    const box = document.getElementById('catalogMerchantSearchList');
    if (!input || !box) return;
    input.setAttribute('aria-expanded', 'true');
    const query = String(input.value || '').trim();
    const results = catalogMerchantMatch(query);
    if (!(window._catalogMerchantList || []).length) {
        box.innerHTML = '<li class="px-3 py-3 text-center text-xs font-bold text-slate-400">لا يوجد تجار متعاقدون أو تحت التعاقد (VIP)</li>';
        window._catalogMerchantActiveIndex = -1;
        box.classList.remove('hidden');
        positionCatalogMerchantSearchList();
        return;
    }
    if (!results.length) {
        box.innerHTML = '<li class="px-3 py-3 text-center text-xs font-bold text-slate-400">لا يوجد تاجر مطابق لبحثك</li>';
        window._catalogMerchantActiveIndex = -1;
        box.classList.remove('hidden');
        positionCatalogMerchantSearchList();
        return;
    }
    window._catalogMerchantActiveIndex = 0;
    box.innerHTML = results.map((m, idx) => {
        const id = catalogEscapeHtml(m.merchantId);
        const name = catalogEscapeHtml(m.merchantName);
        const marker = m.vipPreContract
            ? '<span class="shrink-0 text-[10px] font-black text-[#E57723] bg-[#E57723]/10 px-2 py-0.5 rounded-full">تحت التعاقد (VIP)</span>'
            : '';
        return `<li role="option" data-catalog-merchant-option="${id}" class="${idx === 0 ? 'bg-[#FFD700]/25' : ''} cursor-pointer flex items-center justify-between gap-2 px-3 py-2.5 text-right hover:bg-[#FFD700]/15 border-b border-purple-50 last:border-b-0">
            <span class="font-black text-[13px] text-[#230535] truncate">${name}</span>
            ${marker}
        </li>`;
    }).join('');
    box.classList.remove('hidden');
    positionCatalogMerchantSearchList();
    box.querySelectorAll('[data-catalog-merchant-option]').forEach((li) => {
        li.addEventListener('click', () => window.selectCatalogMerchant(li.getAttribute('data-catalog-merchant-option')));
    });
};
window.renderCatalogMerchantSearchList = renderCatalogMerchantSearchList;

window.selectCatalogMerchant = (merchantId) => {
    const select = document.getElementById('catalogMerchantSelect');
    if (!select) return;
    select.value = String(merchantId || '');
    setCatalogMerchantInputLabel();
    hideCatalogMerchantSearchList();
    if (typeof window.onCatalogMerchantChange === 'function') window.onCatalogMerchantChange();
};

window.clearCatalogMerchantSelection = () => {
    const select = document.getElementById('catalogMerchantSelect');
    if (select) select.value = '';
    const input = document.getElementById('catalogMerchantSearchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('catalogMerchantSearchClear');
    if (clearBtn) clearBtn.classList.add('hidden');
    hideCatalogMerchantSearchList();
    if (typeof window.onCatalogMerchantChange === 'function') window.onCatalogMerchantChange();
};

/* Typing a fresh query drops the previous selection until a merchant is
   picked again, so the hidden value can never point at a stale merchant. */
window.onCatalogMerchantSearchInput = (event) => {
    const input = event && event.target;
    if (!input) return;
    const select = document.getElementById('catalogMerchantSelect');
    if (select) select.value = '';
    const clearBtn = document.getElementById('catalogMerchantSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !String(input.value || '').trim());
    renderCatalogMerchantSearchList();
};

window.onCatalogMerchantSearchKeydown = (event) => {
    const box = document.getElementById('catalogMerchantSearchList');
    if (!box || box.classList.contains('hidden')) {
        if (event.key === 'ArrowDown') { renderCatalogMerchantSearchList(); event.preventDefault(); }
        return;
    }
    const options = Array.from(box.querySelectorAll('[data-catalog-merchant-option]'));
    if (!options.length) {
        if (event.key === 'Escape') hideCatalogMerchantSearchList();
        return;
    }
    let idx = window._catalogMerchantActiveIndex;
    if (event.key === 'ArrowDown') idx = Math.min(options.length - 1, idx + 1);
    else if (event.key === 'ArrowUp') idx = Math.max(0, idx - 1);
    else if (event.key === 'Enter') {
        if (idx >= 0 && options[idx]) { event.preventDefault(); options[idx].click(); }
        return;
    } else if (event.key === 'Escape') {
        hideCatalogMerchantSearchList();
        return;
    } else {
        return;
    }
    event.preventDefault();
    window._catalogMerchantActiveIndex = idx;
    options.forEach((li, i) => li.classList.toggle('bg-[#FFD700]/25', i === idx));
    if (options[idx]) options[idx].scrollIntoView({ block: 'nearest' });
};

window.bindCatalogMerchantCombobox = () => {
    const input = document.getElementById('catalogMerchantSearchInput');
    const box = document.getElementById('catalogMerchantSearchList');
    if (!input || input._catalogMerchantBound) return;
    input._catalogMerchantBound = true;
    if (box && box.parentNode !== document.body) document.body.appendChild(box);
    input.addEventListener('input', () => {
        /* Typing drops the previous selection immediately so the hidden
           value can never submit a stale merchant while the debounced
           render is still pending. */
        const select = document.getElementById('catalogMerchantSelect');
        if (select) select.value = '';
        const clearBtn = document.getElementById('catalogMerchantSearchClear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !String(input.value || '').trim());
        if (window._catalogMerchantTimer) clearTimeout(window._catalogMerchantTimer);
        window._catalogMerchantTimer = setTimeout(window.renderCatalogMerchantSearchList, 120);
    });
    input.addEventListener('focus', () => { renderCatalogMerchantSearchList(); });
    input.addEventListener('keydown', window.onCatalogMerchantSearchKeydown);
    input.addEventListener('blur', () => {
        /* Grace period lets a tap on an option land before we tear down. */
        setTimeout(() => {
            if (window._catalogMerchantTouching) return;
            hideCatalogMerchantSearchList();
            setCatalogMerchantInputLabel();
        }, 250);
    });
    if (box) {
        box.addEventListener('mousedown', (event) => { if (event.cancelable) event.preventDefault(); });
        box.addEventListener('touchstart', () => { window._catalogMerchantTouching = true; }, { passive: true });
        box.addEventListener('touchend', () => { setTimeout(() => { window._catalogMerchantTouching = false; }, 300); });
        box.addEventListener('touchcancel', () => { window._catalogMerchantTouching = false; });
    }
};

const catalogProductThumbUrl = (p) => {
    const enhanced = catalogEnhancedImageUrls(p);
    if (enhanced[0]) return catalogDriveThumbnailUrl(enhanced[0]) || enhanced[0];
    const raw = catalogRawImageUrls(p);
    if (raw[0]) return catalogDriveThumbnailUrl(raw[0]) || raw[0];
    return '';
};

const catalogProductFullImageUrls = (p) => {
    const enhanced = catalogEnhancedImageUrls(p);
    if (enhanced.length) return enhanced;
    return catalogRawImageUrls(p);
};

const findCatalogProductById = (productId) => {
    const caches = [
        window.allCatalogProductsCache,
        window.repCatalogProductsCache,
        window.catalogDeleteRequestsCache
    ];
    for (let i = 0; i < caches.length; i++) {
        const cache = caches[i];
        if (!Array.isArray(cache)) continue;
        const found = cache.find((p) => p.id === productId);
        if (found) return found;
    }
    return null;
};

const catalogProductLightboxUrl = (p) => {
    const full = catalogProductFullImageUrls(p)[0] || '';
    if (!full) return '';
    const id = catalogDriveFileId(full);
    if (id) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w2000';
    return full;
};

/* Google's thumbnail service refuses to render a size that exceeds the stored
   image (it answers 404 with an HTML body, which the browser then blocks by
   ORB). That made the full-size lightbox fail for rows whose card thumbnail
   rendered fine — e.g. a small original that succeeds at `sz=w200-h200` but
   404s at `sz=w1600`. Returning the size chain lets the lightbox step down to
   a renderable size instead of showing the "no image" state. */
const catalogDriveLightboxUrls = (urlOrId, primarySize) => {
    const id = catalogDriveFileId(urlOrId);
    if (!id) return urlOrId ? [String(urlOrId)] : [];
    const sizes = [primarySize || 'w2000', 'w1000', 'w400', 'w200-h200'];
    const seen = new Set();
    const urls = [];
    sizes.forEach((s) => {
        const u = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=' + s;
        if (!seen.has(u)) { seen.add(u); urls.push(u); }
    });
    return urls;
};

const catalogClickableThumbHtml = (p, opts) => {
    const pid = catalogEscapeHtml((p && p.id) || '');
    const thumb = catalogEscapeHtml(catalogProductThumbUrl(p));
    const full = catalogEscapeHtml(catalogProductLightboxUrl(p));
    const imgClass = (opts && opts.imgClass) || 'w-16 h-16 rounded-xl object-cover border border-[#230535]/15 shrink-0 cursor-pointer transition-opacity duration-200 hover:opacity-75';
    const boxClass = (opts && opts.boxClass) || 'w-16 h-16 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0 cursor-pointer transition-opacity duration-200 hover:opacity-75';
    const click = pid
        ? `onclick="event.stopPropagation();openCatalogProductLightbox('${pid}')"`
        : `onclick="event.stopPropagation();openImageLightbox(this)"`;
    if (!thumb || !full) {
        return `<div class="${boxClass}" ${click} title="عرض الصورة" role="button"><i class="fa-regular fa-image"></i></div>`;
    }
    return `<img src="${thumb}" data-full-img="${full}" alt="" loading="lazy" decoding="async" class="${imgClass}" ${click} title="عرض الصورة بالحجم الكامل" onerror="this.style.display='none'">`;
};

/* Open the shared lightbox for a specific product, resolving its full-resolution
   image from the live caches. When the product has no image, the lightbox shows
   a friendly empty-state message instead. */
window.openCatalogProductLightbox = (productId) => {
    const product = findCatalogProductById(productId);
    if (!product) { window.openImageViewer(''); return; }
    const full = catalogProductFullImageUrls(product)[0] || '';
    const urls = catalogDriveLightboxUrls(full, 'w2000');
    window.openImageViewer(urls[0] || '', urls.slice(1));
};

window.openImageLightbox = (el) => {
    if (el && typeof el.stopPropagation === 'function') el.stopPropagation();
    const node = (el && el.getAttribute) ? el : null;
    const url = node ? String(node.getAttribute('data-full-img') || '').trim() : '';
    const thumb = node ? String(node.getAttribute('src') || '').trim() : '';
    const fallbacks = url ? catalogDriveLightboxUrls(url, 'w2000').slice(1) : [];
    if (thumb && thumb !== url && fallbacks.indexOf(thumb) === -1) fallbacks.push(thumb);
    window.openImageViewer(url, fallbacks);
};

/* Shared full-screen viewer. `url` is the preferred (largest) source;
   `fallbacks` is an optional ordered list the viewer steps through if the
   preferred size is unavailable, so a renderable image is shown instead of the
   empty state whenever one exists. */
window.openImageViewer = (url, fallbacks) => {
    const overlay = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    const empty = document.getElementById('imageLightboxEmpty');
    if (!overlay || !img) return;
    const src = String(url || '').trim();
    const queue = (Array.isArray(fallbacks) ? fallbacks : [])
        .map((u) => String(u || '').trim())
        .filter((u) => u && u !== src);
    img.onerror = function () {
        let list = [];
        try { list = JSON.parse(this.dataset.fallbacks || '[]'); } catch (err) { list = []; }
        if (list.length) {
            this.dataset.fallbacks = JSON.stringify(list.slice(1));
            this.src = list[0];
            return;
        }
        this.style.display = 'none';
        const e = document.getElementById('imageLightboxEmpty');
        if (e) e.classList.remove('hidden');
    };
    img.onload = function () {
        this.style.display = 'block';
        const e = document.getElementById('imageLightboxEmpty');
        if (e) e.classList.add('hidden');
    };
    if (!src) {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (empty) empty.classList.remove('hidden');
    } else {
        if (empty) empty.classList.add('hidden');
        img.dataset.fallbacks = JSON.stringify(queue);
        img.style.display = 'block';
        img.src = src;
    }
    overlay.classList.remove('hidden');
};

window.closeImageLightbox = () => {
    const overlay = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    const empty = document.getElementById('imageLightboxEmpty');
    if (overlay) overlay.classList.add('hidden');
    if (img) { img.style.display = 'none'; img.removeAttribute('src'); img.dataset.fallbacks = '[]'; }
    if (empty) empty.classList.add('hidden');
};

/* High-resolution, inline image preview via SweetAlert2 (no browser download).
   Reads the element's `data-full-img` (a Drive url/id) and upgrades it to the
   largest renderable Google thumbnail. Falls back to the built-in lightbox /
   native dialog when the SweetAlert2 CDN is unavailable. */
window.catalogOpenSwalImage = (el) => {
    const node = (el && el.getAttribute) ? el : null;
    const raw = node ? String(node.getAttribute('data-full-img') || '').trim() : '';
    const title = node ? String(node.getAttribute('data-image-title') || '').trim() : '';
    const urls = raw ? catalogDriveLightboxUrls(raw, 'w2000') : [];
    const primary = urls[0] || raw;
    if (!primary) { window.openImageViewer(''); return; }
    if (typeof window.Swal === 'undefined') {
        window.openImageViewer(raw, urls.slice(1));
        return;
    }
    window.Swal.fire({
        title: title ? catalogEscapeHtml(title) : undefined,
        imageUrl: primary,
        imageAlt: title,
        confirmButtonText: 'إغلاق',
        confirmButtonColor: '#230535',
        width: 'min(94vw, 920px)',
        padding: '0.75rem',
        showCloseButton: true,
        imageClass: 'rounded-xl'
    });
};

/* ─────────── Product details modal (admin/manager audit) ───────────
   Surfaces the fields management needs to spot bad data entry: the exact
   name, base price, the full raw description (highlighted), every variation
   with its price/barcode, and who added it. */
const catalogProductDetailsHtml = (p) => {
    const name = catalogEscapeHtml(p.name_ar || p.name_en || p.name || 'بدون اسم');
    const nameEn = p.name_en ? catalogEscapeHtml(p.name_en) : '';
    const price = p.base_price == null || p.base_price === '' ? '—' : catalogEscapeHtml(p.base_price);
    const desc = String(p.description_ar || p.description_en || p.description || '').trim();
    const descHtml = desc
        ? `<div class="whitespace-pre-wrap break-words">${catalogEscapeHtml(desc)}</div>`
        : '<span class="text-slate-400 font-bold">لا يوجد وصف لهذا المنتج</span>';
    const sku = catalogEscapeHtml(p.sku || p.barcode || '');
    const category = catalogEscapeHtml(p.category || '');
    const rep = catalogEscapeHtml(catalogRepDisplayName(p));
    const variations = (Array.isArray(p.variations) ? p.variations : [])
        .filter((v) => v && String(v.name || '').trim());
    const varsHtml = variations.length
        ? `<div class="overflow-x-auto rounded-xl border border-[#230535]/10">
                <table class="w-full text-right text-[12px] border-collapse">
                    <thead class="bg-[#230535] text-[#FFD700]">
                        <tr>
                            <th class="px-3 py-2 font-black">#</th>
                            <th class="px-3 py-2 font-black">اسم الخيار</th>
                            <th class="px-3 py-2 font-black">السعر</th>
                            <th class="px-3 py-2 font-black">الباركود</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white">
                        ${variations.map((v, i) => {
                            const vname = catalogEscapeHtml(v.name);
                            const vprice = v.price == null || v.price === '' ? '—' : catalogEscapeHtml(v.price);
                            const vbarcode = catalogEscapeHtml(v.barcode || v.sku || '—');
                            return `<tr class="${i % 2 ? 'bg-purple-50/50' : ''} border-t border-[#230535]/5">
                                <td class="px-3 py-2 font-bold text-slate-400">${i + 1}</td>
                                <td class="px-3 py-2 font-black text-[#230535]">${vname}</td>
                                <td class="px-3 py-2 font-black text-[#E57723] whitespace-nowrap">${vprice} ج.م</td>
                                <td class="px-3 py-2 font-bold text-slate-500">${vbarcode}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`
        : '<div class="text-slate-400 font-bold text-[12px] bg-slate-50 border border-dashed border-[#230535]/15 rounded-xl px-3 py-3">منتج بسيط بدون متغيرات</div>';

    return `
    <div class="rounded-2xl border border-[#230535]/10 bg-slate-50 p-3">
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <div class="font-black text-base text-[#230535] break-words">${name}</div>
                ${nameEn ? `<div class="text-[11px] font-bold text-slate-400 mt-0.5">${nameEn}</div>` : ''}
                ${(category || sku) ? `<div class="flex flex-wrap gap-1.5 mt-2">
                    ${category ? `<span class="text-[10px] font-black bg-[#230535]/10 text-[#230535] px-2 py-0.5 rounded-full">${category}</span>` : ''}
                    ${sku ? `<span class="text-[10px] font-black bg-[#6D28D9]/10 text-[#6D28D9] px-2 py-0.5 rounded-full">SKU: ${sku}</span>` : ''}
                </div>` : ''}
            </div>
            <div class="shrink-0 text-center bg-white border border-[#FFD700]/60 rounded-2xl px-3 py-2">
                <div class="text-[10px] font-black text-slate-400">السعر الأساسي</div>
                <div class="font-black text-lg text-[#E57723]">${price} ج.م</div>
            </div>
        </div>
    </div>

    <div class="rounded-2xl border-2 border-[#FFD700]/70 bg-[#FFD700]/10 p-3">
        <div class="text-[11px] font-black text-[#230535] mb-1.5 flex items-center gap-1.5"><i class="fa-solid fa-align-right"></i> الوصف الكامل</div>
        <div class="text-[12px] font-bold text-[#230535] leading-relaxed">${descHtml}</div>
    </div>

    <div>
        <div class="text-[11px] font-black text-[#230535] mb-1.5 flex items-center gap-1.5"><i class="fa-solid fa-list"></i> المتغيرات (${variations.length})</div>
        ${varsHtml}
    </div>

    <div class="rounded-2xl bg-[#230535] text-white p-3 flex items-center justify-between gap-2">
        <div class="text-[11px] font-black text-white/70 flex items-center gap-1.5"><i class="fa-solid fa-user-pen"></i> أضافه</div>
        <div class="font-black text-sm text-[#FFD700] truncate">${rep}</div>
    </div>`;
};

window.openCatalogProductDetails = (productId) => {
    const product = findCatalogProductById(productId);
    if (!product) {
        if (window.showToast) window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    if (window.kanjoAuditLogView) {
        const detailName = product.name_ar || product.name_en || product.name || productId;
        window.kanjoAuditLogView({
            entityKind: 'product',
            targetEntity: 'منتج',
            targetId: productId,
            targetName: detailName,
            description: `عرض تفاصيل المنتج «${detailName}»`,
            collection: 'merchant_products'
        });
    }
    const modal = document.getElementById('catalogProductDetailsModal');
    const card = document.getElementById('catalogProductDetailsCard');
    const body = document.getElementById('catalogProductDetailsBody');
    if (!modal || !card || !body) return;
    if (window._catalogDetailsHideTimer) { clearTimeout(window._catalogDetailsHideTimer); window._catalogDetailsHideTimer = null; }
    body.innerHTML = catalogProductDetailsHtml(product);
    if (card) card.scrollTop = 0;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => card.classList.remove('opacity-0', 'scale-95'));
};

window.closeCatalogProductDetails = () => {
    const modal = document.getElementById('catalogProductDetailsModal');
    const card = document.getElementById('catalogProductDetailsCard');
    if (!modal) return;
    if (card) card.classList.add('opacity-0', 'scale-95');
    if (window._catalogDetailsHideTimer) clearTimeout(window._catalogDetailsHideTimer);
    window._catalogDetailsHideTimer = setTimeout(() => {
        modal.classList.add('hidden');
        window._catalogDetailsHideTimer = null;
    }, 180);
};

const hideCatalogSavedImages = () => {
    const wrap = document.getElementById('catalogCurrentImagesWrap');
    const box = document.getElementById('catalogCurrentImages');
    if (wrap) wrap.classList.add('hidden');
    if (box) box.innerHTML = '';
};

const renderCatalogSavedImages = (product) => {
    const wrap = document.getElementById('catalogCurrentImagesWrap');
    const box = document.getElementById('catalogCurrentImages');
    if (!wrap || !box) return;
    const urls = catalogProductFullImageUrls(product);
    wrap.classList.remove('hidden');
    if (!urls.length) {
        box.innerHTML = '<div class="w-20 h-20 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60"><i class="fa-regular fa-image text-xl"></i></div>';
        return;
    }
    box.innerHTML = urls.map((u) => {
        const thumb = catalogEscapeHtml(catalogDriveThumbnailUrl(u) || catalogDriveViewUrl(u) || u);
        const full = catalogEscapeHtml(catalogDriveViewUrl(u) || u);
        return `<img src="${thumb}" data-full="${full}" alt="صورة محفوظة" loading="lazy" decoding="async" class="w-20 h-20 rounded-xl object-cover border-2 border-[#230535]/25 shadow-sm cursor-pointer" onclick="openImageLightbox(this)" data-full-img="${full}" onerror="if(this.dataset.full&&this.src!==this.dataset.full){this.src=this.dataset.full;}else{this.style.display='none';}">`;
    }).join('');
};

const setCatalogModalChrome = () => {
    const editing = !!window._catalogEditingProduct;
    const title = document.getElementById('catalogProductModalTitle');
    const subtitle = document.getElementById('catalogProductModalSubtitle');
    const saveAnother = document.getElementById('catalogProductSubmitBtn');
    const saveClose = document.getElementById('catalogProductSaveCloseBtn');
    if (title) title.textContent = editing ? 'تعديل المنتج' : 'إضافة منتج للكتالوج';
    if (subtitle) subtitle.textContent = editing ? 'عدّل البيانات والصورة ثم احفظ مباشرة' : 'للتاجر المتعاقد نهائياً فقط';
    if (saveAnother && !saveAnother.disabled) saveAnother.textContent = editing ? 'حفظ التعديلات' : 'حفظ وإضافة منتج آخر';
    if (saveClose) saveClose.classList.toggle('hidden', editing);
};

const resetCatalogEditState = () => {
    window._catalogEditingProduct = null;
    hideCatalogSavedImages();
    setCatalogModalChrome();
    if (typeof window.updateMasterCatalogSearchVisibility === 'function') window.updateMasterCatalogSearchVisibility();
};

const isSupermarketMerchant = (merchant) => {
    const cat = String((merchant && (merchant.category || merchant.cat)) || resolveMerchantCategory(merchant) || '').trim();
    return cat.includes('سوبر ماركت') || cat.toLowerCase().includes('supermarket');
};

const selectedCatalogMerchant = () => {
    const merchantId = (document.getElementById('catalogMerchantSelect') || {}).value || '';
    return (window._catalogMerchantMap && window._catalogMerchantMap[merchantId]) || null;
};

const isKanjoDriveImageUrl = (url) => !!catalogDriveFileId(url);

window.updateMasterCatalogSearchVisibility = () => {
    const wrap = document.getElementById('masterCatalogSearchWrap');
    if (!wrap) return;
    wrap.classList.toggle('hidden', !isSupermarketMerchant(selectedCatalogMerchant()));
};

window.onCatalogMerchantChange = () => {
    window.updateMasterCatalogSearchVisibility();
    window.hideCatalogNameSuggestions();
    fetchCatalogAutocompleteCache();
};

window.closeMasterCatalogSearchModal = () => {
    const modal = document.getElementById('masterCatalogSearchModal');
    if (modal) modal.classList.add('hidden');
};

const MASTER_CATALOG_SEARCH_SYNONYMS = {
    'قهوه': ['كوفي', 'coffee'],
    'كوفي': ['قهوه', 'coffee'],
    coffee: ['قهوه', 'كوفي'],
    'حليب': ['لبن', 'milk'],
    'لبن': ['حليب', 'milk'],
    milk: ['حليب', 'لبن'],
    'شاي': ['شاهي', 'tea'],
    'شاهي': ['شاي', 'tea'],
    tea: ['شاي', 'شاهي'],
    'زبادي': ['زبادى', 'yogurt', 'yoghurt'],
    'زبادى': ['زبادي', 'yogurt', 'yoghurt']
};

const normalizeArabicSearchText = (value) => String(value || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/گ/g, 'ك')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* Standalone Arabic normalization helper used by the "Add Product" smart
   autocomplete and the Kanjo category matcher. Removes tashkeel/tatweel,
   unifies alef forms and hamza carriers, normalizes taa marbuta and alef
   maqsura so morphological variations collapse to the same searchable string. */
const normalizeArabic = (str) => String(str || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
window.normalizeArabic = normalizeArabic;

/* Egyptian e-commerce synonym dictionary. Keys/values are normalized lazily
   below so lookups work regardless of the spelling the user typed. */
const searchSynonyms = {
    'فراخ': ['فرخه', 'دجاج'],
    'فرخه': ['فراخ', 'دجاج'],
    'دجاج': ['فراخ', 'فرخه'],
    'برجر': ['برغر', 'همبرجر', 'burger'],
    'شاورما': ['شاورمه'],
    'بطاطس': ['بطاطا', 'فرايز']
};

const normalizedSearchSynonyms = (() => {
    const map = {};
    Object.keys(searchSynonyms).forEach((key) => {
        const normKey = normalizeArabic(key);
        if (!normKey) return;
        const aliases = (map[normKey] || []).concat((searchSynonyms[key] || []).map(normalizeArabic));
        map[normKey] = aliases.filter((alias, i) => alias && aliases.indexOf(alias) === i);
    });
    return map;
})();

const masterCatalogSearchHaystack = (item) => normalizeArabicSearchText([
    item && item.name,
    item && item.name_ar,
    item && item.name_en,
    item && item.category,
    item && item.sku,
    item && item.id,
    item && item.kanjo_id
].filter(Boolean).join(' '));

const masterCatalogSearchTokens = (query) => normalizeArabicSearchText(query).split(' ').filter(Boolean);

const tokenSearchAliases = (token) => {
    const aliases = [token];
    (MASTER_CATALOG_SEARCH_SYNONYMS[token] || []).forEach((alias) => {
        const norm = normalizeArabicSearchText(alias);
        if (norm) aliases.push(norm);
    });
    return aliases;
};

const masterCatalogSearchScore = (item, tokens) => {
    const hay = item._searchHay || masterCatalogSearchHaystack(item);
    const nameHay = normalizeArabicSearchText(item.name || item.name_ar || item.name_en || '');
    let score = 0;
    const allMatch = tokens.every((token) => {
        const aliases = tokenSearchAliases(token);
        const hit = aliases.some((alias) => hay.includes(alias));
        if (!hit) return false;
        if (aliases.some((alias) => nameHay === alias)) score += 100;
        else if (aliases.some((alias) => nameHay.startsWith(alias))) score += 40;
        else if (aliases.some((alias) => nameHay.includes(alias))) score += 20;
        else score += 8;
        return true;
    });
    return allMatch ? score : 0;
};

const isMasterCatalogImageUrl = (url) => isKanjoDriveImageUrl(url);

const masterCatalogThumbUrl = (url) => catalogDriveThumbnailUrl(url) || catalogDriveViewUrl(url) || '';

const masterCatalogFullImageUrl = (url) => catalogDriveViewUrl(url) || catalogDriveThumbnailUrl(url) || '';

const hydrateMasterCatalogItem = (docId, data) => {
    const item = { ...(data || {}) };
    item.id = String(item.id || item.kanjo_id || docId || '').trim();
    item._searchHay = masterCatalogSearchHaystack(item);
    return item;
};

window.openMasterCatalogSearchModal = async () => {
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    if (!isSupermarketMerchant(selectedCatalogMerchant())) {
        if (window.showToast) window.showToast('البحث المرجعي متاح لتجار السوبر ماركت فقط', false);
        return;
    }
    const modal = document.getElementById('masterCatalogSearchModal');
    const input = document.getElementById('masterCatalogSearchInput');
    const results = document.getElementById('masterCatalogSearchResults');
    if (input) input.value = '';
    if (results) results.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold">اكتب كلمة للبحث</div>';
    if (modal) modal.classList.remove('hidden');
    try {
        if (!Array.isArray(window._masterCatalogCache) || !window._masterCatalogCache.length) {
            const snap = await window.getDocs(window.collection(window.db, MASTER_CATALOG_COLLECTION));
            const items = [];
            snap.forEach((d) => items.push(hydrateMasterCatalogItem(d.id, d.data() || {})));
            window._masterCatalogCache = items;
        }
    } catch (err) {
        console.error('[master] search load failed:', err);
        if (results) results.innerHTML = '<div class="text-center py-8 text-red-500 font-bold">تعذر تحميل الكتالوج المرجعي</div>';
    }
};

window.searchMasterCatalog = () => {
    const input = document.getElementById('masterCatalogSearchInput');
    const results = document.getElementById('masterCatalogSearchResults');
    if (!results) return;
    const tokens = masterCatalogSearchTokens((input && input.value) || '');
    if (!tokens.length) {
        results.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold">اكتب كلمة للبحث</div>';
        return;
    }
    const scored = (window._masterCatalogCache || []).map((item) => ({ item, score: masterCatalogSearchScore(item, tokens) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || String(a.item.name || '').localeCompare(String(b.item.name || ''), 'ar'))
        .slice(0, 40);
    if (!scored.length) {
        results.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold">لا توجد نتائج</div>';
        return;
    }
    results.innerHTML = scored.map((row) => {
        const item = row.item;
        const id = catalogEscapeHtml(item.id);
        const name = catalogEscapeHtml(item.name || item.name_ar || 'بدون اسم');
        const price = catalogEscapeHtml(item.price == null ? '' : item.price);
        const category = catalogEscapeHtml(item.category || '');
        const thumbSrc = catalogEscapeHtml(masterCatalogThumbUrl(item.image_url));
        const fullSrc = catalogEscapeHtml(masterCatalogFullImageUrl(item.image_url) || item.image_url || '');
        const thumb = thumbSrc
            ? `<img src="${thumbSrc}" data-full="${fullSrc}" alt="" loading="lazy" decoding="async" class="w-14 h-14 rounded-xl object-cover border border-[#230535]/15 shrink-0" onerror="if(this.dataset.full&&this.src!==this.dataset.full){this.src=this.dataset.full;}else{this.style.display='none';}">`
            : `<div class="w-14 h-14 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image"></i></div>`;
        return `<button type="button" onclick="selectMasterCatalogItem('${id}')" class="w-full bg-white border border-purple-100 rounded-2xl p-3 shadow-sm flex items-center gap-3 text-right hover:bg-[#FFD700]/10 transition">
            ${thumb}
            <div class="min-w-0 flex-1">
                <div class="font-black text-sm text-[#230535] truncate">${name}</div>
                <div class="text-[11px] font-black bg-[#FFD700]/20 text-[#230535] inline-block px-2 py-0.5 rounded-full mt-1">${price} ج.م</div>
                ${category ? `<div class="text-[10px] text-slate-400 font-bold mt-1 truncate">${category}</div>` : ''}
            </div>
        </button>`;
    }).join('');
};

window.selectMasterCatalogItem = (itemId) => {
    const item = (window._masterCatalogCache || []).find((p) => p.id === itemId);
    if (!item) return;
    const name = String(item.name || item.name_ar || '').trim();
    const price = item.price == null ? '' : item.price;
    const sku = String(item.sku || '').trim();
    const nameEl = document.getElementById('catalogNameAr');
    const descEl = document.getElementById('catalogDescriptionAr');
    const priceEl = document.getElementById('catalogBasePrice');
    const skuEl = document.getElementById('catalogSku');
    if (nameEl) nameEl.value = name;
    if (descEl && !String(descEl.value || '').trim()) descEl.value = name;
    if (typeof window.onCatalogDescriptionInput === 'function') window.onCatalogDescriptionInput();
    if (priceEl) priceEl.value = price;
    if (skuEl && sku) skuEl.value = sku;
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl) typeEl.value = 'simple';
    window.onCatalogProductTypeChange();
    const viewUrl = masterCatalogFullImageUrl(item.image_url);
    if (viewUrl) {
        renderCatalogSavedImages({ rawImageUrls: [viewUrl], enhancedImageUrls: [viewUrl] });
    } else {
        hideCatalogSavedImages();
    }
    window.closeMasterCatalogSearchModal();
    if (window.showToast) window.showToast('تم تعبئة بيانات المنتج. يمكنك تعديل السعر أو رفع صورة محلية');
};

/* ---------------------------------------------------------------------------
   Smart Auto-fill (autocomplete) for the "Add Product" form
   ---------------------------------------------------------------------------
   Caches existing products for the selected merchant's category, normalizes
   Arabic input, expands it through the synonym dictionary and renders a
   prefix-first / infix-second suggestion dropdown. */
window._catalogAutocompleteCache = window._catalogAutocompleteCache || [];
window._catalogAutocompleteCategory = window._catalogAutocompleteCategory || '';

const hideCatalogNameSuggestions = () => {
    const box = document.getElementById('catalogNameArAutocomplete');
    if (!box) return;
    box.classList.add('hidden');
    box.innerHTML = '';
};
window.hideCatalogNameSuggestions = hideCatalogNameSuggestions;

const fetchCatalogAutocompleteCache = async () => {
    const merchant = selectedCatalogMerchant();
    const category = resolveMerchantCategory(merchant);
    const previousCategory = window._catalogAutocompleteCategory;
    window._catalogAutocompleteCategory = category || '';
    if (!category || typeof window.getDocs !== 'function' || !window.db) {
        window._catalogAutocompleteCache = [];
        return;
    }
    /* Zero-new-reads guard: the category's product set has not changed since it
       was last loaded for this exact category, so reuse the in-memory cache and
       skip the Firestore read on modal re-opens and merchant switches. */
    if (previousCategory === category
        && Array.isArray(window._catalogAutocompleteCache)
        && window._catalogAutocompleteCache.length) {
        return;
    }
    try {
        const ref = window.query(
            window.collection(window.db, CATALOG_COLLECTION),
            window.where('category', '==', category)
        );
        const snap = await window.getDocs(ref);
        const seen = new Set();
        const unique = [];
        snap.forEach((d) => {
            const data = { id: d.id, ...d.data() };
            const name = String(data.name_ar || data.name_en || data.name || '').trim();
            const key = normalizeArabic(name);
            if (!name || !key || seen.has(key)) return;
            seen.add(key);
            unique.push(data);
        });
        unique.sort((a, b) => String(a.name_ar || '').localeCompare(String(b.name_ar || ''), 'ar'));
        window._catalogAutocompleteCache = unique;
    } catch (err) {
        console.error('[catalog] autocomplete cache failed:', err);
        window._catalogAutocompleteCache = [];
    }
};

const expandCatalogSearchTerms = (query) => {
    const norm = normalizeArabic(query);
    if (!norm) return [];
    const terms = [norm];
    (normalizedSearchSynonyms[norm] || []).forEach((alias) => {
        if (alias && terms.indexOf(alias) === -1) terms.push(alias);
    });
    return terms;
};

/* Position the suggestion dropdown against the input using document
   coordinates. The dropdown lives on document.body (position: absolute) so the
   modal's overflow-y-auto can never clip it, and the visualViewport math keeps
   it above the virtual keyboard on mobile. */
const positionCatalogNameSuggestions = () => {
    const input = document.getElementById('catalogNameAr');
    const box = document.getElementById('catalogNameArAutocomplete');
    if (!input || !box || box.classList.contains('hidden')) return;
    const rect = input.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportOffsetLeft = vv ? vv.offsetLeft : 0;
    const viewportOffsetTop = vv ? vv.offsetTop : 0;
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const gutter = 8;
    const width = Math.max(160, Math.min(rect.width, viewportWidth - gutter * 2));
    const clampedLeft = Math.max(viewportOffsetLeft + gutter, Math.min(rect.left, viewportOffsetLeft + viewportWidth - width - gutter));
    const boxHeight = box.offsetHeight || 0;
    const viewportBottom = viewportOffsetTop + viewportHeight;
    const spaceBelow = viewportBottom - rect.bottom;
    const spaceAbove = rect.top - viewportOffsetTop;
    const openAbove = (spaceBelow < boxHeight + 12) && (spaceAbove > spaceBelow);
    const available = openAbove ? (spaceAbove - 6) : (spaceBelow - 6);
    const topDoc = (openAbove ? rect.top - boxHeight - 6 : rect.bottom + 6) + scrollY;
    box.style.position = 'absolute';
    box.style.width = width + 'px';
    box.style.left = (clampedLeft + scrollX) + 'px';
    box.style.top = Math.max(viewportOffsetTop + scrollY + 4, topDoc) + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    box.style.maxHeight = Math.max(120, Math.min(288, available)) + 'px';
    box.style.zIndex = '9999';
};
window.positionCatalogNameSuggestions = positionCatalogNameSuggestions;

const renderCatalogNameSuggestions = () => {
    const input = document.getElementById('catalogNameAr');
    const box = document.getElementById('catalogNameArAutocomplete');
    if (!input || !box) return;
    const query = String(input.value || '').trim();
    if (!query) { hideCatalogNameSuggestions(); return; }
    const terms = expandCatalogSearchTerms(query);
    if (!terms.length) { hideCatalogNameSuggestions(); return; }
    const scored = [];
    (window._catalogAutocompleteCache || []).forEach((product) => {
        const hay = normalizeArabic(product.name_ar || product.name_en || product.name || '');
        if (!hay) return;
        let rank = 99;
        terms.forEach((term) => {
            if (!term) return;
            const idx = hay.indexOf(term);
            if (idx === -1) return;
            const r = idx === 0 ? 0 : 1;
            if (r < rank) rank = r;
        });
        if (rank < 99) scored.push({ product, rank });
    });
    if (!scored.length) { hideCatalogNameSuggestions(); return; }
    scored.sort((a, b) => a.rank - b.rank
        || String(a.product.name_ar || '').localeCompare(String(b.product.name_ar || ''), 'ar'));
    box.innerHTML = scored.slice(0, 8).map(({ product }) => {
        const id = catalogEscapeHtml(product.id);
        const name = catalogEscapeHtml(product.name_ar || product.name_en || 'بدون اسم');
        const price = (product.base_price == null || product.base_price === '')
            ? ''
            : catalogEscapeHtml(product.base_price);
        const thumb = catalogProductThumbUrl(product);
        const thumbHtml = thumb
            ? `<img src="${catalogEscapeHtml(thumb)}" alt="" loading="lazy" decoding="async" class="w-11 h-11 rounded-xl object-cover border border-[#230535]/15 shrink-0" onerror="this.style.display='none'">`
            : `<div class="w-11 h-11 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image"></i></div>`;
        return `<button type="button" data-catalog-suggest-id="${id}" class="w-full flex items-center gap-3 px-3 py-2 text-right hover:bg-[#FFD700]/15 active:bg-[#FFD700]/25 transition border-b border-purple-50 last:border-b-0">
            ${thumbHtml}
            <div class="min-w-0 flex-1">
                <div class="font-black text-[13px] text-[#230535] truncate">${name}</div>
                ${price === '' ? '' : `<div class="text-[11px] font-bold text-slate-500">${price} ج.م</div>`}
            </div>
            <i class="fa-solid fa-wand-magic-sparkles text-[#E57723] text-xs"></i>
        </button>`;
    }).join('');
    box.classList.remove('hidden');
    positionCatalogNameSuggestions();
    box.querySelectorAll('[data-catalog-suggest-id]').forEach((btn) => {
        btn.addEventListener('click', () => window.applyCatalogNameSuggestion(btn.getAttribute('data-catalog-suggest-id')));
    });
};
window.renderCatalogNameSuggestions = renderCatalogNameSuggestions;

const clearCatalogVariationRows = () => {
    const list = document.getElementById('catalogVariationsList');
    if (!list) return;
    Array.from(list.children).forEach((row) => {
        if (row._variantPreviewUrl) URL.revokeObjectURL(row._variantPreviewUrl);
    });
    list.innerHTML = '';
    catalogVariationSeq = 0;
};

window.applyCatalogNameSuggestion = (productId) => {
    const product = (window._catalogAutocompleteCache || []).find((p) => p.id === productId);
    if (!product) return;
    const nameEl = document.getElementById('catalogNameAr');
    const descEl = document.getElementById('catalogDescriptionAr');
    const priceEl = document.getElementById('catalogBasePrice');
    const typeEl = document.getElementById('catalogProductType');
    const priceWrap = document.getElementById('catalogBasePriceWrap');
    const section = document.getElementById('catalogVariationsSection');
    const name = String(product.name_ar || product.name_en || '').trim();
    const desc = String(product.description_ar || product.description_en || '').trim();
    const variations = Array.isArray(product.variations)
        ? product.variations.filter((v) => v && String(v.name || '').trim())
        : [];
    const isVariable = variations.length > 0;

    if (nameEl) nameEl.value = name;
    if (descEl && desc) descEl.value = desc;
    if (typeof window.onCatalogDescriptionInput === 'function') window.onCatalogDescriptionInput();
    if (priceEl && product.base_price != null && product.base_price !== '') priceEl.value = product.base_price;
    if (typeEl) typeEl.value = isVariable ? 'variable' : 'simple';
    if (section) section.classList.toggle('hidden', !isVariable);
    if (priceWrap) priceWrap.classList.toggle('hidden', isVariable);
    if (priceEl) {
        if (isVariable) priceEl.removeAttribute('required');
        else priceEl.setAttribute('required', 'required');
    }

    const imageUrls = catalogProductFullImageUrls(product);
    if (imageUrls.length) {
        renderCatalogSavedImages({ rawImageUrls: imageUrls, enhancedImageUrls: [] });
    } else {
        hideCatalogSavedImages();
    }

    clearCatalogVariationRows();
    if (isVariable) {
        variations.forEach((v) => window.addCatalogVariationRow(v.name, v.price, v.image_url || ''));
    }

    hideCatalogNameSuggestions();
    if (window.showToast) window.showToast('تم تعبئة بيانات المنتج تلقائياً');
};

const bindCatalogNameAutocomplete = () => {
    const input = document.getElementById('catalogNameAr');
    const box = document.getElementById('catalogNameArAutocomplete');
    if (!input || input._catalogAutocompleteBound) return;
    input._catalogAutocompleteBound = true;
    /* Park the dropdown on <body> so modal scroll containers cannot clip it. */
    if (box && box.parentNode !== document.body) document.body.appendChild(box);
    input.addEventListener('input', () => {
        if (window._catalogAutocompleteTimer) clearTimeout(window._catalogAutocompleteTimer);
        window._catalogAutocompleteTimer = setTimeout(renderCatalogNameSuggestions, 300);
    });
    input.addEventListener('focus', () => {
        if (String(input.value || '').trim()) renderCatalogNameSuggestions();
    });
    input.addEventListener('blur', () => {
        /* Longer grace period on touch: let the tap on a suggestion land first. */
        setTimeout(() => {
            if (window._catalogSuggestionTouching) return;
            hideCatalogNameSuggestions();
        }, 250);
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hideCatalogNameSuggestions();
    });
    if (box) {
        /* Keep focus on the input so the blur handler doesn't tear the dropdown
           down before the tap/click is dispatched. On touch we must NOT
           preventDefault (that can swallow the click), so instead we raise a
           flag that the blur handler honours. */
        box.addEventListener('mousedown', (event) => { if (event.cancelable) event.preventDefault(); });
        box.addEventListener('touchstart', () => { window._catalogSuggestionTouching = true; }, { passive: true });
        box.addEventListener('touchend', () => { setTimeout(() => { window._catalogSuggestionTouching = false; }, 300); });
        box.addEventListener('touchcancel', () => { window._catalogSuggestionTouching = false; });
    }
    /* Reposition when the on-screen keyboard opens/closes or the page scrolls. */
    const reposition = () => {
        /* Don't move the target out from under a finger mid-tap. */
        if (window._catalogSuggestionTouching) return;
        if (box && !box.classList.contains('hidden')) positionCatalogNameSuggestions();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', reposition);
        window.visualViewport.addEventListener('scroll', reposition);
    }
};
window.bindCatalogNameAutocomplete = bindCatalogNameAutocomplete;

let productImagesState = [];

const revokeCatalogPreviewUrls = () => {
    productImagesState.forEach((item) => {
        if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
};

const resetCatalogImageState = () => {
    revokeCatalogPreviewUrls();
    productImagesState = [];
    const fileEl = document.getElementById('catalogRawImage');
    if (fileEl) fileEl.value = '';
    renderCatalogImagePreviews();
};

const renderCatalogImagePreviews = () => {
    const preview = document.getElementById('catalogRawImagePreviews');
    const nameEl = document.getElementById('catalogRawImageName');
    if (nameEl) nameEl.textContent = productImagesState.length ? (productImagesState.length + ' صورة') : 'الكاميرا أو معرض الصور';
    if (!preview) return;
    preview.innerHTML = '';
    productImagesState.forEach((item, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'relative w-16 h-16';
        const img = document.createElement('img');
        img.src = item.previewUrl;
        img.alt = (item.file && item.file.name) || '';
        img.className = 'w-16 h-16 rounded-xl object-cover border border-[#FFD700]/50';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'absolute -top-1 -left-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-black shadow-md leading-none';
        del.textContent = '×';
        del.onclick = () => window.removeCatalogProductImage(idx);
        wrap.appendChild(img);
        wrap.appendChild(del);
        preview.appendChild(wrap);
    });
};

window.removeCatalogProductImage = (index) => {
    const item = productImagesState[index];
    if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    productImagesState.splice(index, 1);
    renderCatalogImagePreviews();
};

window.onCatalogRawImageChange = (event) => {
    const input = event && event.target;
    const files = input && input.files ? Array.from(input.files) : [];
    files.forEach((file) => {
        if (!file || !String(file.type || '').startsWith('image/')) return;
        if (productImagesState.length >= 12) return;
        productImagesState.push({ file, previewUrl: URL.createObjectURL(file) });
    });
    if (input) input.value = '';
    if (productImagesState.length > 12) {
        productImagesState.slice(12).forEach((item) => {
            if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        productImagesState = productImagesState.slice(0, 12);
        if (window.showToast) window.showToast('الحد الأقصى 12 صورة للمنتج', false);
    }
    renderCatalogImagePreviews();
};

const generateCatalogSku = () => 'KJ-PRD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

const catalogDraftsDriver = () => (window.localforage && typeof window.localforage.getItem === 'function')
    ? window.localforage
    : null;

const readCatalogDrafts = async () => {
    const driver = catalogDraftsDriver();
    if (driver) {
        const items = await driver.getItem(CATALOG_DRAFTS_KEY);
        return Array.isArray(items) ? items : [];
    }
    try {
        const raw = localStorage.getItem(CATALOG_DRAFTS_KEY);
        const items = raw ? JSON.parse(raw) : [];
        return Array.isArray(items) ? items : [];
    } catch (_) {
        return [];
    }
};

const writeCatalogDrafts = async (items) => {
    const list = Array.isArray(items) ? items : [];
    const driver = catalogDraftsDriver();
    if (driver) {
        await driver.setItem(CATALOG_DRAFTS_KEY, list);
        return list;
    }
    localStorage.setItem(CATALOG_DRAFTS_KEY, JSON.stringify(list));
    return list;
};

window.renderCatalogDraftsWidget = async () => {
    const widget = document.getElementById('catalogDraftsWidget');
    const label = document.getElementById('catalogDraftsCountLabel');
    const syncBtn = document.getElementById('catalogSyncAllBtn');
    if (!widget) return;
    const canCreate = window.canCreateCatalogProducts();
    let count = 0;
    try {
        const drafts = await readCatalogDrafts();
        count = drafts.length;
    } catch (err) {
        console.error('[catalog] drafts read failed:', err);
    }
    widget.classList.toggle('hidden', !canCreate);
    if (label) label.textContent = 'لديك ' + count + ' منتج في المسودة';
    if (syncBtn) {
        syncBtn.disabled = !!window._catalogSyncing || count === 0;
        if (!window._catalogSyncing) {
            syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> رفع الكل الآن';
        }
    }
};

const setCatalogSubmitBusy = (busy, label) => {
    const saveAnother = document.getElementById('catalogProductSubmitBtn');
    const saveClose = document.getElementById('catalogProductSaveCloseBtn');
    [saveAnother, saveClose].forEach((btn) => {
        if (!btn) return;
        btn.disabled = !!busy;
    });
    if (saveAnother && label) saveAnother.innerHTML = label;
    if (!busy && saveAnother) saveAnother.innerHTML = window._catalogEditingProduct ? 'حفظ التعديلات' : 'حفظ وإضافة منتج آخر';
};

const clearCatalogProductFields = (keepMerchant) => {
    window.stopCatalogBarcodeScan();
    const ids = ['catalogNameAr', 'catalogDescriptionAr', 'catalogSku', 'catalogBasePrice'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (!keepMerchant) {
        const merchantEl = document.getElementById('catalogMerchantSelect');
        if (merchantEl) merchantEl.value = '';
        setCatalogMerchantInputLabel();
    }
    if (typeof window.updateMasterCatalogSearchVisibility === 'function') window.updateMasterCatalogSearchVisibility();
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl) typeEl.value = 'simple';
    resetCatalogImageState();
    resetCatalogVariations();
    if (typeof window.onCatalogDescriptionInput === 'function') window.onCatalogDescriptionInput();
    if (keepMerchant) {
        const nameEl = document.getElementById('catalogNameAr');
        if (nameEl) nameEl.focus();
    }
};

const isCatalogProductFormDirty = () => {
    const ids = ['catalogNameAr', 'catalogDescriptionAr', 'catalogSku', 'catalogBasePrice'];
    if (ids.some((id) => String((document.getElementById(id) || {}).value || '').trim())) return true;
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl && typeEl.value && typeEl.value !== 'simple') return true;
    if (productImagesState.length) return true;
    const vars = collectCatalogVariations();
    return vars.some((v) => v.name || v.priceRaw || v.imageFile);
};

window.stopCatalogBarcodeScan = async () => {
    const reader = document.getElementById('catalogSkuReader');
    const scanner = window._catalogQrScanner;
    window._catalogQrScanner = null;
    if (scanner && typeof scanner.stop === 'function') {
        try { await scanner.stop(); } catch (_) { /* ignore */ }
    }
    if (reader) {
        reader.classList.add('hidden');
        reader.innerHTML = '';
    }
};

window.startCatalogBarcodeScan = async () => {
    const reader = document.getElementById('catalogSkuReader');
    if (!reader) return;
    if (typeof Html5Qrcode !== 'function') {
        if (window.showToast) window.showToast('ماسح الباركود غير متاح حالياً', false);
        return;
    }
    if (window._catalogQrScanner) {
        await window.stopCatalogBarcodeScan();
        return;
    }
    reader.innerHTML = '';
    reader.classList.remove('hidden');
    const formats = (typeof Html5QrcodeSupportedFormats === 'object')
        ? [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39
        ]
        : undefined;
    const scanner = new Html5Qrcode('catalogSkuReader', { verbose: false, formatsToSupport: formats });
    window._catalogQrScanner = scanner;
    try {
        await scanner.start(
            { facingMode: 'environment' },
            { fps: 30, qrbox: { width: 250, height: 100 } },
            (decodedText) => {
                const skuEl = document.getElementById('catalogSku');
                if (skuEl) skuEl.value = String(decodedText || '').trim();
                window.stopCatalogBarcodeScan();
                if (window.showToast) window.showToast('تم قراءة الباركود');
            },
            () => {}
        );
    } catch (err) {
        console.error('[catalog] barcode scan failed:', err);
        await window.stopCatalogBarcodeScan();
        if (window.showToast) window.showToast('تعذر فتح الكاميرا الخلفية', false);
    }
};

window.openCatalogProductModal = () => {
    if (!window.canCreateCatalogProducts()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب وفريق مراجعة المنتجات فقط', false);
        return;
    }
    if (window.kanjoAuditLogView) {
        window.kanjoAuditLogView({
            entityKind: 'catalog',
            targetEntity: 'كتالوج',
            targetName: 'إضافة منتج للكتالوج',
            description: 'فتح شاشة إضافة منتج للكتالوج'
        });
    }
    resetCatalogEditState();
    fillCatalogMerchantOptions();
    clearCatalogProductFields(false);
    setCatalogModalChrome();
    window.updateMasterCatalogSearchVisibility();
    window.bindCatalogNameAutocomplete();
    window.bindCatalogMerchantCombobox();
    window.hideCatalogMerchantSearchList();
    window.setCatalogMerchantInputLabel();
    window.hideCatalogNameSuggestions();
    fetchCatalogAutocompleteCache();
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCatalogProductModal = () => {
    window.stopCatalogBarcodeScan();
    window.hideCatalogNameSuggestions();
    window.hideCatalogMerchantSearchList();
    resetCatalogImageState();
    resetCatalogEditState();
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.add('hidden');
};

window.requestCloseCatalogProductModal = () => {
    if (isCatalogProductFormDirty()) {
        const ok = window.confirm('هل أنت متأكد من الإغلاق؟ سيتم فقدان البيانات غير المحفوظة.');
        if (!ok) return;
    }
    window.closeCatalogProductModal();
};

const collectCatalogFormDraft = async () => {
    const merchantId = (document.getElementById('catalogMerchantSelect') || {}).value || '';
    const merchant = window._catalogMerchantMap && window._catalogMerchantMap[merchantId];
    const nameAr = String((document.getElementById('catalogNameAr') || {}).value || '').trim();
    const descriptionAr = String((document.getElementById('catalogDescriptionAr') || {}).value || '').trim();
    let sku = String((document.getElementById('catalogSku') || {}).value || '').trim();
    /* A <select> reports '' when the stored field has no matching option (e.g. a
       legacy/odd product_type). Falling straight back to 'simple' would skip
       variant collection and let the update wipe existing variants + images.
       Resolve to the product's stored type first, then 'simple' as last resort. */
    const catalogTypeIds = ['simple', 'variable', 'bundle'];
    const rawProductType = String((document.getElementById('catalogProductType') || {}).value || '').trim().toLowerCase();
    let productType = rawProductType;
    if (!catalogTypeIds.includes(productType)) {
        const storedType = String((window._catalogEditingProduct && window._catalogEditingProduct.product_type) || '').trim().toLowerCase();
        productType = catalogTypeIds.includes(storedType) ? storedType : 'simple';
    }
    const priceRaw = String((document.getElementById('catalogBasePrice') || {}).value || '').trim();
    const category = resolveMerchantCategory(merchant);
    const files = productImagesState.map((item) => item.file).filter(Boolean);

    if (!merchant || !merchantId) {
        window.showToast('اختر تاجراً باتفاق نهائي', false);
        return null;
    }
    if (!nameAr) {
        window.showToast('أدخل اسم المنتج بالعربية', false);
        return null;
    }
    if (!descriptionAr) {
        window.showToast('أدخل وصف المنتج بالعربية', false);
        return null;
    }
    if (!sku) sku = generateCatalogSku();
    if (!productType) {
        window.showToast('اختر نوع المنتج', false);
        return null;
    }
    let basePrice = Number(priceRaw);
    if (!category) {
        window.showToast('لا توجد فئة مسجّلة لهذا التاجر', false);
        return null;
    }
    let variations = [];
    if (productType === 'variable') {
        const rawVars = collectCatalogVariations();
        if (rawVars.length === 0) {
            window.showToast('أضف خياراً واحداً على الأقل للمنتج المتغير', false);
            return null;
        }
        for (const v of rawVars) {
            if (!v.name) {
                window.showToast('أدخل اسم كل خيار (الحجم / اللون)', false);
                return null;
            }
            if (v.priceRaw === '' || Number.isNaN(v.price) || v.price < 0) {
                window.showToast('أدخل سعراً صحيحاً لكل خيار', false);
                return null;
            }
            const variation = { name: v.name, price: v.price };
            if (v.imageFile) {
                variation.imageBase64 = await compressCatalogImage(v.imageFile);
                variation.imageFileName = catalogJpegFileName(v.imageFile.name, 'variant');
            } else if (v.existingImageUrl) {
                variation.image_url = v.existingImageUrl;
            }
            variations.push(variation);
        }
        basePrice = Math.min(...variations.map((v) => v.price));
    } else if (priceRaw === '' || Number.isNaN(basePrice) || basePrice < 0) {
        window.showToast('أدخل سعراً صحيحاً', false);
        return null;
    }
    if (files.length > 12) {
        window.showToast('الحد الأقصى 12 صورة للمنتج', false);
        return null;
    }
    if (files.some((f) => f.size > CATALOG_MAX_IMAGE_BYTES)) {
        window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);
        return null;
    }

    const images = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64Data = await compressCatalogImage(file);
        images.push({
            fileName: catalogJpegFileName(file.name, 'product-raw-' + (i + 1)),
            mimeType: 'image/jpeg',
            base64: base64Data
        });
    }

    const draft = {
        id: 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
        merchantId: merchant.merchantId,
        merchantName: merchant.merchantName,
        name_ar: nameAr,
        description_ar: descriptionAr,
        sku,
        product_type: productType,
        base_price: basePrice,
        category,
        images,
        createdAt: new Date().toISOString(),
        createdBy: (window.currentUser && window.currentUser.name) || ''
    };
    if (productType === 'variable') draft.variations = variations;
    return draft;
};

window.submitCatalogProduct = async (event, options) => {
    if (event) event.preventDefault();
    if (window._catalogDraftSaving) return;
    if (!window.canEditCatalogProducts()) {
        if (window.showToast) window.showToast('هذه الشاشة غير متاحة لحسابك', false);
        return;
    }
    /* Strict double-submit guard: flip the lock flag and disable BOTH save
       buttons synchronously on the very first invocation — before any await or
       branch — so a rapid second click, Enter key, or programmatic resubmit can
       never enqueue the same product twice (the split-brain duplicate-SKU bug). */
    window._catalogDraftSaving = true;
    setCatalogSubmitBusy(true, '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الحفظ...');
    try {
        if (window._catalogEditingProduct) {
            await updateCatalogProductDirect();
            return;
        }
        const closeAfterSave = !!(options && options.closeAfterSave);
        const draft = await collectCatalogFormDraft();
        if (!draft) return;
        const drafts = await readCatalogDrafts();
        drafts.push(draft);
        await writeCatalogDrafts(drafts);
        await window.renderCatalogDraftsWidget();
        window.showToast('تم حفظ المنتج في المسودة');
        if (closeAfterSave) {
            window.closeCatalogProductModal();
        } else {
            clearCatalogProductFields(true);
        }
    } catch (err) {
        console.error('[catalog] draft save failed:', err);
        window.showToast('فشل حفظ المسودة، حاول مرة أخرى', false);
    } finally {
        window._catalogDraftSaving = false;
        setCatalogSubmitBusy(false);
    }
};

const collectCatalogFormPayload = () => {
    const merchantId = (document.getElementById('catalogMerchantSelect') || {}).value || '';
    const merchant = window._catalogMerchantMap && window._catalogMerchantMap[merchantId];
    const nameAr = String((document.getElementById('catalogNameAr') || {}).value || '').trim();
    const descriptionAr = String((document.getElementById('catalogDescriptionAr') || {}).value || '').trim();
    let sku = String((document.getElementById('catalogSku') || {}).value || '').trim();
    /* A <select> reports '' when the stored field has no matching option (e.g. a
       legacy/odd product_type). Falling straight back to 'simple' would skip
       variant collection and let the update wipe existing variants + images.
       Resolve to the product's stored type first, then 'simple' as last resort. */
    const catalogTypeIds = ['simple', 'variable', 'bundle'];
    const rawProductType = String((document.getElementById('catalogProductType') || {}).value || '').trim().toLowerCase();
    let productType = rawProductType;
    if (!catalogTypeIds.includes(productType)) {
        const storedType = String((window._catalogEditingProduct && window._catalogEditingProduct.product_type) || '').trim().toLowerCase();
        productType = catalogTypeIds.includes(storedType) ? storedType : 'simple';
    }
    const priceRaw = String((document.getElementById('catalogBasePrice') || {}).value || '').trim();
    const category = resolveMerchantCategory(merchant);
    const files = productImagesState.map((item) => item.file).filter(Boolean);

    if (!merchant || !merchantId) {
        window.showToast('اختر تاجراً باتفاق نهائي', false);
        return null;
    }
    if (!nameAr) {
        window.showToast('أدخل اسم المنتج بالعربية', false);
        return null;
    }
    if (!descriptionAr) {
        window.showToast('أدخل وصف المنتج بالعربية', false);
        return null;
    }
    if (!sku) sku = generateCatalogSku();
    if (!productType) {
        window.showToast('اختر نوع المنتج', false);
        return null;
    }
    let basePrice = Number(priceRaw);
    if (!category) {
        window.showToast('لا توجد فئة مسجّلة لهذا التاجر', false);
        return null;
    }
    let variations = [];
    if (productType === 'variable') {
        const rawVars = collectCatalogVariations();
        if (rawVars.length === 0) {
            window.showToast('أضف خياراً واحداً على الأقل للمنتج المتغير', false);
            return null;
        }
        for (const v of rawVars) {
            if (!v.name) {
                window.showToast('أدخل اسم كل خيار (الحجم / اللون)', false);
                return null;
            }
            if (v.priceRaw === '' || Number.isNaN(v.price) || v.price < 0) {
                window.showToast('أدخل سعراً صحيحاً لكل خيار', false);
                return null;
            }
            variations.push({
                name: v.name,
                price: v.price,
                imageFile: v.imageFile,
                existingImageUrl: v.existingImageUrl
            });
        }
        basePrice = Math.min(...variations.map((v) => v.price));
    } else if (priceRaw === '' || Number.isNaN(basePrice) || basePrice < 0) {
        window.showToast('أدخل سعراً صحيحاً', false);
        return null;
    }
    if (files.length > 12) {
        window.showToast('الحد الأقصى 12 صورة للمنتج', false);
        return null;
    }
    if (files.some((f) => f.size > CATALOG_MAX_IMAGE_BYTES)) {
        window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);
        return null;
    }
    return { merchant, nameAr, descriptionAr, sku, productType, basePrice, category, files, variations };
};

const updateCatalogProductDirect = async () => {
    const editing = window._catalogEditingProduct;
    if (!editing || !editing.id) return;
    if (editing.deleteRequested) {
        window.showToast('المنتج في انتظار الموافقة على الحذف', false);
        return;
    }
    const form = collectCatalogFormPayload();
    if (!form) return;
    window._catalogDraftSaving = true;
    setCatalogSubmitBusy(true, '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري حفظ التعديلات...');
    try {
        const nameChanged = form.nameAr !== String(editing.name_ar || '').trim();
        const descChanged = form.descriptionAr !== String(editing.description_ar || '').trim();
        let nameEn = catalogResolvedEnglish(editing.name_en, editing.name_ar);
        let descriptionEn = catalogResolvedEnglish(editing.description_en, editing.description_ar);
        const nameNeedsTranslation = nameChanged || !nameEn;
        const descNeedsTranslation = descChanged || !descriptionEn;
        if (nameNeedsTranslation || descNeedsTranslation) {
            const [translatedName, translatedDesc] = await Promise.all([
                nameNeedsTranslation ? translateArToEn(form.nameAr) : Promise.resolve(nameEn),
                descNeedsTranslation ? translateArToEn(form.descriptionAr) : Promise.resolve(descriptionEn)
            ]);
            if (nameNeedsTranslation) nameEn = catalogTranslationOrKeep(translatedName, nameEn);
            if (descNeedsTranslation) descriptionEn = catalogTranslationOrKeep(translatedDesc, descriptionEn);
        }
        let rawImageUrls = catalogRawImageUrls(editing);
        let rawImageUrl = editing.rawImageUrl || rawImageUrls[0] || '';
        if (form.files.length) {
            rawImageUrls = [];
            for (let i = 0; i < form.files.length; i++) {
                const file = form.files[i];
                const base64Data = await compressCatalogImage(file);
                const uploadedUrl = await uploadCatalogImageToGas(
                    base64Data,
                    catalogJpegFileName(file.name, 'product-raw-' + (i + 1)),
                    form.merchant.merchantName,
                    'raw'
                );
                rawImageUrls.push(uploadedUrl);
            }
            rawImageUrl = rawImageUrls[0] || '';
        }
        /* Product-type safety net: an update must never silently wipe an existing
           product's variants (and their uploaded images) just because the form
           value arrived empty/desynced/unknown. Only accept the three known
           types; otherwise fall back to what the product is already stored as
           (and only as a last resort to 'simple'). */
        const catalogKnownTypes = ['simple', 'variable', 'bundle'];
        const normalizedFormType = String(form.productType || '').trim().toLowerCase();
        const storedType = String(editing.product_type || '').trim().toLowerCase();
        const effectiveProductType = catalogKnownTypes.includes(normalizedFormType)
            ? normalizedFormType
            : (catalogKnownTypes.includes(storedType) ? storedType : 'simple');
        const payload = {
            merchantId: form.merchant.merchantId,
            merchantName: form.merchant.merchantName,
            name_ar: form.nameAr,
            name_en: nameEn,
            description_ar: form.descriptionAr,
            description_en: descriptionEn,
            sku: form.sku,
            product_type: effectiveProductType,
            base_price: form.basePrice,
            category: form.category,
            rawImageUrl,
            rawImageUrls,
            updatedAt: new Date(),
            updatedBy: (window.currentUser && window.currentUser.name) || ''
        };
        if (effectiveProductType === 'variable') {
            const variantPayload = [];
            for (const v of form.variations) {
                let variantImageUrl = '';
                if (v.imageFile) {
                    const base64Data = await compressCatalogImage(v.imageFile);
                    variantImageUrl = await uploadCatalogImageToGas(
                        base64Data,
                        catalogJpegFileName(v.imageFile.name, 'variant'),
                        form.merchant.merchantName,
                        'variant'
                    );
                } else if (v.existingImageUrl) {
                    variantImageUrl = v.existingImageUrl;
                }
                variantPayload.push({
                    name: v.name,
                    price: v.price,
                    image_url: variantImageUrl || rawImageUrl || ''
                });
            }
            payload.variations = variantPayload;
        } else {
            payload.variations = [];
        }
        /* Smart edit routing: only re-queue the product for the image editor
           when a NEW product image was actually attached. A text-only edit
           (description, name, price, ...) must NOT reset the status — it just
           updates the fields so the KPI engine re-evaluates the description and
           the export picks up the new text, without creating redundant work for
           the image editor (Youssef). */
        const hasNewImages = form.files.length > 0;
        if (hasNewImages) {
            payload.enhancedImageUrl = '';
            payload.enhancedImageUrls = [];
            payload.status = 'pending';
        } else if (editing.status) {
            payload.status = editing.status;
        }
        /* REST-first write: the SDK is trapped offline on strict field networks,
           so this PATCH is what actually persists Sara's edit from her mobile. */
        if (!(await catalogRestMerge([CATALOG_COLLECTION, editing.id], payload))) {
            await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, editing.id), payload);
        }
        /* Update the rep list locally instead of re-reading the collection. */
        if (window.patchRepCatalogProductLocally) window.patchRepCatalogProductLocally(editing.id, payload);
        window._catalogMyProductsSignature = '';
        if (typeof window.renderCatalogMyProductsWidget === 'function') window.renderCatalogMyProductsWidget();
        /* Audit edits live in the manager "all products" grid, which is a
           different cache than the rep list patched above, so fold the change
           into that cache and repaint too — still zero extra reads. */
        if (window.isProductAuditUser()) {
            const all = window.allCatalogProductsCache || [];
            const auditIdx = all.findIndex((p) => p.id === editing.id);
            if (auditIdx !== -1) { all[auditIdx] = { ...all[auditIdx], ...payload }; window.allCatalogProductsCache = all; }
            if (typeof window.renderCatalogAllProductsWidget === 'function') window.renderCatalogAllProductsWidget();
        }
        window.showToast('تم حفظ تعديلات المنتج');
        window.closeCatalogProductModal();
    } catch (err) {
        console.error('[catalog] update failed:', err);
        window.showToast('فشل حفظ التعديلات، حاول مرة أخرى', false);
    } finally {
        window._catalogDraftSaving = false;
        setCatalogSubmitBusy(false);
        setCatalogModalChrome();
    }
};

window.openCatalogProductEditor = (productId) => {
    if (!window.canEditCatalogProducts()) {
        if (window.showToast) window.showToast('هذه الشاشة غير متاحة لحسابك', false);
        return;
    }
    const product = (window.repCatalogProductsCache || []).find((p) => p.id === productId)
        || (window.merchantProductsCache || []).find((p) => p.id === productId)
        || (window.allCatalogProductsCache || []).find((p) => p.id === productId);
    if (!product) {
        if (window.showToast) window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    if (product.deleteRequested) {
        if (window.showToast) window.showToast('المنتج في انتظار الموافقة على الحذف', false);
        return;
    }
    window._catalogEditingProduct = product;
    fillCatalogMerchantOptions({
        merchantId: product.merchantId,
        merchantName: product.merchantName,
        category: product.category || ''
    });
    clearCatalogProductFields(false);
    const merchantEl = document.getElementById('catalogMerchantSelect');
    if (merchantEl) merchantEl.value = product.merchantId || '';
    window.bindCatalogMerchantCombobox();
    window.setCatalogMerchantInputLabel();
    window.bindCatalogNameAutocomplete();
    fetchCatalogAutocompleteCache();
    const nameEl = document.getElementById('catalogNameAr');
    if (nameEl) nameEl.value = product.name_ar || '';
    const descEl = document.getElementById('catalogDescriptionAr');
    if (descEl) descEl.value = product.description_ar || '';
    if (typeof window.onCatalogDescriptionInput === 'function') window.onCatalogDescriptionInput();
    const skuEl = document.getElementById('catalogSku');
    if (skuEl) skuEl.value = product.sku || '';
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl) typeEl.value = product.product_type || 'simple';
    const priceEl = document.getElementById('catalogBasePrice');
    if (priceEl) priceEl.value = product.base_price == null ? '' : product.base_price;
    resetCatalogVariations();
    if ((product.product_type || 'simple') === 'variable') {
        const list = document.getElementById('catalogVariationsList');
        if (list) list.innerHTML = '';
        const vars = Array.isArray(product.variations) ? product.variations : [];
        if (vars.length) vars.forEach((v) => window.addCatalogVariationRow(v.name, v.price, v.image_url));
        else window.addCatalogVariationRow();
        window.onCatalogProductTypeChange();
    }
    renderCatalogSavedImages(product);
    setCatalogModalChrome();
    window.updateMasterCatalogSearchVisibility();
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.remove('hidden');
};

window.toggleCatalogMyProductsWidget = () => {
    const body = document.getElementById('catalogMyProductsBody');
    const chevron = document.getElementById('catalogMyProductsChevron');
    if (!body) return;
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    window._catalogMyProductsOpen = willOpen;
    if (willOpen) {
        window._catalogMyProductsSignature = '';
        renderCatalogMyProductsList();
        /* Pull the rep's own products on demand (count-gated) instead of
           unconditionally on every boot / refresh. */
        if (typeof window.loadMyCatalogProducts === 'function') window.loadMyCatalogProducts(false);
    }
};

const catalogGroupMerchantKey = (p) => String((p && (p.merchantName || p.merchant || p.merchant_name)) || '').trim() || 'تاجر غير معروف';

const groupCatalogProductsByMerchant = (products) => {
    const grouped = {};
    (products || []).forEach((p) => {
        const key = catalogGroupMerchantKey(p);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
    });
    return Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ar')).map((merchantName) => ({
        merchantName,
        products: grouped[merchantName]
    }));
};

window.toggleCatalogGroupedAccordion = (elId, event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        event.stopPropagation();
    }
    const accordion = document.getElementById(elId);
    if (!accordion) return;
    const body = accordion.querySelector('[data-catalog-group-body]');
    const chevron = accordion.querySelector('[data-catalog-group-chevron]');
    if (!body) return;

    /* Prevent ghost/double taps on touch screens from firing the toggle twice. */
    window._catalogAccordionLocks = window._catalogAccordionLocks || {};
    const now = Date.now();
    if (window._catalogAccordionLocks[elId] && (now - window._catalogAccordionLocks[elId]) < 350) return;
    window._catalogAccordionLocks[elId] = now;

    const mapName = accordion.getAttribute('data-open-map') || '';
    const merchantName = accordion.getAttribute('data-catalog-merchant') || '';
    const willOpen = body.classList.contains('hidden');

    /* Freeze the accordion's current height before mutating the DOM so the
       surrounding grid cannot collapse/reflow mid-interaction (prevents CLS). */
    const prevHeight = accordion.getBoundingClientRect().height;
    if (prevHeight > 0) accordion.style.minHeight = prevHeight + 'px';

    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    if (mapName) {
        const openMap = window[mapName] || {};
        if (willOpen) openMap[merchantName] = true;
        else delete openMap[merchantName];
        window[mapName] = openMap;
    }

    /* Lazy group body: collapsed groups ship an empty body, so build the cards
       on the first expand. Subsequent toggles reuse the already-built nodes. */
    if (willOpen && body.children.length === 0) {
        const renderKey = accordion.getAttribute('data-catalog-render-key') || '';
        const registry = window._catalogAccordionRegistry && window._catalogAccordionRegistry[renderKey];
        const groupProducts = registry && registry.groups ? registry.groups[merchantName] : null;
        if (registry && Array.isArray(groupProducts)) {
            body.innerHTML = groupProducts.map(registry.renderCard).join('');
        }
    }

    /* Release the height lock once the browser has laid out the new content. */
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { accordion.style.minHeight = ''; });
    });

    /* Keep the clicked merchant comfortably at the top after the injected
       product cards have been laid out (150ms lets the DOM settle first). */
    if (willOpen) {
        setTimeout(() => {
            accordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    }
};

const renderCatalogMerchantAccordionList = (list, products, openMapName, idPrefix, renderCard, emptyHtml) => {
    if (!list) return;
    if (!products.length) {
        list.innerHTML = emptyHtml;
        return;
    }
    const openMap = window[openMapName] || {};
    window[openMapName] = openMap;
    /* Lazy group rendering: collapsed merchant groups contribute ONLY their
       header to the DOM; the product cards are built on first expand. A rep
       with 1,500+ products therefore pays for a handful of headers on mount
       instead of building every card synchronously. The group payload and its
       card renderer are stashed in a registry the toggle looks up. */
    window._catalogAccordionRegistry = window._catalogAccordionRegistry || {};
    const registry = { renderCard, groups: {} };
    window._catalogAccordionRegistry[idPrefix] = registry;
    list.innerHTML = groupCatalogProductsByMerchant(products).map((group) => {
        const accordionId = catalogMerchantDomId(group.merchantName);
        const elId = idPrefix + '-' + accordionId;
        const safeName = catalogEscapeHtml(group.merchantName);
        const isOpen = !!openMap[group.merchantName];
        registry.groups[group.merchantName] = group.products;
        const cards = isOpen ? group.products.map(renderCard).join('') : '';
        return `<div id="${elId}" data-catalog-merchant="${safeName}" data-open-map="${openMapName}" data-catalog-render-key="${idPrefix}" class="rounded-2xl overflow-hidden border border-[#230535]/20 shadow-sm">
            <button type="button" onclick="toggleCatalogGroupedAccordion('${elId}', event)" class="w-full bg-white text-[#230535] px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#FFD700]/10 transition">
                <span class="font-black text-sm truncate">${safeName}</span>
                <span class="flex items-center gap-2 shrink-0">
                    <span class="text-[11px] font-black bg-[#FFD700] text-[#230535] px-2.5 py-0.5 rounded-full">${group.products.length} منتجات</span>
                    <i data-catalog-group-chevron class="fa-solid fa-chevron-down text-[#230535] text-xs transition-transform ${isOpen ? 'rotate-180' : ''}"></i>
                </span>
            </button>
            <div data-catalog-group-body class="${isOpen ? '' : 'hidden'} bg-slate-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">${cards}</div>
        </div>`;
    }).join('');
};

const renderCatalogMyProductCard = (p) => {
    const id = catalogEscapeHtml(p.id);
    const name = catalogEscapeHtml(p.name_ar || 'بدون اسم');
    const price = catalogEscapeHtml(p.base_price == null ? '' : p.base_price);
    const pendingDelete = !!p.deleteRequested;
    const status = pendingDelete ? 'في انتظار الموافقة على الحذف' : (String(p.status || '') === 'done' ? 'مكتمل' : 'قيد المعالجة');
    const statusClass = pendingDelete ? 'bg-red-50 text-red-700' : (String(p.status || '') === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700');
    const thumbHtml = catalogClickableThumbHtml(p);
    const actions = pendingDelete
        ? `<div class="shrink-0 flex flex-col gap-1.5"><button type="button" disabled class="bg-slate-200 text-slate-400 px-3 py-2 rounded-xl text-[11px] font-black cursor-not-allowed">تعديل</button><button type="button" disabled class="bg-slate-200 text-slate-400 px-3 py-2 rounded-xl text-[11px] font-black cursor-not-allowed">طلب حذف</button></div>`
        : `<div class="shrink-0 flex flex-col gap-1.5"><button type="button" onclick="openCatalogProductEditor('${id}')" class="bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition">تعديل</button><button type="button" onclick="requestCatalogProductDeletion('${id}')" class="bg-red-600 text-white px-3 py-2 rounded-xl text-[11px] font-black hover:bg-red-700 transition">طلب حذف</button></div>`;
    return `<div class="bg-white border border-purple-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
        ${thumbHtml}
        <div class="min-w-0 flex-1">
            <div class="font-black text-sm text-[#230535] truncate">${name}</div>
            <div class="flex flex-wrap gap-1.5 mt-1">
                <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                <span class="text-[10px] font-black ${statusClass} px-2 py-0.5 rounded-full">${status}</span>
            </div>
        </div>
        ${actions}
    </div>`;
};

const catalogMyProductsSignature = () => (window.repCatalogProductsCache || [])
    .map((p) => [p.id, p.status || '', p.deleteRequested ? 'D' : '', p.name_ar || '', p.base_price == null ? '' : p.base_price].join(':'))
    .join('|');

const renderCatalogMyProductsList = () => {
    const list = document.getElementById('catalogMyProductsList');
    const countEl = document.getElementById('catalogMyProductsCount');
    const products = window.repCatalogProductsCache || [];
    if (countEl) countEl.textContent = String(products.length);
    if (!list) return;
    /* Skip redundant repaints: if the underlying data has not changed since the
       last render, leave the DOM untouched. Replacing the nodes restarts the
       CSS reveal animation on every unrelated snapshot, which is what makes
       the rep list flash/blink continuously. */
    const signature = catalogMyProductsSignature();
    if (window._catalogMyProductsRendered && signature === window._catalogMyProductsSignature) return;
    window._catalogMyProductsSignature = signature;
    window._catalogMyProductsRendered = true;
    renderCatalogMerchantAccordionList(
        list,
        products,
        '_catalogMyProductsOpenMerchants',
        'catalogMyMerchantAccordion',
        renderCatalogMyProductCard,
        '<div class="text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-box-open text-3xl text-[#230535]/30 mb-2"></i><div>لا توجد منتجات مرفوعة بعد</div></div>'
    );
};

window.renderCatalogMyProductsWidget = () => {
    const widget = document.getElementById('catalogMyProductsWidget');
    if (!widget) return;
    const isRep = window.isCatalogRepUser();
    widget.classList.toggle('hidden', !isRep);
    const countEl = document.getElementById('catalogMyProductsCount');
    if (countEl) {
        countEl.textContent = window._catalogMyProductsLoaded
            ? String((window.repCatalogProductsCache || []).length)
            : '—';
    }
    const body = document.getElementById('catalogMyProductsBody');
    if (isRep && body && !body.classList.contains('hidden')) renderCatalogMyProductsList();
};

window.toggleCatalogAllProductsWidget = () => {
    if (!window.canViewAllCatalogProducts()) return;
    const body = document.getElementById('catalogAllProductsBody');
    const chevron = document.getElementById('catalogAllProductsChevron');
    if (!body) return;
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    window._catalogAllProductsOpen = willOpen;
    if (willOpen) {
        /* The all-products view resolves merchant logos from the global task
           archive, so make sure the archive is being loaded. */
        if (typeof window.ensureTaskArchiveLoaded === 'function') {
            Promise.resolve(window.ensureTaskArchiveLoaded()).then(() => {
                if (window._catalogAllProductsOpen) renderCatalogAllProductsList();
            }).catch(() => {});
        }
        const searchInput = document.getElementById('catalogGlobalSearchInput');
        if (searchInput) searchInput.value = String(window._catalogSearchQuery || '');
        const clearBtn = document.getElementById('catalogGlobalSearchClear');
        if (clearBtn) clearBtn.classList.toggle('hidden', !String(window._catalogSearchQuery || '').trim());
        renderCatalogAllProductsList();
        /* Opening pulls fresh data on demand (throttled to once a minute) so the
           full collection is only read while the user is actually looking. */
        const age = Date.now() - (window._catalogAllProductsFetchedAt || 0);
        if (age > 60000 && typeof window.refreshCatalogFromRest === 'function') {
            window.refreshCatalogFromRest();
        }
    }
};

/* One-tap entry for the product-audit team: open the all-products grid (which
   loads the full catalog on demand) and scroll it into view. */
window.openCatalogAudit = () => {
    if (!window.canViewAllCatalogProducts() || window.isDataEntryUser()) return;
    const body = document.getElementById('catalogAllProductsBody');
    if (body && body.classList.contains('hidden')) {
        window.toggleCatalogAllProductsWidget();
    } else if (typeof window.renderCatalogAllProductsList === 'function') {
        window.renderCatalogAllProductsList();
    }
    const widget = document.getElementById('catalogAllProductsWidget');
    if (widget && typeof widget.scrollIntoView === 'function') {
        try { widget.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
    }
};

const catalogMerchantLogoUrl = (merchantName) => {
    const name = String(merchantName || '').trim();
    if (!name || !Array.isArray(window.allTasksCache)) return '';
    const getBase = window.getBaseName;
    const baseName = getBase ? getBase(name) : name;
    const logoTask = window.allTasksCache.find((t) => {
        if (!t || !t.merchantLogo) return false;
        const taskBase = getBase ? getBase(t.name) : String(t.name || '');
        return taskBase === baseName || String(t.name || '') === name;
    });
    return logoTask && logoTask.merchantLogo ? String(logoTask.merchantLogo) : '';
};
window.catalogMerchantLogoUrl = catalogMerchantLogoUrl;

const catalogProductStatusCounts = (products) => {
    let approved = 0;
    let pending = 0;
    (products || []).forEach((p) => {
        if (String(p.status || '') === 'done') approved += 1;
        else pending += 1;
    });
    return { total: (products || []).length, approved, pending };
};

const renderCatalogMerchantFolderCard = (group) => {
    const name = catalogEscapeHtml(group.merchantName);
    const encoded = encodeURIComponent(group.merchantName).replace(/'/g, '%27');
    const counts = catalogProductStatusCounts(group.products);
    const logo = catalogMerchantLogoUrl(group.merchantName);
    const logoHtml = logo
        ? `<img src="${catalogEscapeHtml(logo)}" alt="" loading="lazy" decoding="async" class="w-16 h-16 rounded-2xl object-cover border border-[#FFD700]/50 bg-white shadow-sm">`
        : `<div class="w-16 h-16 rounded-2xl grid place-items-center bg-[#230535] text-[#FFD700] text-2xl shadow-sm"><i class="fa-solid fa-store"></i></div>`;
    return `<button type="button" onclick="openCatalogAllProductsMerchant('${encoded}', event)" class="catalog-merchant-card">
        <div class="flex justify-center mb-3">${logoHtml}</div>
        <div class="font-black text-sm text-[#230535] leading-snug line-clamp-2 min-h-[2.5rem]">${name}</div>
        <div class="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            <span class="text-[10px] font-black bg-[#230535] text-[#FFD700] px-2.5 py-0.5 rounded-full">${counts.total} منتجات</span>
            <span class="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">${counts.approved} مكتمل</span>
            <span class="text-[10px] font-black bg-[#E57723]/15 text-[#E57723] px-2 py-0.5 rounded-full">${counts.pending} قيد المعالجة</span>
        </div>
        ${renderCatalogMerchantSearchMatches(group)}
    </button>`;
};

const renderCatalogAllProductCard = (p) => {
    const pid = catalogEscapeHtml(p.id);
    const name = catalogEscapeHtml(p.name_ar || 'بدون اسم');
    const price = catalogEscapeHtml(p.base_price == null ? '' : p.base_price);
    const repName = catalogEscapeHtml(p.createdBy || p.deleteRequestedBy || '');
    const status = String(p.status || '') === 'done' ? 'مكتمل' : 'قيد المعالجة';
    const statusClass = String(p.status || '') === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#E57723]/15 text-[#E57723]';
    const thumbHtml = catalogClickableThumbHtml(p, {
        imgClass: 'w-full h-36 rounded-xl object-cover border border-[#230535]/10 cursor-pointer bg-slate-100 transition-opacity duration-200 hover:opacity-75',
        boxClass: 'w-full h-36 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 cursor-pointer transition-opacity duration-200 hover:opacity-75'
    });
    /* The audit team refines any imported product before launch. Read + update
       only, so this card exposes a single "تعديل" action and NO delete control. */
    const auditEdit = window.isProductAuditUser()
        ? `<button type="button" onclick="openCatalogProductEditor('${pid}')" class="w-full bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-pen-to-square"></i> تعديل</button>`
        : '';
    return `<div class="catalog-product-card p-3 shadow-sm space-y-2">
        ${thumbHtml}
        <button type="button" onclick="openCatalogProductDetails('${pid}')" title="عرض التفاصيل الكاملة" class="block w-full text-right font-black text-sm text-[#230535] line-clamp-2 min-h-[2.5rem] cursor-pointer transition-colors hover:text-[#E57723] hover:underline decoration-[#FFD700] underline-offset-2">${name}</button>
        <div class="flex flex-wrap gap-1.5">
            <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
            <span class="text-[10px] font-black ${statusClass} px-2 py-0.5 rounded-full">${status}</span>
            ${repName ? `<span class="text-[10px] font-black bg-[#230535]/10 text-[#230535] px-2 py-0.5 rounded-full truncate max-w-full">${repName}</span>` : ''}
        </div>
        ${auditEdit}
    </div>`;
};

const catalogAllProductsEmptyHtml = '<div class="col-span-full text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-box-open text-3xl text-[#230535]/30 mb-2"></i><div>لا توجد منتجات مرفوعة بعد</div></div>';

/* Initial-render cap for a single merchant's product grid. A merchant can hold
   hundreds of products; building every card synchronously on mount janks
   low-end devices, so only the first page is painted and the rest is revealed
   on demand through "عرض المزيد". */
const CATALOG_MERCHANT_GRID_PAGE = 120;
window.showMoreCatalogMerchantProducts = () => {
    window._catalogMerchantRenderLimit = (Number(window._catalogMerchantRenderLimit) || CATALOG_MERCHANT_GRID_PAGE) + CATALOG_MERCHANT_GRID_PAGE;
    renderCatalogAllProductsListNow();
};

/* Neutral skeleton placeholder used while the first REST response is in flight.
   It prevents the widgets from flashing an empty-state message or a "(0)" badge
   before real data arrives, which reads as broken/dummy data to employees. */
const catalogSkeletonCardHtml = () => `
    <div class="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm animate-pulse">
        <div class="flex items-start gap-3">
            <div class="w-16 h-16 rounded-xl bg-slate-200 shrink-0"></div>
            <div class="flex-1 space-y-2 py-1">
                <div class="h-3.5 bg-slate-200 rounded-full w-3/4"></div>
                <div class="h-2.5 bg-slate-100 rounded-full w-1/2"></div>
                <div class="h-2.5 bg-slate-100 rounded-full w-2/3"></div>
            </div>
        </div>
    </div>`;
const catalogLoadingStateHtml = (count = 6) =>
    `<div class="col-span-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">${
        Array.from({ length: count }).map(catalogSkeletonCardHtml).join('')
    }</div>`;
const catalogInlineSpinnerHtml = (label) =>
    `<div class="text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i><div>${label}</div></div>`;


window.openCatalogAllProductsMerchant = (encodedName, event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        event.stopPropagation();
    }
    /* Guard against ghost/double taps on touch devices: ignore a second
       invocation that lands within the same 350ms window. */
    const now = Date.now();
    if (window._catalogMerchantNavLock && (now - window._catalogMerchantNavLock) < 350) return;
    window._catalogMerchantNavLock = now;

    window._catalogAllProductsSelectedMerchant = decodeURIComponent(String(encodedName || ''));
    window._catalogMerchantRenderLimit = CATALOG_MERCHANT_GRID_PAGE;
    transitionCatalogAllProductsView(() => renderCatalogAllProductsListNow());
};

window.backCatalogAllProductsMerchants = (event) => {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        event.stopPropagation();
    }
    window._catalogAllProductsSelectedMerchant = '';
    transitionCatalogAllProductsView(() => renderCatalogAllProductsListNow());
};

/* Fade the products view out, swap its DOM, then fade it back in using
   requestAnimationFrame. Setting opacity-0 BEFORE the innerHTML swap hides the
   transient frame where the old grid is gone but the new one has not painted
   yet — this was the source of the harsh white flash on mobile. The wrapper
   keeps a min-height so the page never collapses to 0px during the swap. */
const transitionCatalogAllProductsView = (render) => {
    const view = document.getElementById('catalogAllProductsView');
    if (!view) {
        render();
        return;
    }
    view.classList.remove('transition-opacity', 'duration-300', 'opacity-100');
    view.classList.add('opacity-0');
    render();
    requestAnimationFrame(() => {
        view.classList.add('transition-opacity', 'duration-300', 'opacity-100');
        view.classList.remove('opacity-0');
        /* Smooth window scroll (instead of scrollIntoView) to the products view.
           offset by 90px so the sticky search bar never covers the toolbar. */
        const viewTop = Math.max(0, view.getBoundingClientRect().top + window.pageYOffset - 90);
        window.scrollTo({ top: viewTop, behavior: 'smooth' });
    });
};

const catalogRepDisplayName = (p) => String((p && (p.createdBy || p.added_by || p.addedBy || p.repName || p.created_by)) || '').trim() || 'غير معروف';

const aggregateCatalogProductsByRep = (products) => {
    const counts = new Map();
    (products || []).forEach((p) => {
        const name = catalogRepDisplayName(p);
        counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'ar'));
};

window.renderCatalogRepLeaderboard = (products) => {
    const wrap = document.getElementById('catalogRepLeaderboard');
    if (!wrap) return;
    const canView = window.canViewAllCatalogProducts() && !window.isDataEntryUser();
    if (!canView) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        return;
    }
    const list = products || window.allCatalogProductsCache || [];
    const reps = aggregateCatalogProductsByRep(list);
    const total = list.length;
    const maxCount = reps.length ? reps[0].count : 0;
    const selectedRep = String(window._catalogSelectedRep || '');
    wrap.classList.remove('hidden');
    const medals = ['fa-crown', 'fa-medal', 'fa-award'];
    const cards = reps.map((rep, idx) => {
        const pct = maxCount ? Math.round((rep.count / maxCount) * 100) : 0;
        const medal = idx < 3
            ? `<i class="fa-solid ${medals[idx]} text-[#E57723]"></i>`
            : `<span class="text-[10px] font-black text-slate-400">#${idx + 1}</span>`;
        const isActive = !!selectedRep && selectedRep === rep.name;
        const isDimmed = !!selectedRep && selectedRep !== rep.name;
        const encoded = encodeURIComponent(rep.name).replace(/'/g, '%27');
        const stateClass = isActive
            ? 'bg-[#E57723]/15 border-[#E57723] ring-2 ring-[#E57723] shadow-md'
            : 'bg-white border-[#FFD700]/40 hover:shadow-md';
        const dimClass = isDimmed ? 'opacity-40' : '';
        return `<button type="button" onclick="toggleCatalogRepFilter('${encoded}')" title="${isActive ? 'إلغاء التصفية' : 'عرض منتجات هذا المندوب'}" class="text-right ${stateClass} ${dimClass} border rounded-2xl p-2.5 shadow-sm min-w-[130px] flex-1 transition-all duration-200 cursor-pointer">
            <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-black ${isActive ? 'text-[#E57723]' : 'text-[#230535]'} truncate">${catalogEscapeHtml(rep.name)}</span>
                ${medal}
            </div>
            <div class="mt-1 flex items-baseline gap-1">
                <span class="text-2xl font-black text-[#E57723]">${rep.count}</span>
                <span class="text-[10px] font-bold text-slate-500">منتج</span>
            </div>
            <div class="mt-2 h-1.5 rounded-full bg-[#230535]/10 overflow-hidden">
                <div class="h-full rounded-full bg-[#FFD700]" style="width:${pct}%"></div>
            </div>
            ${isActive ? '<div class="mt-1 text-[10px] font-black text-[#E57723] text-center"><i class="fa-solid fa-filter"></i> مفعّل</div>' : ''}
        </button>`;
    }).join('');
    wrap.innerHTML = `<div class="bg-[#230535] rounded-2xl p-3 sm:p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-ranking-star text-[#FFD700]"></i>
                <h4 class="font-black text-sm text-[#FFD700]">أداء فريق المبيعات (إجمالي المنتجات المضافة)</h4>
            </div>
            <div class="flex items-center gap-2">
                ${selectedRep ? `<button type="button" onclick="toggleCatalogRepFilter('${encodeURIComponent(selectedRep).replace(/'/g, '%27')}')" class="text-[10px] font-black bg-[#E57723] text-white px-2.5 py-1 rounded-full hover:opacity-90 transition"><i class="fa-solid fa-xmark"></i> إلغاء تصفية: ${catalogEscapeHtml(selectedRep)}</button>` : ''}
                <span class="text-[10px] font-black bg-[#FFD700] text-[#230535] px-2.5 py-0.5 rounded-full">${total} منتج إجمالي</span>
            </div>
        </div>
        ${reps.length
            ? `<div class="flex flex-row flex-nowrap gap-2 overflow-x-auto hide-scrollbar pb-1">${cards}</div>`
            : '<div class="text-center py-4 text-[#FFD700]/70 font-bold text-xs">لا توجد بيانات بعد</div>'}
    </div>`;
};

window.toggleCatalogRepFilter = (encodedName) => {
    if (!window.canViewAllCatalogProducts() || window.isDataEntryUser()) return;
    const name = decodeURIComponent(String(encodedName || ''));
    if (!name) return;
    const current = String(window._catalogSelectedRep || '');
    window._catalogSelectedRep = current === name ? '' : name;
    window._catalogAllProductsSelectedMerchant = '';
    window.renderCatalogRepLeaderboard(window.allCatalogProductsCache || []);
    const body = document.getElementById('catalogAllProductsBody');
    if (window._catalogSelectedRep && body && body.classList.contains('hidden')) {
        window.toggleCatalogAllProductsWidget();
    } else {
        renderCatalogAllProductsList();
    }
};

/* Global deep search for "جميع منتجات المناديب".
   Matches (infix, Arabic-normalized) against merchant names AND product
   names, then keeps every merchant that passes so the folder grid stays
   coherent. Runs on the rep-scoped list, so it honors the active
   Multi-Select Rep Filter automatically. */
const catalogProductDisplayName = (p) => String(
    (p && (p.name_ar || p.name_en || p.name)) || ''
).trim();

const catalogDeepSearchMerchantSet = (products, query) => {
    const q = window.normalizeArabic(String(query || ''));
    const passing = new Set();
    if (!q) return passing;
    (products || []).forEach((p) => {
        const merchantName = catalogGroupMerchantKey(p);
        if (passing.has(merchantName)) return;
        const nameMatch = window.normalizeArabic(merchantName).includes(q);
        const productMatch = window.normalizeArabic(catalogProductDisplayName(p)).includes(q);
        if (nameMatch || productMatch) passing.add(merchantName);
    });
    return passing;
};

const catalogDeepSearchFilter = (products, query) => {
    if (!String(query || '').trim()) return products;
    const passing = catalogDeepSearchMerchantSet(products, query);
    return (products || []).filter((p) => passing.has(catalogGroupMerchantKey(p)));
};

/* ─── Client-side category filter + sort for "جميع منتجات المناديب" ───
   Both run on the ALREADY-LOADED in-memory product cache and never issue a
   Firestore read. The base list is narrowed by category, then by the existing
   search text, regrouped into merchant cards, and finally ordered by the
   selected sort mode. */

/* Distinct, non-empty product categories across the loaded products, sorted
   for a stable <select>. Pure in-memory Set work. */
const catalogUniqueCategories = (products) => {
    const set = new Set();
    (products || []).forEach((p) => {
        const cat = String((p && p.category) || '').trim();
        if (cat) set.add(cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
};

/* Root-level vendor types only (taxonomy fix).
   `window.categories` (constants.js) is the canonical Kanjo vendor-type list.
   Product documents carry their vendor's activity label in `category`, but a
   minority also store product-level sub-categories (e.g. "مشروبات ساخنة",
   "سلطات", "أدوية"). The UI filter must surface ONLY root vendor types, so the
   option list is intersected with the canonical root list and returned in that
   canonical order — never a product-level sub-category. Degrades to the full
   distinct set only if the constant is unavailable. */
const catalogRootVendorCategories = (products) => {
    const root = Array.isArray(window.categories) ? window.categories : [];
    const present = new Set();
    (products || []).forEach((p) => {
        const cat = String((p && p.category) || '').trim();
        if (cat) present.add(cat);
    });
    if (!root.length) return catalogUniqueCategories(products);
    return root.filter((cat) => present.has(cat));
};

/* Category is stored per product (`category`, e.g. "🍔 مطاعم وكافيهات"). The
   default "الكل" is the empty string and is a pass-through. */
const catalogFilterProductsByCategory = (products, category) => {
    const cat = String(category || '').trim();
    if (!cat) return products || [];
    return (products || []).filter((p) => String((p && p.category) || '').trim() === cat);
};

/* Millisecond timestamp of a product, tolerant of a Firestore Timestamp,
   KanjoRestTimestamp, Date and ISO string. Returns 0 when unknown. */
const catalogProductCreatedAtMillis = (p) => {
    const value = p && p.createdAt;
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    const millis = new Date(value).getTime();
    return Number.isFinite(millis) ? millis : 0;
};

/* Newest product in a merchant group — i.e. the merchant's latest activity. */
const catalogGroupNewestMillis = (group) => (group && group.products || [])
    .reduce((max, p) => Math.max(max, catalogProductCreatedAtMillis(p)), 0);

/* Ordered merchant groups for the folder grid, covering both directions of
   every metric. Ties always fall back to the Arabic alphabetical order so the
   grid stays deterministic. */
const catalogSortMerchantGroups = (groups, sortMode) => {
    const mode = String(sortMode || 'newest');
    const alpha = (a, b) => a.merchantName.localeCompare(b.merchantName, 'ar');
    if (mode === 'alpha') groups.sort(alpha);
    else if (mode === 'alpha_desc') groups.sort((a, b) => -alpha(a, b));
    else if (mode === 'most') groups.sort((a, b) => (b.products.length - a.products.length) || alpha(a, b));
    else if (mode === 'least') groups.sort((a, b) => (a.products.length - b.products.length) || alpha(a, b));
    else if (mode === 'oldest') groups.sort((a, b) => (catalogGroupNewestMillis(a) - catalogGroupNewestMillis(b)) || alpha(a, b));
    else groups.sort((a, b) => (catalogGroupNewestMillis(b) - catalogGroupNewestMillis(a)) || alpha(a, b));
    return groups;
};

/* ─── Merchant-card status filters (client-side, zero reads) ───
   Each merchant card is triaged from its OWN product counts, then the selected
   status narrows the already-loaded folder grid. Nothing here touches Firestore. */

/* Buckets a merchant group from its product counts:
     empty        — the merchant has no products at all
     full_done    — every product is completed (and there is at least one)
     full_pending — every product is still pending (and there is at least one)
     partial      — a mix of completed and pending products */
const catalogMerchantStatusKey = (group) => {
    const counts = catalogProductStatusCounts(group && group.products);
    if (counts.total === 0) return 'empty';
    if (counts.pending === 0) return 'full_done';
    if (counts.approved === 0) return 'full_pending';
    return 'partial';
};

const CATALOG_STATUS_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/* A merchant is "recent" when its newest product was added within the last 7
   days, and "has delete requests" when any of its products is flagged. */
const catalogMerchantIsRecent = (group) => {
    const newest = catalogGroupNewestMillis(group);
    return newest > 0 && (Date.now() - newest) <= CATALOG_STATUS_RECENT_MS;
};
const catalogMerchantHasDeleteRequest = (group) => (group && group.products || [])
    .some((p) => !!(p && (p.deleteRequested || p.deleteRequestedBy)));

const catalogMerchantStatusFilters = [
    { key: '', label: 'الكل', icon: 'fa-layer-group' },
    { key: 'full_done', label: 'مكتمل بالكامل', icon: 'fa-circle-check' },
    { key: 'full_pending', label: 'قيد المعالجة بالكامل', icon: 'fa-hourglass-half' },
    { key: 'partial', label: 'مكتمل جزئي', icon: 'fa-circle-half-stroke' },
    { key: 'empty', label: 'بدون منتجات', icon: 'fa-box-open' },
    { key: 'recent', label: 'نشاط حديث', icon: 'fa-bolt' },
    { key: 'delete', label: 'طلبات حذف', icon: 'fa-trash-can' }
];

const catalogMerchantGroupsByStatus = (groups, status) => {
    const key = String(status || '');
    if (!key) return groups || [];
    if (key === 'recent') return (groups || []).filter(catalogMerchantIsRecent);
    if (key === 'delete') return (groups || []).filter(catalogMerchantHasDeleteRequest);
    return (groups || []).filter((g) => catalogMerchantStatusKey(g) === key);
};

const catalogMerchantStatusCounts = (groups) => {
    const counts = { '': (groups || []).length, full_done: 0, full_pending: 0, partial: 0, empty: 0, recent: 0, delete: 0 };
    (groups || []).forEach((g) => {
        const key = catalogMerchantStatusKey(g);
        counts[key] = (counts[key] || 0) + 1;
        if (catalogMerchantIsRecent(g)) counts.recent += 1;
        if (catalogMerchantHasDeleteRequest(g)) counts.delete += 1;
    });
    return counts;
};

const renderCatalogStatusFilterBar = (groups) => {
    const bar = document.getElementById('catalogStatusFilterBar');
    if (!bar) return;
    const counts = catalogMerchantStatusCounts(groups);
    const active = String(window._catalogStatusFilter || '');
    /* Premium interactive pills: [icon] label (count). Each chip is a real
       button with an aria-pressed state so the active filter is unmistakable. */
    bar.innerHTML = catalogMerchantStatusFilters.map((f) => {
        const on = f.key === active;
        return `<button type="button" onclick="onCatalogStatusFilterChange('${f.key}')" class="catalog-status-chip${on ? ' is-active' : ''}" aria-pressed="${on ? 'true' : 'false'}">
            <i class="fa-solid ${f.icon}" aria-hidden="true"></i>
            <span class="catalog-status-chip-label">${f.label}</span>
            <span class="catalog-status-chip-count">(${counts[f.key] || 0})</span>
        </button>`;
    }).join('');
};

window.onCatalogStatusFilterChange = (key) => {
    window._catalogStatusFilter = String(key || '');
    /* A merchant detail view would hide the filtered folders, so snap back to
       the folder grid while a status filter is active. */
    window._catalogAllProductsSelectedMerchant = '';
    renderCatalogAllProductsListNow();
};

const catalogStatusNoResultsHtml = (status) => {
    const filter = catalogMerchantStatusFilters.find((f) => f.key === String(status || ''));
    const label = filter ? filter.label : '';
    return `<div class="col-span-full text-center py-10 text-slate-400 font-bold">
        <i class="fa-solid fa-filter-circle-xmark text-3xl text-[#230535]/30 mb-3"></i>
        <div class="text-base text-[#230535] font-black mb-1">لا يوجد تجار بهذه الحالة</div>
        <div class="text-xs">الحالة المحددة: <span class="text-[#E57723]">${catalogEscapeHtml(label)}</span></div>
        <button type="button" onclick="onCatalogStatusFilterChange('')" class="mt-4 bg-[#230535] text-[#FFD700] px-4 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition inline-flex items-center gap-2">
            <i class="fa-solid fa-xmark"></i> كل الحالات
        </button>
    </div>`;
};

/* Keep the two <select> controls in sync with the loaded data. Options are
   rebuilt only when the category list actually changes, so the native popup
   is not reset (and the current choice is preserved) on every keystroke. */
let _catalogCategoryOptionsSig = null;
const syncCatalogFilterControls = (baseProducts) => {
    const categorySelect = document.getElementById('catalogCategoryFilter');
    if (categorySelect) {
        /* Root vendor types ONLY — never product-level sub-categories. */
        const categories = catalogRootVendorCategories(baseProducts);
        const sig = categories.join('\u0001');
        if (_catalogCategoryOptionsSig !== sig) {
            _catalogCategoryOptionsSig = sig;
            categorySelect.innerHTML = '<option value="">الكل</option>' + categories.map((cat) => {
                const safe = catalogEscapeHtml(cat);
                return `<option value="${safe}">${safe}</option>`;
            }).join('');
        }
        const current = String(window._catalogCategoryFilter || '');
        if (current && !categories.includes(current)) window._catalogCategoryFilter = '';
        categorySelect.value = window._catalogCategoryFilter || '';
    }
    const sortSelect = document.getElementById('catalogSortSelect');
    if (sortSelect) sortSelect.value = String(window._catalogSortMode || 'newest');
};

window.onCatalogCategoryFilterChange = (event) => {
    window._catalogCategoryFilter = event && event.target ? String(event.target.value || '') : '';
    /* A merchant detail view would hide the filtered folders, so snap back to
       the grid while a category filter is active. */
    window._catalogAllProductsSelectedMerchant = '';
    renderCatalogAllProductsListNow();
};

window.onCatalogSortChange = (event) => {
    window._catalogSortMode = (event && event.target && String(event.target.value)) || 'newest';
    window._catalogAllProductsSelectedMerchant = '';
    renderCatalogAllProductsListNow();
};

const catalogCategoryNoResultsHtml = (category) => `<div class="col-span-full text-center py-10 text-slate-400 font-bold">
    <i class="fa-solid fa-filter text-3xl text-[#230535]/30 mb-3"></i>
    <div class="text-base text-[#230535] font-black mb-1">لا توجد منتجات في هذه الفئة</div>
    <div class="text-xs">الفئة المحددة: <span class="text-[#E57723]">${catalogEscapeHtml(String(category || ''))}</span></div>
    <button type="button" onclick="onCatalogCategoryFilterChange({target:{value:''}})" class="mt-4 bg-[#230535] text-[#FFD700] px-4 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition inline-flex items-center gap-2">
        <i class="fa-solid fa-xmark"></i> كل الفئات
    </button>
</div>`;

/* Maps each merchant to the exact products whose name matched the query.
   Founders use this mini-list to audit suspicious entries (name + price +
   who entered it) without leaving the merchant folder grid. */
const catalogDeepSearchProductMatchMap = (products, query) => {
    const q = window.normalizeArabic(String(query || ''));
    const map = new Map();
    if (!q) return map;
    (products || []).forEach((p) => {
        if (!window.normalizeArabic(catalogProductDisplayName(p)).includes(q)) return;
        const merchantName = catalogGroupMerchantKey(p);
        if (!map.has(merchantName)) map.set(merchantName, []);
        map.get(merchantName).push(p);
    });
    return map;
};

const renderCatalogMerchantSearchMatches = (group) => {
    const matches = group && group.matchedSearchProducts;
    if (!Array.isArray(matches) || !matches.length) return '';
    const items = matches.map((p) => {
        const name = catalogEscapeHtml(catalogProductDisplayName(p) || 'بدون اسم');
        const rawPrice = p.base_price != null ? p.base_price : (p.price != null ? p.price : '');
        const price = catalogEscapeHtml(rawPrice === '' ? '—' : rawPrice);
        const rep = catalogEscapeHtml(catalogRepDisplayName(p));
        return `<li class="flex items-start justify-between gap-2 py-1.5 border-b border-purple-100/70 last:border-0">
            <div class="min-w-0 flex-1 text-right">
                <div class="text-[11px] font-black text-[#230535] leading-snug line-clamp-2">${name}</div>
                <div class="text-[9px] font-bold text-purple-500 mt-0.5"><i class="fa-solid fa-user-pen"></i> أضافه: ${rep}</div>
            </div>
            <div class="text-[11px] font-black text-[#E57723] whitespace-nowrap">${price} ج.م</div>
        </li>`;
    }).join('');
    return `<div class="mt-3 bg-purple-50 border border-purple-100 rounded-xl p-2.5 text-right" onclick="event.stopPropagation()">
        <div class="text-[10px] font-black text-purple-700 mb-1.5 flex items-center gap-1.5"><i class="fa-solid fa-list-check"></i> نتائج مطابقة داخل هذا التاجر (${matches.length})</div>
        <ul>${items}</ul>
    </div>`;
};

const catalogSearchNoResultsHtml = (query) => `<div class="col-span-full text-center py-10 text-slate-400 font-bold">
    <i class="fa-solid fa-magnifying-glass text-3xl text-[#230535]/30 mb-3"></i>
    <div class="text-base text-[#230535] font-black mb-1">لا توجد نتائج مطابقة</div>
    <div class="text-xs">لم نعثر على تاجر أو منتج يطابق: <span class="text-[#E57723]">${catalogEscapeHtml(String(query || ''))}</span></div>
    <button type="button" onclick="clearCatalogGlobalSearch()" class="mt-4 bg-[#230535] text-[#FFD700] px-4 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition inline-flex items-center gap-2">
        <i class="fa-solid fa-xmark"></i> مسح البحث
    </button>
</div>`;

let _catalogGlobalSearchTimer = null;
window.onCatalogGlobalSearchInput = (event) => {
    const input = event && event.target;
    const value = input ? String(input.value || '') : '';
    const clearBtn = document.getElementById('catalogGlobalSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !value);
    if (_catalogGlobalSearchTimer) clearTimeout(_catalogGlobalSearchTimer);
    _catalogGlobalSearchTimer = setTimeout(() => {
        window._catalogSearchQuery = value;
        /* A cross-date merchant search needs the global task archive for names
           and logos; trigger it on first keystroke. */
        if (value.trim() && typeof window.ensureTaskArchiveLoaded === 'function') {
            window.ensureTaskArchiveLoaded();
        }
        /* A merchant detail view would hide the filtered folders, so snap
           back to the folder grid while a query is active. */
        if (value.trim()) window._catalogAllProductsSelectedMerchant = '';
        renderCatalogAllProductsList();
    }, 300);
};

window.clearCatalogGlobalSearch = () => {
    if (_catalogGlobalSearchTimer) {
        clearTimeout(_catalogGlobalSearchTimer);
        _catalogGlobalSearchTimer = null;
    }
    window._catalogSearchQuery = '';
    const input = document.getElementById('catalogGlobalSearchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('catalogGlobalSearchClear');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderCatalogAllProductsList();
};

const renderCatalogAllProductsListNow = () => {
    const list = document.getElementById('catalogAllProductsList');
    const toolbar = document.getElementById('catalogAllProductsToolbar');
    const countEl = document.getElementById('catalogAllProductsCount');
    const allProducts = window.allCatalogProductsCache || [];
    const selectedRep = String(window._catalogSelectedRep || '');
    const repProducts = selectedRep
        ? allProducts.filter((p) => catalogRepDisplayName(p) === selectedRep)
        : allProducts;
    const searchQuery = String(window._catalogSearchQuery || '').trim();
    const categoryFilter = String(window._catalogCategoryFilter || '').trim();
    const sortMode = String(window._catalogSortMode || 'newest');
    /* Populate the dropdowns from the rep-scoped base set (before the active
       filters) so their options stay stable while typing a search. */
    syncCatalogFilterControls(repProducts);
    let products = catalogFilterProductsByCategory(repProducts, categoryFilter);
    products = catalogDeepSearchFilter(products, searchQuery);
    if (countEl) countEl.textContent = String(products.length);
    window.renderCatalogRepLeaderboard(allProducts);
    if (!list) return;
    /* First load, nothing in cache yet: show skeletons, never an empty state. */
    if (!products.length && !window._catalogAllProductsLoaded) {
        if (countEl) countEl.textContent = '…';
        list.className = 'catalog-card-grid';
        list.innerHTML = catalogLoadingStateHtml();
        return;
    }
    if (!products.length) {
        if (toolbar) {
            if (selectedRep && searchQuery) {
                toolbar.classList.remove('hidden');
                toolbar.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#230535]/10 rounded-2xl px-3 py-2.5">
                <button type="button" onclick="toggleCatalogRepFilter('${encodeURIComponent(selectedRep).replace(/'/g, '%27')}')" class="bg-[#E57723] text-white px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-2">
                    <i class="fa-solid fa-xmark"></i> إلغاء تصفية المندوب
                </button>
                <div class="min-w-0 text-center flex-1">
                    <div class="font-black text-sm text-[#230535] truncate"><i class="fa-solid fa-filter text-[#E57723]"></i> نطاق البحث: ${catalogEscapeHtml(selectedRep)}</div>
                </div>
            </div>`;
            } else if (selectedRep) {
                toolbar.classList.remove('hidden');
                toolbar.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#230535]/10 rounded-2xl px-3 py-2.5">
                <button type="button" onclick="toggleCatalogRepFilter('${encodeURIComponent(selectedRep).replace(/'/g, '%27')}')" class="bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-2">
                    <i class="fa-solid fa-xmark"></i> إلغاء التصفية
                </button>
                <div class="min-w-0 text-center flex-1">
                    <div class="font-black text-sm text-[#230535] truncate">لا توجد منتجات للمندوب: ${catalogEscapeHtml(selectedRep)}</div>
                </div>
            </div>`;
            } else {
                toolbar.classList.add('hidden');
                toolbar.innerHTML = '';
            }
        }
        list.className = 'catalog-card-grid';
        list.innerHTML = searchQuery
            ? catalogSearchNoResultsHtml(searchQuery)
            : (categoryFilter ? catalogCategoryNoResultsHtml(categoryFilter) : catalogAllProductsEmptyHtml);
        return;
    }
    const allGroups = catalogSortMerchantGroups(groupCatalogProductsByMerchant(products), sortMode);
    /* Status chips reflect the current (rep/category/search-scoped) merchant
       set, then the active status narrows the folder grid. Pure in-memory. */
    renderCatalogStatusFilterBar(allGroups);
    const statusFilter = String(window._catalogStatusFilter || '');
    const groups = catalogMerchantGroupsByStatus(allGroups, statusFilter);
    if (!groups.length && statusFilter && list) {
        list.className = 'catalog-card-grid';
        list.innerHTML = catalogStatusNoResultsHtml(statusFilter);
        return;
    }
    const selected = String(window._catalogAllProductsSelectedMerchant || '');
    const selectedGroup = selected ? groups.find((g) => g.merchantName === selected) : null;
    if (selected && selectedGroup) {
        const counts = catalogProductStatusCounts(selectedGroup.products);
        if (toolbar) {
            toolbar.classList.remove('hidden');
            toolbar.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#230535]/10 rounded-2xl px-3 py-2.5">
                <div class="flex items-center gap-2">
                    <button type="button" onclick="backCatalogAllProductsMerchants(event)" class="bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-2">
                        <i class="fa-solid fa-arrow-right"></i> كل التجار
                    </button>
                    ${selectedRep ? `<button type="button" onclick="toggleCatalogRepFilter('${encodeURIComponent(selectedRep).replace(/'/g, '%27')}')" class="bg-[#E57723] text-white px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-2"><i class="fa-solid fa-xmark"></i> إلغاء تصفية المندوب</button>` : ''}
                </div>
                <div class="min-w-0 text-center flex-1">
                    <div class="font-black text-sm text-[#230535] truncate">${catalogEscapeHtml(selectedGroup.merchantName)}</div>
                    <div class="text-[10px] font-bold text-slate-500">${counts.total} منتجات — ${counts.approved} مكتمل — ${counts.pending} قيد المعالجة</div>
                </div>
            </div>`;
        }
        list.className = 'catalog-card-grid catalog-product-grid';
        const gridLimit = Math.max(CATALOG_MERCHANT_GRID_PAGE, Number(window._catalogMerchantRenderLimit) || CATALOG_MERCHANT_GRID_PAGE);
        const shownProducts = selectedGroup.products.slice(0, gridLimit);
        const remainingProducts = selectedGroup.products.length - shownProducts.length;
        list.innerHTML = shownProducts.map(renderCatalogAllProductCard).join('')
            + (remainingProducts > 0
                ? `<div class="col-span-full text-center py-4"><button type="button" onclick="showMoreCatalogMerchantProducts()" class="bg-[#230535] text-[#FFD700] px-5 py-3 rounded-xl text-xs font-black hover:opacity-90 transition inline-flex items-center gap-2"><i class="fa-solid fa-chevron-down"></i> عرض المزيد (${remainingProducts} متبقي)</button></div>`
                : '');
        return;
    }
    window._catalogAllProductsSelectedMerchant = '';
    if (selectedRep) {
        if (toolbar) {
            toolbar.classList.remove('hidden');
            toolbar.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E57723]/40 rounded-2xl px-3 py-2.5">
                <button type="button" onclick="toggleCatalogRepFilter('${encodeURIComponent(selectedRep).replace(/'/g, '%27')}')" class="bg-[#E57723] text-white px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-2">
                    <i class="fa-solid fa-xmark"></i> إلغاء التصفية
                </button>
                <div class="min-w-0 text-center flex-1">
                    <div class="font-black text-sm text-[#230535] truncate"><i class="fa-solid fa-filter text-[#E57723]"></i> منتجات المندوب: ${catalogEscapeHtml(selectedRep)}</div>
                    <div class="text-[10px] font-bold text-slate-500">${searchQuery ? `نتائج البحث عن «${catalogEscapeHtml(searchQuery)}» — ` : ''}${products.length} منتج — ${groups.length} تاجر</div>
                </div>
            </div>`;
        }
    } else if (searchQuery) {
        if (toolbar) {
            toolbar.classList.remove('hidden');
            toolbar.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#230535]/10 rounded-2xl px-3 py-2.5">
                <button type="button" onclick="clearCatalogGlobalSearch()" class="bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-2">
                    <i class="fa-solid fa-xmark"></i> مسح البحث
                </button>
                <div class="min-w-0 text-center flex-1">
                    <div class="font-black text-sm text-[#230535] truncate"><i class="fa-solid fa-magnifying-glass text-[#E57723]"></i> نتائج البحث: ${catalogEscapeHtml(searchQuery)}</div>
                    <div class="text-[10px] font-bold text-slate-500">${products.length} منتج — ${groups.length} تاجر</div>
                </div>
            </div>`;
        }
    } else if (toolbar) {
        toolbar.classList.add('hidden');
        toolbar.innerHTML = '';
    }
    /* Attach the exact matched products (name match) to each merchant so the
       folder card can render an inline audit mini-list while searching.
       Groups are rebuilt on every render, so clearing the search naturally
       drops `matchedSearchProducts` and restores the clean default state. */
    if (searchQuery) {
        const matchMap = catalogDeepSearchProductMatchMap(products, searchQuery);
        groups.forEach((g) => { g.matchedSearchProducts = matchMap.get(g.merchantName) || []; });
    }
    list.className = 'catalog-card-grid';
    list.innerHTML = groups.map(renderCatalogMerchantFolderCard).join('');
};

/* Snapshot-driven callers use the coalesced version (at most one rebuild per
   animation frame); explicit UI actions call Now() directly for instant feedback. */
const renderCatalogAllProductsList = window.scheduleFrameRender(renderCatalogAllProductsListNow);

window.renderCatalogAllProductsWidget = () => {
    const widget = document.getElementById('catalogAllProductsWidget');
    if (!widget) return;
    const canView = window.canViewAllCatalogProducts();
    widget.classList.toggle('hidden', !canView);
    const countEl = document.getElementById('catalogAllProductsCount');
    if (countEl) {
        countEl.textContent = !window._catalogAllProductsLoaded && !(window.allCatalogProductsCache || []).length
            ? '…'
            : String((window.allCatalogProductsCache || []).length);
    }
    const body = document.getElementById('catalogAllProductsBody');
    /* The leaderboard is rendered inside renderCatalogAllProductsListNow(), so we
       no longer render it twice per widget refresh. */
    if (canView && body && !body.classList.contains('hidden')) renderCatalogAllProductsList();
};

window.requestCatalogProductDeletion = async (productId) => {
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('طلب الحذف متاح للمناديب فقط', false);
        return;
    }
    const product = (window.repCatalogProductsCache || []).find((p) => p.id === productId);
    if (!product) {
        if (window.showToast) window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    if (product.deleteRequested) {
        if (window.showToast) window.showToast('طلب الحذف مُرسل بالفعل', false);
        return;
    }
    const ok = window.confirm('هل أنت متأكد من طلب حذف هذا المنتج؟');
    if (!ok) return;
    try {
        const deletionRequest = {
            deleteRequested: true,
            deleteRequestedAt: new Date(),
            deleteRequestedBy: (window.currentUser && window.currentUser.name) || ''
        };
        if (!(await catalogRestMerge([CATALOG_COLLECTION, productId], deletionRequest))) {
            await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), deletionRequest);
        }
        /* Reflect the pending deletion locally without re-fetching. */
        if (window.patchRepCatalogProductLocally) {
            window.patchRepCatalogProductLocally(productId, { deleteRequested: true });
        }
        window._catalogMyProductsSignature = '';
        if (typeof window.renderCatalogMyProductsWidget === 'function') window.renderCatalogMyProductsWidget();
        window.showToast('تم إرسال طلب الحذف للموافقة');
    } catch (err) {
        console.error('[catalog] delete request failed:', err);
        window.showToast('فشل إرسال طلب الحذف', false);
    }
};

window.toggleCatalogDeleteRequestsWidget = () => {
    if (!window.isMahmoudUser()) return;
    const body = document.getElementById('catalogDeleteRequestsBody');
    const chevron = document.getElementById('catalogDeleteRequestsChevron');
    if (!body) return;
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    window._catalogDeleteRequestsOpen = willOpen;
    if (willOpen) {
        renderCatalogDeleteRequestsList();
        window.refreshCatalogDeleteRequestsFromServer();
    }
};

const renderCatalogDeleteRequestCard = (p) => {
    const id = catalogEscapeHtml(p.id);
    const name = catalogEscapeHtml(p.name_ar || 'بدون اسم');
    const price = catalogEscapeHtml(p.base_price == null ? '' : p.base_price);
    const requestedBy = catalogEscapeHtml(p.deleteRequestedBy || p.createdBy || '');
    const thumb = catalogEscapeHtml(catalogProductThumbUrl(p));
    const thumbHtml = thumb
        ? `<img src="${thumb}" alt="" loading="lazy" decoding="async" class="w-16 h-16 rounded-xl object-cover border border-[#230535]/15 shrink-0" onerror="this.style.display='none'">`
        : `<div class="w-16 h-16 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image"></i></div>`;
    return `<div class="bg-white border border-red-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
        ${thumbHtml}
        <div class="min-w-0 flex-1">
            <div class="font-black text-sm text-[#230535] truncate">${name}</div>
            <div class="flex flex-wrap gap-1.5 mt-1">
                <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                ${requestedBy ? `<span class="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">${requestedBy}</span>` : ''}
            </div>
        </div>
        <div class="shrink-0 flex flex-col gap-1.5">
            <button type="button" onclick="approveCatalogProductDeletion('${id}')" class="bg-red-600 text-white px-3 py-2 rounded-xl text-[11px] font-black hover:bg-red-700 transition">موافقة</button>
            <button type="button" onclick="rejectCatalogProductDeletion('${id}')" class="bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-[11px] font-black hover:bg-slate-300 transition">رفض</button>
        </div>
    </div>`;
};

const renderCatalogDeleteRequestsList = () => {
    const list = document.getElementById('catalogDeleteRequestsList');
    const countEl = document.getElementById('catalogDeleteRequestsCount');
    const products = window.catalogDeleteRequestsCache || [];
    if (countEl) countEl.textContent = String(products.length);
    if (!products.length && !window._catalogDeleteRequestsLoaded) {
        if (countEl) countEl.textContent = '…';
        if (list) list.innerHTML = catalogInlineSpinnerHtml('جاري تحميل طلبات الحذف...');
        return;
    }
    renderCatalogMerchantAccordionList(
        list,
        products,
        '_catalogDeleteOpenMerchants',
        'catalogDeleteMerchantAccordion',
        renderCatalogDeleteRequestCard,
        '<div class="text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i><div>لا توجد طلبات حذف معلقة</div></div>'
    );
};

window.renderCatalogDeleteRequestsWidget = () => {
    const widget = document.getElementById('catalogDeleteRequestsWidget');
    if (!window.isMahmoudUser()) {
        if (widget) widget.remove();
        return;
    }
    if (!widget) return;
    widget.classList.remove('hidden');
    const countEl = document.getElementById('catalogDeleteRequestsCount');
    if (countEl) {
        countEl.textContent = !window._catalogDeleteRequestsLoaded && !(window.catalogDeleteRequestsCache || []).length
            ? '…'
            : String((window.catalogDeleteRequestsCache || []).length);
    }
    const body = document.getElementById('catalogDeleteRequestsBody');
    if (body && !body.classList.contains('hidden')) renderCatalogDeleteRequestsList();
};

/* Force a server read of the delete-request queue so a manager never acts on a
   stale IndexedDB snapshot right after another device submits a request. The
   live onSnapshot listener keeps the widget fresh afterwards. */
window.refreshCatalogDeleteRequestsFromServer = async () => {
    if (!window.isMahmoudUser()) return;
    try {
        let items = null;
        if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
            items = await window.kanjoRest.runQuery(CATALOG_COLLECTION, [['deleteRequested', '==', true]], null, { select: CATALOG_LIST_FIELDS });
        } else {
            if (typeof window.getDocs !== 'function' || !window.db) return;
            const snap = await window.getDocs(
                window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('deleteRequested', '==', true)),
                { source: 'server' }
            );
            items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        }
        window.catalogDeleteRequestsCache = sortCatalogProductsByCreatedAt(items);
        window._catalogDeleteRequestsLoaded = true;
        window.renderCatalogDeleteRequestsWidget();
        renderCatalogDeleteRequestsList();
    } catch (err) {
        console.error('[catalog] fresh delete-requests sync failed:', err);
    }
};

window.approveCatalogProductDeletion = async (productId) => {
    if (!window.isMahmoudUser()) {
        if (window.showToast) window.showToast('الموافقة على الحذف متاحة لمحمود فقط', false);
        return;
    }
    const ok = window.confirm('سيتم حذف المنتج نهائياً. هل أنت متأكد؟');
    if (!ok) return;
    try {
        if (!(await catalogRestDelete([CATALOG_COLLECTION, productId]))) {
            await window.deleteDoc(window.doc(window.db, CATALOG_COLLECTION, productId));
        }
        window.showToast('تم حذف المنتج نهائياً');
    } catch (err) {
        console.error('[catalog] approve deletion failed:', err);
        window.showToast('فشل حذف المنتج', false);
    }
};

window.rejectCatalogProductDeletion = async (productId) => {
    if (!window.isMahmoudUser()) {
        if (window.showToast) window.showToast('رفض طلب الحذف متاح لمحمود فقط', false);
        return;
    }
    try {
        /* REST has no FieldValue.delete sentinel: clearing the fields to null
           removes them from the delete queue just the same. */
        if (!(await catalogRestMerge([CATALOG_COLLECTION, productId], {
            deleteRequested: false,
            deleteRequestedAt: null,
            deleteRequestedBy: null
        }))) {
            const patch = {
                deleteRequestedAt: window.deleteField ? window.deleteField() : null,
                deleteRequestedBy: window.deleteField ? window.deleteField() : null
            };
            if (window.deleteField) patch.deleteRequested = window.deleteField();
            else patch.deleteRequested = false;
            await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), patch);
        }
        window.showToast('تم رفض طلب الحذف وإعادة المنتج');
    } catch (err) {
        console.error('[catalog] reject deletion failed:', err);
        window.showToast('فشل رفض طلب الحذف', false);
    }
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const catalogHasArabicScript = (value) => /[\u0600-\u06FF]/.test(String(value || ''));

const catalogResolvedEnglish = (englishValue, arabicValue) => {
    const en = String(englishValue || '').trim();
    const ar = String(arabicValue || '').trim();
    if (!en) return '';
    if (ar && en === ar) return '';
    if (catalogHasArabicScript(en)) return '';
    return en;
};

const parseGoogleTranslateResponse = (data) => {
    if (!Array.isArray(data) || !Array.isArray(data[0])) return '';
    return data[0].map((chunk) => (Array.isArray(chunk) ? String(chunk[0] || '') : '')).join('').trim();
};

/* Auto-translation is best-effort but must never hang the save/publish path.
   Each provider call is bounded by an AbortController timeout, retryable
   failures (HTTP 429/5xx, network abort) are retried across providers with
   exponential backoff, and identical texts share both an in-flight promise and
   a successful-result cache so a bulk sync of repeated descriptions does not
   hammer the free endpoints (the root cause of the silently-empty English
   fields on ليالي الشرق). */
const CATALOG_TRANSLATE_TIMEOUT_MS = 9000;
const CATALOG_TRANSLATE_MAX_ROUNDS = 3;
const CATALOG_TRANSLATE_CACHE = new Map();
const CATALOG_TRANSLATE_INFLIGHT = new Map();
const catalogTranslateSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const catalogFetchWithTimeout = async (url, timeoutMs) => {
    if (typeof AbortController === 'undefined') return fetch(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

const catalogTranslationRetryable = (err) => {
    const message = String((err && err.message) || err || '');
    if (/HTTP_(429|5\d\d)/.test(message)) return true;
    return String((err && err.name) || '') === 'AbortError';
};

const translateViaGoogle = async (text) => {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=' + encodeURIComponent(text);
    const response = await catalogFetchWithTimeout(url, CATALOG_TRANSLATE_TIMEOUT_MS);
    if (!response.ok) throw new Error('GOOGLE_TRANSLATE_HTTP_' + response.status);
    return parseGoogleTranslateResponse(await response.json());
};

const translateViaMyMemory = async (text) => {
    const url = 'https://api.mymemory.translated.net/get?langpair=ar|en&q=' + encodeURIComponent(text);
    const response = await catalogFetchWithTimeout(url, CATALOG_TRANSLATE_TIMEOUT_MS);
    if (!response.ok) throw new Error('MYMEMORY_HTTP_' + response.status);
    const data = await response.json();
    return String((data && data.responseData && data.responseData.translatedText) || '').trim();
};

const translateArToEn = async (arabicText) => {
    const text = String(arabicText || '').trim();
    if (!text) return '';
    if (CATALOG_TRANSLATE_CACHE.has(text)) return CATALOG_TRANSLATE_CACHE.get(text);
    if (CATALOG_TRANSLATE_INFLIGHT.has(text)) return CATALOG_TRANSLATE_INFLIGHT.get(text);
    const providers = [translateViaGoogle, translateViaMyMemory];
    const run = (async () => {
        for (let round = 0; round < CATALOG_TRANSLATE_MAX_ROUNDS; round++) {
            let retryable = false;
            for (let i = 0; i < providers.length; i++) {
                try {
                    const translated = String(await providers[i](text) || '').trim();
                    if (!translated) continue;
                    if (translated === text) continue;
                    if (catalogHasArabicScript(translated)) continue;
                    CATALOG_TRANSLATE_CACHE.set(text, translated);
                    return translated;
                } catch (err) {
                    console.error('[catalog] translate attempt failed:', err);
                    if (catalogTranslationRetryable(err)) retryable = true;
                }
            }
            /* Only wait before another round when the last round saw a retryable
               failure; a clean-but-empty response means retrying won't help. */
            if (round < CATALOG_TRANSLATE_MAX_ROUNDS - 1 && retryable) {
                await catalogTranslateSleep(400 * Math.pow(2, round));
            } else if (!retryable) {
                break;
            }
        }
        return '';
    })();
    CATALOG_TRANSLATE_INFLIGHT.set(text, run);
    try {
        return await run;
    } finally {
        CATALOG_TRANSLATE_INFLIGHT.delete(text);
    }
};

/* Preserve an existing valid English value when a fresh translation came back
   empty: a failed retry must never blank out a previously-good translation. */
const catalogTranslationOrKeep = (translated, fallback) => {
    const fresh = String(translated || '').trim();
    return fresh || String(fallback || '').trim();
};

const catalogEnhanceTargetCount = (product) => {
    const rawCount = catalogRawImageUrls(product).length;
    return rawCount > 0 ? rawCount : 1;
};

const syncOneCatalogDraft = async (draft, persistProgress) => {
    const nameAr = String((draft && draft.name_ar) || '').trim();
    const descriptionAr = String((draft && draft.description_ar) || '').trim();
    /* Translate name + description concurrently (previously two serialized calls
       separated by fixed 1.5s sleeps, which made bulk sync needlessly slow). */
    const [nameEn, descriptionEn] = await Promise.all([
        translateArToEn(nameAr),
        translateArToEn(descriptionAr)
    ]);
    const images = Array.isArray(draft && draft.images) ? draft.images : [];
    /* Resume support: every successful upload is written back onto the draft
       (rawImageUrls[i] / variation.uploadedImageUrl) and persisted, so a retry
       after a mid-way failure only uploads the images that are still missing. */
    if (!Array.isArray(draft.rawImageUrls)) draft.rawImageUrls = [];
    for (let i = 0; i < images.length; i++) {
        const img = images[i] || {};
        if (!img.base64) continue;
        if (draft.rawImageUrls[i]) continue;
        const uploadedUrl = await uploadCatalogImageToGas(
            img.base64,
            img.fileName || catalogJpegFileName('', 'product-raw-' + (i + 1)),
            (draft && draft.merchantName) || 'Unknown',
            'raw'
        );
        draft.rawImageUrls[i] = uploadedUrl;
        if (typeof persistProgress === 'function') await persistProgress();
    }
    const rawImageUrls = images.map((_, i) => draft.rawImageUrls[i]).filter(Boolean);
    const payload = {
        merchantId: draft.merchantId,
        merchantName: draft.merchantName,
        name_ar: nameAr,
        name_en: nameEn,
        description_ar: descriptionAr,
        description_en: descriptionEn,
        sku: draft.sku || generateCatalogSku(),
        product_type: draft.product_type || 'simple',
        base_price: Number(draft.base_price) || 0,
        category: draft.category || '',
        rawImageUrl: rawImageUrls[0] || '',
        rawImageUrls,
        enhancedImageUrl: '',
        enhancedImageUrls: [],
        status: 'pending',
        createdAt: new Date(),
        createdBy: draft.createdBy || ((window.currentUser && window.currentUser.name) || ''),
        syncedFromDraft: true
    };
    if (draft.product_type === 'variable' && Array.isArray(draft.variations)) {
        const variantPayload = [];
        for (let j = 0; j < draft.variations.length; j++) {
            const v = draft.variations[j];
            let variantImageUrl = '';
            if (v && v.uploadedImageUrl) {
                variantImageUrl = v.uploadedImageUrl;
            } else if (v && v.imageBase64) {
                variantImageUrl = await uploadCatalogImageToGas(
                    v.imageBase64,
                    v.imageFileName || catalogJpegFileName('', 'variant'),
                    draft.merchantName || 'Unknown',
                    'variant'
                );
                v.uploadedImageUrl = variantImageUrl;
                if (typeof persistProgress === 'function') await persistProgress();
            } else if (v && v.image_url) {
                variantImageUrl = v.image_url;
            }
            variantPayload.push({
                name: v && v.name,
                price: v && v.price,
                image_url: variantImageUrl || rawImageUrls[0] || ''
            });
        }
        payload.variations = variantPayload;
    }
    let created = await catalogRestCreate(CATALOG_COLLECTION, payload);
    if (!created) {
        const ref = await window.addDoc(window.collection(window.db, CATALOG_COLLECTION), payload);
        created = { id: ref && ref.id, ...payload };
    }
    /* Show the new product instantly (0 extra reads) by folding it into every
       already-loaded cache before the next poll reconciles. */
    if (created && created.id && typeof window.catalogApplyCreatedProductLocally === 'function') {
        window.catalogApplyCreatedProductLocally(created);
    }
};

window.syncAllCatalogDrafts = async () => {
    if (window._catalogSyncing) return;
    if (!window.canCreateCatalogProducts()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب وفريق مراجعة المنتجات فقط', false);
        return;
    }
    const drafts = await readCatalogDrafts();
    if (!drafts.length) {
        window.showToast('لا توجد مسودات للرفع', false);
        await window.renderCatalogDraftsWidget();
        return;
    }
    window._catalogSyncing = true;
    const syncBtn = document.getElementById('catalogSyncAllBtn');
    const setSyncLabel = (done, total) => {
        if (!syncBtn) return;
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الرفع ' + done + '/' + total;
    };
    setSyncLabel(0, drafts.length);
    const remaining = [];
    let uploaded = 0;
    try {
        for (let done = 0; done < drafts.length; done++) {
            setSyncLabel(done, drafts.length);
            const draft = drafts[done];
            /* Persist every not-yet-completed draft (failed ones already collected
               in `remaining`, plus the current draft with its in-progress image
               URLs and every pending draft after it) after each uploaded image,
               so progress survives a failure OR a reload. */
            const persistProgress = () => writeCatalogDrafts(remaining.concat(drafts.slice(done)));
            try {
                await syncOneCatalogDraft(draft, persistProgress);
                uploaded++;
            } catch (err) {
                console.error('[catalog] draft sync failed:', err);
                remaining.push(draft);
            }
        }
        await writeCatalogDrafts(remaining);
        if (remaining.length === 0) {
            window.showToast('تم رفع كل المسودات بنجاح');
        } else if (uploaded > 0) {
            window.showToast('تم رفع ' + uploaded + ' منتج، وتبقّى ' + remaining.length + ' في المسودة', false);
        } else {
            window.showToast('فشل رفع المسودات، حاول مرة أخرى', false);
        }
    } finally {
        window._catalogSyncing = false;
        await window.renderCatalogDraftsWidget();
        /* The synced products were already folded into every loaded cache by
           `catalogApplyCreatedProductLocally`, so just repaint from memory here.
           This deliberately replaces the old forced `loadMyCatalogProducts(true)`
           (a full re-read of the rep's entire product set) with 0 reads. When
           that cache was not loaded, its baseline was cleared so the widget's
           next open reconciles once, count-gated. */
        if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
    }
};

/* ─── One-off SKU de-duplication (admin) ───
   Duplicate products sharing a SKU (same merchant + same Arabic name) are the
   signature of the old split-brain double-submit: one submission produced two
   docs, and a later image/text edit landed on only one of them. This routine
   groups the live catalog by `sku + merchantId + normalized name_ar`, keeps the
   superior twin (most images, then most recently updated/created), and reports
   the plan. Deletion is DRY-RUN by default and only runs when the caller
   explicitly passes { dryRun:false, confirm:true } as a founder; every removed
   doc is written to the Black Box (audit_logs). Same-SKU docs with DIFFERENT
   merchant names are reported as conflicts, never auto-deleted. */
const kanjoDedupeImageCount = (p) => catalogRawImageUrls(p).length + catalogEnhancedImageUrls(p).length;
const kanjoDedupeTime = (value) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object') {
        if (value._date) return new Date(value._date).getTime();
        if (value.seconds != null) return value.seconds * 1000;
        if (typeof value.toDate === 'function') return value.toDate().getTime();
    }
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
};
const kanjoDedupeNormalizedName = (p) => String((p && p.name_ar) || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\s+/g, ' ')
    .trim();
const kanjoDedupeProductSummary = (p) => ({
    id: p.id,
    sku: p.sku || '',
    merchantId: p.merchantId || '',
    merchantName: catalogProductMerchantName(p),
    name_ar: p.name_ar || '',
    name_en: p.name_en || '',
    images: kanjoDedupeImageCount(p),
    status: p.status || '',
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
    updatedBy: p.updatedBy || '',
    hasDescriptionEn: !!String(p.description_en || '').trim()
});
/* Keep the doc with images first, then the most recently touched, then the most
   recently created, then a stable id tiebreak so the "keeper" is deterministic. */
const kanjoDedupeRank = (a, b) => {
    const ia = kanjoDedupeImageCount(a);
    const ib = kanjoDedupeImageCount(b);
    if (ib !== ia) return ib - ia;
    const ua = kanjoDedupeTime(a.updatedAt) || kanjoDedupeTime(a.createdAt);
    const ub = kanjoDedupeTime(b.updatedAt) || kanjoDedupeTime(b.createdAt);
    if (ub !== ua) return ub - ua;
    const ca = kanjoDedupeTime(a.createdAt);
    const cb = kanjoDedupeTime(b.createdAt);
    if (cb !== ca) return cb - ca;
    return String(b.id || '').localeCompare(String(a.id || ''));
};

/* Identity key: a shared SKU only counts as the SAME product when the merchant
   and the normalized Arabic name also match. Documents that merely collide on a
   SKU across different products are surfaced as conflicts, never merged. */
const kanjoDedupeGroupKey = (p) => String(p.merchantId || '') + '\u0000' + kanjoDedupeNormalizedName(p);

/* Raw scan shared by the console helper and the interactive resolution UI.
   Returns identity-scoped duplicate groups WITH the full product docs (so the
   dashboard can render side-by-side comparisons) plus any cross-identity SKU
   conflicts, which are surfaced read-only. */
const kanjoDedupeScan = async (options) => {
    const opts = options || {};
    const merchantName = String(opts.merchantName || '').trim();
    const products = await fetchAllCatalogProductsForExport();
    const groups = new Map();
    (products || []).forEach((p) => {
        const sku = String((p && p.sku) || '').trim();
        if (!sku) return;
        if (merchantName && catalogProductMerchantName(p) !== merchantName) return;
        if (!groups.has(sku)) groups.set(sku, []);
        groups.get(sku).push(p);
    });
    const duplicateGroups = [];
    const conflicts = [];
    groups.forEach((list, sku) => {
        if (list.length < 2) return;
        const byIdentity = new Map();
        list.forEach((p) => {
            const key = kanjoDedupeGroupKey(p);
            if (!byIdentity.has(key)) byIdentity.set(key, []);
            byIdentity.get(key).push(p);
        });
        if (byIdentity.size > 1) {
            conflicts.push({ sku, merchantName: catalogProductMerchantName(list[0]), products: list });
            return;
        }
        const twins = list.slice().sort(kanjoDedupeRank);
        duplicateGroups.push({
            sku,
            merchantName: catalogProductMerchantName(twins[0]),
            suggestedKeepId: twins[0].id,
            products: twins
        });
    });
    return {
        duplicateGroups,
        conflicts,
        totalGroups: duplicateGroups.length,
        totalDuplicateDocs: duplicateGroups.reduce((n, g) => n + g.products.length - 1, 0),
        conflictsCount: conflicts.length
    };
};

/* Delete one duplicate document via the REST-first path (SDK fallback) and
   write its Black Box entry. Only ever deletes the exact id it is given. */
const kanjoDedupeRemove = async (id, meta) => {
    const docId = String(id || '').trim();
    if (!docId) return false;
    let removed = false;
    if (await catalogRestDelete([CATALOG_COLLECTION, docId])) {
        removed = true;
        if (typeof window.kanjoAuditDelete === 'function') {
            window.kanjoAuditDelete({
                collectionId: CATALOG_COLLECTION,
                id: docId,
                name: (meta && (meta.name || meta.sku)) || '',
                description: (meta && meta.description) || 'إزالة منتج مكرر'
            });
        }
    } else if (typeof window.deleteDoc === 'function' && window.doc) {
        /* SDK fallback; its delete hook writes the Black Box entry. */
        await window.deleteDoc(window.doc(window.db, CATALOG_COLLECTION, docId));
        removed = true;
    }
    if (removed && Array.isArray(window.allCatalogProductsCache)) {
        window.allCatalogProductsCache = window.allCatalogProductsCache.filter((p) => p.id !== docId);
    }
    return removed;
};

/* Public, read-only surface for the interactive duplicate-resolution dashboard. */
window.KanjoCatalogDedupeAPI = {
    scan: (options) => kanjoDedupeScan(options),
    remove: (id, meta) => kanjoDedupeRemove(id, meta),
    imageUrl: (p) => catalogEnhancedImageUrls(p)[0] || catalogRawImageUrls(p)[0] || '',
    imageCount: (p) => kanjoDedupeImageCount(p),
    time: (value) => kanjoDedupeTime(value),
    identityKey: (p) => kanjoDedupeGroupKey(p),
    productSummary: (p) => kanjoDedupeProductSummary(p),
    isAdmin: () => (typeof window.isCatalogAdminUser === 'function' ? window.isCatalogAdminUser() : false)
};

window.kanjoDedupeDuplicateSkus = async (options) => {
    const opts = options || {};
    const execute = opts.dryRun === false && opts.confirm === true;
    const scan = await kanjoDedupeScan(opts);
    const plan = scan.duplicateGroups.map((group) => ({
        sku: group.sku,
        keep: kanjoDedupeProductSummary(group.products.find((p) => p.id === group.suggestedKeepId) || group.products[0]),
        remove: group.products.filter((p) => p.id !== group.suggestedKeepId).map(kanjoDedupeProductSummary)
    }));
    const result = {
        dryRun: !execute,
        skuGroups: scan.totalGroups,
        duplicateDocs: scan.totalDuplicateDocs,
        conflicts: scan.conflictsCount,
        plan,
        conflictGroups: scan.conflicts.map((c) => ({ sku: c.sku, products: c.products.map(kanjoDedupeProductSummary) }))
    };
    if (!execute) {
        if (result.duplicateDocs) {
            console.warn('[dedupe] DRY RUN -', result.duplicateDocs, 'duplicate doc(s) across', result.skuGroups, 'SKU group(s). Re-run with { dryRun:false, confirm:true } as a founder to delete.');
        }
        return result;
    }
    const isFounder = typeof window.isFounderAuditUser === 'function'
        ? window.isFounderAuditUser()
        : String(((window.currentUser || {}).role) || '') === 'founder';
    if (!isFounder) {
        if (window.showToast) window.showToast('تنظيف المنتجات المكررة متاح للمؤسسين فقط', false);
        return Object.assign({}, result, { executed: false, error: 'FOUNDER_ONLY' });
    }
    const deleted = [];
    const failures = [];
    for (const group of scan.duplicateGroups) {
        for (const doc of group.products) {
            if (doc.id === group.suggestedKeepId) continue;
            try {
                if (await kanjoDedupeRemove(doc.id, {
                    name: doc.name_ar || doc.sku,
                    sku: group.sku,
                    description: 'إزالة منتج مكرر (نفس SKU ' + group.sku + ') - أُبقي على ' + group.suggestedKeepId
                })) {
                    deleted.push(doc.id);
                } else {
                    failures.push({ id: doc.id, error: 'NO_DELETE_TRANSPORT' });
                }
            } catch (err) {
                console.error('[dedupe] delete failed:', doc.id, err);
                failures.push({ id: doc.id, error: String((err && err.message) || err) });
            }
        }
    }
    if (typeof window.showToast === 'function') {
        window.showToast('تمت إزالة ' + deleted.length + ' منتجاً مكرراً' + (failures.length ? '، وفشل ' + failures.length : ''), failures.length === 0);
    }
    return Object.assign({}, result, { dryRun: false, executed: true, deleted, failures });
};

window.downloadCatalogRawImage = (productId, imageIndex) => {
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId);
    const urls = catalogRawImageUrls(product);
    const idx = Number(imageIndex) || 0;
    const url = catalogDriveDownloadUrl(urls[idx] || urls[0]);
    if (!url) return window.showToast('لا يوجد رابط للصورة الأصلية', false);
    if (typeof window.kpiMarkImageSourceOpened === 'function') {
        window.kpiMarkImageSourceOpened(productId);
    }
    window.open(url, '_blank', 'noopener');
};

window.onCatalogDescriptionInput = () => {
    const field = document.getElementById('catalogDescriptionAr');
    const warning = document.getElementById('catalogDescriptionWarning');
    if (!field || !warning) return;
    const nameField = document.getElementById('catalogNameAr');
    const result = (typeof window.kpiValidateDescription === 'function')
        ? window.kpiValidateDescription(field.value, nameField ? nameField.value : '')
        : null;
    const show = result
        ? (!result.isEmpty && !result.isValid)
        : String(field.value || '').trim().length > 0 && String(field.value || '').trim().length <= 10;
    warning.classList.toggle('hidden', !show);
};

window.triggerCatalogEnhancedSlot = (productId, imageIndex, mode) => {
    if (!window.isCatalogContentUser()) {
        if (window.showToast) window.showToast('رفع الصورة المحسّنة متاح لفريق المحتوى فقط', false);
        return;
    }
    const modePrefix = mode === 'done' ? 'done' : 'pending';
    const input = document.getElementById('catalogEnhanceInput-' + modePrefix + '-' + productId + '-' + imageIndex)
        || document.getElementById('catalogEnhanceInput-' + productId + '-' + imageIndex);
    if (!input) return;
    input.value = '';
    input.click();
};

const markCatalogPendingEmpty = (list) => {
    if (!list) return;
    list.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold">
        <i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i>
        <div>لا توجد منتجات بانتظار التحسين</div>
    </div>`;
};

const removeCatalogPendingProductFromUi = (productId, merchantName) => {
    const card = document.getElementById('catalogPendingCard-' + productId);
    const accordion = (card && card.closest('[data-catalog-merchant]'))
        || document.getElementById('catalogMerchantAccordion-' + catalogMerchantDomId(merchantName));
    if (card) card.remove();
    if (accordion) {
        const left = accordion.querySelectorAll('[id^="catalogPendingCard-"]').length;
        const badge = accordion.querySelector('[data-catalog-merchant-count]');
        if (badge) badge.textContent = left + ' منتجات';
        if (left === 0) {
            if (window._catalogPendingOpenMerchants) delete window._catalogPendingOpenMerchants[merchantName];
            accordion.remove();
        }
    }
    /* Drop it from the pending cache too, so a later re-render of the list does
       not resurrect a product that just moved to the Completed tab. */
    window.merchantProductsCache = (window.merchantProductsCache || []).filter((p) => p.id !== productId);
    updateCatalogContentBadge();
    const list = document.getElementById('catalogPendingList');
    if (list && catalogPendingProducts().length === 0) markCatalogPendingEmpty(list);
};

/* Provenance patch stamped on every completed image task so the analytics can
   classify it (added from scratch / AI-edited / directly approved) and attribute
   it to the media editor's PIN. */
const catalogEditMetaPatch = (editType) => ({
    edit_type: String(editType || '').trim(),
    edited_by: catalogCurrentUserPin(),
    edited_at: new Date()
});

const persistCatalogEnhancedUrls = async (productId, enhancedUrls, options) => {
    const urls = Array.isArray(enhancedUrls) ? enhancedUrls.slice() : [];
    const patch = {
        enhancedImageUrl: urls[0] || '',
        enhancedImageUrls: urls,
        updatedAt: new Date(),
        updatedBy: (window.currentUser && window.currentUser.name) || ''
    };
    if (options && options.status) patch.status = options.status;
    /* Callers may attach provenance (edit_type / edited_by) so the completion is
       classified without a second write. */
    if (options && options.extra && typeof options.extra === 'object') {
        Object.assign(patch, options.extra);
    }
    /* Merge-patch the SAME document: re-uploads overwrite the existing enhanced
       image fields in place instead of creating a duplicate product. */
    if (!(await catalogRestMerge([CATALOG_COLLECTION, productId], patch))) {
        await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), patch);
    }
    /* A completion changes the editor's global processed total and the imported
       pool. Merge the row in place (zero reads) instead of dropping the global
       completed set, which forced a full multi-thousand-doc re-read per
       completion (`completions × N_done`). */
    if (patch.status === 'done' && typeof window.kpiApplyLocalProductChange === 'function') {
        window.kpiApplyLocalProductChange(productId, patch);
    }
    return patch;
};

const completeCatalogProductIfReady = async (productId, product, enhancedUrls, rawCount, editType) => {
    const filled = enhancedUrls.filter(Boolean);
    if (filled.length !== rawCount) return false;
    await persistCatalogEnhancedUrls(productId, enhancedUrls.slice(0, rawCount), {
        status: 'done',
        extra: catalogEditMetaPatch(editType)
    });
    delete window._catalogEnhancedUploads[productId];
    removeCatalogPendingProductFromUi(productId, (product && product.merchantName) || '');
    window.showToast('تم اعتماد المنتج بعد رفع كل الصور المحسّنة');
    return true;
};

/* Move a product that was just completed straight into the in-memory "done"
   cache (it is not there yet when the action started from the pending queue).
   Keeps the Completed tab correct without re-reading the collection. */
const catalogInsertDoneLocally = (productId, enhancedUrls) => {
    if (updateDoneCatalogProductLocally(productId, enhancedUrls)) return;
    const pending = (window.merchantProductsCache || []).find((p) => p.id === productId);
    if (!pending) return;
    const doneRow = Object.assign({}, pending, {
        enhancedImageUrl: enhancedUrls[0] || '',
        enhancedImageUrls: enhancedUrls.slice(),
        status: 'done'
    });
    window.doneCatalogProductsCache = (window.doneCatalogProductsCache || []).concat([doneRow]);
};

/* Professional confirmation dialog for the "direct approval" shortcut. */
const catalogConfirmDirectApproval = async (product) => {
    const name = (product && (product.name_ar || product.name_en || product.name)) || '';
    const message = 'هل أنت متأكد؟ لا حاجة لتعديلات؟';
    if (typeof window.Swal === 'undefined') {
        return window.confirm(message + '\n' + name);
    }
    const res = await window.Swal.fire({
        title: 'اعتماد مباشر',
        html: '<div style="font-weight:800;font-size:15px">' + message + '</div>'
            + (name ? '<div style="margin-top:6px;font-weight:900;color:#230535">' + catalogEscapeHtml(name) + '</div>' : ''),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'نعم، اعتماد مباشر',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#230535',
        cancelButtonColor: '#94a3b8',
        reverseButtons: true
    });
    return !!(res && res.isConfirmed);
};

/* Direct approval: the original (raw) image is already good enough, so map it to
   the final/enhanced field and mark the product done — no edit, no upload. The
   button is only ever rendered when a raw image exists. */
window.catalogDirectApproveProduct = async (productId) => {
    if (!window.isCatalogContentUser()) {
        if (window.showToast) window.showToast('الاعتماد المباشر متاح لفريق المحتوى فقط', false);
        return;
    }
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId)
        || (window.doneCatalogProductsCache || []).find((p) => p.id === productId);
    if (!product) {
        if (window.showToast) window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    const rawUrls = catalogRawImageUrls(product);
    if (!rawUrls.length) {
        if (window.showToast) window.showToast('لا توجد صورة أصلية للاعتماد المباشر', false);
        return;
    }
    if (!(await catalogConfirmDirectApproval(product))) return;
    const btn = document.getElementById('catalogDirectApproveBtn-' + productId);
    const prevHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>'; }
    try {
        await persistCatalogEnhancedUrls(productId, rawUrls.slice(), {
            status: 'done',
            extra: catalogEditMetaPatch(CATALOG_EDIT_TYPE_DIRECT)
        });
        if (typeof window.kpiCompleteImageEdit === 'function') window.kpiCompleteImageEdit(productId);
        removeCatalogPendingProductFromUi(productId, product.merchantName || '');
        catalogInsertDoneLocally(productId, rawUrls.slice());
        if (window._catalogDoneLoaded) renderCatalogDoneCards();
        if (window.showToast) window.showToast('تم الاعتماد المباشر للمنتج بنجاح', true);
    } catch (err) {
        console.error('[catalog] direct approval failed:', err);
        if (window.showToast) window.showToast('تعذر اعتماد المنتج', false);
        if (btn) { btn.disabled = false; btn.innerHTML = prevHtml; }
    }
};

window.handleCatalogEnhancedFile = async (event, productId, imageIndex, mode) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (!file || !productId) return;
    if (!window.isCatalogContentUser()) {
        if (window.showToast) window.showToast('رفع الصورة المحسّنة متاح لفريق المحتوى فقط', false);
        input.value = '';
        return;
    }
    if (file.size > CATALOG_MAX_IMAGE_BYTES) {
        window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);
        input.value = '';
        return;
    }
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId)
        || (window.doneCatalogProductsCache || []).find((p) => p.id === productId);
    if (!product) {
        window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    const rawUrls = catalogRawImageUrls(product);
    const targetCount = catalogEnhanceTargetCount(product);
    const idx = Number(imageIndex) || 0;
    /* Provenance: enhancing an existing rep image = AI edit; supplying the image
       for a product that had none = added from scratch. */
    const editType = rawUrls.length ? CATALOG_EDIT_TYPE_AI : CATALOG_EDIT_TYPE_FROM_SCRATCH;
    const isCompleted = String(product.status || '') === 'done'
        || catalogEnhancedImageUrls(product).some(Boolean);
    const modePrefix = mode === 'done' ? 'done' : 'pending';
    const slotBtn = document.getElementById('catalogEnhanceBtn-' + modePrefix + '-' + productId + '-' + idx)
        || document.getElementById('catalogEnhanceBtn-' + productId + '-' + idx);
    const prevHtml = slotBtn ? slotBtn.innerHTML : '';
    if (slotBtn) {
        slotBtn.disabled = true;
        slotBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    }
    try {
        const base64Data = await compressCatalogImage(file);
        const uploadedUrl = await uploadCatalogImageToGas(
            base64Data,
            catalogJpegFileName(file.name, 'product-enhanced-' + (idx + 1)),
            product.merchantName || '',
            'enhanced'
        );
        if (typeof window.kpiCompleteImageEdit === 'function') {
            window.kpiCompleteImageEdit(productId);
        }
        const enhancedUrls = getCatalogEnhancedLocal(productId, targetCount, catalogEnhancedImageUrls(product));
        enhancedUrls[idx] = uploadedUrl;
        window._catalogEnhancedUploads[productId] = enhancedUrls;
        if (isCompleted) {
            /* Already completed: overwrite the replaced slot in place, keep the
               remaining enhanced images, and stay in the completed list. */
            await persistCatalogEnhancedUrls(productId, enhancedUrls.slice(0, targetCount), {
                status: 'done',
                extra: catalogEditMetaPatch(editType)
            });
            delete window._catalogEnhancedUploads[productId];
            if ((window.merchantProductsCache || []).some((p) => p.id === productId)) {
                removeCatalogPendingProductFromUi(productId, product.merchantName || '');
            }
            updateDoneCatalogProductLocally(productId, enhancedUrls.slice(0, targetCount));
            window.showToast('تم استبدال الصورة المحسّنة بنجاح');
            renderCatalogDoneCards();
        } else {
            const done = await completeCatalogProductIfReady(productId, product, enhancedUrls, targetCount, editType);
            if (!done) {
                window.showToast('تم رفع الصورة المحسّنة (' + enhancedUrls.filter(Boolean).length + '/' + rawUrls.length + ')');
                renderCatalogPendingCards();
            }
        }
    } catch (err) {
        console.error('[catalog] enhance failed:', err);
        window.showToast('فشل رفع الصورة المحسّنة', false);
        if (slotBtn) {
            slotBtn.disabled = false;
            slotBtn.innerHTML = prevHtml || '<i class="fa-solid fa-wand-magic-sparkles"></i> رفع المحسّنة';
        }
    } finally {
        if (input) input.value = '';
    }
};

window.toggleCatalogMerchantAccordion = (domId, mode) => {
    const isDone = mode === 'done';
    const prefix = isDone ? 'catalogDoneMerchantAccordion-' : 'catalogMerchantAccordion-';
    const accordion = document.getElementById(prefix + String(domId || ''));
    if (!accordion) return;
    const body = accordion.querySelector('[data-catalog-merchant-body]');
    const chevron = accordion.querySelector('[data-catalog-merchant-chevron]');
    if (!body) return;
    const merchantName = accordion.getAttribute('data-catalog-merchant') || '';
    const mapKey = isDone ? '_catalogDoneOpenMerchants' : '_catalogPendingOpenMerchants';
    const openMap = window[mapKey] || {};
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    if (willOpen) openMap[merchantName] = true;
    else delete openMap[merchantName];
    window[mapKey] = openMap;
};

const catalogActiveTab = () => (window._catalogContentTab === 'done' ? 'done' : 'pending');

/* Products ingested by the Pharmacy Inventory Intake engine are audited by the
   founders (see founderAudit.js), NOT by the content/image editor. They are
   excluded here so they never appear in the content editor's queue. Matching is
   by the explicit intake source first, then by pharmacy-related category as a
   fallback for older rows. */
window.catalogIsPharmacyIntakeProduct = (p) => {
    if (!p) return false;
    if (String(p.intakeSource || '').trim() === 'pharmacy_inventory_intake') return true;
    const category = String(p.category || '');
    return category.includes('صيدل') || category.includes('عناية شخصية');
};

const catalogPendingProducts = () => (window.merchantProductsCache || [])
    .filter((p) => p.status === 'pending' && !window.catalogIsPharmacyIntakeProduct(p));

const catalogDoneProducts = () => (window.doneCatalogProductsCache || [])
    .filter((p) => !window.catalogIsPharmacyIntakeProduct(p));

const updateCatalogContentBadge = () => {
    const active = catalogActiveTab();
    const pending = catalogPendingProducts();
    const done = catalogDoneProducts();
    const pendingText = (!window._catalogPendingLoaded && !pending.length) ? '…' : String(pending.length);
    const doneText = (!window._catalogDoneLoaded && !done.length) ? '…' : String(done.length);
    const headerEl = document.getElementById('catalogPendingCount');
    if (headerEl) headerEl.textContent = active === 'done' ? doneText : pendingText;
    const pendingTabEl = document.getElementById('catalogTabPendingCount');
    if (pendingTabEl) pendingTabEl.textContent = pendingText;
    const doneTabEl = document.getElementById('catalogTabDoneCount');
    if (doneTabEl) doneTabEl.textContent = doneText;
    const pendingBtn = document.getElementById('catalogTabPendingBtn');
    const doneBtn = document.getElementById('catalogTabDoneBtn');
    if (pendingBtn) pendingBtn.classList.toggle('is-active', active === 'pending');
    if (doneBtn) doneBtn.classList.toggle('is-active', active === 'done');
};

const updateDoneCatalogProductLocally = (productId, enhancedUrls) => {
    const cache = window.doneCatalogProductsCache || [];
    const idx = cache.findIndex((p) => p.id === productId);
    if (idx === -1) return false;
    cache[idx] = {
        ...cache[idx],
        enhancedImageUrl: enhancedUrls[0] || '',
        enhancedImageUrls: enhancedUrls.slice()
    };
    window.doneCatalogProductsCache = cache;
    return true;
};

const renderCatalogProductCard = (p, mode) => {
    const isDone = mode === 'done';
    const id = catalogEscapeHtml(p.id);
    const name = catalogEscapeHtml(p.name_ar);
    const category = catalogEscapeHtml(p.category);
    const price = catalogEscapeHtml(p.base_price);
    const rawUrls = catalogRawImageUrls(p);
    const targetCount = catalogEnhanceTargetCount(p);
    const storedEnhanced = catalogEnhancedImageUrls(p);
    const enhancedUrls = isDone
        ? storedEnhanced.concat(new Array(Math.max(0, targetCount - storedEnhanced.length)).fill('')).slice(0, targetCount)
        : getCatalogEnhancedLocal(p.id, targetCount, storedEnhanced);
    const doneCount = enhancedUrls.filter(Boolean).length;
    const noRawImages = rawUrls.length === 0;
    const slots = (noRawImages ? [''] : rawUrls).map((u, i) => {
        const enhanced = enhancedUrls[i] || '';
        const preview = enhanced || u;
        const thumb = preview ? catalogEscapeHtml(catalogDriveThumbnailUrl(preview) || catalogDirectImageUrl(preview)) : '';
        const hasEnhanced = !!enhanced;
        const uploadBtn = `<button type="button" id="catalogEnhanceBtn-${mode}-${id}-${i}" onclick="triggerCatalogEnhancedSlot('${id}', ${i}, '${mode}')" class="bg-[#230535] text-[#FFD700] px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:opacity-90 transition flex items-center justify-center gap-1">
                <i class="fa-solid fa-wand-magic-sparkles"></i> ${noRawImages ? 'رفع صورة المنتج' : 'رفع المحسّنة'}
            </button>
            <input type="file" id="catalogEnhanceInput-${mode}-${id}-${i}" accept="image/*" class="hidden" onchange="handleCatalogEnhancedFile(event, '${id}', ${i}, '${mode}')">`;
        let actionHtml = '';
        if (isDone) {
            if (hasEnhanced) {
                actionHtml += `<button type="button" onclick="viewCatalogEnhancedImage('${id}', ${i})" class="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:bg-emerald-100 transition flex items-center justify-center gap-1">
                    <i class="fa-regular fa-eye"></i> عرض المحسّنة
                </button>`;
            }
            actionHtml += uploadBtn;
        } else if (hasEnhanced) {
            actionHtml = '<span class="text-[10px] font-black text-emerald-600 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> تم</span>';
        } else {
            /* Direct approval is only offered when an original (raw) image exists
               and the product is still pending: the editor vouches for the raw
               shot without editing it. */
            const directBtn = (u && i === 0)
                ? `<button type="button" id="catalogDirectApproveBtn-${id}" onclick="catalogDirectApproveProduct('${id}')" class="bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:bg-emerald-700 transition flex items-center justify-center gap-1">
                        <i class="fa-solid fa-stamp"></i> اعتماد مباشر
                    </button>`
                : '';
            actionHtml = uploadBtn + directBtn;
        }
        const fullPreview = preview ? catalogEscapeHtml(catalogDirectImageUrl(preview)) : '';
        const thumbHtml = thumb
            ? `<img src="${thumb}" data-full-img="${fullPreview}" data-image-title="${name}" alt="" loading="lazy" decoding="async" class="w-14 h-14 rounded-lg object-cover border ${hasEnhanced ? 'catalog-enhanced-thumb' : 'border-[#FFD700]/40'} shrink-0 cursor-pointer transition hover:opacity-80" onclick="event.stopPropagation();catalogOpenSwalImage(this)" title="عرض الصورة بالحجم الكامل" onerror="this.style.display='none'">`
            : `<div class="w-14 h-14 rounded-lg grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image text-lg"></i></div>`;
        const downloadBtn = u
            ? `<button type="button" onclick="downloadCatalogRawImage('${id}', ${i})" class="bg-white border border-[#230535]/15 text-[#230535] px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:bg-[#230535]/5 transition flex items-center justify-center gap-1">
                    <i class="fa-solid fa-download"></i> تحميل
                </button>`
            : (noRawImages && !isDone ? '<span class="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg">لا توجد صورة من المندوب</span>' : '');
        return `<div class="flex items-center gap-2 bg-[#230535]/5 border border-[#FFD700]/30 rounded-xl p-2">
            ${thumbHtml}
            <div class="min-w-0 flex-1 space-y-1.5">
                <div class="text-[10px] font-black text-[#230535]">${noRawImages ? 'صورة المنتج' : ('صورة ' + (i + 1))}${hasEnhanced ? ' <span class="text-emerald-600">• محسّنة</span>' : ''}</div>
                <div class="flex flex-wrap gap-1.5">
                    ${downloadBtn}
                    ${actionHtml}
                </div>
            </div>
        </div>`;
    }).join('');
    const cardId = (isDone ? 'catalogDoneCard-' : 'catalogPendingCard-') + id;
    return `<div id="${cardId}" class="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div class="min-w-0">
            <div class="font-black text-sm text-[#230535]">${name}</div>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
                <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                ${category ? `<span class="text-[10px] font-bold bg-purple-50 text-kanjo-primary px-2 py-0.5 rounded-full">${category}</span>` : ''}
                <span class="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">${doneCount}/${targetCount}</span>
                ${isDone ? '<span class="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">مكتمل</span>' : ''}
                ${noRawImages && !isDone ? '<span class="text-[10px] font-black bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">بانتظار صورة</span>' : ''}
            </div>
        </div>
        <div class="grid grid-cols-1 gap-2">${slots}</div>
    </div>`;
};

const buildCatalogGroupedMerchantsHtml = (products, mode) => {
    const isDone = mode === 'done';
    const grouped = products.reduce((acc, p) => {
        const key = String(p.merchantName || 'تاجر غير معروف');
        if (!acc[key]) acc[key] = [];
        acc[key].push(p);
        return acc;
    }, {});
    const mapKey = isDone ? '_catalogDoneOpenMerchants' : '_catalogPendingOpenMerchants';
    const openMap = window[mapKey] || {};
    window[mapKey] = openMap;
    const merchantNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ar'));
    const accordionPrefix = isDone ? 'catalogDoneMerchantAccordion-' : 'catalogMerchantAccordion-';
    return merchantNames.map((merchantName) => {
        const items = grouped[merchantName];
        const safeName = catalogEscapeHtml(merchantName);
        const accordionId = (isDone ? 'd-' : '') + catalogMerchantDomId(merchantName);
        const isOpen = !!openMap[merchantName];
        const cards = items.map((item) => renderCatalogProductCard(item, mode)).join('');
        return `<div id="${accordionPrefix}${accordionId}" data-catalog-merchant="${safeName}" class="rounded-2xl overflow-hidden border border-[#230535]/20 shadow-sm">
            <button type="button" onclick="toggleCatalogMerchantAccordion('${accordionId}', '${mode}')" class="w-full ${isDone ? 'bg-emerald-700' : 'bg-[#230535]'} text-white px-4 py-3 flex items-center justify-between gap-3">
                <span class="font-black text-sm truncate">${safeName}</span>
                <span class="flex items-center gap-2 shrink-0">
                    <span data-catalog-merchant-count class="text-[11px] font-black ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-[#FFD700] text-[#230535]'} px-2.5 py-0.5 rounded-full">${items.length} منتجات</span>
                    <i data-catalog-merchant-chevron class="fa-solid fa-chevron-down ${isDone ? 'text-emerald-100' : 'text-[#FFD700]'} text-xs transition-transform ${isOpen ? 'rotate-180' : ''}"></i>
                </span>
            </button>
            <div data-catalog-merchant-body class="${isOpen ? '' : 'hidden'} bg-slate-50 p-3 space-y-3">${cards}</div>
        </div>`;
    }).join('');
};

const markCatalogDoneEmpty = (list) => {
    if (!list) return;
    list.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold">
        <i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i>
        <div>لا توجد مهام مكتملة بعد</div>
    </div>`;
};

const renderCatalogPendingCards = () => {
    updateCatalogContentBadge();
    const list = document.getElementById('catalogPendingList');
    if (!list) return;
    const pending = catalogPendingProducts();
    if (pending.length === 0 && !window._catalogPendingLoaded) {
        list.innerHTML = catalogLoadingStateHtml();
        return;
    }
    if (pending.length === 0) {
        markCatalogPendingEmpty(list);
        return;
    }
    list.innerHTML = buildCatalogGroupedMerchantsHtml(pending, 'pending');
};

const renderCatalogDoneCards = () => {
    updateCatalogContentBadge();
    const list = document.getElementById('catalogDoneList');
    if (!list) return;
    const done = catalogDoneProducts();
    if (done.length === 0 && !window._catalogDoneLoaded) {
        list.innerHTML = catalogLoadingStateHtml();
        return;
    }
    if (done.length === 0) {
        markCatalogDoneEmpty(list);
        return;
    }
    list.innerHTML = buildCatalogGroupedMerchantsHtml(done, 'done');
};

window.viewCatalogEnhancedImage = (productId, imageIndex) => {
    const product = (window.doneCatalogProductsCache || []).find((p) => p.id === productId)
        || (window.merchantProductsCache || []).find((p) => p.id === productId);
    const urls = catalogEnhancedImageUrls(product);
    const idx = Number(imageIndex) || 0;
    const target = urls[idx] || urls[0];
    const url = catalogDriveViewUrl(target) || target || '';
    if (!url) {
        window.showToast('لا يوجد رابط للصورة المحسّنة', false);
        return;
    }
    window.open(url, '_blank', 'noopener');
};

window.loadDoneCatalogProducts = async () => {
    if (!window.isCatalogContentUser()) return;
    /* Strict cache-first: the "done" set is already in memory (from the content
       "done" tab, the export dropdown, or a prior export) — reuse it instead of
       issuing another one-read-per-document query. */
    if (window._catalogDoneLoaded && Array.isArray(window.doneCatalogProductsCache) && window.doneCatalogProductsCache.length) {
        return window.doneCatalogProductsCache;
    }
    try {
        let items = null;
        if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
            try {
                items = await window.kanjoRest.runQuery(CATALOG_COLLECTION, [['status', '==', 'done']], null, { select: CATALOG_LIST_FIELDS });
            } catch (restErr) {
                console.warn('[catalog] REST done-products fetch failed; trying SDK:', restErr);
            }
        }
        if (!items) {
            if (typeof window.getDocs !== 'function' || !window.db) return;
            const ref = window.query(
                window.collection(window.db, CATALOG_COLLECTION),
                window.where('status', '==', 'done')
            );
            const snap = await window.getDocs(ref);
            items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        }
        window.doneCatalogProductsCache = sortCatalogProductsByCreatedAt(items);
        window._catalogDoneLoaded = true;
    } catch (err) {
        console.error('[catalog] done products fetch failed:', err);
    }
};

window.switchCatalogContentTab = async (tab) => {
    if (!window.isCatalogContentUser()) return;
    const target = tab === 'done' ? 'done' : 'pending';
    window._catalogContentTab = target;
    const pendingList = document.getElementById('catalogPendingList');
    const doneList = document.getElementById('catalogDoneList');
    if (pendingList) pendingList.classList.toggle('hidden', target !== 'pending');
    if (doneList) doneList.classList.toggle('hidden', target !== 'done');
    updateCatalogContentBadge();
    if (target === 'done') {
        if (window._catalogDoneLoaded) renderCatalogDoneCards();
        else if (doneList) doneList.innerHTML = catalogLoadingStateHtml();
        await window.loadDoneCatalogProducts();
        renderCatalogDoneCards();
    } else {
        renderCatalogPendingCards();
    }
};

window.toggleCatalogContentWidget = () => {
    const body = document.getElementById('catalogContentBody');
    const chevron = document.getElementById('catalogContentChevron');
    if (!body) return;
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    window._catalogContentWidgetOpen = willOpen;
    if (willOpen && window.isCatalogContentUser()) {
        if (catalogActiveTab() === 'done') window.switchCatalogContentTab('done');
        else renderCatalogPendingCards();
    }
};

window.renderCatalogWidgets = () => {
    if (window.isDataEntryUser()) {
        ['catalogRepBanner', 'catalogDraftsWidget', 'catalogMyProductsWidget', 'catalogAllProductsWidget', 'catalogDeleteRequestsWidget', 'catalogContentWidget', 'catalogExportSection'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (typeof window.renderStagingCatalogWidgets === 'function') window.renderStagingCatalogWidgets();
        return;
    }
    const repBanner = document.getElementById('catalogRepBanner');
    /* Reps AND the product-audit team can add products, so both see the
       "إضافة منتج" banner (the audit team covers items the agents missed). */
    if (repBanner) repBanner.classList.toggle('hidden', !window.canCreateCatalogProducts());
    if (typeof window.renderCatalogDraftsWidget === 'function') window.renderCatalogDraftsWidget();
    if (typeof window.renderCatalogMyProductsWidget === 'function') window.renderCatalogMyProductsWidget();
    if (typeof window.renderCatalogAllProductsWidget === 'function') window.renderCatalogAllProductsWidget();
    if (typeof window.renderCatalogDeleteRequestsWidget === 'function') window.renderCatalogDeleteRequestsWidget();

    const contentWidget = document.getElementById('catalogContentWidget');
    if (contentWidget) contentWidget.classList.toggle('hidden', !window.isCatalogContentUser());

    const exportSection = document.getElementById('catalogExportSection');
    const isAdmin = window.isCatalogAdminUser();
    if (exportSection) exportSection.classList.toggle('hidden', !isAdmin);
    const exportBtn = document.getElementById('catalogExportBtn');
    if (exportBtn) exportBtn.classList.toggle('hidden', !isAdmin);
    const fixBtn = document.getElementById('catalogFixTranslationsBtn');
    if (fixBtn) fixBtn.classList.toggle('hidden', !isAdmin);
    const dupBtn = document.getElementById('catalogResolveDuplicatesBtn');
    if (dupBtn) dupBtn.classList.toggle('hidden', !isAdmin);
    if (isAdmin) populateMerchantExportFilter();

    const mpExportBtn = document.getElementById('mpCatalogExportBtn');
    const mpModal = document.getElementById('merchantProfileModal');
    if (mpExportBtn && mpModal && !mpModal.classList.contains('hidden')) {
        mpExportBtn.classList.toggle('hidden', !window.isCatalogAdminUser());
    }

    if (window.isCatalogContentUser()) {
        const body = document.getElementById('catalogContentBody');
        if (body && !body.classList.contains('hidden')) {
            if (catalogActiveTab() === 'done') {
                if (window._catalogDoneLoaded) renderCatalogDoneCards();
                else updateCatalogContentBadge();
            } else {
                renderCatalogPendingCards();
            }
        } else {
            updateCatalogContentBadge();
        }
    }

    if (typeof window.renderStagingCatalogWidgets === 'function') window.renderStagingCatalogWidgets();
};

const fetchDoneCatalogProducts = async () => {
    /* Zero-new-reads reuse: when the full catalog is already in memory, derive
       the "done" set locally instead of issuing another server query. */
    if (Array.isArray(window.allCatalogProductsCache) && window.allCatalogProductsCache.length) {
        return window.allCatalogProductsCache.filter((p) => p && p.status === 'done');
    }
    /* Stable done-cache guard: once the done set has been fetched (by this
       function, the content "done" tab, or the all-products load) reuse it so
       repeated callers — the export dropdown's onfocus in particular — cost
       ZERO Firestore reads instead of re-reading every done document. */
    if (window._catalogDoneLoaded && Array.isArray(window.doneCatalogProductsCache) && window.doneCatalogProductsCache.length) {
        return window.doneCatalogProductsCache;
    }
    /* REST-first (CORS-enabled, survives a blocked SDK transport). The result is
       cached so a second export in the same session is free, and the SDK
       transport (whose streaming channel can fail) is only a last resort. */
    if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
        try {
            const items = (await window.kanjoRest.runQuery(CATALOG_COLLECTION, [['status', '==', 'done']], null, { select: CATALOG_LIST_FIELDS })) || [];
            window.doneCatalogProductsCache = items;
            window._catalogDoneLoaded = true;
            return items;
        } catch (err) {
            console.warn('[catalog] done REST fetch failed; trying SDK:', err);
        }
    }
    const qRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'done'));
    const snap = await window.getDocs(qRef);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    window.doneCatalogProductsCache = items;
    window._catalogDoneLoaded = true;
    return items;
};

const catalogProductMerchantName = (p) => String((p && (p.merchantName || p.merchant || p.merchant_name)) || '').trim();

/* Full-catalog source for the "include pending" export. Cache-first (a checked
   box never queries); one REST read — then the SDK — is only issued on the
   explicit export click when nothing is cached yet. */
const fetchAllCatalogProductsForExport = async () => {
    if (Array.isArray(window.allCatalogProductsCache) && window.allCatalogProductsCache.length) {
        return window.allCatalogProductsCache;
    }
    if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
        try {
            const items = (await window.kanjoRest.runQuery(CATALOG_COLLECTION, [], null, { select: CATALOG_LIST_FIELDS })) || [];
            window.allCatalogProductsCache = items;
            window._catalogAllProductsLoaded = true;
            if (typeof window.refreshCatalogDuplicatesBadge === 'function') window.refreshCatalogDuplicatesBadge();
            return items;
        } catch (err) {
            console.warn('[catalog] full REST fetch failed; trying SDK:', err);
        }
    }
    const items = await fetchAllCatalogProducts();
    window.allCatalogProductsCache = items;
    window._catalogAllProductsLoaded = true;
    if (typeof window.refreshCatalogDuplicatesBadge === 'function') window.refreshCatalogDuplicatesBadge();
    return items;
};

const populateMerchantExportFilter = async (allowFetch = false) => {
    const select = document.getElementById('merchantExportFilter');
    if (!select) return;
    const previous = String(select.value || '').trim();
    /* The export dropdown must never trigger the heavy done-set read on boot:
       fill it from whatever is already in memory. The server read is only
       allowed through the explicit on-demand path (wired to the select's
       focus), and even then it reuses the all-products cache first. */
    let products = window.allCatalogProductsCache || [];
    if (!products.length && allowFetch) {
        try {
            products = await fetchDoneCatalogProducts();
        } catch (err) {
            console.error('[catalog] merchant filter load failed:', err);
            products = [];
        }
    }
    if (!products.length) {
        products = [].concat(
            window.merchantProductsCache || [],
            window.repCatalogProductsCache || [],
            window.catalogDeleteRequestsCache || []
        );
    }
    const names = Array.from(new Set(products.map(catalogProductMerchantName).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ar'));
    select.innerHTML = '<option value="" disabled selected>اختر التاجر للتصدير...</option>' + names.map((name) => {
        const safe = catalogEscapeHtml(name);
        return `<option value="${safe}">${safe}</option>`;
    }).join('');
    if (previous && names.indexOf(previous) !== -1) select.value = previous;
};
window.loadMerchantExportFilterFull = () => populateMerchantExportFilter(true);

/* ═══════════════════ Kanjo Excel bulk export engine ═══════════════════ */

/* Official Kanjo product categories, exactly as the platform import template
   expects them (`ID:<id> | <name_ar>`). The list mirrors the main database's
   category table (id -> Arabic name); its order is the canonical order and the
   final tie-breaker when two categories match at the same position. Each
   category auto-matches on its own name (the authoritative table ships no
   synonym list). */
const KANJO_PRODUCT_CATEGORIES = [
    { id: 149, name: 'إضافات', keywords: ['إضافات'] },
    { id: 12, name: 'برجر', keywords: ['برجر'] },
    { id: 148, name: 'بيتي', keywords: ['بيتي'] },
    { id: 160, name: 'تمور', keywords: ['تمور'] },
    { id: 159, name: 'تمور', keywords: ['تمور'] },
    { id: 150, name: 'طواجن', keywords: ['طواجن'] },
    { id: 152, name: 'عروض', keywords: ['عروض'] },
    { id: 8, name: 'كرسبي', keywords: ['كرسبي'] },
    { id: 151, name: 'كشري', keywords: ['كشري'] },
    { id: 156, name: 'كيك', keywords: ['كيك'] },
    { id: 153, name: 'مجمدات', keywords: ['مجمدات'] },
    { id: 147, name: 'مقبلات', keywords: ['مقبلات'] },
    { id: 157, name: 'وافل', keywords: ['وافل'] },
    { id: 139, name: 'الخضار', keywords: ['الخضار'] },
    { id: 9, name: 'مشويات', keywords: ['مشويات'] },
    { id: 10, name: 'أسماك', keywords: ['أسماك'] },
    { id: 140, name: 'خضرة', keywords: ['خضرة'] },
    { id: 28, name: 'توفير', keywords: ['توفير'] },
    { id: 7, name: 'حواوشي', keywords: ['حواوشي'] },
    { id: 18, name: 'مسكنات', keywords: ['مسكنات'] },
    { id: 11, name: 'مصري', keywords: ['مصري'] },
    { id: 141, name: 'للطبخ', keywords: ['للطبخ'] },
    { id: 142, name: 'الفاكهة', keywords: ['الفاكهة'] },
    { id: 32, name: 'بقالة', keywords: ['بقالة'] },
    { id: 57, name: 'مدرسية', keywords: ['مدرسية'] },
    { id: 143, name: 'الموسمية', keywords: ['الموسمية'] },
    { id: 146, name: 'عضوي', keywords: ['عضوي'] },
    { id: 118, name: 'الأدوية', keywords: ['الأدوية'] },
    { id: 144, name: 'مستوردة', keywords: ['مستوردة'] },
    { id: 100, name: 'الإضاءة', keywords: ['الإضاءة'] },
    { id: 48, name: 'الخبز', keywords: ['الخبز'] },
    { id: 145, name: 'مجهزة', keywords: ['مجهزة'] },
    { id: 20, name: 'مزمنة', keywords: ['مزمنة'] },
    { id: 15, name: 'بيتزا', keywords: ['بيتزا'] },
    { id: 40, name: 'قهوة', keywords: ['قهوة'] },
    { id: 79, name: 'لحوم', keywords: ['لحوم'] },
    { id: 108, name: 'ماكياج', keywords: ['ماكياج'] },
    { id: 128, name: 'مكسرات', keywords: ['مكسرات'] },
    { id: 92, name: 'الملابس', keywords: ['الملابس'] },
    { id: 68, name: 'موبايلات', keywords: ['موبايلات'] },
    { id: 58, name: 'مكتبية', keywords: ['مكتبية'] },
    { id: 29, name: 'ثلاجة', keywords: ['ثلاجة'] },
    { id: 24, name: 'الأطفال', keywords: ['الأطفال'] },
    { id: 155, name: 'حفاضات', keywords: ['حفاضات'] },
    { id: 109, name: 'البشرة', keywords: ['البشرة'] },
    { id: 101, name: 'المشترك', keywords: ['المشترك'] },
    { id: 49, name: 'المعجنات', keywords: ['المعجنات'] },
    { id: 129, name: 'محمص', keywords: ['محمص'] },
    { id: 69, name: 'جرابات', keywords: ['جرابات'] },
    { id: 14, name: 'شاورما', keywords: ['شاورما'] },
    { id: 80, name: 'قطعيات', keywords: ['قطعيات'] },
    { id: 41, name: 'باردة', keywords: ['باردة'] },
    { id: 119, name: 'الحشرات', keywords: ['الحشرات'] },
    { id: 93, name: 'المطبخ', keywords: ['المطبخ'] },
    { id: 59, name: 'الرسم', keywords: ['الرسم'] },
    { id: 120, name: 'كلاب', keywords: ['كلاب'] },
    { id: 102, name: 'البطاريات', keywords: ['البطاريات'] },
    { id: 130, name: 'التسالي', keywords: ['التسالي'] },
    { id: 70, name: 'شواحن', keywords: ['شواحن'] },
    { id: 42, name: 'فريش', keywords: ['فريش'] },
    { id: 110, name: 'الشعر', keywords: ['الشعر'] },
    { id: 27, name: 'المرأة', keywords: ['المرأة'] },
    { id: 50, name: 'الفطائر', keywords: ['الفطائر'] },
    { id: 33, name: 'تسالي', keywords: ['تسالي'] },
    { id: 4, name: 'ساندوتشات', keywords: ['ساندوتشات', 'سندوتشات', 'ساندوتش', 'سندوتش', 'سندويتش'] },
    { id: 81, name: 'مجهزة', keywords: ['مجهزة'] },
    { id: 94, name: 'الحمام', keywords: ['الحمام'] },
    { id: 121, name: 'قطط', keywords: ['قطط'] },
    { id: 60, name: 'اكسسوارات', keywords: ['اكسسوارات'] },
    { id: 111, name: 'الأظافر', keywords: ['الأظافر'] },
    { id: 71, name: 'باوربانك', keywords: ['باوربانك'] },
    { id: 131, name: 'البهارات', keywords: ['البهارات'] },
    { id: 103, name: 'الأدوات', keywords: ['الأدوات'] },
    { id: 23, name: 'الشخصية', keywords: ['الشخصية'] },
    { id: 82, name: 'حلويات', keywords: ['حلويات'] },
    { id: 43, name: 'الساخن', keywords: ['الساخن'] },
    { id: 1, name: 'باستا', keywords: ['باستا'] },
    { id: 51, name: 'حلويات', keywords: ['حلويات'] },
    { id: 31, name: 'لحوم', keywords: ['لحوم'] },
    { id: 95, name: 'الأسطح', keywords: ['الأسطح'] },
    { id: 122, name: 'الطيور', keywords: ['الطيور'] },
    { id: 132, name: 'الأعشاب', keywords: ['الأعشاب'] },
    { id: 112, name: 'العطور', keywords: ['العطور'] },
    { id: 72, name: 'سماعات', keywords: ['سماعات'] },
    { id: 38, name: 'طازج', keywords: ['طازج'] },
    { id: 83, name: 'فراخ', keywords: ['فراخ'] },
    { id: 25, name: 'فيتامينات', keywords: ['فيتامينات'] },
    { id: 13, name: 'كريب', keywords: ['كريب'] },
    { id: 52, name: 'كيك', keywords: ['كيك'] },
    { id: 104, name: 'مستلزمات', keywords: ['مستلزمات'] },
    { id: 96, name: 'معطرات', keywords: ['معطرات'] },
    { id: 44, name: 'ميلك شيك', keywords: ['ميلك شيك'] },
    { id: 61, name: 'المناسبات', keywords: ['المناسبات'] },
    { id: 97, name: 'مستلزمات', keywords: ['مستلزمات'] },
    { id: 123, name: 'أعلاف', keywords: ['أعلاف'] },
    { id: 105, name: 'الأجهزة', keywords: ['الأجهزة'] },
    { id: 133, name: 'البقوليات', keywords: ['البقوليات'] },
    { id: 21, name: 'البشرة', keywords: ['البشرة'] },
    { id: 113, name: 'الجسم', keywords: ['الجسم'] },
    { id: 53, name: 'بسكوت', keywords: ['بسكوت'] },
    { id: 73, name: 'للسيارات', keywords: ['للسيارات'] },
    { id: 45, name: 'سموزي', keywords: ['سموزي'] },
    { id: 17, name: 'مشروبات', keywords: ['مشروبات'] },
    { id: 84, name: 'قطعيات', keywords: ['قطعيات'] },
    { id: 34, name: 'مشروبات', keywords: ['مشروبات'] },
    { id: 62, name: 'نسائية', keywords: ['نسائية'] },
    { id: 114, name: 'رموش', keywords: ['رموش'] },
    { id: 74, name: 'سمارت', keywords: ['سمارت'] },
    { id: 134, name: 'العسل', keywords: ['العسل'] },
    { id: 22, name: 'الشعر', keywords: ['الشعر'] },
    { id: 124, name: 'العناية', keywords: ['العناية'] },
    { id: 85, name: 'متبل', keywords: ['متبل'] },
    { id: 54, name: 'ساندوتشات', keywords: ['ساندوتشات', 'سندوتشات', 'ساندوتش', 'سندوتش', 'سندويتش'] },
    { id: 16, name: 'سلطات', keywords: ['سلطات'] },
    { id: 106, name: 'للسيارات', keywords: ['للسيارات'] },
    { id: 46, name: 'كوكتيل', keywords: ['كوكتيل'] },
    { id: 98, name: 'العشرات', keywords: ['العشرات'] },
    { id: 35, name: 'منظفات', keywords: ['منظفات'] },
    { id: 63, name: 'رجالية', keywords: ['رجالية'] },
    { id: 115, name: 'مستلزمات', keywords: ['مستلزمات'] },
    { id: 75, name: 'اكسسوارات', keywords: ['اكسسوارات'] },
    { id: 135, name: 'مجفف', keywords: ['مجفف'] },
    { id: 55, name: 'شرقي', keywords: ['شرقي'] },
    { id: 47, name: 'حلويات', keywords: ['حلويات'] },
    { id: 86, name: 'طيور', keywords: ['طيور'] },
    { id: 107, name: 'كشافات', keywords: ['كشافات'] },
    { id: 30, name: 'مخبوزات', keywords: ['مخبوزات'] },
    { id: 125, name: 'مستلزمات', keywords: ['مستلزمات'] },
    { id: 26, name: 'مستلزمات', keywords: ['مستلزمات'] },
    { id: 99, name: 'الأطفال', keywords: ['الأطفال'] },
    { id: 158, name: 'حفاضات', keywords: ['حفاضات'] },
    { id: 65, name: 'أطفال', keywords: ['أطفال'] },
    { id: 87, name: 'أسماك', keywords: ['أسماك'] },
    { id: 76, name: 'التصوير', keywords: ['التصوير'] },
    { id: 116, name: 'الشفاه', keywords: ['الشفاه'] },
    { id: 136, name: 'القهوة', keywords: ['القهوة'] },
    { id: 126, name: 'سبلايز', keywords: ['سبلايز'] },
    { id: 66, name: 'بوكسات', keywords: ['بوكسات'] },
    { id: 56, name: 'صحي', keywords: ['صحي'] },
    { id: 39, name: 'الأم', keywords: ['الأم'] },
    { id: 36, name: 'ورقيات', keywords: ['ورقيات'] },
    { id: 19, name: 'المناعة', keywords: ['المناعة'] },
    { id: 117, name: 'بوكسات', keywords: ['بوكسات'] },
    { id: 77, name: 'جيمنج', keywords: ['جيمنج'] },
    { id: 137, name: 'السناكس', keywords: ['السناكس'] },
    { id: 67, name: 'منزلية', keywords: ['منزلية'] },
    { id: 88, name: 'فيليه', keywords: ['فيليه'] },
    { id: 127, name: 'المزارع', keywords: ['المزارع'] },
    { id: 138, name: 'الخلطات', keywords: ['الخلطات'] },
    { id: 89, name: 'سي فود', keywords: ['سي فود'] },
    { id: 78, name: 'مستلزمات', keywords: ['مستلزمات'] },
    { id: 91, name: 'مجمدات', keywords: ['مجمدات'] },
    { id: 37, name: 'حلويات', keywords: ['حلويات'] },
    /* Restaurant feteer ("فطائر" — no definite article). Distinct from the
       bakery entry ID:50 "الفطائر"; the operator explicitly confirmed the
       restaurant vertical is ID:161. */
    { id: 161, name: 'فطائر', keywords: ['فطائر'] },
    /* 2026 restaurant verticals introduced by the Ops Manager. Both are offered
       only to restaurants via the vendor rule below; "فراخ" therefore repeats the
       poultry name and MUST be pinned per-domain. */
    { id: 163, name: 'اللمة', keywords: ['اللمة', 'لمه'] },
    { id: 164, name: 'فراخ', keywords: ['فراخ'] },
    /* 2026 restaurant fries vertical. "بطاطس" is the canonical keyword; the
       colloquial pack/serving words are handled by the semantic rules below. */
    { id: 165, name: 'بطاطس', keywords: ['بطاطس'] },
    /* ===== Desserts & Cafés tree — merged into the "حلويات" vendor type =====
       Ops Manager, 2026: the standalone "الحلو" vendor type was scrapped and
       this dictionary folded into the existing حلويات auto-tagging rule, so no
       merchant has to be migrated. Two-level tree: standalone dessert items plus
       a "مشروبات" parent (ID:176) whose children are beverages. The Kanjo export
       workbook has a SINGLE `category` column (see KANJO_PRODUCTS_SHEET_COLUMNS),
       so per the export spec the CHILD id is emitted; there is no category_path
       column to populate. The `parent` metadata is kept here for documentation
       and a future hierarchical export.

       Several names repeat existing categories (كريب/طواجن/وافل/كيك/سموذي/ميلك شيك);
       the merged حلويات rule below pins each shared name to its legacy AND
       dessert IDs — the matcher is ID-scoped, never name-scoped. */
    { id: 166, name: 'كريب', keywords: ['كريب', 'crepe', 'crêpe'] },
    { id: 167, name: 'مولتن', keywords: ['مولتن', 'molten'] },
    { id: 168, name: 'فريسكا', keywords: ['فريسكا', 'فري سكا', 'freska', 'fresca'] },
    { id: 169, name: 'سينابون', keywords: ['سينابون', 'cinnabon'] },
    { id: 170, name: 'زلابيا', keywords: ['زلابيا', 'زلابية', 'zalabya', 'zalabia'] },
    { id: 171, name: 'طواجن', keywords: ['طواجن', 'طاجن', 'tagine'] },
    { id: 172, name: 'وافل', keywords: ['وافل', 'waffle'] },
    { id: 173, name: 'بان كيك', keywords: ['بان كيك', 'بانكيك', 'pancake'] },
    { id: 174, name: 'كيك', keywords: ['كيك', 'كيكة', 'cake'] },
    { id: 175, name: 'أم علي', keywords: ['أم علي', 'ام علي', 'om ali', 'umm ali'] },
    /* Children of parent ID:176 "مشروبات" (beverage sub-tree). */
    { id: 177, name: 'ماتشا', keywords: ['ماتشا', 'matcha'], parent: { id: 176, name: 'مشروبات' } },
    { id: 178, name: 'بوبا', keywords: ['بوبا', 'boba', 'bubble tea'], parent: { id: 176, name: 'مشروبات' } },
    { id: 179, name: 'زبادو', keywords: ['زبادو', 'zabado'], parent: { id: 176, name: 'مشروبات' } },
    { id: 180, name: 'سموذي', keywords: ['سموذي', 'سموزي', 'smoothie'], parent: { id: 176, name: 'مشروبات' } },
    { id: 181, name: 'ميلك شيك', keywords: ['ميلك شيك', 'ميلكشيك', 'milkshake'], parent: { id: 176, name: 'مشروبات' } },
    { id: 182, name: 'صودا', keywords: ['صودا', 'soda', 'موهيتو', 'mojito', 'صن شاين', 'sunshine'], parent: { id: 176, name: 'مشروبات' } },
    { id: 183, name: 'عصير', keywords: ['عصير', 'juice'], parent: { id: 176, name: 'مشروبات' } },
    { id: 184, name: 'آيس كوفي', keywords: ['آيس كوفي', 'ايس كوفي', 'iced coffee', 'ice coffee'], parent: { id: 176, name: 'مشروبات' } },
    { id: 185, name: 'فرابيه', keywords: ['فرابيه', 'فرابية', 'frappe'], parent: { id: 176, name: 'مشروبات' } },
];

/* ===== Export text normalization (auto-typo correction) =====
   Data-entry reps spell the same word many ways ("سندوش", "سندوتش", "ساندويتش",
   "ساندويش"). Unifying the spelling BEFORE both the category matcher and the
   Excel writer means (a) the matcher hits its keyword/alias list far more often
   and (b) the exported sheet reads professionally instead of echoing the typo.
   Rules are applied left-to-right; the original catalogue record is never
   mutated — only the row that goes into the sheet is corrected. */
const KANJO_TEXT_NORMALIZATION_RULES = [
    { re: /ساندوتشات|سندوتشات|ساندويتش|ساندويش|ساندوش|سندوش|سندوتش/g, to: 'ساندوتش' },
    { re: /فطاير/g, to: 'فطائر' },
    { re: /بسطرمه/g, to: 'بسطرمة' },
    { re: /شاورمه|شاورمة/g, to: 'شاورما' },
    { re: /بيتزه/g, to: 'بيتزا' },
    { re: /سلطه/g, to: 'سلطة' },
    { re: /كريمه/g, to: 'كريمة' },
    { re: /مكرونه/g, to: 'مكرونة' }
];

const kanjoNormalizeProductText = (value) => {
    let out = String(value == null ? '' : value);
    if (!out) return out;
    KANJO_TEXT_NORMALIZATION_RULES.forEach((rule) => { out = out.replace(rule.re, rule.to); });
    return out;
};

/* Shallow COPY with normalized name_ar + description_ar. Returns the original
   object untouched when there is nothing to correct, so routine exports do not
   allocate. */
const kanjoWithNormalizedText = (product) => {
    if (!product || typeof product !== 'object') return product;
    const nameAr = kanjoNormalizeProductText(product.name_ar);
    const descAr = kanjoNormalizeProductText(product.description_ar);
    if (nameAr === (product.name_ar || '') && descAr === (product.description_ar || '')) return product;
    return Object.assign({}, product, { name_ar: nameAr, description_ar: descAr });
};

/* Curated semantic synonym families (Egyptian menu wording) merged into each
   category's keyword list. These are the mandatory food-vertical mapping rules:
   they let the matcher classify common items whose name never literally repeats
   the category name (مكرونة -> باستا, فطيرة -> الفطائر, كفتة -> مشويات,
   جمبري -> أسماك, كنافة -> حلويات, عصير -> مشروبات, بانيه -> كرسبي, ...).
   Additive only: the original name keyword always stays, and the canonical
   position/specificity ordering still decides overlaps, so a "بيتزا سي فود"
   stays بيتزا (the leading noun) rather than flipping to أسماك. */
const KANJO_CATEGORY_SYNONYMS = {
    'باستا': ['مكرونة', 'اسباجيتي', 'مبكبكة', 'نجرسكو', 'فيتوتشيني', 'لازانيا', 'بشاميل'],
    'الفطائر': ['فطير', 'فطيرة', 'فطاير', 'مشلتت'],
    'فطائر': ['فطير', 'فطيرة', 'فطاير', 'مشلتت'],
    'مشويات': ['كفتة', 'كفته', 'كباب', 'شيش طاووق', 'طرب', 'ريش', 'نيفة', 'كبدة مشوية', 'فرخة مشوية'],
    'أسماك': ['جمبري', 'سبيط', 'سمك', 'فيليه', 'كابوريا', 'سي فود', 'حنشان', 'جندوفلي'],
    'حلويات': ['أم علي', 'ام علي', 'أرز بلبن', 'مهلبية', 'كاسترد', 'كنافة', 'بسبوسة', 'نوتيلا', 'تشيز كيك'],
    'مشروبات': ['عصير', 'صاروخ', 'سموزي', 'ميلك شيك', 'بيبسي', 'كانز', 'مياه', 'قهوة', 'شاي'],
    'كرسبي': ['بانيه', 'زنجر', 'كريسبي', 'كرسبي', 'ستربس', 'دجاج مقلي', 'بروست'],
    'طواجن': ['طاجن'],
    /* Alias list: every misspelling the reps actually type still routes to the
       ساندوتشات category (ID:4 restaurant / ID:54 other) even before the export
       normalizer rewrites the sheet text. */
    'ساندوتشات': ['رغيف', 'ساندوتش', 'سندوتش', 'ساندويتش', 'ساندويش', 'سندوش', 'سندوتشات']
};
KANJO_PRODUCT_CATEGORIES.forEach((cat) => {
    const extra = KANJO_CATEGORY_SYNONYMS[cat.name];
    if (!extra) return;
    extra.forEach((token) => {
        if (cat.keywords.indexOf(token) === -1) cat.keywords.push(token);
    });
});

const kanjoCategoryValue = (cat) => (cat ? ('ID:' + cat.id + ' | ' + cat.name) : '');

/* ===== Semantic auto-tagging (dataset-driven) =====
   The Ops Manager wants ADDITIVE tags on top of the keyword match, so a chicken
   dish can be exported as both "مشويات" and "فراخ". The trigger lists below were
   derived from the real catalogue. Arabic has no ASCII word characters, so a JS
   `\b` never fires next to Arabic letters — we use a Unicode-aware boundary
   (`\p{L}`/`\p{N}`) instead, which still prevents the dessert "شكلمة" from
   matching "لمة". Terms are normalized with normalizeArabic so hamza/taa-marbuta
   spelling variants unify. */
const KANJO_LAMMA_TERMS = ['صينية', 'صينيه', 'صنية', 'كيلو', 'عائلية', 'عائلي', 'لمة', 'اللمة', 'اللمه', 'صحاب', 'حبايب', 'دستة', 'دسته', 'توفير', 'وليمة'];
const KANJO_CHICKEN_TERMS = ['فراخ', 'دجاج', 'فرخة', 'فرخه', 'شيش', 'بانيه', 'تشيكن', 'زنجر', 'كرسبي', 'استربس', 'ستربس'];
const KANJO_LAMMA_CATEGORY_ID = 163;
const KANJO_CHICKEN_CATEGORY_ID = 164;

const kanjoSemanticTermRegex = (terms) => {
    const escaped = (terms || []).map((t) => normalizeArabic(t)).filter(Boolean)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .filter((t, i, arr) => arr.indexOf(t) === i);
    if (!escaped.length) return null;
    return new RegExp('(?:^|[^\\p{L}\\p{N}])(?:' + escaped.join('|') + ')(?![\\p{L}\\p{N}])', 'u');
};
const KANJO_LAMMA_RE = kanjoSemanticTermRegex(KANJO_LAMMA_TERMS);
const KANJO_CHICKEN_RE = kanjoSemanticTermRegex(KANJO_CHICKEN_TERMS);
const kanjoHasSemanticTerm = (haystack, re) => !!haystack && !!re && re.test(haystack);

/* Extended restaurant-only add-ons. Each rule maps a normalized trigger to the
   category ID(s) the Ops Manager wants tagged, e.g. any salad wording exports
   as سلطات + مقبلات + إضافات at once. IDs are applied in order and only when the
   vendor's rule explicitly allows them (see kanjoMatchProductCategory), so these
   never leak into a non-restaurant vertical. The regexes reuse the Unicode-aware
   boundary helper, so "محمرة" cannot fire inside an unrelated word. */
const KANJO_RESTAURANT_ADDON_RULES = [
    { ids: [149], terms: ['صوص', 'إضافة', 'اضافة', 'إضافه', 'اضافه', 'اكسترا'] },
    { ids: [16, 147, 149], terms: ['سلطة', 'سلطه'] },
    { ids: [165, 149], terms: ['بطاطس', 'باكيت', 'باكت', 'محمرة'] },
    { ids: [4], terms: ['ساندوتش'] }
].map((rule) => ({ ids: rule.ids, re: kanjoSemanticTermRegex(rule.terms) }));

/* Parse an already-official category cell (single value or comma-joined multi
   value). Returns the cell unchanged when EVERY part is a category this vendor
   is allowed to use, otherwise ''. */
const kanjoOfficialCategoryString = (value, allowedValues) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return '';
    return parts.every((p) => allowedValues.has(p)) ? parts.join(', ') : '';
};

/* Join a manual audit selection (array from the multi-select modal, or a legacy
   single string) into the semicolon-separated cell the Kanjo importer requires
   (commas are rejected, e.g. "ID:51 | حلويات; ID:174 | كيك"). */
const kanjoJoinCategorySelection = (selection, fallback) => {
    if (Array.isArray(selection)) {
        const values = selection.map((s) => String(s || '').trim()).filter(Boolean);
        if (values.length) return values.join('; ');
    } else if (typeof selection === 'string' && selection.trim()) {
        return selection.trim();
    }
    return fallback || KANJO_UNCATEGORIZED_LABEL;
};

/* Final-export normaliser: the target importer accepts MULTIPLE categories only
   when they are semicolon-delimited, so any internally comma-joined cell is
   re-joined with "; " right before it reaches the workbook. Single values pass
   through untouched. Pure in-memory string work — issues no reads. */
const kanjoFormatExportCategory = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts.join('; ') : '';
};

/* ===== Qema static-taxonomy enforcement (ZERO reads) =====
   window.QEMA_TAXONOMY is hardcoded in config/qemaTaxonomy.js. These helpers map
   a merchant's activity label to its Qema vendor type, filter assigned
   categories down to that vendor's legal set, and strictly translate variant
   options. Nothing here reads Firestore. */
const kanjoQemaTaxonomy = () => (typeof window !== 'undefined' && window.QEMA_TAXONOMY) || null;

/* SMART_ALIASES.categories bridge (ZERO reads): alternative/brand spellings
   ("ميرندا", "پيبسي", "رضعات"...) -> canonical dashboard category NAME
   ("صودا", "كوكتيل"...). Consumed in two places: the keyword matcher treats the
   alias keys as extra keywords for the canonical category, and
   kanjoQemaResolveCategory bridges a stored/manual cell whose name is an alias. */
const kanjoQemaCategoryAliases = (t) => (t && t.SMART_ALIASES && t.SMART_ALIASES.categories) || {};
const kanjoQemaCategoryAliasName = (rawName) => {
    const aliases = kanjoQemaCategoryAliases(kanjoQemaTaxonomy());
    const norm = normalizeArabic(rawName);
    if (!norm) return '';
    const key = Object.keys(aliases).find((k) => normalizeArabic(k) === norm);
    return key ? aliases[key] : '';
};
const kanjoQemaCategoryAliasKeywords = (canonicalName) => {
    const aliases = kanjoQemaCategoryAliases(kanjoQemaTaxonomy());
    const target = normalizeArabic(canonicalName);
    if (!target) return [];
    return Object.keys(aliases).filter((k) => normalizeArabic(aliases[k]) === target);
};

/* Vendor-scoped category namespace (ZERO reads). A category NAME is resolved
   ONLY inside DASHBOARD_CATEGORIES_TAXONOMY[<vendor_type>] (via the scoped index
   built by kanjoQemaCategoryIndex), so an identical name that exists under a
   DIFFERENT vendor type can never leak its ID into this vendor's export. The
   SMART_ALIASES.categories bridge is applied inside the same scope only. */
const kanjoQemaScopedValue = (index, name) => {
    if (!index) return '';
    const raw = kanjoCategoryNameFromValue(name);
    const norm = normalizeArabic(raw);
    if (!norm) return '';
    let entry = index.get(norm);
    if (!entry) {
        const bridged = kanjoQemaCategoryAliasName(raw);
        if (bridged) entry = index.get(normalizeArabic(bridged));
    }
    return entry ? entry.id : '';
};

const kanjoQemaParseNum = (token, label) => {
    const m = String(token || '').match(new RegExp(label + ':(\\d+)'));
    return m ? Number(m[1]) : 0;
};

/* Merchant activity label -> Qema vendor type (a DASHBOARD_CATEGORIES_TAXONOMY
   key). Exact alias, then normalized alias/key, then the longest vendor key
   contained in the label. '' means "not mappable". */
const kanjoQemaResolveVendorType = (vendorType) => {
    const t = kanjoQemaTaxonomy();
    if (!t) return '';
    const raw = String(vendorType || '').trim();
    if (!raw) return '';
    const dict = t.DASHBOARD_CATEGORIES_TAXONOMY || {};
    const mapping = t.VENDOR_TYPE_MAPPING || {};
    const aliases = t.APP_VENDOR_TYPE_ALIASES || {};
    if (aliases[raw]) return mapping[aliases[raw]] || '';
    const norm = normalizeArabic(raw);
    const normAlias = Object.keys(aliases).find((k) => normalizeArabic(k) === norm);
    if (normAlias) return mapping[aliases[normAlias]] || '';
    const normKey = Object.keys(mapping).find((k) => normalizeArabic(k) === norm);
    if (normKey) return mapping[normKey] || '';
    const keys = Object.keys(mapping).slice().sort((a, b) => b.length - a.length);
    const hit = keys.find((k) => norm.indexOf(normalizeArabic(k)) !== -1);
    if (hit) return mapping[hit] || '';
    if (dict[raw]) return raw;
    const normDict = Object.keys(dict).find((k) => normalizeArabic(k) === norm);
    return normDict || '';
};

/* { normalizedName -> { name, id } } for a vendor's legal categories, or null
   when the taxonomy/vendor type is unavailable (caller then falls back). */
const kanjoQemaCategoryIndex = (vendorType) => {
    const t = kanjoQemaTaxonomy();
    if (!t) return null;
    const mapped = kanjoQemaResolveVendorType(vendorType);
    const dict = (t.DASHBOARD_CATEGORIES_TAXONOMY || {})[mapped];
    if (!dict) return null;
    const index = new Map();
    Object.keys(dict).forEach((name) => {
        index.set(normalizeArabic(name), { name, id: String(dict[name] || '') });
    });
    return index;
};

/* Adapter objects for the audit modal's checkbox builder ({ name, id }). */
const kanjoQemaAllowedCategoryObjects = (vendorType) => {
    const index = kanjoQemaCategoryIndex(vendorType);
    if (!index) return null;
    return Array.from(index.values()).map((c) => ({ name: c.name, id: kanjoQemaParseNum(c.id, 'ID') }));
};

const kanjoCategoryNameFromValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const idx = raw.lastIndexOf('|');
    return (idx === -1 ? raw : raw.slice(idx + 1)).trim();
};

/* Filter an assigned category cell down to the vendor's legal Qema set and
   re-emit canonical `ID:n | Name` joined by '; '. `available:false` (vendor not
   mappable) tells the caller to keep the legacy cell; `available:true, cell:''`
   means every assigned category was illegal and the caller must pause. */
const kanjoQemaResolveCategory = (vendorType, assigned) => {
    const index = kanjoQemaCategoryIndex(vendorType);
    if (!index) return { available: false, cell: '', dropped: [] };
    const names = String(assigned || '').split(/[;,]/).map(kanjoCategoryNameFromValue).filter(Boolean);
    const out = [];
    const seen = new Set();
    const dropped = [];
    names.forEach((name) => {
        let entry = index.get(normalizeArabic(name));
        if (!entry) {
            const bridged = kanjoQemaCategoryAliasName(name);
            if (bridged) entry = index.get(normalizeArabic(bridged));
        }
        if (!entry) { dropped.push(name); return; }
        const key = normalizeArabic(entry.name);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(entry.id + ' | ' + entry.name);
    });
    return { available: true, cell: out.join('; '), dropped };
};

/* Prefer the operator's explicit selection, then the product's persisted manual
   category, then the matcher output. */
const kanjoQemaAssignedFor = (product, match, selection) => {
    if (Array.isArray(selection) && selection.length) {
        return selection.map((s) => String(s || '').trim()).filter(Boolean).join('; ');
    }
    if (typeof selection === 'string' && selection.trim()) return selection.trim();
    const stored = kanjoStoredCategoryValues(product);
    if (stored.length) return stored.join('; ');
    return match && match.status === 'matched' ? String(match.category || '') : '';
};

/* In-memory auto-translation ("Smart Match"). An option written entirely as a
   Latin abbreviation ("M"/"L"/"XL", "x-large") or as an attribute label
   ("size"/"مقاس") is swapped for its official Arabic value BEFORE strict
   validation. Per-token shorthands and fragments ("سوري" -> "عيش سوري") are
   resolved inside the greedy dictionary scan (kanjoQemaVariantAnalysis), where
   multi-word official options take precedence so the swap can never corrupt them.
   A value that resolves to a valid dictionary entry exports normally; only one
   that STILL fails to match triggers the unmapped-variant halt. ZERO reads. */
const kanjoQemaMergedAliasOptions = (t) => {
    const merged = {};
    const smart = (t && t.SMART_ALIASES && t.SMART_ALIASES.options) || {};
    Object.keys(smart).forEach((k) => { merged[String(k).trim().toLowerCase()] = smart[k]; });
    return merged;
};

const kanjoQemaOfficialOptions = (t) => {
    const tax = (t && t.DASHBOARD_VARIANTS_TAXONOMY) || {};
    const list = [];
    Object.keys(tax).forEach((group) => {
        const opts = (tax[group] && tax[group].options) || {};
        Object.keys(opts).forEach((name) => { list.push({ name, norm: normalizeArabic(name) }); });
    });
    return list;
};

const kanjoQemaApplyVariantAliases = (rawName) => {
    const t = kanjoQemaTaxonomy();
    const raw = String(rawName || '').trim();
    if (!t || !raw) return raw;
    const names = (t.SMART_ALIASES && t.SMART_ALIASES.names) || {};
    const options = kanjoQemaMergedAliasOptions(t);
    const whole = raw.toLowerCase();
    if (options[whole]) return options[whole];
    if (names[whole]) return names[whole];
    return raw;
};

/* Strict variant mapping. The whole option name is matched first (multi-word
   options such as "اكس لارج"/"صوص أحمر"/"عيش سوري"); otherwise a greedy
   longest-phrase scan assigns each recognised phrase to its attribute family and
   reports every leftover word as `unknown`. The export ABORTS on any unknown
   option (see kanjoHaltUnmappedVariants) rather than silently dropping it.
   Returns null when the taxonomy is absent so callers keep the legacy alias
   path. Assignment order follows QEMA_VARIANT_GROUP_PRIORITY and is capped at
   the template's four attribute families; any overflow is reported as unknown
   so it can never be dropped invisibly. */
const QEMA_VARIANT_PHRASE_MAX = 4;
const kanjoQemaVariantAnalysis = (rawName) => {
    const t = kanjoQemaTaxonomy();
    if (!t) return null;
    const tax = t.DASHBOARD_VARIANTS_TAXONOMY || {};
    const priority = (t.QEMA_VARIANT_GROUP_PRIORITY || []).slice();
    const ordered = priority.concat(Object.keys(tax).filter((g) => priority.indexOf(g) === -1));
    /* Attribute LABELS ("الحجم"/"size"/"مقاس") annotate a variant, they are not
       option values. They are ignored once at least one real option is
       recognised; a variant carrying only a label keeps it as unmapped so it can
       never be dropped silently. */
    const labelSet = new Set();
    Object.keys(tax).forEach((g) => labelSet.add(normalizeArabic(g)));
    const aliasNames = (t.SMART_ALIASES && t.SMART_ALIASES.names) || {};
    Object.keys(aliasNames).forEach((k) => labelSet.add(normalizeArabic(k)));
    Object.values(aliasNames).forEach((v) => labelSet.add(normalizeArabic(v)));
    const aliasOptions = kanjoQemaMergedAliasOptions(t);
    const official = kanjoQemaOfficialOptions(t);
    const officialSet = new Set(official.map((o) => o.norm));
    const findOption = (phrase) => {
        const target = normalizeArabic(phrase);
        if (!target) return null;
        for (let i = 0; i < ordered.length; i++) {
            const group = tax[ordered[i]];
            if (!group) continue;
            const opts = group.options || {};
            const hit = Object.keys(opts).find((o) => normalizeArabic(o) === target);
            if (hit) return {
                groupName: ordered[i],
                groupId: kanjoQemaParseNum(group.id, 'ID'),
                valueId: kanjoQemaParseNum(opts[hit], 'ATTR'),
                label: hit
            };
        }
        return null;
    };
    /* Exact shorthand ("m" -> "وسط") then unique dictionary fragment
       ("سوري" -> "عيش سوري") for a single word that no phrase matched. */
    const aliasKey = (token) => String(token || '').trim().toLowerCase();
    const findAliasOption = (token) => {
        const mapped = aliasOptions[aliasKey(token)];
        return mapped ? findOption(mapped) : null;
    };
    const findFragmentOption = (token) => {
        const norm = normalizeArabic(token);
        if (!norm || officialSet.has(norm)) return null;
        if (norm.length >= 3) {
            const supers = official.filter((o) => o.norm.indexOf(norm) !== -1);
            if (new Set(supers.map((o) => o.norm)).size === 1) return findOption(supers[0].name);
        }
        const subs = official.filter((o) => o.norm !== norm && norm.indexOf(o.norm) !== -1);
        if (new Set(subs.map((o) => o.norm)).size === 1) return findOption(subs[0].name);
        return null;
    };
    const translated = kanjoQemaApplyVariantAliases(rawName);
    const trimmed = String(translated || '').trim();
    if (!trimmed) return { assignments: [], unknown: [] };
    const whole = findOption(trimmed);
    if (whole) return { assignments: [whole], unknown: [] };
    /* Split on whitespace/punctuation only; Unicode letters/digits survive, so
       "صغير - حار" scans as two options instead of three tokens. */
    const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const byGroup = new Map();
    const unknown = [];
    let i = 0;
    while (i < words.length) {
        let matched = null;
        const max = Math.min(QEMA_VARIANT_PHRASE_MAX, words.length - i);
        for (let len = max; len >= 1; len--) {
            const hit = findOption(words.slice(i, i + len).join(' '));
            if (hit) { matched = { hit, len }; break; }
        }
        if (matched) {
            if (!byGroup.has(matched.hit.groupName)) byGroup.set(matched.hit.groupName, matched.hit);
            i += matched.len;
        } else {
            const fallback = findAliasOption(words[i]) || findFragmentOption(words[i]);
            if (fallback) {
                if (!byGroup.has(fallback.groupName)) byGroup.set(fallback.groupName, fallback);
            } else if (unknown.indexOf(words[i]) === -1) {
                unknown.push(words[i]);
            }
            i += 1;
        }
    }
    const sorted = Array.from(byGroup.values())
        .sort((a, b) => ordered.indexOf(a.groupName) - ordered.indexOf(b.groupName));
    const assignments = sorted.slice(0, 4);
    sorted.slice(4).forEach((a) => { if (unknown.indexOf(a.label) === -1) unknown.push(a.label); });
    /* Drop pure label tokens only when a real option was resolved. */
    const filteredUnknown = assignments.length
        ? unknown.filter((w) => !labelSet.has(normalizeArabic(w)))
        : unknown;
    return { assignments, unknown: filteredUnknown };
};

const kanjoQemaVariantAssignments = (rawName) => {
    const analysis = kanjoQemaVariantAnalysis(rawName);
    return analysis === null ? null : analysis.assignments;
};

const kanjoQemaVariantCells = (rawName) => {
    const analysis = kanjoQemaVariantAnalysis(rawName);
    if (analysis === null) return null;
    const cells = {};
    analysis.assignments.forEach((a, i) => {
        const slot = i + 1;
        cells['attribute_' + slot + '_name'] = 'ID:' + a.groupId + ' | ' + a.groupName;
        cells['attribute_' + slot + '_value'] = 'ID:' + a.valueId + ' | ATTR:' + a.groupId + ' | ' + a.label;
    });
    return { assignments: analysis.assignments, cells, unknown: analysis.unknown };
};

/* Every variant option across the evaluated products that the static dictionary
   cannot fully map, tagged with the products that carry it. An empty array means
   the export may proceed. ZERO reads — pure array work. */
const kanjoQemaUnmappedVariants = (evaluations) => {
    if (!kanjoQemaTaxonomy()) return [];
    const found = new Map();
    (evaluations || []).forEach(({ product }) => {
        const variations = Array.isArray(product && product.variations)
            ? product.variations.filter((v) => v && String(v.name || '').trim())
            : [];
        const productName = String((product && (product.name_ar || product.name_en || product.id)) || '').trim();
        variations.forEach((v) => {
            const analysis = kanjoQemaVariantAnalysis(v.name);
            if (!analysis || !analysis.unknown.length) return;
            analysis.unknown.forEach((token) => {
                if (!found.has(token)) found.set(token, new Set());
                found.get(token).add(productName);
            });
        });
    });
    return Array.from(found.entries()).map(([option, products]) => ({
        option,
        products: Array.from(products).filter(Boolean)
    }));
};

const kanjoUnmappedVariantsMessage = (unmapped) => {
    const list = (unmapped || []).map((item) => item.option).join('، ');
    return 'فشل التصدير: المتغيرات التالية غير مسجلة في قاموس لوحة التحكم. يرجى تحديث القاموس أولاً: ' + list;
};

/* HALT: never silently drop an unmapped option — abort the whole export and tell
   the operator exactly which options must be added to the dictionary. */
const kanjoHaltUnmappedVariants = (unmapped) => {
    const message = kanjoUnmappedVariantsMessage(unmapped);
    console.error('[catalog] Export halted — unmapped variants:', unmapped);
    if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
        const rows = (unmapped || []).map((item) => {
            const names = item.products.slice(0, 3).join('، ');
            const more = item.products.length > 3 ? '…' : '';
            const products = names ? ' <span style="font-weight:600;color:#64748b">(' + catalogEscapeHtml(names + more) + ')</span>' : '';
            return '<li style="margin:3px 0"><span style="font-weight:900;color:#230535">' + catalogEscapeHtml(item.option) + '</span>' + products + '</li>';
        }).join('');
        window.Swal.fire({
            icon: 'error',
            title: 'فشل التصدير',
            html: '<div style="text-align:right;direction:rtl;font-size:13px;line-height:1.7">'
                + 'المتغيرات التالية غير مسجلة في قاموس لوحة التحكم. يرجى تحديث القاموس أولاً:'
                + '<ul style="text-align:right;margin-top:8px;padding-inline-start:18px">' + rows + '</ul></div>',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#230535'
        });
        return message;
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    return message;
};

/* ===== In-memory fuzzy suggestion engine (ZERO reads/writes) =====
   A tiny Levenshtein-based similarity used ONLY to PROPOSE candidates to the
   operator. It never overrides an exact match and never edits the dictionary or
   Firestore; a fuzzy guess becomes real only after the admin confirms it. */
const kanjoFuzzyLevenshtein = (a, b) => {
    const s = String(a == null ? '' : a);
    const t = String(b == null ? '' : b);
    const n = s.length;
    const m = t.length;
    if (!n) return m;
    if (!m) return n;
    let prev = new Array(m + 1);
    let curr = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
        curr[0] = i;
        const si = s.charCodeAt(i - 1);
        for (let j = 1; j <= m; j++) {
            const cost = si === t.charCodeAt(j - 1) ? 0 : 1;
            const del = prev[j] + 1;
            const ins = curr[j - 1] + 1;
            const sub = prev[j - 1] + cost;
            curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
        }
        const swap = prev; prev = curr; curr = swap;
    }
    return prev[m];
};

/* Normalized similarity in [0,1]; 1 = identical after Arabic normalization. */
const kanjoFuzzySimilarity = (a, b) => {
    const na = normalizeArabic(a);
    const nb = normalizeArabic(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const dist = kanjoFuzzyLevenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length) || 1;
    return 1 - (dist / maxLen);
};

/* "High confidence" = a single-character typo on a >=3 char token, or a
   >=0.8 similarity within two edits. Short tokens stay exact-only so the engine
   never \"corrects\" a legitimate 2-letter option into another one. */
const kanjoFuzzyHighConfidence = (a, b) => {
    const na = normalizeArabic(a);
    const nb = normalizeArabic(b);
    if (!na || !nb || na === nb) return false;
    if (Math.min(na.length, nb.length) < 3) return false;
    const dist = kanjoFuzzyLevenshtein(na, nb);
    if (dist === 1) return true;
    return dist <= 2 && kanjoFuzzySimilarity(na, nb) >= 0.8;
};

/* Best confident candidate for `query` among [{name|label, token}] (or plain
   strings). Returns { name, token, score, distance } or null when nothing is
   confidently close, or when the top two candidates tie (ambiguous -> we never
   guess). */
const kanjoFuzzyBest = (query, candidates, opts) => {
    const o = opts || {};
    const minScore = (typeof o.minScore === 'number') ? o.minScore : 0.8;
    const q = normalizeArabic(query);
    if (!q) return null;
    const seenNorm = new Set();
    const list = (candidates || []).map((c) => (
        (c && typeof c === 'object')
            ? { name: String(c.name || c.label || ''), token: c.token, ref: c }
            : { name: String(c == null ? '' : c), token: c, ref: c }
    )).filter((c) => {
        const n = normalizeArabic(c.name);
        if (!n || n === q || seenNorm.has(n)) return false;
        seenNorm.add(n);
        return true;
    });
    let best = null;
    let second = null;
    list.forEach((c) => {
        const row = {
            name: c.name,
            token: c.token,
            score: kanjoFuzzySimilarity(query, c.name),
            distance: kanjoFuzzyLevenshtein(q, normalizeArabic(c.name)),
            ref: c.ref
        };
        if (!best || row.score > best.score) { second = best; best = row; }
        else if (!second || row.score > second.score) { second = row; }
    });
    if (!best) return null;
    if (!kanjoFuzzyHighConfidence(query, best.name) && best.score < minScore) return null;
    if (second && (best.score - second.score) < 0.0001) return null;
    return best;
};

window.kanjoFuzzyLevenshtein = kanjoFuzzyLevenshtein;
window.kanjoFuzzySimilarity = kanjoFuzzySimilarity;
window.kanjoFuzzyBest = kanjoFuzzyBest;

/* ===== Fuzzy variant typo interruption (human-in-the-loop) =====
   Runs ONLY on tokens the exact dictionary left unmapped. Each token is scored
   against the official variant options; a confident near-match is offered to the
   operator as an Accept / Ignore confirmation. Accepting injects the canonical
   option into the in-memory variation names for THIS run (no Firestore, no
   dictionary edits); ignoring leaves the token unmapped so the existing HALT
   still protects it. */
const kanjoFuzzyMatchVariants = (unmapped) => {
    const t = kanjoQemaTaxonomy();
    const suggestions = [];
    const unresolved = [];
    const options = t ? kanjoQemaOfficialOptions(t).map((o) => ({ name: o.name, token: o.name })) : [];
    (unmapped || []).forEach((item) => {
        const best = options.length ? kanjoFuzzyBest(item.option, options, { minScore: 0.8 }) : null;
        if (best) suggestions.push({ option: item.option, products: item.products || [], suggestion: best.name });
        else unresolved.push(item);
    });
    return { suggestions, unresolved };
};

const kanjoResolveFuzzyVariantIssues = async (unmapped) => {
    const normalized = (unmapped || []).filter((i) => i && String(i.option || '').trim());
    const { suggestions, unresolved } = kanjoFuzzyMatchVariants(normalized);
    const injections = new Map();
    if (!suggestions.length) return { injections, remaining: unresolved };
    const Swal = (typeof window !== 'undefined') ? window.Swal : null;
    if (!Swal || typeof Swal.fire !== 'function') return { injections, remaining: normalized };
    for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        const names = (s.products || []).slice(0, 3).join('، ');
        const more = s.products.length > 3 ? '…' : '';
        const who = names
            ? '<div style="margin-top:6px;font-size:12px;color:#64748b;font-weight:600">(' + catalogEscapeHtml(names + more) + ')</div>'
            : '';
        const res = await Swal.fire({
            icon: 'warning',
            title: 'تم العثور على خطأ إملائي',
            html: '<div style="text-align:right;direction:rtl;font-size:14px;line-height:1.9">'
                + 'تم العثور على خطأ إملائي: <b style="color:#230535">' + catalogEscapeHtml(s.option) + '</b>.<br>'
                + 'هل تقصد <b style="color:#166534">' + catalogEscapeHtml(s.suggestion) + '</b>؟'
                + who
                + '<div style="margin-top:8px;font-size:12px;color:#94a3b8">سيُطبَّق التصحيح على هذا التصدير فقط دون تعديل القاموس.</div></div>',
            confirmButtonText: 'نعم، استخدم التصحيح',
            confirmButtonColor: '#230535',
            showCancelButton: true,
            cancelButtonText: 'تجاهل',
            focusConfirm: true
        });
        if (res && res.isConfirmed) injections.set(normalizeArabic(s.option), s.suggestion);
        else unresolved.push({ option: s.option, products: s.products });
    }
    return { injections, remaining: unresolved };
};

/* Rebuild the in-memory evaluations with confirmed typos replaced by their
   canonical option name (word-level, Arabic-normalized). Copies only — the
   source product documents are never mutated. */
const kanjoInjectVariantFixes = (evaluations, injections) => {
    if (!injections || !injections.size) return evaluations;
    return (evaluations || []).map((ev) => {
        const product = ev && ev.product;
        const variations = Array.isArray(product && product.variations) ? product.variations : null;
        if (!variations || !variations.length) return ev;
        let changed = false;
        const next = variations.map((v) => {
            const raw = String((v && v.name) || '');
            if (!raw) return v;
            let touched = false;
            const rebuilt = raw.split(/([^\p{L}\p{N}]+)/u).map((w) => {
                const key = normalizeArabic(w);
                if (key && injections.has(key)) { touched = true; return injections.get(key); }
                return w;
            }).join('');
            if (!touched) return v;
            changed = true;
            return Object.assign({}, v, { name: rebuilt });
        });
        if (!changed) return ev;
        return Object.assign({}, ev, { product: Object.assign({}, product, { variations: next }) });
    });
};

/* One-shot helper used by the export gates: offer fuzzy fixes, inject the
   confirmed ones, then return the still-unmapped set (empty = safe to proceed).
   `onInject(updatedEvaluations)` lets the caller keep its own reference in sync. */
const kanjoSettleUnmappedVariants = async (evaluations, onInject) => {
    let current = evaluations;
    let unmapped = kanjoQemaUnmappedVariants(current);
    if (!unmapped.length) return { evaluations: current, remaining: [] };
    const outcome = await kanjoResolveFuzzyVariantIssues(unmapped);
    if (outcome.injections.size) {
        current = kanjoInjectVariantFixes(current, outcome.injections);
        if (typeof onInject === 'function') onInject(current);
    }
    return { evaluations: current, remaining: kanjoQemaUnmappedVariants(current) };
};

/* ===== Vendor-scoped strict mapping enforcement (ZERO reads) =====
   For EVERY product whose vendor_type resolves to a DASHBOARD_CATEGORIES_TAXONOMY
   entry, each assigned category NAME must exist INSIDE that vendor's scope (the
   SMART_ALIASES.categories bridge is allowed, but only within the same scope). A
   name that belongs to another vendor, or to no vendor, is collected here so the
   export HALTS with a precise error instead of emitting a colliding/blank
   category. Vendors absent from the dashboard taxonomy keep the legacy
   passthrough. When `opts.includeUnassigned` is set (non-interactive exports
   where nothing can be audited) a product with no category at all is also
   reported, so nothing is silently dropped. */
const kanjoStrictMappingIssues = (evaluations, vendorTypeOf, assignedFor, opts) => {
    if (typeof vendorTypeOf !== 'function') return [];
    const includeUnassigned = !!(opts && opts.includeUnassigned);
    const issues = [];
    (evaluations || []).forEach(({ product, match }) => {
        const vendor = vendorTypeOf(product);
        const index = kanjoQemaCategoryIndex(vendor);
        if (!index) return;
        const assigned = (typeof assignedFor === 'function')
            ? assignedFor(product, match)
            : kanjoQemaAssignedFor(product, match, null);
        const label = String((product && (product.name_ar || product.name_en || product.id)) || '').trim();
        const id = String((product && product.id) || '');
        const vendorName = kanjoQemaResolveVendorType(vendor) || vendor;
        if (!assigned) {
            if (includeUnassigned) issues.push({ id, vendor: vendorName, vendorType: vendor, category: KANJO_UNCATEGORIZED_LABEL, product: label });
            return;
        }
        String(assigned).split(/[;,]/).map(kanjoCategoryNameFromValue).filter(Boolean).forEach((name) => {
            if (kanjoQemaScopedValue(index, name)) return;
            issues.push({ id, vendor: vendorName, vendorType: vendor, category: name, product: label });
        });
    });
    return issues;
};

const kanjoStrictMappingMessage = (issues) => {
    const list = (issues || []).map((i) => i.category)
        .filter((v, idx, arr) => v && arr.indexOf(v) === idx)
        .join('، ');
    return 'فشل التصدير: التصنيفات التالية غير مدرجة في نطاق نوع التاجر '
        + '(DASHBOARD_CATEGORIES_TAXONOMY) أو خارج نطاقه. يرجى تصحيح التصنيف أولاً: ' + list;
};

/* HALT: never silently drop a category that the active vendor scope cannot
   resolve to an in-scope ID. */
const kanjoHaltStrictMapping = (issues, options) => {
    const o = options || {};
    const message = o.message || kanjoStrictMappingMessage(issues);
    const intro = o.intro || 'التصنيفات التالية غير مدرجة في جدول المطابقة الصارم (STRICT_TAXONOMY_MAP). يرجى تحديث الجدول أولاً:';
    console.error('[catalog] Export halted — strict-mapping misses:', issues);
    if (typeof window !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') {
        const rows = (issues || []).map((item) => {
            const product = item.product ? ' <span style="font-weight:600;color:#64748b">(' + catalogEscapeHtml(item.product) + ')</span>' : '';
            return '<li style="margin:3px 0"><span style="font-weight:900;color:#230535">'
                + catalogEscapeHtml(item.category) + '</span>'
                + ' <span style="color:#64748b">[' + catalogEscapeHtml(item.vendor) + ']</span>' + product + '</li>';
        }).join('');
        window.Swal.fire({
            icon: 'error',
            title: 'فشل التصدير',
            html: '<div style="text-align:right;direction:rtl;font-size:13px;line-height:1.7">'
                + catalogEscapeHtml(intro)
                + '<ul style="text-align:right;margin-top:8px;padding-inline-start:18px">' + rows + '</ul></div>',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#230535'
        });
        return message;
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    return message;
};

/* ===== Global taxonomy exports (ZERO reads) =====
   Mirror the Qema dashboard "التصنيفات الحالية" / "المتغيرات الحالية" CSV files
   column-for-column straight from the in-memory dictionaries. Fields the static
   taxonomy does not carry (slugs, English names, scope, path, counts) are
   emitted empty rather than guessed; sort_order preserves dictionary order and
   active defaults to 1. The exports never read Firestore. */
const QEMA_CATEGORY_EXPORT_COLUMNS = [
    'id', 'parent_id', 'slug', 'name_ar', 'name_en', 'scope', 'vendor_type',
    'vendor', 'depth', 'path', 'sort_order', 'active', 'products_count'
];
const QEMA_VARIANT_EXPORT_COLUMNS = [
    'variant_id', 'variant_slug', 'variant_name_ar', 'variant_name_en',
    'variant_sort_order', 'variant_active', 'variant_required', 'option_id',
    'option_name_ar', 'option_name_en', 'option_value', 'option_sort_order',
    'option_active'
];

const kanjoTaxonomyCategoryRows = () => {
    const t = kanjoQemaTaxonomy();
    const dict = (t && t.DASHBOARD_CATEGORIES_TAXONOMY) || {};
    const rows = [];
    Object.keys(dict).forEach((vendorType) => {
        const cats = dict[vendorType] || {};
        let sort = 0;
        Object.keys(cats).forEach((name) => {
            sort += 1;
            rows.push({
                id: kanjoQemaParseNum(cats[name], 'ID'),
                parent_id: '', slug: '', name_ar: name, name_en: '', scope: '',
                vendor_type: vendorType, vendor: '', depth: '',
                path: '', sort_order: sort, active: 1, products_count: ''
            });
        });
    });
    return rows;
};

const kanjoTaxonomyVariantRows = () => {
    const t = kanjoQemaTaxonomy();
    const tax = (t && t.DASHBOARD_VARIANTS_TAXONOMY) || {};
    const rows = [];
    let variantSort = 0;
    Object.keys(tax).forEach((groupName) => {
        const group = tax[groupName] || {};
        variantSort += 1;
        const opts = group.options || {};
        let optionSort = 0;
        Object.keys(opts).forEach((optionName) => {
            optionSort += 1;
            rows.push({
                variant_id: kanjoQemaParseNum(group.id, 'ID'),
                variant_slug: '', variant_name_ar: groupName, variant_name_en: '',
                variant_sort_order: variantSort, variant_active: 1, variant_required: 0,
                option_id: kanjoQemaParseNum(opts[optionName], 'ATTR'),
                option_name_ar: optionName, option_name_en: '', option_value: '',
                option_sort_order: optionSort, option_active: 1
            });
        });
    });
    return rows;
};

/* Comma-delimited CSV (the reference files) with the same UTF-8 BOM/escaping
   used elsewhere, kept separate from the locale ';' helper on purpose. */
const formatQemaCsvRow = (values) => values.map((v) => {
    const s = String(v === undefined || v === null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
    return /[",]/.test(s) ? '"' + s + '"' : s;
}).join(',');

const downloadQemaTaxonomyCsv = (headers, rows, fileName) => {
    const body = [formatQemaCsvRow(headers)]
        .concat(rows.map((row) => formatQemaCsvRow(headers.map((col) => row[col]))))
        .join('\r\n');
    const blob = new Blob(['\uFEFF', body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const kanjoTaxonomyExportFileName = (kind) => 'qema-' + kind + '-' + new Date().toISOString().slice(0, 10) + '.csv';

window.exportQemaTaxonomyCategories = () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير التصنيفات متاح للإدارة فقط', false);
        return;
    }
    const rows = kanjoTaxonomyCategoryRows();
    if (!rows.length) {
        if (window.showToast) window.showToast('لا توجد تصنيفات للتصدير', false);
        return;
    }
    downloadQemaTaxonomyCsv(QEMA_CATEGORY_EXPORT_COLUMNS, rows, kanjoTaxonomyExportFileName('categories'));
    if (window.showToast) window.showToast('تم تصدير جميع التصنيفات (' + rows.length + ' تصنيف)');
};

window.exportQemaTaxonomyVariants = () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير المتغيرات متاح للإدارة فقط', false);
        return;
    }
    const rows = kanjoTaxonomyVariantRows();
    if (!rows.length) {
        if (window.showToast) window.showToast('لا توجد متغيرات للتصدير', false);
        return;
    }
    downloadQemaTaxonomyCsv(QEMA_VARIANT_EXPORT_COLUMNS, rows, kanjoTaxonomyExportFileName('variants'));
    if (window.showToast) window.showToast('تم تصدير جميع المتغيرات (' + rows.length + ' خيار)');
};

/* Silent fallback for products the keyword matcher cannot classify: the export
   must never block on a manual category prompt, so unmatched rows are exported
   as "غير مصنف" (Uncategorized) instead. */
const KANJO_UNCATEGORIZED_LABEL = 'غير مصنف';

/* ===== Manual-categorization learning (ZERO Firestore reads) =====
   When the admin resolves an uncategorized product in the pre-export audit we
   (a) persist the chosen categories onto the product document itself and
   (b) append the name→category rule to a centralized taxonomy document via
   arrayUnion. The in-session matcher consults the product's persisted categories
   and a local name→categories index (mirrored to localStorage for the next
   session), so a decision is never asked twice — without issuing any read. */
const KANJO_CATEGORY_LEARNING_COLLECTION = 'category_learning';
const KANJO_CATEGORY_LEARNING_DOC = 'kanjo_product_categories';
const KANJO_CATEGORY_LEARNED_FIELD = 'kanjo_categories';
const KANJO_CATEGORY_LEARNED_IDS_FIELD = 'kanjo_category_ids';
const KANJO_CATEGORY_LEARNING_STORAGE_KEY = 'kanjo_category_learning_v1';
const KANJO_CATEGORY_BATCH_LIMIT = 450; // Firestore hard limit is 500 ops/batch

const kanjoLearnedCategoryRules = new Map(); // normalized name -> [category value, ...]

const kanjoLearnedRuleKeyFor = (product) => {
    if (!product) return '';
    const name = String(product.name_ar || product.name_en || '').trim();
    return name ? normalizeArabic(name) : '';
};

const kanjoLoadLearnedCategoryRules = () => {
    try {
        const raw = window.localStorage ? window.localStorage.getItem(KANJO_CATEGORY_LEARNING_STORAGE_KEY) : null;
        if (!raw) return;
        const parsed = JSON.parse(raw);
        Object.keys(parsed || {}).forEach((key) => {
            const values = parsed[key];
            if (Array.isArray(values) && values.length) kanjoLearnedCategoryRules.set(key, values.slice());
        });
    } catch (_) { /* a corrupt cache must never break the export */ }
};

const kanjoSaveLearnedCategoryRules = () => {
    try {
        const out = {};
        kanjoLearnedCategoryRules.forEach((values, key) => { out[key] = values; });
        if (window.localStorage) window.localStorage.setItem(KANJO_CATEGORY_LEARNING_STORAGE_KEY, JSON.stringify(out));
    } catch (_) { /* storage may be unavailable (private mode) */ }
};

kanjoLoadLearnedCategoryRules();

/* Categories already persisted on a product (array or comma string). */
const kanjoStoredCategoryValues = (product) => {
    const raw = product && product[KANJO_CATEGORY_LEARNED_FIELD];
    if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) return raw.split(',').map((v) => v.trim()).filter(Boolean);
    return [];
};

/* Parse "ID:37 | حلويات" -> 37 (0 when unrecognised). */
const kanjoCategoryIdFromValue = (value) => {
    const m = String(value || '').match(/^ID:(\d+)/);
    return m ? Number(m[1]) : 0;
};

/* Patch an id in every in-memory catalog slice AND the KPI caches (no reads). */
const kanjoPatchProductCaches = (productId, patch) => {
    const arrays = [window.allCatalogProductsCache, window.merchantProductsCache, window.doneCatalogProductsCache, window.repCatalogProductsCache];
    let touched = 0;
    arrays.forEach((arr) => {
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] && String(arr[i].id) === String(productId)) {
                arr[i] = Object.assign({}, arr[i], patch);
                touched += 1;
            }
        }
    });
    if (typeof window.kpiApplyLocalProductChange === 'function') window.kpiApplyLocalProductChange(productId, patch);
    return touched;
};

const KANJO_PRODUCTS_SHEET_COLUMNS = ['product_key', 'product_type', 'sku', 'name_en', 'name_ar', 'description_en', 'description_ar', 'base_price', 'main_image_url', 'category', 'status'];
const KANJO_VARIANTS_SHEET_COLUMNS = ['product_key', 'variant_sku', 'attribute_1_name', 'attribute_1_value', 'attribute_2_name', 'attribute_2_value', 'attribute_3_name', 'attribute_3_value', 'attribute_4_name', 'attribute_4_value', 'branch', 'price', 'stock', 'thumbnail_url', 'status'];

/* Normalized substring hit. Both the keyword and the product name pass through
   normalizeArabic first, so minor spelling differences (hamza/alef forms, taa
   marbuta vs haa, alef maqsura vs yaa, tashkeel/tatweel) never break the match.
   SHORT tokens (normalized length < 4) are matched on a word boundary instead of
   as a bare substring, so a two/three-letter generic token can never fire inside
   an unrelated word and steal the classification. */
/* Whole-word occurrence test (spaces only — normalizeArabic collapses runs and
   trims, so a keyword bounded by start/end or a single space is an exact word).
   Used to give a real word-boundary hit priority over a mere substring hit when
   two candidates would otherwise tie. */
const kanjoCategoryBoundaryHit = (kw, haystack) => {
    if (!kw) return false;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|\\s)' + escaped + '(?:\\s|$)').test(haystack);
};

const kanjoCategoryKeywordHit = (keyword, haystack) => {
    const kw = normalizeArabic(keyword);
    if (!kw) return false;
    if (kw.length < 4) {
        return kanjoCategoryBoundaryHit(kw, haystack);
    }
    return haystack.indexOf(kw) !== -1;
};

/* Match info for one category: the character position of its earliest matching
   keyword (the primary noun usually appears first), a `defining` flag that is
   true when a matched keyword IS the category name or a leading part of it (e.g.
   "مشويات" defines the Grills category, "لحمه" leads "لحوم"), a `boundary` flag
   for exact-word hits, the matched keyword length (`specificity`), and the
   category NAME length (`nameLen`). The matcher orders by these so a word-boundary
   hit beats a substring hit, and the longer (more specific) category name wins at
   equal positions — exactly the requested "boundaries + longer names first". */
const kanjoCategoryMatchInfo = (cat, haystack, extraKeywords) => {
    const nameNorm = normalizeArabic(cat.name);
    let best = -1;
    let defining = false;
    let boundary = false;
    let specificity = 0;
    const terms = (extraKeywords && extraKeywords.length) ? cat.keywords.concat(extraKeywords) : cat.keywords;
    terms.forEach((keyword) => {
        if (!kanjoCategoryKeywordHit(keyword, haystack)) return;
        const kw = normalizeArabic(keyword);
        if (!kw) return;
        if (nameNorm === kw || nameNorm.indexOf(kw) === 0) defining = true;
        if (kanjoCategoryBoundaryHit(kw, haystack)) boundary = true;
        specificity = Math.max(specificity, kw.length);
        const pos = haystack.indexOf(kw);
        if (pos === -1) return;
        if (best === -1 || pos < best) best = pos;
    });
    if (best === -1) return null;
    return { pos: best, defining, boundary, specificity, nameLen: nameNorm.length };
};

/* Categories ordered most-specific first (longest normalized name first) for
   matching. The canonical KANJO_PRODUCT_CATEGORIES order/id is preserved for the
   exported value and the audit dropdown; only the matcher walks this view. */
const KANJO_CATEGORIES_BY_SPECIFICITY = KANJO_PRODUCT_CATEGORIES
    .map((cat, canonical) => ({ cat, canonical }))
    .sort((a, b) => (normalizeArabic(b.cat.name).length - normalizeArabic(a.cat.name).length) || (a.canonical - b.canonical));

/* ── Vendor-scoped category allow-list ──────────────────────────────────────
   The vendor's activity label is stored on every catalog product as `category`
   (e.g. "🍔 مطاعم وكافيهات"). It decides which of the Kanjo product categories
   are even candidates, so a restaurant can never be auto-classified into a
   butcher/roastery bucket such as "فراخ", "لحوم" or "محمص".

   Rules are tried in order; the FIRST whose token appears in the (normalized)
   activity label wins. A vendor type with no rule is UNMAPPED and keeps the full
   category list — the export never hard-blocks on an unknown vertical, and the
   interactive audit modal still forces a valid choice for any ambiguous row. */
const KANJO_VENDOR_CATEGORY_RULES = [
    {
        match: ['مطاعم', 'مطعم', 'كافيه', 'كافيهات', 'ريستوران', 'restaurant', 'cafe'],
        /* Marks the restaurant vertical so the additive semantic tagging (which is
           restaurant-only by spec) can be gated explicitly instead of relying on
           the allow-list alone. */
        restaurant: true,
        allow: ['إضافات', 'برجر', 'بيتي', 'طواجن', 'عروض', 'فطائر', 'كرسبي', 'كشري', 'مشروبات', 'مقبلات', 'مشويات', 'أسماك', 'حواوشي', 'مصري', 'بيتزا', 'شاورما', 'ساندوتشات', 'باستا', 'كريب', 'سلطات', 'حلويات', 'اللمة', 'فراخ', 'بطاطس'],
        /* Names that repeat across verticals MUST resolve to the restaurant ID
           only: desserts = 37 (NOT 82 butcher offal / 51 / 47), seafood = 10
           (NOT 87 fish shop), drinks = 17 (NOT 34 juice bar), sandwiches = 4,
           chicken = 164 (NOT 83 poultry). */
        /* 2026: "كريب"/"طواجن" now ALSO exist in the dessert tree (166/171) and the
           audit dropdown reads this allow-list directly, so pin the restaurant IDs
           to keep the dessert duplicates out of a restaurant's options. */
        pins: { 'حلويات': [37], 'أسماك': [10], 'مشروبات': [17], 'ساندوتشات': [4], 'فراخ': [164], 'كريب': [13], 'طواجن': [150] }
    },
    {
        match: ['جزارة', 'جزار', 'لحوم', 'butcher'],
        allow: ['لحوم', 'قطعيات', 'فيليه', 'مجمدات', 'مجهزة', 'مصنعات', 'مخبوزات', 'حلويات'],
        /* Butcher "حلويات" is meat offal/sweetbreads, ID:82 — never a dessert. */
        pins: { 'حلويات': [82] }
    },
    {
        match: ['دواجن', 'فراخ', 'poultry'],
        allow: ['فراخ', 'طيور', 'الطيور', 'قطعيات', 'فيليه', 'مجمدات', 'مجهزة'],
        /* Poultry "فراخ" is ID:83 — never the restaurant vertical 164. */
        pins: { 'فراخ': [83] }
    },
    {
        match: ['أسماك', 'اسماك', 'سمك', 'سي فود', 'fish', 'seafood'],
        allow: ['أسماك', 'سي فود', 'فيليه', 'مجمدات', 'مجهزة', 'طازج'],
        /* Fish shop seafood = 87 (NOT restaurant seafood = 10). */
        pins: { 'أسماك': [87] }
    },
    {
        match: ['خضار', 'فاكهة', 'خضروات', 'vegetable', 'fruit'],
        allow: ['الخضار', 'خضرة', 'للطبخ', 'الفاكهة', 'الموسمية', 'مستوردة', 'عضوي', 'مجهزة', 'طازج', 'البقوليات']
    },
    {
        match: ['مخبوزات', 'مخبز', 'خبز', 'bakery', 'معجنات'],
        allow: ['الخبز', 'المعجنات', 'الفطائر', 'حلويات', 'كيك', 'بسكوت', 'مخبوزات', 'وافل'],
        /* Bakery feteer = 50 "الفطائر" (NOT restaurant = 161). Bakery/general
           sweets are 51/47 — never the restaurant 37 or butcher 82. "كيك"/"وافل"
           also exist in the dessert tree (174/172), pinned out here. */
        pins: { 'الفطائر': [50], 'حلويات': [51, 47], 'كيك': [156, 52], 'وافل': [157] }
    },
    {
        match: ['عصائر', 'عصير', 'juice'],
        allow: ['مشروبات', 'سموزي', 'كوكتيل', 'فريش', 'باردة', 'ميلك شيك', 'صودا'],
        /* Juice bar drinks = 34 (NOT restaurant drinks = 17). "ميلك شيك"/"صودا"
           now live under the قهوة وعصاير taxonomy (186/187); the matcher emits
           the heuristic IDs and kanjoQemaResolveCategory remaps them by NAME. */
        pins: { 'مشروبات': [34] }
    },
    {
        match: ['عطارة', 'توابل', 'بهارات', 'محمص', 'roastery', 'spices'],
        allow: ['البهارات', 'الأعشاب', 'البقوليات', 'العسل', 'مجفف', 'الخلطات', 'قهوة', 'القهوة', 'محمص', 'مكسرات', 'التسالي', 'السناكس', 'تمور']
    },
    {
        match: ['مسليات', 'مكسرات', 'تسالي', 'snacks', 'nuts'],
        allow: ['مكسرات', 'التسالي', 'السناكس', 'محمص', 'تسالي', 'بسكوت']
    },
    {
        /* "حلويات" now carries the ENTIRE merged dictionary. Ops Manager
           decision (2026): scrap the separate "الحلو" vendor type and fold its
           Desserts & Cafés tree into the existing حلويات type instead, so no
           merchant has to be migrated.

           Legacy confectionery fallbacks stay intact (51/47 حلويات, 156 كيك,
           66 بوكسات, بسكوت …) while names shared with the dessert tree pin to
           BOTH id sets:
             كيك  -> 156, 52, 174
             وافل -> 157, 172
           Names unique to the dessert tree stay dessert-only (كريب 166,
           طواجن 171, سموذي 180, ميلك شيك 181). The matcher is ID-scoped, so a
           restaurant/bakery/butcher vendor never sees these IDs. */
        match: ['حلويات', 'حلواني', 'sweets', 'dessert'],
        allow: ['حلويات', 'كيك', 'بسكوت', 'وافل', 'بوكسات', 'كريب', 'مولتن', 'فريسكا', 'سينابون', 'زلابيا', 'طواجن', 'بان كيك', 'أم علي', 'ماتشا', 'بوبا', 'زبادو', 'سموذي', 'ميلك شيك', 'صودا', 'عصير', 'آيس كوفي', 'فرابيه'],
        pins: { 'حلويات': [51, 47], 'كيك': [156, 52, 174], 'وافل': [157, 172], 'كريب': [166], 'طواجن': [171], 'سموذي': [180], 'ميلك شيك': [181] }
    },
    {
        match: ['لبنة', 'ألبان', 'البان', 'dairy'],
        allow: ['مجهزة', 'مجمدات', 'للطبخ', 'عضوي', 'طازج', 'بقالة']
    },
    {
        match: ['صيدليات', 'صيدلية', 'pharmacy'],
        allow: ['الأدوية', 'مسكنات', 'فيتامينات', 'المناعة', 'صحي', 'العناية', 'سبلايز', 'مزمنة', 'المشترك', 'الأم']
    },
    {
        match: ['كوزماتكس', 'عناية شخصية', 'تجميل', 'cosmetic', 'beauty'],
        allow: ['ماكياج', 'البشرة', 'الشعر', 'الجسم', 'الأظافر', 'الشفاه', 'رموش', 'العطور', 'العناية', 'الشخصية', 'المرأة', 'مستلزمات']
    },
    {
        match: ['موبايل', 'إكسسوارات موبايل', 'mobile'],
        allow: ['موبايلات', 'جرابات', 'شواحن', 'باوربانك', 'سماعات', 'سمارت', 'التصوير', 'اكسسوارات', 'البطاريات', 'الأجهزة', 'مستلزمات', 'جيمنج']
    },
    {
        match: ['كهرباء', 'كهربائية', 'الكترونيات', 'electronics', 'electric'],
        allow: ['الإضاءة', 'البطاريات', 'الأجهزة', 'كشافات', 'الأدوات', 'مستلزمات', 'جيمنج', 'سمارت']
    },
    {
        match: ['منظفات', 'أدوات نظافة', 'نظافة', 'cleaning', 'detergent'],
        allow: ['منظفات', 'ورقيات', 'معطرات', 'الأسطح', 'الحمام', 'المطبخ', 'الحشرات', 'الأدوات', 'مستلزمات', 'ثلاجة']
    },
    {
        match: ['مستلزمات المطبخ', 'أطقم صيني', 'طقم صيني', 'kitchen'],
        allow: ['المطبخ', 'الأدوات', 'الأجهزة', 'مستلزمات', 'ثلاجة']
    },
    {
        match: ['لعب أطفال', 'كنترول', 'ألعاب', 'toys'],
        allow: ['الأطفال', 'أطفال', 'بوكسات', 'اكسسوارات', 'مستلزمات', 'مدرسية', 'الرسم']
    },
    {
        match: ['حيوانات', 'أليفة', 'pets'],
        allow: ['كلاب', 'قطط', 'الطيور', 'طيور', 'أعلاف', 'العناية', 'مستلزمات', 'المزارع']
    },
    {
        match: ['مكتبات', 'مكتبة', 'قرطاسية', 'stationery', 'books'],
        allow: ['مكتبية', 'مدرسية', 'الرسم', 'مستلزمات']
    },
    {
        match: ['هدايا', 'ورود', 'gifts', 'flowers'],
        allow: ['المناسبات', 'العشرات', 'بوكسات', 'اكسسوارات', 'العطور']
    },
    {
        match: ['مفروشات', 'أثاث', 'furniture'],
        allow: ['منزلية', 'مستلزمات', 'المنزلية']
    },
    {
        match: ['رياضية', 'رياضة', 'sports'],
        allow: ['الملابس', 'رجالية', 'نسائية', 'المناسبات', 'اكسسوارات', 'مستلزمات']
    },
    {
        match: ['سباكة', 'plumbing'],
        allow: ['الأدوات', 'مستلزمات', 'الأجهزة']
    },
    {
        match: ['صيانة', 'فني', 'خدمات', 'maintenance', 'services'],
        allow: ['الأدوات', 'الأجهزة', 'مستلزمات', 'الإضاءة', 'كشافات', 'البطاريات']
    }
];

/* Resolve the rule that owns this vendor's activity label. */
const kanjoVendorRuleFor = (vendorType) => {
    const hay = normalizeArabic(vendorType);
    if (!hay) return null;
    return KANJO_VENDOR_CATEGORY_RULES.find((rule) => rule.match
        .some((token) => hay.indexOf(normalizeArabic(token)) !== -1)) || null;
};

/* The candidate categories for a vendor type. Unknown/unmapped vendors keep the
   complete list (non-blocking); a mapped vendor is strictly narrowed to its
   allowed names. When a name repeats across verticals (e.g. "حلويات" exists for
   restaurant, butcher, bakery and confectionery), `rule.pins[name]` forces the
   domain-correct ID(s) so a vendor can never select another vertical's category.
   An empty intersection also falls back to the full list so a typo in a rule can
   never produce an empty dropdown. */
const kanjoVendorAllowedCategories = (vendorType) => {
    const rule = kanjoVendorRuleFor(vendorType);
    if (!rule) return KANJO_PRODUCT_CATEGORIES;
    const allowed = new Set(rule.allow.map((name) => normalizeArabic(name)));
    const pins = {};
    Object.keys(rule.pins || {}).forEach((name) => { pins[normalizeArabic(name)] = rule.pins[name]; });
    const list = KANJO_PRODUCT_CATEGORIES.filter((cat) => {
        const name = normalizeArabic(cat.name);
        if (!allowed.has(name)) return false;
        const pinned = pins[name];
        return pinned ? pinned.indexOf(cat.id) !== -1 : true;
    });
    return list.length ? list : KANJO_PRODUCT_CATEGORIES;
};

/* Multi-category matcher, scoped to a vendor type. Every allowed category whose
   keyword (or synonym) appears in the product name OR description is collected,
   ranked (earliest keyword, owning word, boundary hit, longer name/keyword,
   canonical ID), de-duplicated by category NAME, and the additive semantic tags
   (اللمة / فراخ) are appended. Scanning descriptions too lets abstract names
   (e.g. "سبايدر مان") auto-tag from the descriptive text instead of forcing the
   manual modal. The name is concatenated BEFORE the description so a name hit
   always ranks ahead of a description-only hit at equal specificity. The result
   is the comma-separated cell the Kanjo importer expects, e.g.
   "ID:9 | مشويات, ID:164 | فراخ". Only products with neither a keyword nor a
   semantic hit are `unmapped`. Returns:
   - { status: 'matched',  category, categories, primary, options }
   - { status: 'unmapped', category: '', categories: [], options: [] } */
const kanjoMatchProductCategory = (product, vendorType) => {
    const vendor = String(vendorType != null && vendorType !== ''
        ? vendorType
        : ((product && (product.category || product.vendor_type || product.vendorType)) || '')).trim();
    const rule = kanjoVendorRuleFor(vendor);
    let allowedCats = kanjoVendorAllowedCategories(vendor);
    /* STRICT vendor scope (ZERO reads): the candidate set is EXACTLY the keys of
       DASHBOARD_CATEGORIES_TAXONOMY[<vendor_type>]. Each key is resolved back to
       its keyword-bearing category object so inference still works; a name that
       only exists under another vendor is never proposed. */
    const scopedIndex = kanjoQemaCategoryIndex(vendor);
    if (scopedIndex) {
        const byName = new Map();
        KANJO_PRODUCT_CATEGORIES.forEach((cat) => {
            const key = normalizeArabic(cat.name);
            if (!byName.has(key)) byName.set(key, cat);
        });
        allowedCats = Array.from(scopedIndex.values())
            .map((c) => byName.get(normalizeArabic(c.name)))
            .filter(Boolean);
    }
    /* Scope by ID, NOT by name: a name like "حلويات" exists in several verticals,
       so a name set would leak every duplicate back into this vendor's matcher. */
    const allowedIds = new Set(allowedCats.map((cat) => cat.id));
    const allowedValues = new Set(allowedCats.map((cat) => kanjoCategoryValue(cat)));
    /* Manual decisions always win. A product the admin already categorized
       (persisted on the doc) or a same-named product learned this session is
       returned BEFORE any keyword rule, so a fixed row is never re-asked and the
       export reuses the exact same decision. */
    const storedOfficial = kanjoOfficialCategoryString(kanjoStoredCategoryValues(product).join(', '), allowedValues);
    if (storedOfficial) {
        const storedValues = storedOfficial.split(', ').filter(Boolean);
        return { status: 'matched', category: storedOfficial, categories: storedValues, primary: storedValues[0] || '', options: [] };
    }
    const learnedKey = kanjoLearnedRuleKeyFor(product);
    const learnedValues = learnedKey ? kanjoLearnedCategoryRules.get(learnedKey) : null;
    const learnedOfficial = learnedValues ? kanjoOfficialCategoryString(learnedValues.join(', '), allowedValues) : '';
    if (learnedOfficial) {
        const learnedList = learnedOfficial.split(', ').filter(Boolean);
        return { status: 'matched', category: learnedOfficial, categories: learnedList, primary: learnedList[0] || '', options: [] };
    }
    const existing = String((product && product.category) || '').trim();
    const existingOfficial = kanjoOfficialCategoryString(existing, allowedValues);
    /* Heuristic haystack = name + description (name first so it outranks a
       description-only hit). Descriptions let abstract-named products
       (e.g. "سبايدر مان") auto-tag without opening the manual modal. Zero reads
       — both fields already live on the in-memory product doc. */
    const haystack = normalizeArabic([
        product && product.name_ar,
        product && product.name_en,
        product && product.description_ar,
        product && product.description_en
    ].filter(Boolean).join(' '))
        .replace(/\s+/g, ' ')
        .trim();
    const ranked = [];
    if (haystack) {
        const matches = [];
        KANJO_CATEGORIES_BY_SPECIFICITY.forEach(({ cat, canonical }) => {
            if (!allowedIds.has(cat.id)) return;
            const info = kanjoCategoryMatchInfo(cat, haystack, kanjoQemaCategoryAliasKeywords(cat.name));
            if (info) matches.push({
                cat,
                canonical,
                pos: info.pos,
                defining: info.defining ? 1 : 0,
                boundary: info.boundary ? 1 : 0,
                specificity: info.specificity,
                nameLen: info.nameLen
            });
        });
        if (matches.length) {
            /* Spec exclusion: a generic "ساندوتش/رغيف" wrapper must not swallow a
               real برجر / شاورما / حواوشي filling — drop the wrapper when a
               stronger filling category is present, regardless of position. */
            const SANDWICH_OVERRIDES = ['برجر', 'شاورما', 'حواوشي'];
            const hasFilling = matches.some((m) => SANDWICH_OVERRIDES.indexOf(m.cat.name) !== -1);
            const pool = (hasFilling ? matches.filter((m) => m.cat.name !== 'ساندوتشات') : matches);
            const sorted = (pool.length ? pool : matches).slice().sort((a, b) => (a.pos - b.pos)
                || (b.defining - a.defining)
                || (b.boundary - a.boundary)
                || (b.nameLen - a.nameLen)
                || (b.specificity - a.specificity)
                || (a.canonical - b.canonical));
            sorted.forEach((m) => ranked.push(m.cat));
        }
    }
    /* Additive semantic tags — RESTAURANT ONLY (spec: never push these IDs for a
       non-restaurant vendor_type). The vendor's rule must be the restaurant
       vertical AND explicitly allow the target ID. Appended after the keyword
       matches so keyword hits always stay primary: اللمة, فراخ, then the
       sauces/salads/fries/sandwich add-ons. */
    if (haystack && rule && rule.restaurant) {
        const pushSemanticId = (id) => {
            if (!allowedIds.has(id)) return;
            const cat = allowedCats.find((c) => c.id === id);
            if (cat) ranked.push(cat);
        };
        if (kanjoHasSemanticTerm(haystack, KANJO_LAMMA_RE)) pushSemanticId(KANJO_LAMMA_CATEGORY_ID);
        if (kanjoHasSemanticTerm(haystack, KANJO_CHICKEN_RE)) pushSemanticId(KANJO_CHICKEN_CATEGORY_ID);
        KANJO_RESTAURANT_ADDON_RULES.forEach((addon) => {
            if (kanjoHasSemanticTerm(haystack, addon.re)) addon.ids.forEach(pushSemanticId);
        });
    }
    /* De-dup by category name so a repeated name (e.g. "حلويات" across IDs) is
       exported once, mirroring the single option shown in the audit modal. */
    const seenNames = new Set();
    const orderedCats = [];
    ranked.forEach((cat) => {
        const name = normalizeArabic(cat.name);
        if (seenNames.has(name)) return;
        seenNames.add(name);
        orderedCats.push(cat);
    });
    if (orderedCats.length) {
        const values = orderedCats.map((cat) => kanjoCategoryValue(cat));
        return {
            status: 'matched',
            category: values.join(', '),
            categories: values,
            primary: values[0],
            options: orderedCats
        };
    }
    if (existingOfficial) {
        const values = existingOfficial.split(', ').filter(Boolean);
        return { status: 'matched', category: existingOfficial, categories: values, primary: values[0] || '', options: [] };
    }
    /* Last-resort "وجبة" rule: a generic meal with no other signal maps to the
       Egyptian set (مصري). It fires only after every specific family failed, so
       "وجبة بانيه" still resolves to كرسبي, "وجبة شيش طاووق" to مشويات, etc. */
    const meal = allowedCats.find((cat) => normalizeArabic(cat.name) === normalizeArabic('مصري'));
    if (haystack && haystack.indexOf(normalizeArabic('وجبة')) !== -1 && meal) {
        const value = kanjoCategoryValue(meal);
        return { status: 'matched', category: value, categories: [value], primary: value, options: [] };
    }
    return { status: 'unmapped', category: '', categories: [], primary: '', options: [] };
};

/* ===== Kanjo strict variant translation middleware =====
   Legacy catalog rows still store pre-schema variant strings (e.g.
   `ID:2 | المقاس`) while the bulk importer only accepts Kanjo's NEW strict
   attribute pairs (`ID:X | ATTR:X | Label`). This middleware intercepts every
   exported variant and remaps both the attribute NAME and the VALUE onto the
   new IDs. Rules are ordered most-specific-first ("كبير جدا" before "كبير") and
   the value's attribute family drives the name, so name/value can never drift
   out of sync. */
const KANJO_VARIANT_NAME_BY_ATTR = {
    1: 'ID:1 | الحجم',
    2: 'ID:2 | الطعم',
    3: 'ID:3 | نوع العيش',
    4: 'ID:4 | الصوص',
    5: 'ID:5 | تحويجة القهوة',
    6: 'ID:6 | الوزن',
    7: 'ID:7 | حجم العبوة',
    8: 'ID:8 | العدد',
    9: 'ID:9 | نوع العجينة'
};

/* Safe default per family, exposed for the variant conflict modal options. */
const KANJO_VARIANT_DEFAULT_VALUE_BY_ATTR = {
    1: 'ID:2 | ATTR:1 | وسط',
    2: 'ID:7 | ATTR:2 | عادي',
    3: 'ID:10 | ATTR:3 | عيش فينو',
    4: 'ID:11 | ATTR:4 | صوص أحمر'
};

const KANJO_VARIANT_FALLBACK = { name: KANJO_VARIANT_NAME_BY_ATTR[1], value: KANJO_VARIANT_DEFAULT_VALUE_BY_ATTR[1] };

/* Legacy variant VALUE -> new strict `ID:n | ATTR:n | label`, exposed as the flat
   option list for the (unused) variant conflict modal. */
const KANJO_VARIANT_VALUE_RULES = [
    { attr: 1, tokens: ['كبير جدا', 'جامبو'], value: 'ID:4 | ATTR:1 | جامبو' },
    { attr: 1, tokens: ['لارج', 'كبير'], value: 'ID:3 | ATTR:1 | كبير' },
    { attr: 1, tokens: ['صغير'], value: 'ID:1 | ATTR:1 | صغير' },
    { attr: 1, tokens: ['وسط'], value: 'ID:2 | ATTR:1 | وسط' },
    { attr: 1, tokens: ['صاروخ'], value: 'ID:5 | ATTR:1 | صاروخ' },
    { attr: 1, tokens: ['شرقي'], value: 'ID:6 | ATTR:1 | شرقي' },
    { attr: 2, tokens: ['عادي'], value: 'ID:7 | ATTR:2 | عادي' },
    { attr: 2, tokens: ['حار'], value: 'ID:8 | ATTR:2 | حار' },
    { attr: 3, tokens: ['سوري', 'خبز سوري'], value: 'ID:9 | ATTR:3 | عيش سوري' },
    { attr: 3, tokens: ['فينو', 'عيش فينو'], value: 'ID:10 | ATTR:3 | عيش فينو' },
    { attr: 4, tokens: ['أحمر'], value: 'ID:11 | ATTR:4 | صوص أحمر' },
    { attr: 4, tokens: ['أبيض'], value: 'ID:12 | ATTR:4 | صوص أبيض' }
];

/* EXACT Kanjo alias dictionary (Dashboard Template v2). Each entry maps a raw
   variant word/phrase to a REAL template value of the form
   `ID:<valueId> | ATTR:<groupId> | <label>`. Values are collected in array
   order (de-duplicated) and packed into the four sheet attribute slots. */
const KANJO_ALIAS_MAPPINGS = [
  // 1. SIZE & MAGNITUDE (ATTR:1)
  { regex: /\b(S|صغير|سنجاب)\b/i, value: 'ID:1 | ATTR:1 | صغير' },
  { regex: /\b(M|وسط|ميديم)\b/i, value: 'ID:2 | ATTR:1 | وسط' },
  { regex: /\b(L|كبير|لارج)\b/i, value: 'ID:3 | ATTR:1 | كبير' },
  { regex: /\b(XL|اكس لارج)\b/i, value: 'ID:51 | ATTR:1 | اكس لارج' },
  { regex: /\b(جامبو)\b/i, value: 'ID:4 | ATTR:1 | جامبو' },
  { regex: /\b(صاروخ)\b/i, value: 'ID:5 | ATTR:1 | صاروخ' },
  { regex: /\b(دبل لارج|دابل لارج)\b/i, value: 'ID:56 | ATTR:1 | دبل لارج' },
  { regex: /\b(سنجل)\b/i, value: 'ID:48 | ATTR:1 | سنجل' },
  { regex: /\b(دبل|دابل)\b/i, value: 'ID:50 | ATTR:1 | دبل' },
  { regex: /\b(عائلي|عائلية)\b/i, value: 'ID:49 | ATTR:1 | عائلي' },

  // 2. BREAD TYPES (ATTR:3)
  { regex: /\b(سوري)\b/i, value: 'ID:9 | ATTR:3 | عيش سوري' },
  { regex: /\b(فينو)\b/i, value: 'ID:10 | ATTR:3 | عيش فينو' },
  { regex: /\b(بلدي|بلدى)\b/i, value: 'ID:44 | ATTR:3 | بلدي' },
  { regex: /\b(فرنساوي|فرنسي)\b/i, value: 'ID:45 | ATTR:3 | فرنساوي' },
  { regex: /\b(كيزر)\b/i, value: 'ID:46 | ATTR:3 | كيزر' },
  { regex: /\b(عيش سادة|خبز سادة)\b/i, value: 'ID:47 | ATTR:3 | سادة' },

  // 3. COFFEE BLENDS (ATTR:5)
  { regex: /\b(سادة|ساده)\b/i, value: 'ID:13 | ATTR:5 | سادة' },
  { regex: /\b(محوج)\b/i, value: 'ID:14 | ATTR:5 | محوج' },
  { regex: /\b(فاتح)\b/i, value: 'ID:15 | ATTR:5 | فاتح' },
  { regex: /\b(غامق)\b/i, value: 'ID:16 | ATTR:5 | غامق' },
  { regex: /\b(بن مشكل|مشكل)\b/i, value: 'ID:17 | ATTR:5 | مشكل' },
  { regex: /\b(تركي)\b/i, value: 'ID:18 | ATTR:5 | تركي' },
  { regex: /\b(كويتي)\b/i, value: 'ID:19 | ATTR:5 | كويتي' },
  { regex: /\b(العميد)\b/i, value: 'ID:20 | ATTR:5 | العميد' },
  { regex: /\b(ديل)\b/i, value: 'ID:21 | ATTR:5 | ديل' },
  { regex: /\b(بندق)\b/i, value: 'ID:22 | ATTR:5 | بندق' },

  // 4. WEIGHT (ATTR:6)
  { regex: /\b(جرام)\b/i, value: 'ID:23 | ATTR:6 | جرام' },
  { regex: /\b(ثمن)\b/i, value: 'ID:24 | ATTR:6 | ثمن كيلو' },
  { regex: /\b(ربع)\b/i, value: 'ID:25 | ATTR:6 | ربع كيلو' },
  { regex: /\b(نص)\b/i, value: 'ID:26 | ATTR:6 | نص كيلو' },
  { regex: /\b(750 جرام|750)\b/i, value: 'ID:27 | ATTR:6 | 750 جرام' },
  { regex: /\b(1 كيلو|كيلو)\b/i, value: 'ID:28 | ATTR:6 | كيلو' },

  // 5. VOLUME (ATTR:7)
  { regex: /\b(30 ملل|30ملل|30ml|30 ml)\b/i, value: 'ID:31 | ATTR:7 | 30 ملل' },
  { regex: /\b(50 ملل|50ملل|50ml|50 ml)\b/i, value: 'ID:33 | ATTR:7 | 50 ملل' },
  { regex: /\b(100 ملل|100ملل|100ml|100 ml)\b/i, value: 'ID:38 | ATTR:7 | 100 ملل' },

  // 6. QUANTITY (ATTR:8)
  { regex: /\b(قطعتين|2 قطعة|2 قطعه)\b/i, value: 'ID:39 | ATTR:8 | قطعتين' },
  { regex: /\b(3 قطع|3قطع)\b/i, value: 'ID:40 | ATTR:8 | 3 قطع' },
  { regex: /\b(5 قطع|5قطع)\b/i, value: 'ID:42 | ATTR:8 | 5 قطع' },
  { regex: /\b(بوكس 6|6 قطع|6قطع)\b/i, value: 'ID:43 | ATTR:8 | بوكس 6 قطع' },

  // 7. CRUST TYPE (ATTR:9)
  { regex: /\b(شرقي|شرقى)\b/i, value: 'ID:52 | ATTR:9 | شرقي' },
  { regex: /\b(إيطالي|ايطالي)\b/i, value: 'ID:53 | ATTR:9 | إيطالي' },
  { regex: /\b(عجينة عادية|عجينه عاديه)\b/i, value: 'ID:54 | ATTR:9 | عادي' },
  { regex: /\b(ملفوف|رول)\b/i, value: 'ID:55 | ATTR:9 | ملفوف' }
];

/* Fold the same characters normalizeArabic folds so a pattern written with
   ة/ى/أ still matches the normalised haystack. */
const KANJO_ALIAS_CHAR_FOLD = { 'ة': 'ه', 'ى': 'ي', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ئ': 'ي', 'ؤ': 'و' };

/* `\b` does not work next to Arabic letters, so swap the leading/trailing word
   boundaries for Unicode-aware ones and normalise the pattern's Arabic chars. */
const kanjoAliasRegex = (mapping) => {
    if (mapping._compiled) return mapping._compiled;
    let source = String((mapping.regex && mapping.regex.source) || '');
    source = source.replace(/^\\b/, '(?<![\\p{L}\\p{N}])').replace(/\\b$/, '(?![\\p{L}\\p{N}])');
    source = source.replace(/[ةىأإآٱئؤ]/g, (ch) => KANJO_ALIAS_CHAR_FOLD[ch] || ch);
    mapping._compiled = new RegExp(source, 'iu');
    return mapping._compiled;
};
const kanjoAliasRegexGlobal = (mapping) => {
    if (mapping._compiledGlobal) return mapping._compiledGlobal;
    mapping._compiledGlobal = new RegExp(kanjoAliasRegex(mapping).source, 'giu');
    return mapping._compiledGlobal;
};

/* Taste/Sauce are not part of the alias dictionary but are real ATTR:2 / ATTR:4
   template values; kept so legacy variants do not lose them. Written as bounded
   patterns so "عادي" never fires inside "عجينة عادية". */
const KANJO_VARIANT_TASTE_SAUCE_MAPPINGS = [
    { regex: /\b(عادي)\b/i, value: 'ID:7 | ATTR:2 | عادي' },
    { regex: /\b(حار)\b/i, value: 'ID:8 | ATTR:2 | حار' },
    { regex: /\b(أحمر)\b/i, value: 'ID:11 | ATTR:4 | صوص أحمر' },
    { regex: /\b(أبيض)\b/i, value: 'ID:12 | ATTR:4 | صوص أبيض' }
];
/* Full matcher set: the exact alias dictionary first, then the supplementals. */
const KANJO_VARIANT_MAPPINGS = KANJO_ALIAS_MAPPINGS.concat(KANJO_VARIANT_TASTE_SAUCE_MAPPINGS);
const KANJO_VARIANT_ALIAS_FALLBACK_VALUE = 'ID:1 | ATTR:1 | صغير';

/* Words inside a product's variants that NO alias/supplemental rule recognises.
   They are appended to the parent product's name_ar so nothing is lost (the
   raw variant name when the variant matches nothing at all). */
const kanjoVariantUnrecognizedWords = (product) => {
    const variations = Array.isArray(product && product.variations)
        ? product.variations.filter((v) => v && String(v.name || '').trim())
        : [];
    const out = [];
    const seen = new Set();
    variations.forEach((v) => {
        const raw = String(v.name || '').trim();
        if (!raw) return;
        const rawWords = raw.split(/\s+/).filter(Boolean);
        const normWords = rawWords.map((w) => normalizeArabic(w));
        const normText = normWords.join(' ');
        if (!normText) return;
        const covered = new Array(normText.length).fill(false);
        const cover = (from, len) => {
            for (let k = from; k < from + len; k++) covered[k] = true;
        };
        KANJO_VARIANT_MAPPINGS.forEach((mapping) => {
            const re = kanjoAliasRegexGlobal(mapping);
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(normText)) !== null) {
                cover(m.index, m[0].length);
                if (m[0].length === 0) re.lastIndex++;
            }
        });
        let cursor = 0;
        normWords.forEach((w, i) => {
            const start = cursor;
            cursor = start + w.length + 1;
            if (!w.length) return;
            let isCovered = false;
            for (let k = start; k < start + w.length; k++) if (covered[k]) { isCovered = true; break; }
            if (isCovered) return;
            const key = normalizeArabic(rawWords[i]);
            if (!key || seen.has(key)) return;
            seen.add(key);
            out.push(rawWords[i]);
        });
    });
    return out;
};

/* Translate a legacy variant name into up to four Kanjo attribute assignments.
   Every value in KANJO_VARIANT_MAPPINGS whose pattern matches the normalised
   variant name is collected, and only the LONGEST non-overlapping matches are
   kept (so "دبل لارج" is never also read as "دبل" + "لارج"). Survivors are
   ordered by dictionary order and packed into attribute_1..4 (first four). A
   value's own `ATTR:n` marker decides its attribute NAME, so the group always
   matches the value. When nothing matches, the size defaults to a real ID
   (صغير) and the raw variant name is preserved by kanjoVariantUnrecognizedWords
   — never turned into an invalid synthetic ID. */
const mapVariantToKanjo = (rawName, rawValue) => {
    const haystack = normalizeArabic([rawValue, rawName].filter(Boolean).join(' '));
    const candidates = [];
    KANJO_VARIANT_MAPPINGS.forEach((mapping, order) => {
        const re = kanjoAliasRegexGlobal(mapping);
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(haystack)) !== null) {
            if (m[0].length) candidates.push({ value: mapping.value, order, start: m.index, end: m.index + m[0].length });
            if (m[0].length === 0) re.lastIndex++;
        }
    });
    candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.order - b.order);
    const claimed = [];
    const accepted = new Map();
    candidates.forEach((c) => {
        if (claimed.some(([s, e]) => c.start < e && c.end > s)) return;
        claimed.push([c.start, c.end]);
        if (!accepted.has(c.value)) accepted.set(c.value, c.order);
    });
    const values = [...accepted.entries()].sort((a, b) => a[1] - b[1]).map(([value]) => value);
    if (!values.length) {
        return [{ attr: 1, name: KANJO_VARIANT_NAME_BY_ATTR[1], value: KANJO_VARIANT_ALIAS_FALLBACK_VALUE }];
    }
    return values.slice(0, 4).map((value, index) => {
        const attrMatch = /ATTR:(\d+)/.exec(value);
        const group = attrMatch ? Number(attrMatch[1]) : (index + 1);
        return {
            attr: index + 1,
            name: KANJO_VARIANT_NAME_BY_ATTR[group] || KANJO_VARIANT_FALLBACK.name,
            value
        };
    });
};
/* Exposed for the Data-Entry menu importer so a raw size cell (e.g. "وسط") is
   translated to its standard Dashboard Template value (ID:2 | ATTR:1 | وسط)
   at import time, using the exact same alias dictionary the export uses. */
window.kanjoMapVariantToKanjo = mapVariantToKanjo;

/* Sentinel + flat option list used by the variant conflict modal so the admin
   can pick any valid Kanjo attribute (or delete an invalid variant). */
const KANJO_VARIANT_DELETE = '__KANJO_DELETE_VARIANT__';
const KANJO_VARIANT_ATTRIBUTE_OPTIONS = (() => {
    const list = [];
    const seen = new Set();
    KANJO_VARIANT_VALUE_RULES.forEach((rule) => {
        if (seen.has(rule.value)) return;
        seen.add(rule.value);
        list.push({ name: KANJO_VARIANT_NAME_BY_ATTR[rule.attr], value: rule.value });
    });
    if (!seen.has(KANJO_VARIANT_FALLBACK.value)) {
        list.push({ name: KANJO_VARIANT_FALLBACK.name, value: KANJO_VARIANT_FALLBACK.value });
    }
    return list;
})();

const kanjoBuildProductRow = (p, category) => {
    const row = mapCatalogProductToExportRow(p);
    row.category = category || '';
    /* Kanjo bulk importer expects "variant" (not "variable") for multi-option
       products; simple products stay "simple". */
    if (String(row.product_type || '').toLowerCase() === 'variable') row.product_type = 'variant';
    /* Variant products must not carry a base_price — only simple products do. */
    if (row.product_type === 'variant') row.base_price = '';
    /* Graceful fallback: the Kanjo dashboard requires name_en/description_en.
       When auto-translation never populated one (network/rate-limit failure on
       an old product), inject the Arabic source so the exported template never
       fails target mandatory-field validation. In-memory only. */
    if (!String(row.name_en || '').trim()) row.name_en = row.name_ar || '';
    if (!String(row.description_en || '').trim()) row.description_en = row.description_ar || '';
    return row;
};

const kanjoBuildVariantRow = (p, v, index) => {
    const taxonomy = kanjoQemaVariantCells(v && v.name);
    let cells;
    if (taxonomy) {
        /* Strict taxonomy: an option not present in the template is dropped
           (the importer rejects unknown attribute/value pairs). */
        if (!taxonomy.assignments.length) return null;
        cells = taxonomy.cells;
    } else {
        cells = {};
        mapVariantToKanjo(v && v.name, v && v.name).forEach((a) => {
            cells['attribute_' + a.attr + '_name'] = a.name;
            cells['attribute_' + a.attr + '_value'] = a.value;
        });
    }
    const row = {
        product_key: (p && p.id) || '',
        variant_sku: String((p && (p.sku || p.id)) || '') + '-V' + (index + 1),
        /* Kanjo expects the full attribute/branch column set even when unused. */
        attribute_1_name: '',
        attribute_1_value: '',
        attribute_2_name: '',
        attribute_2_value: '',
        attribute_3_name: '',
        attribute_3_value: '',
        attribute_4_name: '',
        attribute_4_value: '',
        branch: '',
        price: Number(v && v.price) || 0,
        stock: Number(v && v.stock) || 0,
        thumbnail_url: catalogDirectImageUrl((v && v.image_url) || '') || '',
        status: 'active'
    };
    /* Each assignment lands in ITS OWN attribute family. */
    Object.assign(row, cells);
    return row;
};

const kanjoBuildVariantRows = (p) => {
    const variations = Array.isArray(p && p.variations)
        ? p.variations.filter((v) => v && String(v.name || '').trim())
        : [];
    return variations
        .map((v, index) => kanjoBuildVariantRow(p, v, index))
        .filter(Boolean);
};

/* Flatten every product's variants into audit-friendly entries that carry both
   the raw source option and the strict Kanjo row that will be exported. */
const kanjoCollectVariantEntries = (evaluations) => {
    const entries = [];
    (evaluations || []).forEach(({ product }) => {
        const variations = Array.isArray(product && product.variations)
            ? product.variations.filter((v) => v && String(v.name || '').trim())
            : [];
        const nameAr = String((product && product.name_ar) || '').trim();
        const nameEn = String((product && product.name_en) || '').trim();
        variations.forEach((v, index) => {
            const row = kanjoBuildVariantRow(product, v, index);
            if (!row) return;
            entries.push({
                entryId: String(entries.length),
                product_key: row.product_key,
                productName: nameAr || nameEn || '(بدون اسم)',
                rawName: String(v.name || ''),
                rawValue: String(v.name || ''),
                price: row.price,
                attribute_1_name: row.attribute_1_name,
                attribute_1_value: row.attribute_1_value,
                row
            });
        });
    });
    return entries;
};

/* The FULL attribute combination (all four families), not just attribute_1:
   "صغير ايطالي" and "صغير سوري" share the size but differ in bread, and must be
   treated as two distinct variants. */
const kanjoVariantAttributeSignature = (entry) => {
    const row = (entry && entry.row) || {};
    return [1, 2, 3, 4].map((n) => String(row['attribute_' + n + '_value'] || '')).join('\u0002');
};
const kanjoVariantGroupKey = (entry) => String(entry.product_key) + '\u0001' + kanjoVariantAttributeSignature(entry);

/* Group by product + resolved Kanjo attribute value. */
const kanjoGroupVariantEntries = (entries) => {
    const groups = new Map();
    (entries || []).forEach((entry) => {
        const key = kanjoVariantGroupKey(entry);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    });
    return Array.from(groups.values());
};

/* Post-resolution safety net: drop only EXACT same-price duplicates so no
   pricing information is ever lost silently. */
const kanjoDedupeVariantEntries = (entries) => {
    const seen = new Map();
    const out = [];
    (entries || []).forEach((entry) => {
        const key = kanjoVariantGroupKey(entry);
        if (!seen.has(key)) { seen.set(key, entry); out.push(entry); return; }
        if (seen.get(key).price === entry.price) return;
        out.push(entry);
    });
    return out;
};

/* Apply the admin's manual resolutions. `__KANJO_DELETE_VARIANT__` removes the
   variant; otherwise the selected option index re-points the attribute. */
const kanjoApplyVariantDecisions = (kept, conflicts, decisions) => {
    const resolved = (kept || []).slice();
    (conflicts || []).forEach((group) => {
        group.entries.forEach((entry) => {
            const decision = decisions[entry.entryId];
            if (!decision || decision === KANJO_VARIANT_DELETE) return;
            const option = KANJO_VARIANT_ATTRIBUTE_OPTIONS[Number(decision)];
            if (!option) return;
            entry.attribute_1_name = option.name;
            entry.attribute_1_value = option.value;
            entry.row.attribute_1_name = option.name;
            entry.row.attribute_1_value = option.value;
            resolved.push(entry);
        });
    });
    return kanjoDedupeVariantEntries(resolved);
};

/* Pre-export variant audit. Kept fully silent and non-blocking: exact same-price
   duplicates are dropped, and groups that map to the same Kanjo attribute but
   carry DIFFERENT prices are all kept (one row per distinct price) so no pricing
   information is lost — the admin resolves any remainder inside the sheet. */
const kanjoStartVariantPhase = (evaluations, selections, opts) => {
    /* Safety gate: an option outside the static dictionary must never be
       silently dropped — abort the whole export and list it. */
    const unmappedVariants = kanjoQemaUnmappedVariants(evaluations);
    if (unmappedVariants.length) { kanjoHaltUnmappedVariants(unmappedVariants); return; }
    const entries = kanjoCollectVariantEntries(evaluations);
    const groups = kanjoGroupVariantEntries(entries);
    const kept = [];
    groups.forEach((group) => {
        if (group.length <= 1) { if (group[0]) kept.push(group[0]); return; }
        const uniquePrices = new Set(group.map((e) => e.price));
        if (uniquePrices.size === 1) { kept.push(group[0]); return; }
        /* Price conflict: do not halt behind a modal — export every distinct
           price. kanjoDedupeVariantEntries strips only exact same-price twins. */
        group.forEach((entry) => kept.push(entry));
    });
    kanjoFinalizeExport(evaluations, selections, opts, kanjoDedupeVariantEntries(kept));
};

const kanjoSheetFromRows = (columns, rows) => (
    (rows && rows.length)
        ? XLSX.utils.json_to_sheet(rows, { header: columns })
        : XLSX.utils.aoa_to_sheet([columns])
);

const kanjoWriteWorkbook = async (productRows, variantRows, fileName) => {
    /* P1.7: hand the (CPU-heavy) SheetJS serialization to the background worker.
       The worker receives plain row data and streams the .xlsx bytes back, so
       the dashboard thread stays responsive even for tens of thousands of rows. */
    const sheets = [
        { name: 'Products', header: KANJO_PRODUCTS_SHEET_COLUMNS, rows: productRows, colWidth: 22 },
        { name: 'Variants', header: KANJO_VARIANTS_SHEET_COLUMNS, rows: variantRows, colWidth: 22 }
    ];
    if (window.kanjoExportWorker && typeof window.kanjoExportWorker.writeWorkbook === 'function') {
        return window.kanjoExportWorker.writeWorkbook(sheets, fileName);
    }
    if (typeof XLSX === 'undefined' || !XLSX.utils) throw new Error('مكتبة Excel غير محمّلة، أعد تحميل الصفحة');
    const wb = XLSX.utils.book_new();
    const wsProducts = kanjoSheetFromRows(KANJO_PRODUCTS_SHEET_COLUMNS, productRows);
    const wsVariants = kanjoSheetFromRows(KANJO_VARIANTS_SHEET_COLUMNS, variantRows);
    wsProducts['!cols'] = KANJO_PRODUCTS_SHEET_COLUMNS.map(() => ({ wch: 22 }));
    wsVariants['!cols'] = KANJO_VARIANTS_SHEET_COLUMNS.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');
    XLSX.utils.book_append_sheet(wb, wsVariants, 'Variants');
    XLSX.writeFile(wb, fileName);
};

/* Failsafe for the whole export pipeline: never fail silently. Logs the full
   error (with stack) and surfaces a clear message to the user. */
const kanjoReportExportError = (err) => {
    const error = err || new Error('UNKNOWN_EXPORT_ERROR');
    console.error('[catalog] Kanjo Excel export failed:', error);
    const message = (error && error.message) ? error.message : String(error);
    /* Non-blocking: prefer an inline toast over a modal alert() so a failed
       export never freezes the dashboard behind a dialog. */
    if (typeof window.showToast === 'function') {
        window.showToast('حدث خطأ أثناء التصدير: ' + message, false);
    } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('حدث خطأ أثناء التصدير: ' + message);
    }
};

/* The importer rejects a repeated attribute combination for the same product
   ("attribute combination already exists"), so the FINAL variant rows are
   filtered in memory to one row per (product_key + full attribute signature).
   The first occurrence is kept; later twins (even at a different price) are
   dropped. Pure array work — issues no reads and mutates no source document. */
const kanjoVariantRowSignature = (row) => [1, 2, 3, 4]
    .map((n) => String((row && row['attribute_' + n + '_value']) || ''))
    .join('\u0002');
const kanjoDedupeVariantRows = (rows) => {
    const seen = new Set();
    return (rows || []).filter((row) => {
        const key = String((row && row.product_key) || '') + '\u0001' + kanjoVariantRowSignature(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/* Builds the Products/Variants rows (no I/O, no download) so both the normal
   export and the vendor ZIP can share the exact same sheet content. `options`
   is optional and additive: `options.categoryResolver(vendorType, assigned,
   product)` lets an isolated caller (the vendor-template filler) supply its own
   name -> ID mapping without changing the default export behaviour. */
const kanjoBuildExportRows = async (evaluations, selections, variantEntries, options) => {
    const productRows = [];
    const uniqueSkuById = new Map();
    const seenSkus = new Set();
    /* Qualifiers/units that no variant rule could map are preserved on the
       parent product name instead of being lost or turned into fake IDs. */
    const variantNameSuffix = new Map();
    evaluations.forEach(({ product }) => {
        const extra = kanjoVariantUnrecognizedWords(product);
        if (extra.length) variantNameSuffix.set(String((product && product.id) || ''), extra.join(' '));
    });
    for (let i = 0; i < evaluations.length; i++) {
        if (i > 0 && i % 300 === 0 && typeof window.kanjoYieldToMain === 'function') await window.kanjoYieldToMain();
        const { product, match } = evaluations[i];
        const key = String((product && product.id) || '');
        const vendorType = String((product && (product.category || product.vendor_type || product.vendorType)) || '');
        const assigned = kanjoQemaAssignedFor(product, match, (selections || {})[key]);
        const category = (options && typeof options.categoryResolver === 'function')
            ? String(options.categoryResolver(vendorType, assigned, product) || '')
            : (() => { const qema = kanjoQemaResolveCategory(vendorType, assigned); return qema.available ? qema.cell : kanjoFormatExportCategory(assigned); })();
        const row = kanjoBuildProductRow(product, category);
        const extraName = variantNameSuffix.get(key);
        if (extraName) row.name_ar = (String(row.name_ar || '').trim() + ' ' + extraName).trim();
        /* Deduplicate the parent SKU. Reps duplicate products, and the Kanjo
           importer rejects any repeated sku. A blank sku falls back to the
           (always unique) doc id so the cell is never empty. */
        const base = String((product && product.sku) || '').trim() || key || 'SKU';
        let sku = base;
        let suffix = 1;
        while (seenSkus.has(sku)) { sku = base + '-D' + suffix; suffix++; }
        seenSkus.add(sku);
        uniqueSkuById.set(key, sku);
        row.sku = sku;
        /* Variants link to their parent via product_key, so it must carry the
           NEW deduped sku on BOTH sheets or the relation breaks. */
        row.product_key = sku;
        productRows.push(row);
    }
    /* The variant phase already resolved duplicates/conflicts; fall back to a
       straight build only when called without pre-computed entries. */
    let variantRows;
    if (Array.isArray(variantEntries)) {
        variantRows = variantEntries.map((entry) => entry.row);
    } else {
        variantRows = [];
        evaluations.forEach(({ product }) => variantRows.push(...kanjoBuildVariantRows(product)));
    }
    variantRows = kanjoDedupeVariantRows(variantRows);
    /* Re-point each variant at its parent's deduped sku and renumber
       variant_sku per parent. kanjoDedupeVariantRows already collapsed any
       repeated attribute combination for a product (the importer rejects it),
       and unrecognised words are preserved on the product name rather than
       becoming an invalid synthetic ID. */
    const variantSeq = new Map();
    variantRows.forEach((row) => {
        const parentKey = String(row.product_key || '');
        const uniqueSku = uniqueSkuById.get(parentKey) || parentKey;
        row.product_key = uniqueSku;
        const n = (variantSeq.get(uniqueSku) || 0) + 1;
        variantSeq.set(uniqueSku, n);
        row.variant_sku = uniqueSku + '-V' + n;
    });
    /* Step 4 — orphaned product cleanup: a product exported as `variant` with
       zero final variants (empty/missing variations) would be rejected as an
       orphaned parent, so drop it from the Products sheet. Its (non-existent)
       variants are never exported either. Simple products are always kept. */
    const parentsWithVariants = new Set(variantRows.map((row) => String(row.product_key || '')));
    const cleanedProductRows = productRows.filter((row) => (
        String(row.product_type || '').toLowerCase() !== 'variant'
        || parentsWithVariants.has(String(row.product_key || ''))
    ));
    return { productRows: cleanedProductRows, variantRows };
};

const kanjoFinalizeExport = async (evaluations, selections, opts, variantEntries) => {
    try {
        const { productRows, variantRows } = await kanjoBuildExportRows(evaluations, selections, variantEntries);
        const merchantName = String((opts && opts.merchantName) || '').trim();
        const safeName = merchantName ? ('_' + merchantName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)) : '';
        const fileName = 'Kanjo_Products_Export' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        await kanjoWriteWorkbook(productRows, variantRows, fileName);
        if (window.showToast) window.showToast('تم تصدير ملف Excel (' + productRows.length + ' منتج، ' + variantRows.length + ' خيار) بنجاح');
    } catch (err) {
        kanjoReportExportError(err);
    }
};

/* Build (but do NOT download) the same Products/Variants workbook so the
   client-side vendor ZIP export can append it as an archive entry. */
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const kanjoBuildWorkbookBlob = async (productRows, variantRows, fileName) => {
    const sheets = [
        { name: 'Products', header: KANJO_PRODUCTS_SHEET_COLUMNS, rows: productRows, colWidth: 22 },
        { name: 'Variants', header: KANJO_VARIANTS_SHEET_COLUMNS, rows: variantRows, colWidth: 22 }
    ];
    if (window.kanjoExportWorker && typeof window.kanjoExportWorker.buildWorkbookBlob === 'function') {
        return window.kanjoExportWorker.buildWorkbookBlob(sheets, fileName);
    }
    if (typeof XLSX === 'undefined' || !XLSX.utils) throw new Error('مكتبة Excel غير محمّلة، أعد تحميل الصفحة');
    const wb = XLSX.utils.book_new();
    const wsProducts = kanjoSheetFromRows(KANJO_PRODUCTS_SHEET_COLUMNS, productRows);
    const wsVariants = kanjoSheetFromRows(KANJO_VARIANTS_SHEET_COLUMNS, variantRows);
    wsProducts['!cols'] = KANJO_PRODUCTS_SHEET_COLUMNS.map(() => ({ wch: 22 }));
    wsVariants['!cols'] = KANJO_VARIANTS_SHEET_COLUMNS.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');
    XLSX.utils.book_append_sheet(wb, wsVariants, 'Variants');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buffer], { type: MIME_XLSX });
};

/* Interactive remediation for the ZIP/batch export. When a scoped vendor has a
   product the strict gate cannot resolve AND a matching vendor template has been
   uploaded (session memory), pause, ask the operator to pick a valid category
   strictly from the template's own `_lookups` sheet, inject the choice in-memory
   and resume. ZERO Firestore: the override lives only for this workbook. Falls
   back to the normal PDF/Excel HALT when no matching template is active. */
const kanjoResolveScopedIssuesInteractive = async (issues) => {
    const tpl = (typeof window !== 'undefined' && window.KanjoTemplateExport && typeof window.KanjoTemplateExport.getActiveTemplate === 'function')
        ? window.KanjoTemplateExport.getActiveTemplate()
        : null;
    if (!tpl || !Array.isArray(tpl.categories) || !tpl.categories.length) return { ok: false, reason: 'no-template' };
    if (typeof window.kanjoPickTemplateCategories !== 'function') return { ok: false, reason: 'no-template' };
    const items = [];
    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const index = kanjoQemaCategoryIndex(issue.vendorType || issue.vendor);
        const seen = new Set();
        const options = [];
        tpl.categories.forEach((cat) => {
            /* Only template categories that belong to THIS vendor's scope are
               offered, so a template can never inject a cross-vendor ID. */
            if (!kanjoQemaScopedValue(index, cat.name)) return;
            if (seen.has(cat.token)) return;
            seen.add(cat.token);
            options.push({ token: cat.token, label: cat.name });
        });
        if (!options.length) return { ok: false, reason: 'no-template' };
        items.push({ productId: issue.id || issue.product, label: issue.product, vendorName: issue.vendor, category: issue.category, options: options });
    }
    const picked = await window.kanjoPickTemplateCategories(items);
    if (!picked) return { ok: false, reason: 'cancelled' };
    return { ok: true, overrides: picked };
};

/* Non-interactive vendor workbook builder used by the ZIP export. Unlike the
   modal export it never pauses behind the category audit: products the matcher
   cannot classify fall back to their own stored category, and scoped products
   that remain unresolved trigger the template-backed interactive picker. */
window.kanjoBuildVendorWorkbookBlob = async (opts) => {
    const o = opts || {};
    const includePending = o.includePending !== false;
    const source = includePending ? await fetchAllCatalogProductsForExport() : await fetchDoneCatalogProducts();
    let filtered = source;
    if (o.merchantId) {
        filtered = source.filter((p) => String(p.merchantId || '') === String(o.merchantId));
    } else if (o.merchantName) {
        filtered = source.filter((p) => catalogProductMerchantName(p) === o.merchantName);
    }
    if (!filtered.length) return { blob: null, fileName: '', productCount: 0, variantCount: 0 };
    filtered = filtered.map((p) => kanjoWithNormalizedText(p));
    const vendorTypeOf = (p) => String((p && (p.category || p.vendor_type || p.vendorType)) || o.vendorType || '').trim();
    let evaluations = filtered.map((p) => ({ product: p, match: kanjoMatchProductCategory(p, vendorTypeOf(p)) }));
    /* Variant safety gate: an option outside the static dictionary must never be
       silently dropped. Before halting, offer a confident typo correction to the
       operator (Accept injects it in-memory for this run; Ignore keeps the HALT). */
    const settledVariants = await kanjoSettleUnmappedVariants(evaluations);
    evaluations = settledVariants.evaluations;
    if (settledVariants.remaining.length) throw new Error(kanjoUnmappedVariantsMessage(settledVariants.remaining));
    /* Only vendors outside the dashboard taxonomy fall back to their raw label;
       a scoped vendor must never fabricate a category and is audited below. */
    const selections = {};
    evaluations.forEach(({ product, match }) => {
        if (match.status === 'matched') return;
        if (kanjoQemaCategoryIndex(vendorTypeOf(product))) return;
        const fallback = String((product && (product.category || product.vendor_type)) || '').trim();
        if (fallback) selections[String((product && product.id) || '')] = [fallback];
    });
    /* Non-interactive export: nothing can be audited, so ANY scoped category that
       is missing/out-of-scope (including a product with no category at all) HALTS
       the workbook with the exact list instead of silently dropping the cell. */
    const effectiveAssigned = (product, match) => kanjoQemaAssignedFor(
        product,
        match,
        selections[String((product && product.id) || '')]
    );
    const scopedIssues = kanjoStrictMappingIssues(evaluations, vendorTypeOf, effectiveAssigned, { includeUnassigned: true });
    const overrides = {};
    if (scopedIssues.length) {
        const outcome = await kanjoResolveScopedIssuesInteractive(scopedIssues);
        if (!outcome.ok) {
            if (outcome.reason === 'no-template') {
                kanjoHaltStrictMapping(scopedIssues, {
                    intro: 'لا يوجد قالب تاجر نشط يطابق نطاق نوع التاجر. يرجى رفع القالب الرسمي للتاجر من زر «تعبئة قالب التاجر» أولاً ثم إعادة التصدير:'
                });
                throw new Error(kanjoStrictMappingMessage(scopedIssues));
            }
            /* Operator deliberately cancelled the picker: abort quietly. */
            throw new Error('تم إلغاء التصدير: لم يتم اختيار تصنيفات المنتجات غير المعروفة');
        }
        Object.assign(overrides, outcome.overrides || {});
        const remaining = kanjoStrictMappingIssues(
            evaluations,
            vendorTypeOf,
            (product, match) => overrides[String((product && product.id) || '')] || effectiveAssigned(product, match),
            { includeUnassigned: true }
        );
        if (remaining.length) {
            kanjoHaltStrictMapping(remaining);
            throw new Error(kanjoStrictMappingMessage(remaining));
        }
    }
    const { productRows, variantRows } = await kanjoBuildExportRows(evaluations, selections, undefined, {
        categoryResolver: (vendorType, assigned, product) => {
            const key = String((product && product.id) || '');
            if (overrides[key]) return overrides[key];
            const qema = kanjoQemaResolveCategory(vendorType, assigned);
            return qema.available ? qema.cell : kanjoFormatExportCategory(assigned);
        }
    });
    const merchantName = String(o.merchantName || '').trim();
    const safeName = merchantName ? ('_' + merchantName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)) : '';
    const fileName = 'Kanjo_Products_Export' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    const blob = await kanjoBuildWorkbookBlob(productRows, variantRows, fileName);
    return { blob, fileName, productCount: productRows.length, variantCount: variantRows.length };
};

/* ===== Interactive pre-export category audit ===== */

let _kanjoAuditState = null;

/* One checkbox per distinct category NAME (the Kanjo table repeats several names
   under different IDs; showing the duplicates only confuses the operator). The
   first canonical ID for a name is used as the value. The container scrolls so a
   long vertical (restaurants) stays usable, and multiple boxes can be ticked to
   assign several categories to the same product. */
const kanjoCategoryCheckboxesHtml = (categories, key) => {
    const seen = new Set();
    const safeKey = catalogEscapeHtml(key);
    return (categories || []).map((cat) => {
        const name = normalizeArabic(cat.name);
        if (seen.has(name)) return '';
        seen.add(name);
        const value = kanjoCategoryValue(cat);
        return '<label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-kanjo-light cursor-pointer">'
            + '<input type="checkbox" class="kanjo-audit-cat-check h-4 w-4 shrink-0"'
            + ' data-product-key="' + safeKey + '" value="' + catalogEscapeHtml(value) + '">'
            + '<span class="text-xs font-bold text-[#230535] break-words">' + catalogEscapeHtml(value) + '</span>'
            + '</label>';
    }).join('');
};

window.openKanjoCategoryAuditModal = (items, onConfirm) => {
    const modal = document.getElementById('kanjoCategoryAuditModal');
    const body = document.getElementById('kanjoCategoryAuditBody');
    const countEl = document.getElementById('kanjoCategoryAuditCount');
    if (!modal || !body) {
        if (typeof onConfirm === 'function') onConfirm({});
        return;
    }
    _kanjoAuditState = { items: items || [], onConfirm };
    body.innerHTML = (items || []).map((entry) => {
        const p = entry.product || {};
        const key = String(p.id || '');
        const nameAr = String(p.name_ar || '').trim();
        const nameEn = String(p.name_en || '').trim();
        const label = nameAr || nameEn || '(بدون اسم)';
        const sub = (nameAr && nameEn && nameAr !== nameEn)
            ? '<div class="text-[10px] text-slate-400 font-bold mt-0.5 break-words">' + catalogEscapeHtml(nameEn) + '</div>'
            : '';
        /* Only categories valid for THIS product's vendor type are offered; the
           static Qema taxonomy drives the list when available. */
        const vendorType = String(entry.vendorType || p.category || '').trim();
        const taxonomyOptions = kanjoQemaAllowedCategoryObjects(vendorType);
        const optionsHtml = kanjoCategoryCheckboxesHtml(taxonomyOptions || kanjoVendorAllowedCategories(vendorType), key);
        const vendorBadge = vendorType
            ? '<span class="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-lg bg-purple-100 text-[#230535] max-w-[45%] truncate" title="' + catalogEscapeHtml(vendorType) + '">' + catalogEscapeHtml(vendorType) + '</span>'
            : '';
        return '<div class="kanjo-audit-row bg-kanjo-light/60 border border-purple-100 rounded-2xl p-3">'
            + '<div class="flex items-start justify-between gap-2 mb-2">'
            + '<div class="min-w-0"><div class="font-black text-sm text-[#230535] break-words">' + catalogEscapeHtml(label) + '</div>' + sub + '</div>'
            + '<div class="flex flex-col items-end gap-1">' + vendorBadge
            + '<span class="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg bg-rose-100 text-rose-700">غير مصنّف</span>'
            + '</div>'
            + '</div>'
            + '<div class="text-[10px] font-bold text-slate-400 mb-1">يمكن اختيار أكثر من تصنيف</div>'
            + '<div class="kanjo-audit-cats grid grid-cols-1 sm:grid-cols-2 gap-0.5 max-h-44 overflow-y-auto bg-white border border-purple-100 rounded-xl p-1.5">'
            + optionsHtml
            + '</div>'
            + '</div>';
    }).join('');
    if (countEl) countEl.textContent = String((items || []).length);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.showToast) window.showToast('راجع تصنيف ' + (items || []).length + ' منتج لإكمال التصدير', false);
};

/* Persist the admin's manual categorization. One writeBatch updates every
   affected product document (ids already in memory — zero reads) and the first
   chunk also appends the learned name→category rules to the centralized
   taxonomy document via arrayUnion. The in-memory catalog/KPI caches and the
   local learning index are patched immediately, so the SAME decision is reused
   for the rest of the session even before the network round-trip resolves. The
   commit MUST resolve before the caller builds the .xlsx. */
const kanjoPersistManualCategories = async (items, selections) => {
    const entries = [];
    (items || []).forEach((entry) => {
        const product = entry && entry.product;
        const id = String((product && product.id) || '');
        const values = Array.isArray(selections[id])
            ? selections[id].map((v) => String(v || '').trim()).filter(Boolean)
            : [];
        if (!id || !values.length) return;
        entries.push({ id, product: product || {}, values });
    });
    if (!entries.length) return { ok: true, count: 0 };

    const byName = String((window.currentUser && window.currentUser.name) || '');
    const now = new Date();
    const rulesToLearn = [];
    entries.forEach(({ id, product, values }) => {
        const ids = values.map(kanjoCategoryIdFromValue).filter((n) => n > 0);
        const patch = {
            [KANJO_CATEGORY_LEARNED_FIELD]: values,
            [KANJO_CATEGORY_LEARNED_IDS_FIELD]: ids,
            kanjo_categorized_at: now,
            kanjo_categorized_by: byName
        };
        kanjoPatchProductCaches(id, patch);
        const key = kanjoLearnedRuleKeyFor(product);
        if (key) {
            kanjoLearnedCategoryRules.set(key, values.slice());
            rulesToLearn.push({ name: key, categories: values.slice() });
        }
    });
    kanjoSaveLearnedCategoryRules();

    const db = window.db;
    if (!db || typeof window.writeBatch !== 'function' || typeof window.doc !== 'function') {
        return { ok: false, count: entries.length, reason: 'NO_BATCH' };
    }
    try {
        for (let start = 0; start < entries.length; start += KANJO_CATEGORY_BATCH_LIMIT) {
            const chunk = entries.slice(start, start + KANJO_CATEGORY_BATCH_LIMIT);
            const batch = window.writeBatch(db);
            chunk.forEach(({ id, values }) => {
                batch.update(window.doc(db, CATALOG_COLLECTION, id), {
                    [KANJO_CATEGORY_LEARNED_FIELD]: values,
                    [KANJO_CATEGORY_LEARNED_IDS_FIELD]: values.map(kanjoCategoryIdFromValue).filter((n) => n > 0),
                    kanjo_categorized_at: now,
                    kanjo_categorized_by: byName
                });
            });
            /* Taxonomy write rides the first chunk only. */
            if (start === 0 && rulesToLearn.length) {
                const taxonomyRef = window.doc(db, KANJO_CATEGORY_LEARNING_COLLECTION, KANJO_CATEGORY_LEARNING_DOC);
                const rulesValue = typeof window.arrayUnion === 'function'
                    ? window.arrayUnion(...rulesToLearn)
                    : rulesToLearn;
                batch.set(taxonomyRef, {
                    rules: rulesValue,
                    updatedAt: now,
                    updatedBy: byName
                }, { merge: true });
            }
            await batch.commit();
        }
        return { ok: true, count: entries.length };
    } catch (err) {
        console.warn('[catalog] manual category persistence failed:', err);
        return { ok: false, count: entries.length, error: err };
    }
};

window.confirmKanjoCategoryAudit = async () => {
    if (!_kanjoAuditState || _kanjoAuditState.busy) return;
    const selections = {};
    const checked = {};
    document.querySelectorAll('#kanjoCategoryAuditBody .kanjo-audit-cat-check:checked').forEach((box) => {
        const key = box.getAttribute('data-product-key') || '';
        const value = String(box.value || '').trim();
        if (!value) return;
        if (!checked[key]) checked[key] = [];
        if (checked[key].indexOf(value) === -1) checked[key].push(value);
    });
    let missing = 0;
    (_kanjoAuditState.items || []).forEach((entry) => {
        const key = String((entry.product && entry.product.id) || '');
        if (checked[key] && checked[key].length) selections[key] = checked[key];
        else missing++;
    });
    if (missing) {
        if (window.showToast) window.showToast('برجاء تحديد تصنيف واحد على الأقل لكل منتج (' + missing + ' متبقي)', false);
        return;
    }
    const state = _kanjoAuditState;
    const onConfirm = state.onConfirm;
    state.busy = true;
    const btn = document.getElementById('kanjoCategoryAuditConfirmBtn');
    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري حفظ التصنيفات...';
    }
    /* Save FIRST, then build the workbook, so the persisted knowledge and the
       exported sheet always agree. A save failure is surfaced but never blocks
       the admin from getting the file (the export uses the same selections). */
    const persisted = await kanjoPersistManualCategories(state.items, selections);
    if (!persisted.ok && window.showToast) {
        window.showToast('تم التصدير، لكن تعذّر حفظ التصنيفات الجديدة — أعد المحاولة لاحقاً', false);
    }
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
    }
    window.closeKanjoCategoryAuditModal();
    if (typeof onConfirm === 'function') onConfirm(selections);
};

window.closeKanjoCategoryAuditModal = () => {
    _kanjoAuditState = null;
    const modal = document.getElementById('kanjoCategoryAuditModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

/* ===== Interactive pre-export variant price-conflict audit ===== */

let _kanjoVariantAuditState = null;

window.openKanjoVariantConflictModal = (conflicts, onConfirm) => {
    const modal = document.getElementById('kanjoVariantConflictModal');
    const body = document.getElementById('kanjoVariantConflictBody');
    const countEl = document.getElementById('kanjoVariantConflictCount');
    if (!modal || !body) {
        if (typeof onConfirm === 'function') onConfirm({});
        return;
    }
    _kanjoVariantAuditState = { conflicts: conflicts || [], onConfirm };
    const optionsHtml = KANJO_VARIANT_ATTRIBUTE_OPTIONS.map((opt, idx) => (
        '<option value="' + idx + '">' + catalogEscapeHtml(opt.value) + '</option>'
    )).join('');
    const totalVariants = (conflicts || []).reduce((n, group) => n + group.entries.length, 0);
    body.innerHTML = (conflicts || []).map((group) => {
        const rowsHtml = group.entries.map((entry) => (
            '<div class="bg-white border border-purple-100 rounded-2xl p-3">'
            + '<div class="flex items-start justify-between gap-2 mb-2">'
            + '<div class="min-w-0">'
            + '<div class="font-black text-xs text-[#230535] break-words">' + catalogEscapeHtml(entry.rawValue || '(بدون اسم)') + '</div>'
            + '<div class="text-[10px] font-bold text-slate-400">' + catalogEscapeHtml(entry.attribute_1_value) + ' — السعر: ' + catalogEscapeHtml(String(entry.price)) + '</div>'
            + '</div>'
            + '<span class="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg bg-rose-100 text-rose-700">تعارض سعر</span>'
            + '</div>'
            + '<select class="kanjo-variant-conflict-select w-full p-3 bg-white border border-purple-100 rounded-xl font-bold text-sm text-[#230535] outline-none focus:border-[#230535]"'
            + ' data-entry-id="' + catalogEscapeHtml(entry.entryId) + '">'
            + '<option value="" disabled selected>اختر القيمة الصحيحة للمتغير...</option>'
            + '<option value="' + KANJO_VARIANT_DELETE + '">--- حذف هذا المتغير (Delete Variant) ---</option>'
            + optionsHtml
            + '</select>'
            + '</div>'
        )).join('');
        return '<div class="bg-kanjo-light/60 border border-purple-100 rounded-2xl p-3 space-y-2">'
            + '<div class="font-black text-sm text-[#230535] break-words">' + catalogEscapeHtml(group.productName) + '</div>'
            + rowsHtml
            + '</div>';
    }).join('');
    if (countEl) countEl.textContent = String(totalVariants);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.showToast) window.showToast('يوجد تعارض أسعار في ' + totalVariants + ' متغير، حدّد القيم قبل التصدير', false);
};

window.confirmKanjoVariantConflictAudit = () => {
    if (!_kanjoVariantAuditState) return;
    const decisions = {};
    let missing = 0;
    document.querySelectorAll('#kanjoVariantConflictBody .kanjo-variant-conflict-select').forEach((sel) => {
        const id = sel.getAttribute('data-entry-id') || '';
        const value = String(sel.value || '');
        if (!value) { missing++; return; }
        decisions[id] = value;
    });
    if (missing) {
        if (window.showToast) window.showToast('برجاء تحديد قيمة لكل متغير متعارض (' + missing + ' متبقي)', false);
        return;
    }
    const onConfirm = _kanjoVariantAuditState.onConfirm;
    window.closeKanjoVariantConflictModal();
    if (typeof onConfirm === 'function') onConfirm(decisions);
};

window.closeKanjoVariantConflictModal = () => {
    _kanjoVariantAuditState = null;
    const modal = document.getElementById('kanjoVariantConflictModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.exportKanjoExcel = async (options) => {
    const opts = options || {};
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير الكتالوج متاح للإدارة فقط', false);
        return;
    }
    try {
        /* "تصدير جميع المنتجات (شامل قيد المراجعة)" toggle, read from the export
           modal unless a caller overrides it via options. Checking the box itself
           never queries; the source is the in-memory cache (a single REST read is
           only issued on the explicit export click when the cache is still empty). */
        let includePending = opts.includePending;
        if (typeof includePending !== 'boolean') {
            const box = document.getElementById('exportIncludePending');
            includePending = !!(box && box.checked);
        }
        const source = includePending
            ? await fetchAllCatalogProductsForExport()
            : await fetchDoneCatalogProducts();
        let filtered = source;
        if (opts.merchantId) {
            filtered = source.filter((p) => String(p.merchantId || '') === String(opts.merchantId));
        } else if (opts.merchantName) {
            filtered = source.filter((p) => catalogProductMerchantName(p) === opts.merchantName);
        }
        if (!filtered.length) {
            if (window.showToast) window.showToast(includePending ? 'لا توجد منتجات للتصدير' : 'لا توجد منتجات مكتملة للتصدير', false);
            return;
        }
        /* Auto-correct data-entry typos on name_ar/description_ar BEFORE the
           matcher runs and BEFORE the workbook is built, so both the automated
           categorization and the exported sheet use the same unified spelling.
           The in-memory catalogue is untouched (copies only). */
        filtered = filtered.map((p) => kanjoWithNormalizedText(p));
        /* Vendor type = the merchant activity label stored on each product
           (`category`, e.g. "🍔 مطاعم وكافيهات"). Each product is matched against
           ONLY its own vendor's category allow-list, so cross-vertical false
           positives (a restaurant landing in "فراخ"/"لحوم") are impossible. */
        const vendorTypeOf = (p) => String((p && (p.category || p.vendor_type || p.vendorType)) || opts.vendorType || '').trim();
        let evaluations = filtered.map((p) => ({ product: p, match: kanjoMatchProductCategory(p, vendorTypeOf(p)) }));
        /* Variant safety gate runs BEFORE any category prompt so an unmapped
           option aborts the export immediately. A confident typo is first offered
           to the operator (Accept injects in-memory for this run; Ignore halts). */
        const settledVariants = await kanjoSettleUnmappedVariants(evaluations);
        evaluations = settledVariants.evaluations;
        if (settledVariants.remaining.length) { kanjoHaltUnmappedVariants(settledVariants.remaining); return; }
        /* STRICT_TAXONOMY_MAP gate: a stored/learned category that is not an
           exact key of the vendor's strict map HALTS the export with a precise
           error (the seven strict vendors only; others keep the audit modal). */
        const strictIssues = kanjoStrictMappingIssues(evaluations, vendorTypeOf);
        if (strictIssues.length) { kanjoHaltStrictMapping(strictIssues); return; }
        const proceed = (selections) => kanjoStartVariantPhase(evaluations, selections || {}, opts);
        /* Intercept: any product the smart matcher cannot classify, OR whose
           matched categories are not legal for its Qema vendor type, PAUSES the
           export behind the interactive audit modal. The operator must pick a
           valid category (scoped to the vendor's static taxonomy) before the
           file is built. */
        const needsAudit = (e) => {
            const assigned = kanjoQemaAssignedFor(e.product, e.match, null);
            const qema = kanjoQemaResolveCategory(vendorTypeOf(e.product), assigned);
            return qema.available ? !qema.cell : e.match.status !== 'matched';
        };
        const unmapped = evaluations.filter(needsAudit);
        if (unmapped.length) {
            if (window.openKanjoCategoryAuditModal) {
                window.openKanjoCategoryAuditModal(
                    unmapped.map((e) => ({ product: e.product, vendorType: vendorTypeOf(e.product) })),
                    proceed
                );
                return;
            }
        }
        proceed({});
    } catch (err) {
        kanjoReportExportError(err);
    }
};

window.exportDoneCatalogProducts = async () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير الكتالوج متاح للإدارة فقط', false);
        return;
    }
    const select = document.getElementById('merchantExportFilter');
    const merchantName = String((select && select.value) || '').trim();
    return window.exportKanjoExcel(merchantName ? { merchantName } : {});
};

const fetchAllCatalogProducts = async () => {
    /* REST-first with the shared compact field mask so this mass read never
       pulls oversized blobs (description/image/base64) that its callers do not
       use. The SDK getDocs (no field mask) remains the last-resort fallback. */
    if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
        try {
            return (await window.kanjoRest.runQuery(CATALOG_COLLECTION, [], null, { select: CATALOG_LIST_FIELDS })) || [];
        } catch (err) {
            console.warn('[catalog] full REST fetch failed; trying SDK:', err);
        }
    }
    const snap = await window.getDocs(window.collection(window.db, CATALOG_COLLECTION));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    return items;
};

window.fixCatalogProductTranslations = async () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('إصلاح الترجمة متاح للإدارة فقط', false);
        return;
    }
    if (window._catalogFixingTranslations) return;
    const fixBtn = document.getElementById('catalogFixTranslationsBtn');
    window._catalogFixingTranslations = true;
    if (fixBtn) {
        fixBtn.disabled = true;
        fixBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري إصلاح الترجمة...';
    }
    try {
        let products = window.allCatalogProductsCache || [];
        if (!products.length) products = await fetchAllCatalogProducts();
        const broken = products.filter((p) => {
            const nameAr = String(p.name_ar || '').trim();
            const nameEn = String(p.name_en || '').trim();
            return !!nameAr && nameAr === nameEn;
        });
        if (!broken.length) {
            window.showToast('جميع المنتجات مترجمة بشكل صحيح');
            return;
        }
        window.showToast('جاري ترجمة ' + broken.length + ' منتج... برجاء عدم إغلاق الصفحة');
        for (const product of broken) {
            await new Promise((r) => setTimeout(r, 2000));
            const nameEn = await translateArToEn(product.name_ar);
            await new Promise((r) => setTimeout(r, 2000));
            const descriptionEn = await translateArToEn(product.description_ar);
            const patch = {};
            if (nameEn) patch.name_en = nameEn;
            if (descriptionEn) patch.description_en = descriptionEn;
            if (!Object.keys(patch).length) continue;
            if (!(await catalogRestMerge([CATALOG_COLLECTION, product.id], patch))) {
                await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, product.id), patch);
            }
        }
        window.showToast('تم إصلاح ترجمة المنتجات بنجاح');
        if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
        if (typeof window.renderCatalogAllProductsWidget === 'function') window.renderCatalogAllProductsWidget();
    } catch (err) {
        console.error('[catalog] fix translations failed:', err);
        window.showToast('فشل إصلاح ترجمة المنتجات', false);
    } finally {
        window._catalogFixingTranslations = false;
        if (fixBtn) {
            fixBtn.disabled = false;
            fixBtn.innerHTML = '<i class="fa-solid fa-language"></i> إصلاح ترجمة المنتجات';
        }
    }
};

window.exportMerchantKanjoSheet = async () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير الكتالوج متاح للإدارة فقط', false);
        return;
    }
    const nameEl = document.getElementById('mpMerchantName');
    const merchantName = String(window.activeMerchantBaseName || (nameEl && nameEl.innerText) || '').trim();
    if (!merchantName) return window.showToast('افتح بطاقة تاجر أولاً', false);
    const merchantId = (window.findMerchantIdForBase && window.findMerchantIdForBase(merchantName)) || '';
    return window.exportKanjoExcel({ merchantName, merchantId });
};

const sortCatalogProductsByCreatedAt = (items) => {
    items.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return tb - ta;
    });
    return items;
};

/* Static (one-shot) loader for the rep's own catalog products. This replaces
   the previous real-time onSnapshot: overlapping listeners (tasks + catalog)
   repainted the same list continuously and made the rep dashboard blink.
   Reads go over direct REST first so they survive a blocked SDK transport. */
window.loadMyCatalogProducts = async (force = false) => {
    if (!window.isCatalogRepUser()) return;
    const createdBy = (window.currentUser && window.currentUser.name) || '';
    if (!createdBy) return;
    try {
        const filters = [['createdBy', '==', createdBy]];
        /* Cheap change gate: without it the 120s poll re-read the rep's ENTIRE
           own-product set every two minutes (one read per product), which is a
           multi-hundred-thousand-read/day leak for a productive rep. An
           aggregation count costs ~1 read; a forced/manual refresh ignores the
           gate so the rep can always pull fresh data on demand, but still probes
           the count so the next poll has an accurate baseline. */
        const count = await catalogRestCount(filters);
        if (!force && count !== null && window._catalogMyProductsLoaded && window._catalogMyProductsCount === count) {
            return;
        }
        let items = null;
        if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
            try {
                items = await window.kanjoRest.runQuery(CATALOG_COLLECTION, filters, null, { select: CATALOG_LIST_FIELDS });
            } catch (restErr) {
                console.warn('[catalog] REST my-products fetch failed; trying SDK:', restErr);
            }
        }
        if (!items) {
            if (typeof window.getDocs !== 'function' || !window.db) return;
            const ref = window.query(
                window.collection(window.db, CATALOG_COLLECTION),
                window.where('createdBy', '==', createdBy)
            );
            const snap = await window.getDocs(ref);
            items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        }
        window.repCatalogProductsCache = sortCatalogProductsByCreatedAt(items);
        window._catalogMyProductsLoaded = true;
        window._catalogMyProductsCount = (typeof count === 'number') ? count : items.length;
        window._catalogMyProductsSignature = '';
        if (typeof window.renderCatalogMyProductsWidget === 'function') window.renderCatalogMyProductsWidget();
    } catch (err) {
        console.error('[catalog] my products fetch failed:', err);
    }
};

/* Patch a single rep product in the in-memory cache so add/edit/delete update
   the UI locally without re-fetching the whole collection. */
const patchRepCatalogProductLocally = (productId, patch) => {
    const cache = window.repCatalogProductsCache || [];
    const idx = cache.findIndex((p) => p.id === productId);
    if (idx === -1) return false;
    cache[idx] = { ...cache[idx], ...patch };
    window.repCatalogProductsCache = cache;
    return true;
};
window.patchRepCatalogProductLocally = patchRepCatalogProductLocally;

/* Optimistic zero-read insert: immediately after a successful create, fold the
   new product into every cache that is ALREADY loaded so it appears instantly
   across the whole UI (rep list, all-products grid/leaderboard, content pending
   queue, export merchant filter) without a single extra Firestore read.
   The cheap 120s polling gates compare an aggregation count against these
   baselines, so each loaded cache's baseline is bumped in lock-step to keep the
   gate honest. A cache that was never loaded is deliberately NOT populated —
   that would defeat the deferred lazy-read policy — instead its loaded flag and
   its count baseline are cleared so the next open reconciles from the server
   exactly once. */
const catalogApplyCreatedProductLocally = (product) => {
    if (!product || !product.id) return;
    const status = String(product.status || 'pending');
    const insertUnique = (cache) => {
        if (!Array.isArray(cache)) return { cache, added: false };
        if (cache.some((p) => p && p.id === product.id)) return { cache, added: false };
        return { cache: sortCatalogProductsByCreatedAt([product].concat(cache)), added: true };
    };

    /* 1) The rep's own list ("منتجاتي"). */
    if (window._catalogMyProductsLoaded && Array.isArray(window.repCatalogProductsCache)) {
        const res = insertUnique(window.repCatalogProductsCache);
        window.repCatalogProductsCache = res.cache;
        if (res.added && typeof window._catalogMyProductsCount === 'number') window._catalogMyProductsCount += 1;
    } else {
        window._catalogMyProductsLoaded = false;
        window._catalogMyProductsCount = null;
        window._catalogMyProductsSignature = '';
    }

    /* 2) The full "all products" grid (manager/admin) + export filter. */
    if (window._catalogAllProductsLoaded && Array.isArray(window.allCatalogProductsCache)) {
        const res = insertUnique(window.allCatalogProductsCache);
        window.allCatalogProductsCache = res.cache;
        if (res.added && typeof window._catalogAllProductsCount === 'number') window._catalogAllProductsCount += 1;
    } else {
        window._catalogAllProductsLoaded = false;
        window._catalogAllProductsCount = null;
    }

    /* 3) The content editor's pending queue (pending rows only). */
    if (status === 'pending') {
        if (window._catalogPendingLoaded && Array.isArray(window.merchantProductsCache)) {
            const res = insertUnique(window.merchantProductsCache);
            window.merchantProductsCache = res.cache;
            if (res.added && typeof window._catalogPendingCount === 'number') window._catalogPendingCount += 1;
        } else {
            window._catalogPendingLoaded = false;
            window._catalogPendingCount = null;
        }
    }

    /* 4) The finished/approved set, only when it is actually loaded. */
    if (status === 'done' && window._catalogDoneLoaded && Array.isArray(window.doneCatalogProductsCache)) {
        window.doneCatalogProductsCache = insertUnique(window.doneCatalogProductsCache).cache;
    }

    /* 5) Delete-request queue (a brand-new row is never requested yet, kept for
       completeness so the helper stays correct for any create-with-flags path). */
    if (product.deleteRequested === true) {
        if (window._catalogDeleteRequestsLoaded && Array.isArray(window.catalogDeleteRequestsCache)) {
            const res = insertUnique(window.catalogDeleteRequestsCache);
            window.catalogDeleteRequestsCache = res.cache;
            if (res.added && typeof window._catalogDeleteRequestsCount === 'number') window._catalogDeleteRequestsCount += 1;
        } else {
            window._catalogDeleteRequestsLoaded = false;
            window._catalogDeleteRequestsCount = null;
        }
    }

    /* 6) Autocomplete is scoped per category: invalidate that one category so
       the next modal open refetches it lazily (never on the create path). */
    if (window._catalogAutocompleteCategory === product.category) {
        window._catalogAutocompleteCache = [];
    }

    /* 7) Repaint whatever is on screen; the export filter reads memory only. */
    if (typeof populateMerchantExportFilter === 'function') {
        try { populateMerchantExportFilter(); } catch (err) { /* non-fatal */ }
    }
    if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
};
window.catalogApplyCreatedProductLocally = catalogApplyCreatedProductLocally;

/* Cheap "did this query change?" probe: an aggregation count costs ~1 read per
   1,000 matching documents (minimum 1) instead of one read per document.
   Returns the count, or `null` when the helper is unavailable (which callers
   treat as "cannot tell — re-fetch"). */
const catalogRestCount = async (filters) => {
    if (window.kanjoRest && typeof window.kanjoRest.count === 'function') {
        try {
            return await window.kanjoRest.count(CATALOG_COLLECTION, filters || []);
        } catch (err) {
            console.warn('[catalog] count probe failed; will re-fetch:', err);
        }
    }
    return null;
};

window.startCatalogListeners = () => {
    if (window._catalogListenerStarted) return;
    window._catalogListenerStarted = true;
    window.merchantProductsCache = [];
    window.repCatalogProductsCache = [];
    window.catalogDeleteRequestsCache = [];
    window.allCatalogProductsCache = [];
    window.doneCatalogProductsCache = [];
    window._catalogContentTab = window._catalogContentTab || 'pending';
    /* Loading flags: while false and a cache is empty the widgets render a
       neutral skeleton instead of an empty-state / "(0)" placeholder. */
    window._catalogPendingLoaded = false;
    window._catalogDoneLoaded = false;
    window._catalogAllProductsLoaded = false;
    window._catalogDeleteRequestsLoaded = false;
    /* Client-side view state for the "all products" folder grid: a category
       filter (empty = الكل), a merchant-status filter and a sort mode. Reset per
       session so a previous user's selection can never leak into the next one. */
    window._catalogCategoryFilter = '';
    window._catalogStatusFilter = '';
    window._catalogSortMode = 'newest';
    _catalogCategoryOptionsSig = null;
    /* Result-size signatures behind the cheap count probes; `null` means "no
       known baseline yet", so the first poll always fetches. Reset per session
       so a previous user's counts can never short-circuit the next user. */
    window._catalogPendingCount = null;
    window._catalogAllProductsCount = null;
    window._catalogDeleteRequestsCount = null;
    /* The rep's own-products read is count-gated the same way: reset per session
       so one identity's count can never short-circuit another's first read. */
    window._catalogMyProductsLoaded = false;
    window._catalogMyProductsCount = null;
    if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];

    const useRest = !!(window.kanjoRest && typeof window.kanjoRest.runQuery === 'function');

    /* Direct REST is the primary read path: the SDK's streaming transport can
       be blocked, which used to leave these widgets stuck at 0. The caches are
       refreshed on a slow poll so they stay current without a live listener.
       Cost model: the timed poll only re-fetches the small pending (+ delete
       request) sets, and only when a cheap aggregation count shows they
       changed; the full collection is read once at boot and again only when a
       manager explicitly opens/refreshes the "all products" widget. A plain rep
       never reads either global set — only their own products. */
    const refreshFromRest = async (allowFull = false) => {
        /* Skip if the previous poll is still in flight: a slow network must not
           stack overlapping full-collection reads. Also skip hidden tabs — a
           backgrounded Ops Center has no user watching the widgets. */
        if (!useRest || window._catalogRestRefreshInFlight) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        window._catalogRestRefreshInFlight = true;
        try {
            const canViewAll = window.canViewAllCatalogProducts();
            /* The global pending set only feeds the content editor / manager
               views; a plain rep renders its own products from
               `loadMyCatalogProducts` and must not pay for it. The audit team
               loads the full collection on demand via the "all products"
               widget, so it is deliberately excluded from the boot/periodic
               pending read to keep its idle cost at zero reads. */
            const canViewPending = (canViewAll && !window.isProductAuditUser()) || window.isCatalogContentUser();
            const isMahmoud = window.isMahmoudUser();
            /* The full-collection read is by far the most expensive one (one
               read per document — 4,000+ today). It is therefore NEVER issued by
               the timed poll (`allowFull === false`); only on boot and when the
               user explicitly opens/refreshes the "all products" widget. */
            const wantAllProducts = allowFull && canViewAll
                && (window._catalogAllProductsOpen === true || !window._catalogAllProductsLoaded);
            /* Never read the rep's own-product set on a plain boot/refresh: it is
               deferred to the "منتجاتي" widget being opened (which calls
               `loadMyCatalogProducts`, count-gated) or an explicit force. */
            const jobs = [];
            if (allowFull || window._catalogMyProductsOpen === true) {
                jobs.push(window.loadMyCatalogProducts(allowFull));
            }
            if (wantAllProducts) {
                jobs.push((async () => {
                    try {
                        /* Cheap change check: an aggregation count costs ~1 read
                           per 1,000 docs, so an explicit re-open with unchanged
                           data skips the full re-fetch. `null` (helper missing)
                           forces the fetch. */
                        const total = await catalogRestCount([]);
                        if (total !== null && window._catalogAllProductsLoaded && total === window._catalogAllProductsCount) {
                            window._catalogAllProductsFetchedAt = Date.now();
                            return;
                        }
                        const items = sortCatalogProductsByCreatedAt(await window.kanjoRest.runQuery(CATALOG_COLLECTION, [], null, { select: CATALOG_LIST_FIELDS }));
                        window.allCatalogProductsCache = items;
                        window._catalogAllProductsLoaded = true;
                        window._catalogAllProductsCount = typeof total === 'number' ? total : items.length;
                        window._catalogAllProductsFetchedAt = Date.now();
                        const pending = items.filter((p) => p.status === 'pending');
                        window.merchantProductsCache = pending;
                        window._catalogPendingLoaded = true;
                        window._catalogPendingCount = pending.length;
                        if (isMahmoud) {
                            window.catalogDeleteRequestsCache = items.filter((p) => p.deleteRequested === true);
                            window._catalogDeleteRequestsLoaded = true;
                            window._catalogDeleteRequestsCount = window.catalogDeleteRequestsCache.length;
                        }
                        if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
                        if (typeof window.renderCatalogAllProductsWidget === 'function') window.renderCatalogAllProductsWidget();
                        if (typeof populateMerchantExportFilter === 'function') populateMerchantExportFilter();
                        if (typeof window.renderCatalogDeleteRequestsWidget === 'function') window.renderCatalogDeleteRequestsWidget();
                    } catch (err) {
                        console.error('[catalog] all-products REST fetch failed:', err);
                    }
                })());
            } else {
                if (canViewPending) {
                    jobs.push((async () => {
                        try {
                            const pendingCount = await catalogRestCount([['status', '==', 'pending']]);
                            if (pendingCount !== null && window._catalogPendingLoaded && pendingCount === window._catalogPendingCount) return;
                            const items = sortCatalogProductsByCreatedAt(await window.kanjoRest.runQuery(CATALOG_COLLECTION, [['status', '==', 'pending']], null, { select: CATALOG_LIST_FIELDS }));
                            window.merchantProductsCache = items;
                            window._catalogPendingLoaded = true;
                            window._catalogPendingCount = typeof pendingCount === 'number' ? pendingCount : items.length;
                            if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
                        } catch (err) {
                            console.error('[catalog] pending REST fetch failed:', err);
                        }
                    })());
                }
                if (isMahmoud) {
                    jobs.push((async () => {
                        try {
                            const deleteCount = await catalogRestCount([['deleteRequested', '==', true]]);
                            if (deleteCount !== null && window._catalogDeleteRequestsLoaded && deleteCount === window._catalogDeleteRequestsCount) return;
                            const items = sortCatalogProductsByCreatedAt(await window.kanjoRest.runQuery(CATALOG_COLLECTION, [['deleteRequested', '==', true]], null, { select: CATALOG_LIST_FIELDS }));
                            window.catalogDeleteRequestsCache = items;
                            window._catalogDeleteRequestsLoaded = true;
                            window._catalogDeleteRequestsCount = typeof deleteCount === 'number' ? deleteCount : items.length;
                        } catch (err) {
                            console.error('[catalog] delete-requests REST fetch failed:', err);
                        }
                    })());
                }
                if (typeof window.renderCatalogDeleteRequestsWidget === 'function') window.renderCatalogDeleteRequestsWidget();
            }
            await Promise.all(jobs);
        } finally {
            window._catalogRestRefreshInFlight = false;
        }
    };

    /* Boot is count-gated: only the small pending/delete-request sets are read.
       The full catalog loads on demand when the "all products" widget is opened
       and the rep's own products when "منتجاتي" is opened, so a plain page load
       or refresh never pays for the multi-thousand-document reads. */
    refreshFromRest(false);
    /* Exposed so opening the "all products" widget can pull the full set on
       demand instead of relying on a background poll. */
    window.refreshCatalogFromRest = () => refreshFromRest(true);
    /* Automated background polling is FORBIDDEN (billing leak). Catalog widgets
       load once here and refresh only on demand: opening the all-products widget
       calls window.refreshCatalogFromRest() after its 60s staleness check. No
       setInterval and no visibility-change auto-read. */

    /* Best-effort real-time, ONLY when REST is not available. When REST is the
       transport we deliberately do not attach SDK listeners: the blocked
       streaming transport is what produced the offline timeout / Listen-channel
       errors. */
    if (!useRest && typeof window.onSnapshot === 'function' && typeof window.collection === 'function' && window.db) {
        const unsubPending = window.onSnapshot(
            window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'pending')),
            (snap) => {
                const items = [];
                snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
                if (!items.length && (window.merchantProductsCache || []).length) return;
                window.merchantProductsCache = sortCatalogProductsByCreatedAt(items);
                window._catalogPendingLoaded = true;
                if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
            },
            (err) => console.error('[catalog] pending listener failed:', err)
        );
        window._appListenerUnsubscribers.push(unsubPending);

        if (window.canViewAllCatalogProducts()) {
            const unsubAll = window.onSnapshot(
                window.collection(window.db, CATALOG_COLLECTION),
                (snap) => {
                    const items = [];
                    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
                    if (items.length || !(window.allCatalogProductsCache || []).length) {
                        window.allCatalogProductsCache = sortCatalogProductsByCreatedAt(items);
                    }
                    window._catalogAllProductsLoaded = true;
                    if (typeof window.renderCatalogAllProductsWidget === 'function') window.renderCatalogAllProductsWidget();
                    if (typeof populateMerchantExportFilter === 'function') populateMerchantExportFilter();
                },
                (err) => console.error('[catalog] all products listener failed:', err)
            );
            window._appListenerUnsubscribers.push(unsubAll);
        }

        if (window.isMahmoudUser()) {
            const unsubDeleteReq = window.onSnapshot(
                window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('deleteRequested', '==', true)),
                (snap) => {
                    const items = [];
                    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
                    if (!items.length && (window.catalogDeleteRequestsCache || []).length) return;
                    window.catalogDeleteRequestsCache = sortCatalogProductsByCreatedAt(items);
                    window._catalogDeleteRequestsLoaded = true;
                    if (typeof window.renderCatalogDeleteRequestsWidget === 'function') window.renderCatalogDeleteRequestsWidget();
                },
                (err) => console.error('[catalog] delete requests listener failed:', err)
            );
            window._appListenerUnsubscribers.push(unsubDeleteReq);
        }
    }
};

const STAGING_CATALOGS_COLLECTION = 'staging_catalogs';
const MASTER_CATALOG_COLLECTION = 'master_catalog';
const MASTER_CATALOG_DRIVE_FOLDER = 'Kanjo Products Data/Master_Catalog_Images';
const MASTER_CATALOG_IMAGES_DIR = 'master_catalog_images';
const STAGING_EXPORT_COLUMNS = ['name', 'price', 'image_url', 'category', 'sku', 'uploaded_at'];

const downloadGenericKanjoCsv = (headers, rows, fileName) => {
    const headersString = formatCsvRow(headers);
    const rowsString = rows.map((row) => formatCsvRow(headers.map((col) => row[col]))).join('\r\n');
    const csvString = headersString + '\r\n' + rowsString;
    const blob = new Blob(['\uFEFF', csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const stagingPick = (item, keys) => {
    if (!item || typeof item !== 'object') return '';
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
            return item[key];
        }
    }
    return '';
};

const extractStagingCatalogArray = (parsed) => {
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return [];
    const keys = ['products', 'items', 'data', 'results', 'catalog', 'records'];
    for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(parsed[keys[i]])) return parsed[keys[i]];
    }
    return [];
};

const mapStagingCatalogItem = (item, category) => {
    const name = String(stagingPick(item, ['name', 'title', 'product_name', 'productName', 'name_ar', 'original_name']) || '').trim();
    const priceRaw = stagingPick(item, ['price', 'current_price', 'currentPrice', 'base_price', 'sale_price', 'amount']);
    const image = String(stagingPick(item, ['image_url', 'imageUrl', 'main_image', 'mainImage', 'image', 'thumbnail', 'img']) || '').trim();
    const sku = String(stagingPick(item, ['sku', 'barcode', 'gtin', 'ean', 'id']) || '').trim();
    const itemCategory = String(stagingPick(item, ['category', 'cat']) || category || '').trim();
    const priceNum = Number(String(priceRaw).replace(/[^\d.]/g, ''));
    return {
        name,
        price: Number.isFinite(priceNum) ? priceNum : (priceRaw || ''),
        image_url: image,
        category: itemCategory,
        sku,
        uploaded_at: new Date()
    };
};

window.renderStagingCatalogWidgets = () => {
    const canUse = window.canUseStagingCatalog();
    const importer = document.getElementById('stagingCatalogImporterWidget');
    const exporter = document.getElementById('stagingCatalogExportWidget');
    const parser = document.getElementById('stagingRawTextParserWidget');
    const master = document.getElementById('masterCatalogImporterWidget');
    const driveLinks = document.getElementById('masterCatalogDriveLinksWidget');
    if (importer) importer.classList.toggle('hidden', !canUse);
    if (exporter) exporter.classList.toggle('hidden', !canUse);
    if (parser) parser.classList.toggle('hidden', !canUse);
    if (master) master.classList.toggle('hidden', !canUse);
    if (driveLinks) driveLinks.classList.toggle('hidden', !canUse);
    if (typeof window.renderPharmacyIntakeWidget === 'function') window.renderPharmacyIntakeWidget();
};

const saveStagingCatalogItems = async (items) => {
    const colRef = window.collection(window.db, STAGING_CATALOGS_COLLECTION);
    let saved = 0;
    for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = window.writeBatch(window.db);
        chunk.forEach((item) => batch.set(window.doc(colRef), item));
        await batch.commit();
        saved += chunk.length;
    }
    return saved;
};

window.parseRawTextCatalog = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('تحليل النصوص متاح لإدخال البيانات فقط', false);
        return;
    }
    if (window._rawTextParsing) return;
    const textEl = document.getElementById('rawTextInput');
    const categoryEl = document.getElementById('rawTextCategory');
    const parseBtn = document.getElementById('rawTextParseBtn');
    const rawText = String((textEl && textEl.value) || '');
    const category = String((categoryEl && categoryEl.value) || '').trim();
    if (!rawText.trim()) {
        window.showToast('الصق النص الخام أولاً', false);
        return;
    }
    if (!category) {
        window.showToast('أدخل اسم الفئة', false);
        return;
    }
    const cleanText = rawText.replace(/\\"/g, '"');
    const unique = new Map();
    const addExtracted = (name, price, imageUrl) => {
        const trimmed = String(name || '').trim();
        if (!trimmed || unique.has(trimmed)) return;
        const numPrice = Number(price);
        unique.set(trimmed, {
            name: trimmed,
            name_ar: trimmed,
            name_en: trimmed,
            price: Number.isFinite(numPrice) ? numPrice : 0,
            image_url: String(imageUrl || '').trim(),
            category,
            sku: '',
            scraped_at: new Date(),
            uploaded_at: new Date()
        });
    };
    /* P1.7: the lazy `[\s\S]*?` scan is O(text) and stalls the main thread on big
       pastes, so run it in the worker; fall back to the inline regex otherwise. */
    let offloaded = null;
    if (window.kanjoExportWorker && typeof window.kanjoExportWorker.parseRawText === 'function') {
        offloaded = await window.kanjoExportWorker.parseRawText(cleanText, category);
    }
    if (Array.isArray(offloaded)) {
        offloaded.forEach((it) => addExtracted(it.name, it.price, it.imageUrl));
    } else {
        const regex = /"imageUrl"\s*:\s*"([^"]+)"[\s\S]*?"productName"\s*:\s*"([^"]+)"[\s\S]*?"sellingPrice"\s*:\s*([0-9.]+)/g;
        let match;
        while ((match = regex.exec(cleanText)) !== null) {
            addExtracted(match[2], parseFloat(match[3]), match[1]);
        }
    }
    const items = Array.from(unique.values());
    if (!items.length) {
        window.showToast('لم يتم العثور على منتجات في النص', false);
        return;
    }
    window._rawTextParsing = true;
    if (parseBtn) {
        parseBtn.disabled = true;
        parseBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري التحليل...';
    }
    try {
        const saved = await saveStagingCatalogItems(items);
        if (textEl) textEl.value = '';
        window.showToast('تم استخراج وحفظ ' + saved + ' منتج');
    } catch (err) {
        console.error('[staging] raw text parse failed:', err);
        window.showToast('فشل حفظ البيانات المستخرجة', false);
    } finally {
        window._rawTextParsing = false;
        if (parseBtn) {
            parseBtn.disabled = false;
            parseBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> تحليل وحفظ البيانات';
        }
    }
};

const readLocalJsonFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsText(file);
});

const masterCatalogDedupeKey = (item) => {
    const image = String((item && item.image_url) || '').trim().toLowerCase();
    if (image) return 'img:' + image;
    const name = String((item && item.name) || '').trim().toLowerCase();
    return name ? 'name:' + name : '';
};

const saveMasterCatalogItems = async (items) => {
    const colRef = window.collection(window.db, MASTER_CATALOG_COLLECTION);
    let saved = 0;
    for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = window.writeBatch(window.db);
        chunk.forEach((item) => {
            const kanjoId = String(item.id || item.kanjo_id || '').trim();
            const ref = kanjoId ? window.doc(window.db, MASTER_CATALOG_COLLECTION, kanjoId) : window.doc(colRef);
            batch.set(ref, item);
        });
        await batch.commit();
        saved += chunk.length;
        if (i + 400 < items.length) await delay(300);
    }
    return saved;
};

const clearMasterCatalogCollection = async () => {
    const snap = await window.getDocs(window.collection(window.db, MASTER_CATALOG_COLLECTION));
    const docs = [];
    snap.forEach((d) => docs.push(d));
    for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        const batch = window.writeBatch(window.db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        if (i + 400 < docs.length) await delay(300);
    }
    /* Bulk batch deletions cannot be intercepted by the single-doc delete hook,
       so the sweep is audited explicitly — deletions must never be invisible. */
    if (docs.length && typeof window.kanjoAuditDelete === 'function') {
        window.kanjoAuditDelete({
            collectionId: MASTER_CATALOG_COLLECTION,
            id: '',
            name: `${docs.length} عنصر`,
            description: `مسح الكتالوج الرئيسي بالكامل (${docs.length} عنصر)`
        });
    }
    return docs.length;
};

const parseCsvRecords = (text) => {
    const raw = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        const next = raw[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                cell += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',' || ch === ';') {
            row.push(cell);
            cell = '';
            continue;
        }
        if (ch === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }
        if (ch === '\r') continue;
        cell += ch;
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows[0].map((h) => String(h || '').trim().toLowerCase());
    const records = [];
    for (let r = 1; r < rows.length; r++) {
        const cols = rows[r];
        if (!cols.some((c) => String(c || '').trim())) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = cols[idx] == null ? '' : cols[idx]; });
        records.push(obj);
    }
    return records;
};

/* P1.7: off-thread parse helpers that fall back to the synchronous parsers
   when the worker is unavailable. */
const parseCsvRecordsAsync = async (text) => {
    if (window.kanjoExportWorker && typeof window.kanjoExportWorker.parseCsv === 'function') {
        const records = await window.kanjoExportWorker.parseCsv(text);
        if (Array.isArray(records)) return records;
    }
    return parseCsvRecords(text);
};

const parseJsonOffthread = (text) => {
    if (window.kanjoExportWorker && typeof window.kanjoExportWorker.parseJson === 'function') {
        return window.kanjoExportWorker.parseJson(text);
    }
    return Promise.resolve(JSON.parse(text));
};

const mapMasterCatalogCsvRow = (row, idx) => {
    const kanjoId = String(row.id || row.Id || row.ID || '').trim();
    const name = String(row.name || row.name_ar || '').trim();
    const priceRaw = row.price;
    const priceNum = Number(String(priceRaw == null ? '' : priceRaw).replace(/[^\d.]/g, ''));
    const csvImage = String(row.image_url || row.imageurl || '').trim();
    return {
        id: kanjoId,
        kanjo_id: kanjoId,
        name,
        price: Number.isFinite(priceNum) ? priceNum : (priceRaw || ''),
        image_url: csvImage,
        category: String(row.category || '').trim(),
        sku: String(row.sku || '').trim(),
        drive_folder: MASTER_CATALOG_DRIVE_FOLDER,
        source_row: idx + 2,
        uploaded_at: new Date()
    };
};

window.onMasterCatalogMigrateCsvChange = (event) => {
    const file = event && event.target && event.target.files && event.target.files[0];
    const label = document.getElementById('masterCatalogMigrateCsvName');
    if (label) label.textContent = file ? file.name : 'اختر ملف CSV (عمود Id)';
};

window.migrateMasterCatalogFromCsv = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('رفع الكتالوج متاح لإدخال البيانات فقط', false);
        return;
    }
    if (window._masterCatalogMigrating) return;
    const fileInput = document.getElementById('masterCatalogMigrateCsv');
    const migrateBtn = document.getElementById('masterCatalogMigrateBtn');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
        window.showToast('اختر ملف CSV أولاً', false);
        return;
    }
    const ok = window.confirm('سيتم مسح الكتالوج الرئيسي بالكامل واستبداله ببيانات الملف. هل تريد المتابعة؟');
    if (!ok) return;
    window._masterCatalogMigrating = true;
    if (migrateBtn) {
        migrateBtn.disabled = true;
        migrateBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الاستبدال...';
    }
    const report = { csvRows: 0, imported: 0, skipped: [], duplicates: [], cleared: 0, errors: [] };
    try {
        const text = await readLocalJsonFile(file);
        const records = await parseCsvRecordsAsync(text);
        if (!records.length) {
            window.showToast('ملف CSV فارغ أو غير صالح', false);
            return;
        }
        report.csvRows = records.length;
        const seenIds = new Set();
        const items = [];
        records.forEach((row, idx) => {
            const item = mapMasterCatalogCsvRow(row, idx);
            if (!item.id || !item.name) {
                report.skipped.push({ row: idx + 2, id: item.id, name: item.name, reason: !item.id ? 'missing_id' : 'missing_name' });
                return;
            }
            if (seenIds.has(item.id)) {
                report.duplicates.push({ row: idx + 2, id: item.id, name: item.name });
                return;
            }
            seenIds.add(item.id);
            items.push(item);
        });
        if (!items.length) {
            window.showToast('لا توجد صفوف صالحة في الملف', false);
            return;
        }
        report.cleared = await clearMasterCatalogCollection();
        report.imported = await saveMasterCatalogItems(items);
        window._masterCatalogCache = items.map((item) => hydrateMasterCatalogItem(item.id, item));
        console.log('[master-catalog-overwrite] imported', report.imported);
        if (report.skipped.length) console.warn('[master-catalog-overwrite] skipped rows', report.skipped);
        if (report.duplicates.length) console.warn('[master-catalog-overwrite] duplicate ids', report.duplicates);
        console.log('[master-catalog-overwrite] report', report);
        window.showToast('تم استبدال الكتالوج بـ ' + report.imported + ' منتج');
        if (fileInput) fileInput.value = '';
        const label = document.getElementById('masterCatalogMigrateCsvName');
        if (label) label.textContent = 'اختر ملف CSV (عمود Id)';
    } catch (err) {
        console.error('[master-catalog-overwrite] failed:', err);
        report.errors.push(String(err && err.message ? err.message : err));
        window.showToast('فشل استبدال الكتالوج الرئيسي', false);
    } finally {
        window._masterCatalogMigrating = false;
        if (migrateBtn) {
            migrateBtn.disabled = false;
            migrateBtn.innerHTML = '<i class="fa-solid fa-database"></i> استبدال الكتالوج بالكامل';
        }
        console.log('[master-catalog-overwrite] finished', report);
    }
};

window.onMasterCatalogDriveLinksCsvChange = (event) => {
    const file = event && event.target && event.target.files && event.target.files[0];
    const label = document.getElementById('masterCatalogDriveLinksCsvName');
    if (label) label.textContent = file ? file.name : 'اختر ملف CSV (Id, image_url)';
};

window.uploadMasterCatalogDriveLinks = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('رفع الروابط متاح لإدخال البيانات فقط', false);
        return;
    }
    if (window._masterCatalogDriveLinksUploading) return;
    const fileInput = document.getElementById('masterCatalogDriveLinksCsv');
    const btn = document.getElementById('masterCatalogDriveLinksBtn');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
        window.showToast('اختر ملف CSV أولاً', false);
        return;
    }
    window._masterCatalogDriveLinksUploading = true;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري التحديث...';
    }
    const report = { csvRows: 0, updated: 0, unmatched: [], skipped: [], duplicates: [], errors: [] };
    try {
        const text = await readLocalJsonFile(file);
        const records = await parseCsvRecordsAsync(text);
        if (!records.length) {
            window.showToast('ملف CSV فارغ أو غير صالح', false);
            return;
        }
        report.csvRows = records.length;
        const csvById = new Map();
        records.forEach((row, idx) => {
            const kanjoId = String(row.id || row.Id || row.ID || '').trim();
            const imageUrl = String(row.image_url || row.imageurl || row.url || '').trim();
            if (!kanjoId) {
                report.skipped.push({ row: idx + 2, reason: 'missing_id' });
                return;
            }
            if (!imageUrl) {
                report.skipped.push({ row: idx + 2, id: kanjoId, reason: 'missing_image_url' });
                return;
            }
            if (csvById.has(kanjoId)) {
                report.duplicates.push({ row: idx + 2, id: kanjoId });
                return;
            }
            csvById.set(kanjoId, { imageUrl, row: idx + 2 });
        });
        if (!csvById.size) {
            window.showToast('لا توجد صفوف صالحة في الملف', false);
            return;
        }
        const snap = await window.getDocs(window.collection(window.db, MASTER_CATALOG_COLLECTION));
        const matchedIds = new Set();
        const updates = [];
        snap.forEach((d) => {
            const data = d.data() || {};
            const kanjoId = String(data.id || data.kanjo_id || d.id || '').trim();
            const csvRow = csvById.get(kanjoId);
            if (!csvRow) return;
            matchedIds.add(kanjoId);
            if (data.image_url === csvRow.imageUrl) return;
            updates.push({
                ref: d.ref,
                payload: {
                    image_url: csvRow.imageUrl,
                    updated_at: new Date()
                }
            });
        });
        csvById.forEach((csvRow, kanjoId) => {
            if (!matchedIds.has(kanjoId)) report.unmatched.push({ row: csvRow.row, id: kanjoId });
        });
        for (let i = 0; i < updates.length; i += 400) {
            const chunk = updates.slice(i, i + 400);
            const batch = window.writeBatch(window.db);
            chunk.forEach((item) => batch.update(item.ref, item.payload));
            await batch.commit();
            report.updated += chunk.length;
            if (i + 400 < updates.length) await delay(300);
        }
        window._masterCatalogCache = [];
        console.log('[master-catalog-drive-links] updated', report.updated, 'of', report.csvRows, report);
        if (report.unmatched.length) console.warn('[master-catalog-drive-links] unmatched ids', report.unmatched);
        window.showToast('تم تحديث ' + report.updated + ' رابط صورة. غير المطابق: ' + report.unmatched.length);
        if (fileInput) fileInput.value = '';
        const label = document.getElementById('masterCatalogDriveLinksCsvName');
        if (label) label.textContent = 'اختر ملف CSV (Id, image_url)';
    } catch (err) {
        console.error('[master-catalog-drive-links] failed:', err);
        report.errors.push(String(err && err.message ? err.message : err));
        window.showToast('فشل تحديث روابط الصور من CSV', false);
    } finally {
        window._masterCatalogDriveLinksUploading = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> تحديث روابط الصور من CSV';
        }
        console.log('[master-catalog-drive-links] finished', report);
    }
};

window.onMasterCatalogFileChange = (event) => {
    const files = event && event.target && event.target.files ? Array.from(event.target.files) : [];
    const label = document.getElementById('masterCatalogFileName');
    if (!label) return;
    if (!files.length) {
        label.textContent = 'اختر ملفات JSON (يمكن اختيار أكثر من ملف)';
        return;
    }
    label.textContent = files.length === 1 ? files[0].name : (files.length + ' ملفات JSON');
};

window.processMasterCatalogJson = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('رفع الكتالوج الرئيسي متاح لإدخال البيانات فقط', false);
        return;
    }
    if (window._masterCatalogSaving) return;
    const fileInput = document.getElementById('masterCatalogFile');
    const categoryEl = document.getElementById('masterCatalogCategory');
    const saveBtn = document.getElementById('masterCatalogSaveBtn');
    const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    const category = String((categoryEl && categoryEl.value) || '').trim();
    if (!files.length) {
        window.showToast('اختر ملفات JSON أولاً', false);
        return;
    }
    if (!category) {
        window.showToast('أدخل اسم الفئة', false);
        return;
    }
    window._masterCatalogSaving = true;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري المعالجة...';
    }
    try {
        const combined = [];
        for (let i = 0; i < files.length; i++) {
            const text = await readLocalJsonFile(files[i]);
            let parsed;
            try {
                parsed = await parseJsonOffthread(text);
            } catch (_) {
                window.showToast('ملف JSON غير صالح: ' + files[i].name, false);
                return;
            }
            extractStagingCatalogArray(parsed)
                .map((item) => mapStagingCatalogItem(item, category))
                .filter((item) => item.name)
                .forEach((item) => combined.push(item));
        }
        const uniqueIncoming = new Map();
        combined.forEach((item) => {
            const key = masterCatalogDedupeKey(item);
            if (!key || uniqueIncoming.has(key)) return;
            uniqueIncoming.set(key, item);
        });
        const existingSnap = await window.getDocs(window.collection(window.db, MASTER_CATALOG_COLLECTION));
        const existingKeys = new Set();
        existingSnap.forEach((d) => {
            const data = d.data() || {};
            const key = masterCatalogDedupeKey(data);
            if (key) existingKeys.add(key);
        });
        const items = [];
        uniqueIncoming.forEach((item, key) => {
            if (existingKeys.has(key)) return;
            items.push({
                name: item.name,
                price: item.price,
                image_url: item.image_url,
                category: item.category || category,
                sku: item.sku || '',
                uploaded_at: new Date(),
                drive_folder: MASTER_CATALOG_DRIVE_FOLDER,
                source_files: files.map((f) => f.name)
            });
        });
        if (!items.length) {
            window.showToast('لا توجد منتجات جديدة للإلحاق', false);
            return;
        }
        const saved = await saveMasterCatalogItems(items);
        window.showToast('تم إلحاق ' + saved + ' منتج فريد في الكتالوج الرئيسي');
        if (fileInput) fileInput.value = '';
        const label = document.getElementById('masterCatalogFileName');
        if (label) label.textContent = 'اختر ملفات JSON (يمكن اختيار أكثر من ملف)';
    } catch (err) {
        console.error('[master] import failed:', err);
        window.showToast('فشل حفظ الكتالوج الرئيسي', false);
    } finally {
        window._masterCatalogSaving = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> معالجة وإلحاق البيانات';
        }
    }
};

window.onStagingCatalogFileChange = (event) => {
    const file = event && event.target && event.target.files && event.target.files[0];
    const label = document.getElementById('stagingCatalogFileName');
    if (label) label.textContent = file ? file.name : 'اختر ملف JSON';
};

window.processStagingCatalogJson = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('رفع الكتالوج متاح لإدخال البيانات فقط', false);
        return;
    }
    if (window._stagingCatalogSaving) return;
    const fileInput = document.getElementById('stagingCatalogFile');
    const categoryEl = document.getElementById('stagingCatalogCategory');
    const saveBtn = document.getElementById('stagingCatalogSaveBtn');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const category = String((categoryEl && categoryEl.value) || '').trim();
    if (!file) {
        window.showToast('اختر ملف JSON أولاً', false);
        return;
    }
    if (!category) {
        window.showToast('أدخل اسم الفئة', false);
        return;
    }
    window._stagingCatalogSaving = true;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري المعالجة...';
    }
    try {
        const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
            reader.readAsText(file);
        });
        let parsed;
        try {
            parsed = await parseJsonOffthread(text);
        } catch (_) {
            window.showToast('ملف JSON غير صالح', false);
            return;
        }
        const items = extractStagingCatalogArray(parsed)
            .map((item) => mapStagingCatalogItem(item, category))
            .filter((item) => item.name);
        if (!items.length) {
            window.showToast('لا توجد عناصر صالحة في الملف', false);
            return;
        }
        const saved = await saveStagingCatalogItems(items);
        window.showToast('تم حفظ ' + saved + ' منتج في البيانات المرحلية');
        if (fileInput) fileInput.value = '';
        const label = document.getElementById('stagingCatalogFileName');
        if (label) label.textContent = 'اختر ملف JSON';
    } catch (err) {
        console.error('[staging] import failed:', err);
        window.showToast('فشل حفظ بيانات الكتالوج', false);
    } finally {
        window._stagingCatalogSaving = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> معالجة وحفظ البيانات';
        }
    }
};

window.exportStagingCatalogs = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('تصدير البيانات المرحلية متاح لإدخال البيانات فقط', false);
        return;
    }
    try {
        const snap = await window.getDocs(window.collection(window.db, STAGING_CATALOGS_COLLECTION));
        const rows = [];
        snap.forEach((d) => {
            const data = d.data() || {};
            const uploaded = data.uploaded_at && data.uploaded_at.toDate ? data.uploaded_at.toDate() : data.uploaded_at;
            rows.push({
                name: data.name || '',
                price: data.price == null ? '' : data.price,
                image_url: data.image_url || '',
                category: data.category || '',
                sku: data.sku || '',
                uploaded_at: uploaded ? new Date(uploaded).toISOString() : ''
            });
        });
        if (!rows.length) return window.showToast('لا توجد بيانات مرحلية للتصدير', false);
        downloadGenericKanjoCsv(STAGING_EXPORT_COLUMNS, rows, 'Kanjo_Staging_Catalogs_' + new Date().toISOString().slice(0, 10) + '.csv');
        window.showToast('تم تصدير البيانات المرحلية بنجاح');
    } catch (err) {
        console.error('[staging] export failed:', err);
        window.showToast('فشل تصدير البيانات المرحلية', false);
    }
};

window.clearStagingCatalogs = async () => {
    if (!window.canUseStagingCatalog()) {
        if (window.showToast) window.showToast('مسح البيانات المرحلية متاح لإدخال البيانات فقط', false);
        return;
    }
    if (window._stagingCatalogClearing) return;
    const ok = window.confirm('هل أنت متأكد من مسح جميع البيانات المرحلية؟ لا يمكن التراجع عن هذا الإجراء.');
    if (!ok) return;
    const clearBtn = document.getElementById('stagingCatalogClearBtn');
    window._stagingCatalogClearing = true;
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري المسح...';
    }
    window.showToast('جاري مسح البيانات...');
    try {
        const snap = await window.getDocs(window.collection(window.db, STAGING_CATALOGS_COLLECTION));
        const docs = [];
        snap.forEach((d) => docs.push(d));
        for (let i = 0; i < docs.length; i += 400) {
            const chunk = docs.slice(i, i + 400);
            const batch = window.writeBatch(window.db);
            chunk.forEach((d) => batch.delete(d.ref));
            await batch.commit();
        }
        /* Bulk batch deletions bypass the single-doc hook; audit the sweep. */
        if (docs.length && typeof window.kanjoAuditDelete === 'function') {
            window.kanjoAuditDelete({
                collectionId: STAGING_CATALOGS_COLLECTION,
                id: '',
                name: `${docs.length} عنصر`,
                description: `مسح الكتالوج المرحلي بالكامل (${docs.length} عنصر)`
            });
        }
        window.showToast('تم مسح جميع البيانات بنجاح.');
    } catch (err) {
        console.error('[staging] clear failed:', err);
        window.showToast('فشل مسح البيانات المرحلية', false);
    } finally {
        window._stagingCatalogClearing = false;
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> مسح جميع البيانات';
        }
    }
};

window.addEventListener('keydown', (ev) => {
    const lightbox = document.getElementById('imageLightbox');
    if (ev.key === 'Escape' && lightbox && !lightbox.classList.contains('hidden')) {
        window.closeImageLightbox();
        return;
    }
    const detailsModal = document.getElementById('catalogProductDetailsModal');
    if (ev.key === 'Escape' && detailsModal && !detailsModal.classList.contains('hidden')) {
        window.closeCatalogProductDetails();
        return;
    }
    const searchModal = document.getElementById('masterCatalogSearchModal');
    if (ev.key === 'Escape' && searchModal && !searchModal.classList.contains('hidden')) {
        window.closeMasterCatalogSearchModal();
        return;
    }
    const modal = document.getElementById('catalogProductModal');
    if (ev.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        window.requestCloseCatalogProductModal();
    }
});

/* Read-only integration surface for the isolated vendor-template filler
   (services/templateExport.js). These are references to existing helpers only —
   no behaviour changes, no new Firestore reads, no touched export routes. */
 window.KanjoCatalogExportAPI = {
    buildExportRows: (evaluations, selections, variantEntries, options) => kanjoBuildExportRows(evaluations, selections, variantEntries, options),
    matchProductCategory: (product, vendorType) => kanjoMatchProductCategory(product, vendorType),
    withNormalizedText: (product) => kanjoWithNormalizedText(product),
    fetchAllProducts: () => fetchAllCatalogProductsForExport(),
    fetchDoneProducts: () => fetchDoneCatalogProducts(),
    merchantNameOf: (product) => catalogProductMerchantName(product),
    resolveVendorType: (vendorType) => kanjoQemaResolveVendorType(vendorType),
    fuzzyLevenshtein: (a, b) => kanjoFuzzyLevenshtein(a, b),
    fuzzySimilarity: (a, b) => kanjoFuzzySimilarity(a, b),
    fuzzyBest: (query, candidates, opts) => kanjoFuzzyBest(query, candidates, opts),
    fuzzyMatchVariants: (unmapped) => kanjoFuzzyMatchVariants(unmapped),
    resolveFuzzyVariantIssues: (unmapped) => kanjoResolveFuzzyVariantIssues(unmapped),
    injectVariantFixes: (evaluations, injections) => kanjoInjectVariantFixes(evaluations, injections),
    settleUnmappedVariants: (evaluations) => kanjoSettleUnmappedVariants(evaluations),
    unmappedVariants: (evaluations) => kanjoQemaUnmappedVariants(evaluations)
};
