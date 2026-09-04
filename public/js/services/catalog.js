/* Kanjo Ops — Product Cataloging Pipeline */

const CATALOG_COLLECTION = 'merchant_products';
const CATALOG_GAS_URL = 'https://script.google.com/macros/s/AKfycbxKn5WpHIT3N0zoyu1Kb6eTmAOo8jOCh1Jta36bnjvoIZ1jnxt54pdAvK9tN-xUTdYA/exec';
const CATALOG_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

window.merchantProductsCache = window.merchantProductsCache || [];
window._catalogEnhancedProductId = null;

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

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const commaIdx = dataUrl.indexOf(',');
        resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
});

const extractCatalogImageUrl = (data) => {
    if (!data || typeof data !== 'object') return '';
    if (typeof data.url === 'string' && data.url) return data.url;
    if (typeof data.imageUrl === 'string' && data.imageUrl) return data.imageUrl;
    if (data.data && typeof data.data.url === 'string' && data.data.url) return data.data.url;
    return '';
};

const uploadCatalogImageToGas = async ({ merchantName, imageType, fileName, fileContent, mimeType }) => {
    const url = catalogScriptUrl();
    if (!url) throw new Error('NO_SCRIPT_URL');
    if (imageType !== 'raw' && imageType !== 'enhanced') throw new Error('INVALID_IMAGE_TYPE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                merchantName,
                imageType,
                fileName,
                fileContent,
                mimeType
            }),
            signal: controller.signal
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { data = null; }
        if (!res.ok) throw new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
        const imageUrl = extractCatalogImageUrl(data);
        if (!imageUrl) throw new Error((data && (data.message || data.error)) || 'NO_IMAGE_URL');
        return imageUrl;
    } finally {
        clearTimeout(timer);
    }
};

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
    if (Array.isArray(p && p.rawImageUrls) && p.rawImageUrls.length) {
        return p.rawImageUrls.map((u) => String(u || '')).filter(Boolean);
    }
    return (p && p.rawImageUrl) ? [String(p.rawImageUrl)] : [];
};

const catalogEnhancedImageUrls = (p) => {
    if (Array.isArray(p && p.enhancedImageUrls) && p.enhancedImageUrls.length) {
        return p.enhancedImageUrls.map((u) => String(u || '')).filter(Boolean);
    }
    return (p && p.enhancedImageUrl) ? [String(p.enhancedImageUrl)] : [];
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

window.onCatalogRawImageChange = (event) => {
    const input = event && event.target;
    const files = input && input.files ? Array.from(input.files) : [];
    const nameEl = document.getElementById('catalogRawImageName');
    if (nameEl) nameEl.textContent = files.length ? (files.length + ' صورة') : 'الكاميرا أو معرض الصور';
    const preview = document.getElementById('catalogRawImagePreviews');
    if (!preview) return;
    preview.innerHTML = '';
    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = document.createElement('img');
            img.src = String(reader.result || '');
            img.alt = file.name || '';
            img.className = 'w-16 h-16 rounded-xl object-cover border border-[#FFD700]/50';
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
};

const generateCatalogSku = () => 'KJ-PRD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

const isCatalogProductFormDirty = () => {
    const ids = ['catalogNameAr', 'catalogNameEn', 'catalogDescriptionAr', 'catalogDescriptionEn', 'catalogSku', 'catalogBasePrice'];
    if (ids.some((id) => String((document.getElementById(id) || {}).value || '').trim())) return true;
    const merchantEl = document.getElementById('catalogMerchantSelect');
    if (merchantEl && merchantEl.value) return true;
    const typeEl = document.getElementById('catalogProductType');
    if (typeEl && typeEl.value && typeEl.value !== 'simple') return true;
    const fileEl = document.getElementById('catalogRawImage');
    if (fileEl && fileEl.files && fileEl.files.length) return true;
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
    const scanner = new Html5Qrcode('catalogSkuReader');
    window._catalogQrScanner = scanner;
    try {
        await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
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
    const fileEl = document.getElementById('catalogRawImage');
    if (fileEl) fileEl.value = '';
    const nameHint = document.getElementById('catalogRawImageName');
    if (nameHint) nameHint.textContent = 'الكاميرا أو معرض الصور';
    const preview = document.getElementById('catalogRawImagePreviews');
    if (preview) preview.innerHTML = '';
    resetCatalogVariations();
    window.stopCatalogBarcodeScan();
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCatalogProductModal = () => {
    window.stopCatalogBarcodeScan();
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
    const fileInput = document.getElementById('catalogRawImage');
    const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
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
            const fileContent = await fileToBase64(file);
            const uploadedUrl = await uploadCatalogImageToGas({
                merchantName: merchant.merchantName,
                imageType: 'raw',
                fileName: file.name || ('product-raw-' + (i + 1) + '.jpg'),
                fileContent,
                mimeType: file.type || 'image/jpeg'
            });
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

window.downloadCatalogRawImage = async (productId, imageIndex) => {
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId);
    const urls = catalogRawImageUrls(product);
    const idx = Number.isInteger(imageIndex) ? imageIndex : 0;
    const url = urls[idx] || urls[0];
    if (!url) return window.showToast('لا يوجد رابط للصورة الأصلية', false);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('FETCH_FAILED');
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = obj;
        a.download = (product.name_ar || 'product') + '-raw-' + (idx + 1);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 2500);
    } catch (_) {
        window.open(url, '_blank', 'noopener');
    }
};

window.triggerCatalogEnhancedUpload = (productId) => {
    if (!window.isCatalogContentUser()) {
        if (window.showToast) window.showToast('رفع الصورة المحسّنة متاح لفريق المحتوى فقط', false);
        return;
    }
    window._catalogEnhancedProductId = productId;
    const input = document.getElementById('catalogEnhancedFileInput');
    if (!input) return;
    input.value = '';
    input.click();
};

window.handleCatalogEnhancedFile = async (event) => {
    const input = event && event.target;
    const files = input && input.files ? Array.from(input.files) : [];
    const productId = window._catalogEnhancedProductId;
    if (!files.length || !productId) return;
    if (files.length > 12) {
        window.showToast('الحد الأقصى 12 صورة للمنتج', false);
        input.value = '';
        return;
    }
    if (files.some((f) => f.size > CATALOG_MAX_IMAGE_BYTES)) {
        window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);
        input.value = '';
        return;
    }
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId);
    if (!product) {
        window.showToast('تعذر العثور على المنتج', false);
        return;
    }
    const card = document.getElementById('catalogPendingCard-' + productId);
    const cardBtn = document.getElementById('catalogEnhanceBtn-' + productId);
    const prevHtml = cardBtn ? cardBtn.innerHTML : '';
    if (cardBtn) {
        cardBtn.disabled = true;
        cardBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    }
    try {
        const enhancedImageUrls = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileContent = await fileToBase64(file);
            const uploadedUrl = await uploadCatalogImageToGas({
                merchantName: product.merchantName || '',
                imageType: 'enhanced',
                fileName: file.name || ('product-enhanced-' + (i + 1) + '.jpg'),
                fileContent,
                mimeType: file.type || 'image/jpeg'
            });
            enhancedImageUrls.push(uploadedUrl);
        }
        const enhancedImageUrl = enhancedImageUrls[0] || '';
        await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), {
            enhancedImageUrl,
            enhancedImageUrls,
            status: 'done',
            updatedAt: new Date(),
            updatedBy: (window.currentUser && window.currentUser.name) || ''
        });
        window.showToast('تم رفع الصورة المحسّنة واعتماد المنتج');
        if (card) card.remove();
        const countEl = document.getElementById('catalogPendingCount');
        const remaining = (window.merchantProductsCache || []).filter((p) => p.id !== productId && p.status === 'pending');
        if (countEl) countEl.textContent = String(remaining.length);
        const list = document.getElementById('catalogPendingList');
        if (list && remaining.length === 0) {
            list.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold">
                <i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i>
                <div>لا توجد منتجات بانتظار التحسين</div>
            </div>`;
        }
    } catch (err) {
        console.error('[catalog] enhance failed:', err);
        window.showToast('فشل رفع الصورة المحسّنة', false);
        if (cardBtn) {
            cardBtn.disabled = false;
            cardBtn.innerHTML = prevHtml || '<i class="fa-solid fa-wand-magic-sparkles"></i> رفع المحسّنة';
        }
    } finally {
        window._catalogEnhancedProductId = null;
        if (input) input.value = '';
    }
};

const renderCatalogPendingCards = () => {
    const list = document.getElementById('catalogPendingList');
    const countEl = document.getElementById('catalogPendingCount');
    const pending = (window.merchantProductsCache || []).filter((p) => p.status === 'pending');
    if (countEl) countEl.textContent = String(pending.length);
    if (!list) return;
    if (pending.length === 0) {
        list.innerHTML = `<div class="text-center py-8 text-slate-400 font-bold">
            <i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i>
            <div>لا توجد منتجات بانتظار التحسين</div>
        </div>`;
        return;
    }
    list.innerHTML = pending.map((p) => {
        const id = catalogEscapeHtml(p.id);
        const name = catalogEscapeHtml(p.name_ar);
        const merchant = catalogEscapeHtml(p.merchantName);
        const category = catalogEscapeHtml(p.category);
        const price = catalogEscapeHtml(p.base_price);
        const rawUrls = catalogRawImageUrls(p);
        const thumbs = rawUrls.map((u, i) => {
            const src = catalogEscapeHtml(u);
            return `<button type="button" onclick="downloadCatalogRawImage('${id}', ${i})" class="w-16 h-16 rounded-xl overflow-hidden bg-[#230535]/5 border border-[#FFD700]/40 shrink-0">
                <img src="${src}" alt="" class="w-full h-full object-cover">
            </button>`;
        }).join('');
        const downloadBtns = rawUrls.map((_, i) => `<button type="button" onclick="downloadCatalogRawImage('${id}', ${i})" class="flex-1 min-w-[120px] bg-white border border-[#230535]/15 text-[#230535] px-3 py-2 rounded-xl text-xs font-black hover:bg-[#230535]/5 transition flex items-center justify-center gap-1">
                    <i class="fa-solid fa-download"></i> تحميل ${rawUrls.length > 1 ? (i + 1) : 'الأصلية'}
                </button>`).join('');
        return `<div id="catalogPendingCard-${id}" class="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div class="flex gap-3 items-start">
                <div class="flex flex-wrap gap-1.5 shrink-0 max-w-[150px]">
                    ${thumbs || `<div class="w-20 h-20 rounded-xl grid place-items-center text-[#230535] bg-[#230535]/5 border border-[#FFD700]/40"><i class="fa-solid fa-image"></i></div>`}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="font-black text-sm text-[#230535]">${name}</div>
                    <div class="text-[11px] font-bold text-slate-500 mt-0.5">${merchant}</div>
                    <div class="flex flex-wrap gap-1.5 mt-1.5">
                        <span class="text-[10px] font-black bg-[#FFD700]/20 text-[#230535] px-2 py-0.5 rounded-full">${price} ج.م</span>
                        ${category ? `<span class="text-[10px] font-bold bg-purple-50 text-kanjo-primary px-2 py-0.5 rounded-full">${category}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex flex-wrap gap-2">
                ${downloadBtns}
                <button type="button" id="catalogEnhanceBtn-${id}" onclick="triggerCatalogEnhancedUpload('${id}')" class="flex-1 min-w-[140px] bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-xs font-black hover:opacity-90 transition flex items-center justify-center gap-1">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> رفع المحسّنة
                </button>
            </div>
        </div>`;
    }).join('');
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

    if (window.isCatalogContentUser()) renderCatalogPendingCards();
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
