/* Kanjo Ops — Product Cataloging Pipeline */

const CATALOG_COLLECTION = 'merchant_products';
const CATALOG_GAS_URL = 'https://script.google.com/macros/s/AKfycbzWid4xw-1Vo4y3gNwUPSs9SYYYVEZMVCZyeilNiNyRCkgfLWSjj9s3WmpvX1G4Octv/exec';
const CATALOG_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

window.merchantProductsCache = window.merchantProductsCache || [];
window._catalogEnhancedUploads = window._catalogEnhancedUploads || {};

const catalogEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.isCatalogRepUser = () => !!(window.currentUser && window.currentUser.role === 'rep');

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

const csvEscapeCell = (value) => {
    const s = String(value == null ? '' : value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
};

const downloadKanjoCsv = (rows, fileName) => {
    const lines = [CATALOG_EXPORT_COLUMNS.join(',')].concat(
        rows.map((row) => CATALOG_EXPORT_COLUMNS.map((col) => csvEscapeCell(row[col])).join(','))
    );
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
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
    product_key: '',
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

const fillCatalogMerchantOptions = () => {
    const select = document.getElementById('catalogMerchantSelect');
    if (!select) return;
    const merchants = listFinalizedMerchants();
    window._catalogMerchantMap = {};
    merchants.forEach((m) => { window._catalogMerchantMap[m.merchantId] = m; });
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

const isCatalogProductFormDirty = () => {
    const ids = ['catalogNameAr', 'catalogNameEn', 'catalogDescriptionAr', 'catalogDescriptionEn', 'catalogSku', 'catalogBasePrice'];
    if (ids.some((id) => String((document.getElementById(id) || {}).value || '').trim())) return true;
    const merchantEl = document.getElementById('catalogMerchantSelect');
    if (merchantEl && merchantEl.value) return true;
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
    fillCatalogMerchantOptions();
    const ids = ['catalogNameAr', 'catalogNameEn', 'catalogDescriptionAr', 'catalogDescriptionEn', 'catalogSku', 'catalogBasePrice'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl) typeEl.value = 'simple';
    resetCatalogImageState();
    resetCatalogVariations();
    window.stopCatalogBarcodeScan();
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCatalogProductModal = () => {
    window.stopCatalogBarcodeScan();
    resetCatalogImageState();
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

window.submitCatalogProduct = async (event) => {
    if (event) event.preventDefault();
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    const merchantId = (document.getElementById('catalogMerchantSelect') || {}).value || '';
    const merchant = window._catalogMerchantMap && window._catalogMerchantMap[merchantId];
    const nameAr = String((document.getElementById('catalogNameAr') || {}).value || '').trim();
    const nameEn = String((document.getElementById('catalogNameEn') || {}).value || '').trim();
    const descriptionAr = String((document.getElementById('catalogDescriptionAr') || {}).value || '').trim();
    const descriptionEn = String((document.getElementById('catalogDescriptionEn') || {}).value || '').trim();
    let sku = String((document.getElementById('catalogSku') || {}).value || '').trim();
    const productType = String((document.getElementById('catalogProductType') || {}).value || 'simple').trim() || 'simple';
    const priceRaw = String((document.getElementById('catalogBasePrice') || {}).value || '').trim();
    const category = resolveMerchantCategory(merchant);
    const files = productImagesState.map((item) => item.file).filter(Boolean);
    const btn = document.getElementById('catalogProductSubmitBtn');

    if (!merchant || !merchantId) return window.showToast('اختر تاجراً باتفاق نهائي', false);
    if (!nameAr) return window.showToast('أدخل اسم المنتج بالعربية', false);
    if (!nameEn) return window.showToast('أدخل اسم المنتج بالإنجليزية', false);
    if (!descriptionAr) return window.showToast('أدخل وصف المنتج بالعربية', false);
    if (!descriptionEn) return window.showToast('أدخل وصف المنتج بالإنجليزية', false);
    if (!sku) sku = generateCatalogSku();
    if (!productType) return window.showToast('اختر نوع المنتج', false);
    let basePrice = Number(priceRaw);
    if (!category) return window.showToast('لا توجد فئة مسجّلة لهذا التاجر', false);
    let variations = [];
    if (productType === 'variable') {
        const rawVars = collectCatalogVariations();
        if (rawVars.length === 0) return window.showToast('أضف خياراً واحداً على الأقل للمنتج المتغير', false);
        for (const v of rawVars) {
            if (!v.name) return window.showToast('أدخل اسم كل خيار (الحجم / اللون)', false);
            if (v.priceRaw === '' || Number.isNaN(v.price) || v.price < 0) return window.showToast('أدخل سعراً صحيحاً لكل خيار', false);
            variations.push({ name: v.name, price: v.price });
        }
        basePrice = Math.min(...variations.map((v) => v.price));
    } else if (priceRaw === '' || Number.isNaN(basePrice) || basePrice < 0) {
        return window.showToast('أدخل سعراً صحيحاً', false);
    }
    if (!files.length) return window.showToast('ارفع صورة المنتج الأصلية', false);
    if (files.length > 12) return window.showToast('الحد الأقصى 12 صورة للمنتج', false);
    if (files.some((f) => f.size > CATALOG_MAX_IMAGE_BYTES)) return window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);

    const prevHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الرفع والحفظ...';
    }
    try {
        const rawImageUrls = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const base64Data = await compressCatalogImage(file);
            const uploadedUrl = await uploadCatalogImageToGas(
                base64Data,
                catalogJpegFileName(file.name, 'product-raw-' + (i + 1)),
                merchant.merchantName,
                'raw'
            );
            rawImageUrls.push(uploadedUrl);
        }
        const rawImageUrl = rawImageUrls[0] || '';
        const payload = {
            merchantId: merchant.merchantId,
            merchantName: merchant.merchantName,
            name_ar: nameAr,
            name_en: nameEn,
            description_ar: descriptionAr,
            description_en: descriptionEn,
            sku,
            product_type: productType,
            base_price: basePrice,
            category,
            rawImageUrl,
            rawImageUrls,
            enhancedImageUrl: '',
            enhancedImageUrls: [],
            status: 'pending',
            createdAt: new Date(),
            createdBy: (window.currentUser && window.currentUser.name) || ''
        };
        if (productType === 'variable') payload.variations = variations;
        await window.addDoc(window.collection(window.db, CATALOG_COLLECTION), payload);
        window.showToast('تم حفظ المنتج بنجاح');
        window.closeCatalogProductModal();
    } catch (err) {
        console.error('[catalog] submit failed:', err);
        let msg = 'فشل حفظ المنتج، حاول مرة أخرى';
        if (err && err.message === 'NO_SCRIPT_URL') msg = 'رابط رفع الصور غير مفعّل';
        else if (err && (err.name === 'AbortError' || err.message === 'FILE_READ_FAILED')) msg = 'تعذر قراءة أو رفع الصورة';
        window.showToast(msg, false);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevHtml || 'حفظ المنتج';
        }
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
        const enhancedUrls = getCatalogEnhancedLocal(productId, rawUrls.length);
        enhancedUrls[idx] = uploadedUrl;
        window._catalogEnhancedUploads[productId] = enhancedUrls;
        const done = await completeCatalogProductIfReady(productId, product, enhancedUrls, rawUrls.length);
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
    const enhancedUrls = getCatalogEnhancedLocal(p.id, rawUrls.length);
    const doneCount = enhancedUrls.filter(Boolean).length;
    const slots = rawUrls.map((u, i) => {
        const thumb = catalogEscapeHtml(catalogDriveThumbnailUrl(u) || u);
        const done = !!enhancedUrls[i];
        const status = done
            ? '<span class="text-[10px] font-black text-emerald-600 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> تم</span>'
            : `<button type="button" id="catalogEnhanceBtn-${id}-${i}" onclick="triggerCatalogEnhancedSlot('${id}', ${i})" class="bg-[#230535] text-[#FFD700] px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:opacity-90 transition flex items-center justify-center gap-1">
                <i class="fa-solid fa-wand-magic-sparkles"></i> رفع المحسّنة
            </button>
            <input type="file" id="catalogEnhanceInput-${id}-${i}" accept="image/*" class="hidden" onchange="handleCatalogEnhancedFile(event, '${id}', ${i})">`;
        return `<div class="flex items-center gap-2 bg-[#230535]/5 border border-[#FFD700]/30 rounded-xl p-2">
            <img src="${thumb}" alt="" class="w-14 h-14 rounded-lg object-cover border border-[#FFD700]/40 shrink-0" onerror="this.style.display='none'">
            <div class="min-w-0 flex-1 space-y-1.5">
                <div class="text-[10px] font-black text-[#230535]">صورة ${i + 1}</div>
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" onclick="downloadCatalogRawImage('${id}', ${i})" class="bg-white border border-[#230535]/15 text-[#230535] px-2.5 py-1.5 rounded-lg text-[10px] font-black hover:bg-[#230535]/5 transition flex items-center justify-center gap-1">
                        <i class="fa-solid fa-download"></i> تحميل
                    </button>
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
                <span class="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">${doneCount}/${rawUrls.length || 0}</span>
            </div>
        </div>
        <div class="grid grid-cols-1 gap-2">${slots || `<div class="w-20 h-20 rounded-xl grid place-items-center text-[#230535] bg-[#230535]/5 border border-[#FFD700]/40"><i class="fa-solid fa-image"></i></div>`}</div>
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
    const repBanner = document.getElementById('catalogRepBanner');
    if (repBanner) repBanner.classList.toggle('hidden', !window.isCatalogRepUser());

    const contentWidget = document.getElementById('catalogContentWidget');
    if (contentWidget) contentWidget.classList.toggle('hidden', !window.isCatalogContentUser());

    const exportBtn = document.getElementById('catalogExportBtn');
    if (exportBtn) exportBtn.classList.toggle('hidden', !window.isCatalogAdminUser());

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
};

const fetchDoneCatalogProducts = async () => {
    const qRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'done'));
    const snap = await window.getDocs(qRef);
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    return items;
};

window.exportDoneCatalogProducts = async () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير الكتالوج متاح للإدارة فقط', false);
        return;
    }
    try {
        const exportData = (await fetchDoneCatalogProducts()).map(mapCatalogProductToExportRow);
        if (exportData.length === 0) return window.showToast('لا توجد منتجات مكتملة للتصدير', false);
        downloadKanjoCsv(exportData, 'Kanjo_Catalog_Done_' + new Date().toISOString().slice(0, 10) + '.csv');
        window.showToast('تم تصدير شيت المنتجات بنجاح');
    } catch (err) {
        console.error('[catalog] export failed:', err);
        window.showToast('فشل تصدير الكتالوج', false);
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

window.startCatalogListeners = () => {
    if (window._catalogListenerStarted) return;
    if (typeof window.onSnapshot !== 'function' || typeof window.collection !== 'function' || !window.db) return;
    window._catalogListenerStarted = true;
    window.merchantProductsCache = [];
    const qRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'pending'));
    const unsub = window.onSnapshot(qRef, (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
            const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return tb - ta;
        });
        window.merchantProductsCache = items;
        if (typeof window.renderCatalogWidgets === 'function') window.renderCatalogWidgets();
    }, (err) => {
        console.error('[catalog] pending listener failed:', err);
    });
    if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];
    window._appListenerUnsubscribers.push(unsub);
};

window.addEventListener('keydown', (ev) => {
    const modal = document.getElementById('catalogProductModal');
    if (ev.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        window.requestCloseCatalogProductModal();
    }
});
