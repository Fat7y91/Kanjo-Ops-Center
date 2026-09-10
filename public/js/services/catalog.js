/* Kanjo Ops — Product Cataloging Pipeline */

const CATALOG_COLLECTION = 'merchant_products';
const CATALOG_GAS_URL = 'https://script.google.com/macros/s/AKfycbzWid4xw-1Vo4y3gNwUPSs9SYYYVEZMVCZyeilNiNyRCkgfLWSjj9s3WmpvX1G4Octv/exec';
const CATALOG_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const CATALOG_DRAFTS_KEY = 'kanjo_drafts';

window.merchantProductsCache = window.merchantProductsCache || [];
window.repCatalogProductsCache = window.repCatalogProductsCache || [];
window.catalogDeleteRequestsCache = window.catalogDeleteRequestsCache || [];
window.allCatalogProductsCache = window.allCatalogProductsCache || [];
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

window.canViewAllCatalogProducts = () => !!(window.isCatalogFounderUser() || window.isMahmoudUser());

window.isDataEntryUser = () => !!(window.currentUser && window.currentUser.role === 'data_entry');

window.canUseStagingCatalog = () => !!(window.isDataEntryUser() || window.isCatalogFounderUser() || window.isMahmoudUser());

const CATALOG_EXPORT_COLUMNS = [
    'product_key',
    'product_type',
    'sku',
    'name_en',
    'name_ar',
    'description_en',
    'description_ar',
    'base_price',
    'main_image_url',
    'category',
    'status'
];

const catalogScriptUrl = () => (window.KANJO_CATALOG_SCRIPT_URL || CATALOG_GAS_URL || '').trim();

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

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
});

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

const compressCatalogImage = async (file) => {
    try {
        return await compressImage(file, 1000, 0.7);
    } catch (_) {
        return fileToBase64(file);
    }
};

const catalogJpegFileName = (name, fallback) => {
    const base = String(name || fallback || 'image').replace(/\.[^.]+$/, '');
    return (base || fallback || 'image') + '.jpg';
};

async function uploadCatalogImageToGas(base64Data, fileName, merchantName, imageType) {
    const GAS_URL = catalogScriptUrl() || CATALOG_GAS_URL;
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
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            redirect: 'follow',
            body: payload
        });
        const result = await response.json();
        if (result.status === 'success') {
            const directUrl = catalogDriveViewUrl(result.id || result.url);
            if (directUrl) return directUrl;
            throw new Error(result.message || 'GAS API Error');
        }
        throw new Error(result.message || 'GAS API Error');
    } catch (error) {
        console.error('GAS Upload Failed:', error);
        throw error;
    }
}

const listFinalizedMerchants = () => {
    const map = new Map();
    const teamFilter = (window.currentUser && window.currentUser.role === 'rep') ? window.currentUser.team : null;
    const taskSource = (window.allTasksCache && window.allTasksCache.length)
        ? window.allTasksCache
        : Array.from((window.tasksMemory || new Map()).values());
    taskSource.forEach((t) => {
        if (teamFilter && t.team !== teamFilter) return;
        const achieved = Number(t.achieved) || 0;
        if (!t.isSigned || achieved <= 0) return;
        const baseName = window.getBaseName ? window.getBaseName(t.name) : String(t.name || '');
        if (!baseName) return;
        if (map.has(baseName)) return;
        const mid = (window.findMerchantIdForBase && window.findMerchantIdForBase(baseName)) || t.merchantId || baseName;
        const rec = window.merchantsById && window.merchantsById.get(mid);
        const recCat = rec && String(rec.cat || rec.category || '').trim();
        const taskCat = (t.cat && t.cat !== 'متابعة' && t.cat !== 'متابعه') ? t.cat : '';
        const cat = ((recCat && recCat !== 'متابعة' && recCat !== 'متابعه') ? recCat : '') || taskCat;
        map.set(baseName, {
            merchantId: mid,
            merchantName: baseName,
            category: cat,
            team: t.team || ''
        });
    });
    return Array.from(map.values()).sort((a, b) => String(a.merchantName).localeCompare(String(b.merchantName), 'ar'));
};

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

const downloadKanjoCsv = (rows, fileName) => {
    const headersString = formatCsvRow(CATALOG_EXPORT_COLUMNS);
    const rowsString = rows.map((row) => formatCsvRow(CATALOG_EXPORT_COLUMNS.map((col) => row[col]))).join('\r\n');
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

const getCatalogEnhancedLocal = (productId, length) => {
    const store = window._catalogEnhancedUploads || {};
    const current = Array.isArray(store[productId]) ? store[productId].slice() : [];
    while (current.length < length) current.push('');
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
    main_image_url: catalogEnhancedImageUrls(p)[0] || '',
    category: p.category || '',
    status: 'active'
});

let catalogVariationSeq = 0;

window.addCatalogVariationRow = (name, price) => {
    const list = document.getElementById('catalogVariationsList');
    if (!list) return;
    const id = 'catalogVar-' + (++catalogVariationSeq);
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center catalog-variation-row';
    row.id = id;
    row.innerHTML = `<input type="text" class="catalog-variation-name flex-1 min-w-0 p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-[#230535]" placeholder="الحجم (وسط، كبير) / اللون" value="${catalogEscapeHtml(name || '')}">
        <input type="number" min="0" step="0.01" class="catalog-variation-price w-28 p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-[#230535]" placeholder="السعر" value="${catalogEscapeHtml(price == null ? '' : price)}">
        <button type="button" onclick="removeCatalogVariationRow('${id}')" class="shrink-0 w-10 h-10 rounded-xl bg-red-50 text-red-500 font-black hover:bg-red-100">×</button>`;
    list.appendChild(row);
};

window.removeCatalogVariationRow = (id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
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
};

const resetCatalogVariations = () => {
    const list = document.getElementById('catalogVariationsList');
    if (list) list.innerHTML = '';
    catalogVariationSeq = 0;
    window.onCatalogProductTypeChange();
};

const collectCatalogVariations = () => {
    const rows = document.querySelectorAll('#catalogVariationsList .catalog-variation-row');
    const items = [];
    rows.forEach((row) => {
        const name = String((row.querySelector('.catalog-variation-name') || {}).value || '').trim();
        const priceRaw = String((row.querySelector('.catalog-variation-price') || {}).value || '').trim();
        items.push({ name, priceRaw, price: Number(priceRaw) });
    });
    return items;
};

const fillCatalogMerchantOptions = (extraMerchant) => {
    const select = document.getElementById('catalogMerchantSelect');
    if (!select) return;
    const merchants = listFinalizedMerchants();
    window._catalogMerchantMap = {};
    merchants.forEach((m) => { window._catalogMerchantMap[m.merchantId] = m; });
    if (extraMerchant && extraMerchant.merchantId && !window._catalogMerchantMap[extraMerchant.merchantId]) {
        merchants.unshift(extraMerchant);
        window._catalogMerchantMap[extraMerchant.merchantId] = extraMerchant;
    }
    if (merchants.length === 0) {
        select.innerHTML = '<option value="">لا يوجد تجار باتفاق نهائي</option>';
        return;
    }
    select.innerHTML = '<option value="">اختر التاجر...</option>' + merchants.map((m) => {
        const id = catalogEscapeHtml(m.merchantId);
        const name = catalogEscapeHtml(m.merchantName);
        return `<option value="${id}">${name}</option>`;
    }).join('');
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

const catalogClickableThumbHtml = (p) => {
    const thumb = catalogEscapeHtml(catalogProductThumbUrl(p));
    const full = catalogEscapeHtml(catalogProductLightboxUrl(p));
    if (!thumb || !full) {
        return `<div class="w-16 h-16 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image"></i></div>`;
    }
    return `<img src="${thumb}" data-full-img="${full}" alt="" class="w-16 h-16 rounded-xl object-cover border border-[#230535]/15 shrink-0 cursor-pointer" onclick="openImageLightbox(this)" onerror="this.style.display='none'">`;
};

window.openImageLightbox = (el) => {
    if (el && typeof el.stopPropagation === 'function') el.stopPropagation();
    const node = (el && el.getAttribute) ? el : null;
    const url = node ? String(node.getAttribute('data-full-img') || '').trim() : '';
    if (!url) return;
    const overlay = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    if (!overlay || !img) return;
    img.removeAttribute('hidden');
    img.style.display = 'block';
    img.src = url;
    overlay.classList.remove('hidden');
};

window.closeImageLightbox = () => {
    const overlay = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    if (overlay) overlay.classList.add('hidden');
    if (img) img.src = '';
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
        const thumb = catalogEscapeHtml(catalogDriveThumbnailUrl(u) || u);
        const full = catalogEscapeHtml(u);
        return `<img src="${thumb}" data-full="${full}" alt="صورة محفوظة" class="w-20 h-20 rounded-xl object-cover border-2 border-[#230535]/25 shadow-sm" onerror="this.src=this.dataset.full">`;
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
};

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
    const isRep = window.isCatalogRepUser();
    let count = 0;
    try {
        const drafts = await readCatalogDrafts();
        count = drafts.length;
    } catch (err) {
        console.error('[catalog] drafts read failed:', err);
    }
    widget.classList.toggle('hidden', !isRep);
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
    }
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl) typeEl.value = 'simple';
    resetCatalogImageState();
    resetCatalogVariations();
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
    return vars.some((v) => v.name || v.priceRaw);
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
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    resetCatalogEditState();
    fillCatalogMerchantOptions();
    clearCatalogProductFields(false);
    setCatalogModalChrome();
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCatalogProductModal = () => {
    window.stopCatalogBarcodeScan();
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
    const productType = String((document.getElementById('catalogProductType') || {}).value || 'simple').trim() || 'simple';
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
            variations.push({ name: v.name, price: v.price });
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
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    if (window._catalogEditingProduct) {
        await updateCatalogProductDirect();
        return;
    }
    const closeAfterSave = !!(options && options.closeAfterSave);
    window._catalogDraftSaving = true;
    setCatalogSubmitBusy(true, '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الحفظ في المسودة...');
    try {
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
    const productType = String((document.getElementById('catalogProductType') || {}).value || 'simple').trim() || 'simple';
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
            variations.push({ name: v.name, price: v.price });
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
            if (nameNeedsTranslation) nameEn = translatedName;
            if (descNeedsTranslation) descriptionEn = translatedDesc;
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
        const payload = {
            merchantId: form.merchant.merchantId,
            merchantName: form.merchant.merchantName,
            name_ar: form.nameAr,
            name_en: nameEn,
            description_ar: form.descriptionAr,
            description_en: descriptionEn,
            sku: form.sku,
            product_type: form.productType,
            base_price: form.basePrice,
            category: form.category,
            rawImageUrl,
            rawImageUrls,
            updatedAt: new Date(),
            updatedBy: (window.currentUser && window.currentUser.name) || ''
        };
        if (form.productType === 'variable') payload.variations = form.variations;
        else payload.variations = [];
        if (form.files.length) {
            payload.enhancedImageUrl = '';
            payload.enhancedImageUrls = [];
            payload.status = 'pending';
        }
        await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, editing.id), payload);
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
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    const product = (window.repCatalogProductsCache || []).find((p) => p.id === productId)
        || (window.merchantProductsCache || []).find((p) => p.id === productId);
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
    const nameEl = document.getElementById('catalogNameAr');
    if (nameEl) nameEl.value = product.name_ar || '';
    const descEl = document.getElementById('catalogDescriptionAr');
    if (descEl) descEl.value = product.description_ar || '';
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
        if (vars.length) vars.forEach((v) => window.addCatalogVariationRow(v.name, v.price));
        else window.addCatalogVariationRow();
        window.onCatalogProductTypeChange();
    }
    renderCatalogSavedImages(product);
    setCatalogModalChrome();
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
    if (willOpen) renderCatalogMyProductsList();
};

const renderCatalogMyProductsList = () => {
    const list = document.getElementById('catalogMyProductsList');
    const countEl = document.getElementById('catalogMyProductsCount');
    const products = window.repCatalogProductsCache || [];
    if (countEl) countEl.textContent = String(products.length);
    if (!list) return;
    if (!products.length) {
        list.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-box-open text-3xl text-[#230535]/30 mb-2"></i><div>لا توجد منتجات مرفوعة بعد</div></div>';
        return;
    }
    list.innerHTML = products.map((p) => {
        const id = catalogEscapeHtml(p.id);
        const name = catalogEscapeHtml(p.name_ar || 'بدون اسم');
        const merchant = catalogEscapeHtml(p.merchantName || '');
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
                <div class="text-[11px] font-bold text-slate-500 truncate">${merchant}</div>
                <div class="flex flex-wrap gap-1.5 mt-1">
                    <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                    <span class="text-[10px] font-black ${statusClass} px-2 py-0.5 rounded-full">${status}</span>
                </div>
            </div>
            ${actions}
        </div>`;
    }).join('');
};

window.renderCatalogMyProductsWidget = () => {
    const widget = document.getElementById('catalogMyProductsWidget');
    if (!widget) return;
    const isRep = window.isCatalogRepUser();
    widget.classList.toggle('hidden', !isRep);
    const countEl = document.getElementById('catalogMyProductsCount');
    if (countEl) countEl.textContent = String((window.repCatalogProductsCache || []).length);
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
    if (willOpen) renderCatalogAllProductsList();
};

const renderCatalogAllProductsList = () => {
    const list = document.getElementById('catalogAllProductsList');
    const countEl = document.getElementById('catalogAllProductsCount');
    const products = window.allCatalogProductsCache || [];
    if (countEl) countEl.textContent = String(products.length);
    if (!list) return;
    if (!products.length) {
        list.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-box-open text-3xl text-[#230535]/30 mb-2"></i><div>لا توجد منتجات مرفوعة بعد</div></div>';
        return;
    }
    list.innerHTML = products.map((p) => {
        const name = catalogEscapeHtml(p.name_ar || 'بدون اسم');
        const merchant = catalogEscapeHtml(p.merchantName || '');
        const price = catalogEscapeHtml(p.base_price == null ? '' : p.base_price);
        const repName = catalogEscapeHtml(p.createdBy || p.deleteRequestedBy || '');
        const status = String(p.status || '') === 'done' ? 'مكتمل' : 'قيد المعالجة';
        const statusClass = String(p.status || '') === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
        const thumbHtml = catalogClickableThumbHtml(p);
        return `<div class="bg-white border border-purple-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
            ${thumbHtml}
            <div class="min-w-0 flex-1">
                <div class="font-black text-sm text-[#230535] truncate">${name}</div>
                <div class="text-[11px] font-bold text-slate-500 truncate">${merchant}</div>
                <div class="flex flex-wrap gap-1.5 mt-1">
                    <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                    ${repName ? `<span class="text-[10px] font-black bg-[#230535]/10 text-[#230535] px-2 py-0.5 rounded-full">${repName}</span>` : ''}
                    <span class="text-[10px] font-black ${statusClass} px-2 py-0.5 rounded-full">${status}</span>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.renderCatalogAllProductsWidget = () => {
    const widget = document.getElementById('catalogAllProductsWidget');
    if (!widget) return;
    const canView = window.canViewAllCatalogProducts();
    widget.classList.toggle('hidden', !canView);
    const countEl = document.getElementById('catalogAllProductsCount');
    if (countEl) countEl.textContent = String((window.allCatalogProductsCache || []).length);
    const body = document.getElementById('catalogAllProductsBody');
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
        await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), {
            deleteRequested: true,
            deleteRequestedAt: new Date(),
            deleteRequestedBy: (window.currentUser && window.currentUser.name) || ''
        });
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
    if (willOpen) renderCatalogDeleteRequestsList();
};

const renderCatalogDeleteRequestsList = () => {
    const list = document.getElementById('catalogDeleteRequestsList');
    const countEl = document.getElementById('catalogDeleteRequestsCount');
    const products = window.catalogDeleteRequestsCache || [];
    if (countEl) countEl.textContent = String(products.length);
    if (!list) return;
    if (!products.length) {
        list.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i><div>لا توجد طلبات حذف معلقة</div></div>';
        return;
    }
    list.innerHTML = products.map((p) => {
        const id = catalogEscapeHtml(p.id);
        const name = catalogEscapeHtml(p.name_ar || 'بدون اسم');
        const merchant = catalogEscapeHtml(p.merchantName || '');
        const price = catalogEscapeHtml(p.base_price == null ? '' : p.base_price);
        const requestedBy = catalogEscapeHtml(p.deleteRequestedBy || p.createdBy || '');
        const thumb = catalogEscapeHtml(catalogProductThumbUrl(p));
        const thumbHtml = thumb
            ? `<img src="${thumb}" alt="" class="w-16 h-16 rounded-xl object-cover border border-[#230535]/15 shrink-0" onerror="this.style.display='none'">`
            : `<div class="w-16 h-16 rounded-xl grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image"></i></div>`;
        return `<div class="bg-white border border-red-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
            ${thumbHtml}
            <div class="min-w-0 flex-1">
                <div class="font-black text-sm text-[#230535] truncate">${name}</div>
                <div class="text-[11px] font-bold text-slate-500 truncate">${merchant}</div>
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
    }).join('');
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
    if (countEl) countEl.textContent = String((window.catalogDeleteRequestsCache || []).length);
    const body = document.getElementById('catalogDeleteRequestsBody');
    if (body && !body.classList.contains('hidden')) renderCatalogDeleteRequestsList();
};

window.approveCatalogProductDeletion = async (productId) => {
    if (!window.isMahmoudUser()) {
        if (window.showToast) window.showToast('الموافقة على الحذف متاحة لمحمود فقط', false);
        return;
    }
    const ok = window.confirm('سيتم حذف المنتج نهائياً. هل أنت متأكد؟');
    if (!ok) return;
    try {
        await window.deleteDoc(window.doc(window.db, CATALOG_COLLECTION, productId));
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
        const patch = {
            deleteRequestedAt: window.deleteField ? window.deleteField() : null,
            deleteRequestedBy: window.deleteField ? window.deleteField() : null
        };
        if (window.deleteField) patch.deleteRequested = window.deleteField();
        else patch.deleteRequested = false;
        await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), patch);
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

const translateViaGoogle = async (text) => {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=' + encodeURIComponent(text);
    const response = await fetch(url);
    if (!response.ok) throw new Error('GOOGLE_TRANSLATE_HTTP_' + response.status);
    return parseGoogleTranslateResponse(await response.json());
};

const translateViaMyMemory = async (text) => {
    const url = 'https://api.mymemory.translated.net/get?langpair=ar|en&q=' + encodeURIComponent(text);
    const response = await fetch(url);
    if (!response.ok) throw new Error('MYMEMORY_HTTP_' + response.status);
    const data = await response.json();
    return String((data && data.responseData && data.responseData.translatedText) || '').trim();
};

const translateArToEn = async (arabicText) => {
    const text = String(arabicText || '').trim();
    if (!text) return '';
    const attempts = [translateViaGoogle, translateViaGoogle, translateViaMyMemory];
    for (let i = 0; i < attempts.length; i++) {
        try {
            const translated = String(await attempts[i](text) || '').trim();
            if (!translated) continue;
            if (translated === text) continue;
            if (catalogHasArabicScript(translated)) continue;
            return translated;
        } catch (err) {
            console.error('[catalog] translate attempt failed:', err);
        }
    }
    return '';
};

const catalogEnhanceTargetCount = (product) => {
    const rawCount = catalogRawImageUrls(product).length;
    return rawCount > 0 ? rawCount : 1;
};

const syncOneCatalogDraft = async (draft) => {
    const nameAr = String((draft && draft.name_ar) || '').trim();
    const descriptionAr = String((draft && draft.description_ar) || '').trim();
    await delay(1500);
    const nameEn = await translateArToEn(nameAr);
    await delay(1500);
    const descriptionEn = await translateArToEn(descriptionAr);
    const images = Array.isArray(draft && draft.images) ? draft.images : [];
    const rawImageUrls = [];
    for (let i = 0; i < images.length; i++) {
        const img = images[i] || {};
        if (!img.base64) continue;
        const uploadedUrl = await uploadCatalogImageToGas(
            img.base64,
            img.fileName || catalogJpegFileName('', 'product-raw-' + (i + 1)),
            (draft && draft.merchantName) || 'Unknown',
            'raw'
        );
        rawImageUrls.push(uploadedUrl);
    }
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
        payload.variations = draft.variations;
    }
    await window.addDoc(window.collection(window.db, CATALOG_COLLECTION), payload);
};

window.syncAllCatalogDrafts = async () => {
    if (window._catalogSyncing) return;
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
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
        let done = 0;
        for (const draft of drafts) {
            setSyncLabel(done, drafts.length);
            try {
                await syncOneCatalogDraft(draft);
                uploaded++;
            } catch (err) {
                console.error('[catalog] draft sync failed:', err);
                remaining.push(draft);
            }
            done++;
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
    }
};

window.downloadCatalogRawImage = (productId, imageIndex) => {
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId);
    const urls = catalogRawImageUrls(product);
    const idx = Number(imageIndex) || 0;
    const url = catalogDriveDownloadUrl(urls[idx] || urls[0]);
    if (!url) return window.showToast('لا يوجد رابط للصورة الأصلية', false);
    window.open(url, '_blank', 'noopener');
};

window.triggerCatalogEnhancedSlot = (productId, imageIndex) => {
    if (!window.isCatalogContentUser()) {
        if (window.showToast) window.showToast('رفع الصورة المحسّنة متاح لفريق المحتوى فقط', false);
        return;
    }
    const input = document.getElementById('catalogEnhanceInput-' + productId + '-' + imageIndex);
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
    const remaining = (window.merchantProductsCache || []).filter((p) => p.id !== productId && p.status === 'pending');
    const countEl = document.getElementById('catalogPendingCount');
    if (countEl) countEl.textContent = String(remaining.length);
    const list = document.getElementById('catalogPendingList');
    if (list && remaining.length === 0) markCatalogPendingEmpty(list);
};

const completeCatalogProductIfReady = async (productId, product, enhancedUrls, rawCount) => {
    const filled = enhancedUrls.filter(Boolean);
    if (filled.length !== rawCount) return false;
    await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), {
        enhancedImageUrl: filled[0] || '',
        enhancedImageUrls: enhancedUrls.slice(0, rawCount),
        status: 'done',
        updatedAt: new Date(),
        updatedBy: (window.currentUser && window.currentUser.name) || ''
    });
    delete window._catalogEnhancedUploads[productId];
    removeCatalogPendingProductFromUi(productId, (product && product.merchantName) || '');
    window.showToast('تم اعتماد المنتج بعد رفع كل الصور المحسّنة');
    return true;
};

window.handleCatalogEnhancedFile = async (event, productId, imageIndex) => {
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
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId);
    if (!product) {
        window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    const rawUrls = catalogRawImageUrls(product);
    const targetCount = catalogEnhanceTargetCount(product);
    const idx = Number(imageIndex) || 0;
    const slotBtn = document.getElementById('catalogEnhanceBtn-' + productId + '-' + idx);
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
        const enhancedUrls = getCatalogEnhancedLocal(productId, targetCount);
        enhancedUrls[idx] = uploadedUrl;
        window._catalogEnhancedUploads[productId] = enhancedUrls;
        const done = await completeCatalogProductIfReady(productId, product, enhancedUrls, targetCount);
        if (!done) {
            window.showToast('تم رفع الصورة المحسّنة (' + enhancedUrls.filter(Boolean).length + '/' + rawUrls.length + ')');
            renderCatalogPendingCards();
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

window.toggleCatalogMerchantAccordion = (domId) => {
    const accordion = document.getElementById('catalogMerchantAccordion-' + String(domId || ''));
    if (!accordion) return;
    const body = accordion.querySelector('[data-catalog-merchant-body]');
    const chevron = accordion.querySelector('[data-catalog-merchant-chevron]');
    if (!body) return;
    const merchantName = accordion.getAttribute('data-catalog-merchant') || '';
    const openMap = window._catalogPendingOpenMerchants || {};
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    if (willOpen) openMap[merchantName] = true;
    else delete openMap[merchantName];
    window._catalogPendingOpenMerchants = openMap;
};

const renderCatalogPendingProductCard = (p) => {
    const id = catalogEscapeHtml(p.id);
    const name = catalogEscapeHtml(p.name_ar);
    const category = catalogEscapeHtml(p.category);
    const price = catalogEscapeHtml(p.base_price);
    const rawUrls = catalogRawImageUrls(p);
    const targetCount = catalogEnhanceTargetCount(p);
    const enhancedUrls = getCatalogEnhancedLocal(p.id, targetCount);
    const doneCount = enhancedUrls.filter(Boolean).length;
    const noRawImages = rawUrls.length === 0;
    const slots = (noRawImages ? [''] : rawUrls).map((u, i) => {
        const thumb = u ? catalogEscapeHtml(catalogDriveThumbnailUrl(u) || u) : '';
        const done = !!enhancedUrls[i];
        const status = done
            ? '<span class="text-[10px] font-black text-emerald-600 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> تم</span>'
            : `<button type="button" id="catalogEnhanceBtn-${id}-${i}" onclick="triggerCatalogEnhancedSlot('${id}', ${i})" class="bg-[#230535] text-[#FFD700] px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:opacity-90 transition flex items-center justify-center gap-1">
                <i class="fa-solid fa-wand-magic-sparkles"></i> ${noRawImages ? 'رفع صورة المنتج' : 'رفع المحسّنة'}
            </button>
            <input type="file" id="catalogEnhanceInput-${id}-${i}" accept="image/*" class="hidden" onchange="handleCatalogEnhancedFile(event, '${id}', ${i})">`;
        const thumbHtml = thumb
            ? `<img src="${thumb}" alt="" class="w-14 h-14 rounded-lg object-cover border border-[#FFD700]/40 shrink-0" onerror="this.style.display='none'">`
            : `<div class="w-14 h-14 rounded-lg grid place-items-center text-slate-400 bg-slate-100 border border-dashed border-[#FFD700]/60 shrink-0"><i class="fa-regular fa-image text-lg"></i></div>`;
        const downloadBtn = u
            ? `<button type="button" onclick="downloadCatalogRawImage('${id}', ${i})" class="bg-white border border-[#230535]/15 text-[#230535] px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:bg-[#230535]/5 transition flex items-center justify-center gap-1">
                    <i class="fa-solid fa-download"></i> تحميل
                </button>`
            : `<span class="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg">لا توجد صورة من المندوب</span>`;
        return `<div class="flex items-center gap-2 bg-[#230535]/5 border border-[#FFD700]/30 rounded-xl p-2">
            ${thumbHtml}
            <div class="min-w-0 flex-1 space-y-1.5">
                <div class="text-[10px] font-black text-[#230535]">${noRawImages ? 'صورة المنتج' : ('صورة ' + (i + 1))}</div>
                <div class="flex flex-wrap gap-1.5">
                    ${downloadBtn}
                    ${status}
                </div>
            </div>
        </div>`;
    }).join('');
    return `<div id="catalogPendingCard-${id}" class="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div class="min-w-0">
            <div class="font-black text-sm text-[#230535]">${name}</div>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
                <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                ${category ? `<span class="text-[10px] font-bold bg-purple-50 text-kanjo-primary px-2 py-0.5 rounded-full">${category}</span>` : ''}
                <span class="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">${doneCount}/${targetCount}</span>
                ${noRawImages ? '<span class="text-[10px] font-black bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">بانتظار صورة</span>' : ''}
            </div>
        </div>
        <div class="grid grid-cols-1 gap-2">${slots}</div>
    </div>`;
};

const renderCatalogPendingCards = () => {
    const list = document.getElementById('catalogPendingList');
    const countEl = document.getElementById('catalogPendingCount');
    const pending = (window.merchantProductsCache || []).filter((p) => p.status === 'pending');
    if (countEl) countEl.textContent = String(pending.length);
    if (!list) return;
    if (pending.length === 0) {
        markCatalogPendingEmpty(list);
        return;
    }
    const grouped = pending.reduce((acc, p) => {
        const key = String(p.merchantName || 'تاجر غير معروف');
        if (!acc[key]) acc[key] = [];
        acc[key].push(p);
        return acc;
    }, {});
    const openMap = window._catalogPendingOpenMerchants || {};
    window._catalogPendingOpenMerchants = openMap;
    const merchantNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ar'));
    list.innerHTML = merchantNames.map((merchantName) => {
        const products = grouped[merchantName];
        const safeName = catalogEscapeHtml(merchantName);
        const accordionId = catalogMerchantDomId(merchantName);
        const isOpen = !!openMap[merchantName];
        const cards = products.map(renderCatalogPendingProductCard).join('');
        return `<div id="catalogMerchantAccordion-${accordionId}" data-catalog-merchant="${safeName}" class="rounded-2xl overflow-hidden border border-[#230535]/20 shadow-sm">
            <button type="button" onclick="toggleCatalogMerchantAccordion('${accordionId}')" class="w-full bg-[#230535] text-white px-4 py-3 flex items-center justify-between gap-3">
                <span class="font-black text-sm truncate">${safeName}</span>
                <span class="flex items-center gap-2 shrink-0">
                    <span data-catalog-merchant-count class="text-[11px] font-black bg-[#FFD700] text-[#230535] px-2.5 py-0.5 rounded-full">${products.length} منتجات</span>
                    <i data-catalog-merchant-chevron class="fa-solid fa-chevron-down text-[#FFD700] text-xs transition-transform ${isOpen ? 'rotate-180' : ''}"></i>
                </span>
            </button>
            <div data-catalog-merchant-body class="${isOpen ? '' : 'hidden'} bg-slate-50 p-3 space-y-3">${cards}</div>
        </div>`;
    }).join('');
};

window.toggleCatalogContentWidget = () => {
    const body = document.getElementById('catalogContentBody');
    const chevron = document.getElementById('catalogContentChevron');
    if (!body) return;
    const willOpen = body.classList.contains('hidden');
    body.classList.toggle('hidden', !willOpen);
    if (chevron) chevron.classList.toggle('rotate-180', willOpen);
    window._catalogContentWidgetOpen = willOpen;
    if (willOpen && window.isCatalogContentUser()) renderCatalogPendingCards();
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
    if (repBanner) repBanner.classList.toggle('hidden', !window.isCatalogRepUser());
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
    if (isAdmin) populateMerchantExportFilter();

    const mpExportBtn = document.getElementById('mpCatalogExportBtn');
    const mpModal = document.getElementById('merchantProfileModal');
    if (mpExportBtn && mpModal && !mpModal.classList.contains('hidden')) {
        mpExportBtn.classList.toggle('hidden', !window.isCatalogAdminUser());
    }

    if (window.isCatalogContentUser()) {
        const body = document.getElementById('catalogContentBody');
        if (body && !body.classList.contains('hidden')) renderCatalogPendingCards();
        else {
            const countEl = document.getElementById('catalogPendingCount');
            const pending = (window.merchantProductsCache || []).filter((p) => p.status === 'pending');
            if (countEl) countEl.textContent = String(pending.length);
        }
    }

    if (typeof window.renderStagingCatalogWidgets === 'function') window.renderStagingCatalogWidgets();
};

const fetchDoneCatalogProducts = async () => {
    const qRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'done'));
    const snap = await window.getDocs(qRef);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    return items;
};

const catalogProductMerchantName = (p) => String((p && (p.merchantName || p.merchant || p.merchant_name)) || '').trim();

const populateMerchantExportFilter = async () => {
    const select = document.getElementById('merchantExportFilter');
    if (!select) return;
    const previous = String(select.value || '').trim();
    let products = window.allCatalogProductsCache || [];
    if (!products.length) {
        try {
            products = await fetchDoneCatalogProducts();
        } catch (err) {
            console.error('[catalog] merchant filter load failed:', err);
            products = [];
        }
    }
    const names = Array.from(new Set(products.map(catalogProductMerchantName).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ar'));
    select.innerHTML = '<option value="" disabled selected>اختر التاجر للتصدير...</option>' + names.map((name) => {
        const safe = catalogEscapeHtml(name);
        return `<option value="${safe}">${safe}</option>`;
    }).join('');
    if (previous && names.indexOf(previous) !== -1) select.value = previous;
};

window.exportDoneCatalogProducts = async () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير الكتالوج متاح للإدارة فقط', false);
        return;
    }
    const select = document.getElementById('merchantExportFilter');
    const merchantName = String((select && select.value) || '').trim();
    if (!merchantName) {
        window.alert('اختر التاجر للتصدير...');
        if (window.showToast) window.showToast('اختر التاجر للتصدير...', false);
        return;
    }
    try {
        const allDone = await fetchDoneCatalogProducts();
        const filtered = allDone.filter((p) => catalogProductMerchantName(p) === merchantName);
        const exportData = filtered.map(mapCatalogProductToExportRow);
        if (exportData.length === 0) return window.showToast('لا توجد منتجات مكتملة لهذا التاجر', false);
        const safeName = merchantName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
        downloadKanjoCsv(exportData, 'Kanjo_Catalog_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.csv');
        window.showToast('تم تصدير شيت المنتجات بنجاح');
    } catch (err) {
        console.error('[catalog] export failed:', err);
        window.showToast('فشل تصدير الكتالوج', false);
    }
};

const fetchAllCatalogProducts = async () => {
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
            await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, product.id), patch);
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
    try {
        const allDone = await fetchDoneCatalogProducts();
        const filtered = allDone.filter((p) => {
            const pName = String(p.merchantName || '');
            const pId = String(p.merchantId || '');
            return (merchantId && pId === merchantId) || pName === merchantName;
        });
        const exportData = filtered.map(mapCatalogProductToExportRow);
        if (exportData.length === 0) return window.showToast('لا توجد منتجات مكتملة لهذا التاجر', false);
        const safeName = merchantName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
        downloadKanjoCsv(exportData, 'Kanjo_Catalog_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.csv');
        window.showToast('تم تصدير شيت المنتجات بنجاح');
    } catch (err) {
        console.error('[catalog] merchant export failed:', err);
        window.showToast('فشل تصدير الكتالوج', false);
    }
};

const sortCatalogProductsByCreatedAt = (items) => {
    items.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return tb - ta;
    });
    return items;
};

window.startCatalogListeners = () => {
    if (window._catalogListenerStarted) return;
    if (typeof window.onSnapshot !== 'function' || typeof window.collection !== 'function' || !window.db) return;
    window._catalogListenerStarted = true;
    window.merchantProductsCache = [];
    window.repCatalogProductsCache = [];
    window.catalogDeleteRequestsCache = [];
    window.allCatalogProductsCache = [];
    if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];
    const pendingRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'pending'));
    const unsubPending = window.onSnapshot(pendingRef, (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        window.merchantProductsCache = sortCatalogProductsByCreatedAt(items);
        if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
    }, (err) => {
        console.error('[catalog] pending listener failed:', err);
    });
    window._appListenerUnsubscribers.push(unsubPending);

    const createdBy = (window.currentUser && window.currentUser.name) || '';
    if (createdBy) {
        const mineRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('createdBy', '==', createdBy));
        const unsubMine = window.onSnapshot(mineRef, (snap) => {
            const items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
            window.repCatalogProductsCache = sortCatalogProductsByCreatedAt(items);
            if (typeof window.renderCatalogMyProductsWidget === 'function') window.renderCatalogMyProductsWidget();
        }, (err) => {
            console.error('[catalog] my products listener failed:', err);
        });
        window._appListenerUnsubscribers.push(unsubMine);
    }

    if (window.canViewAllCatalogProducts()) {
        const allRef = window.collection(window.db, CATALOG_COLLECTION);
        const unsubAll = window.onSnapshot(allRef, (snap) => {
            const items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
            window.allCatalogProductsCache = sortCatalogProductsByCreatedAt(items);
            if (typeof window.renderCatalogAllProductsWidget === 'function') window.renderCatalogAllProductsWidget();
            if (typeof populateMerchantExportFilter === 'function') populateMerchantExportFilter();
        }, (err) => {
            console.error('[catalog] all products listener failed:', err);
        });
        window._appListenerUnsubscribers.push(unsubAll);
    }

    if (window.isMahmoudUser()) {
        const deleteReqRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('deleteRequested', '==', true));
        const unsubDeleteReq = window.onSnapshot(deleteReqRef, (snap) => {
            const items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
            window.catalogDeleteRequestsCache = sortCatalogProductsByCreatedAt(items);
            if (typeof window.renderCatalogDeleteRequestsWidget === 'function') window.renderCatalogDeleteRequestsWidget();
        }, (err) => {
            console.error('[catalog] delete requests listener failed:', err);
        });
        window._appListenerUnsubscribers.push(unsubDeleteReq);
    } else if (typeof window.renderCatalogDeleteRequestsWidget === 'function') {
        window.renderCatalogDeleteRequestsWidget();
    }
};

const STAGING_CATALOGS_COLLECTION = 'staging_catalogs';
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
    if (importer) importer.classList.toggle('hidden', !canUse);
    if (exporter) exporter.classList.toggle('hidden', !canUse);
    if (parser) parser.classList.toggle('hidden', !canUse);
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
    const pattern = /"imageUrl":"([^"]+)".*?"productName":"([^"]+)".*?"sellingPrice":([0-9.]+)/g;
    const unique = new Map();
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
        const name = String(match[2] || '').trim();
        if (!name || unique.has(name)) continue;
        const price = parseFloat(match[3]);
        unique.set(name, {
            name,
            name_ar: name,
            name_en: name,
            price: Number.isFinite(price) ? price : 0,
            image_url: String(match[1] || '').trim(),
            category,
            sku: '',
            scraped_at: new Date(),
            uploaded_at: new Date()
        });
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
            parsed = JSON.parse(text);
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

window.addEventListener('keydown', (ev) => {
    const lightbox = document.getElementById('imageLightbox');
    if (ev.key === 'Escape' && lightbox && !lightbox.classList.contains('hidden')) {
        window.closeImageLightbox();
        return;
    }
    const modal = document.getElementById('catalogProductModal');
    if (ev.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        window.requestCloseCatalogProductModal();
    }
});
