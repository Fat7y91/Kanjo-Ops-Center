/* Kanjo Ops — Product Cataloging Pipeline (Phase 1: Data Entry) */

const CATALOG_COLLECTION = 'merchant_products';
const CATALOG_GAS_URL = 'https://script.google.com/macros/s/AKfycbxKn5WpHIT3N0zoyu1Kb6eTmAOo8jOCh1Jta36bnjvoIZ1jnxt54pdAvK9tN-xUTdYA/exec';
const CATALOG_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const catalogEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.isCatalogRepUser = () => !!(window.currentUser && window.currentUser.role === 'rep');

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

const uploadCatalogRawImage = async ({ merchantName, fileName, fileContent, mimeType }) => {
    const url = catalogScriptUrl();
    if (!url) throw new Error('NO_SCRIPT_URL');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                merchantName,
                imageType: 'raw',
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
        const cat = (t.cat && t.cat !== 'متابعة' && t.cat !== 'متابعه') ? t.cat : '';
        map.set(baseName, {
            merchantId: mid,
            merchantName: baseName,
            category: cat,
            team: t.team || ''
        });
    });
    return Array.from(map.values()).sort((a, b) => String(a.merchantName).localeCompare(String(b.merchantName), 'ar'));
};

const fillCatalogCategoryOptions = (selected) => {
    const select = document.getElementById('catalogCategory');
    if (!select) return;
    const cats = Array.isArray(window.categories) ? window.categories.slice().sort() : [];
    select.innerHTML = '<option value="">الفئة...</option>' + cats.map((c) => {
        const safe = catalogEscapeHtml(c);
        const isSel = selected && selected === c ? ' selected' : '';
        return `<option value="${safe}"${isSel}>${safe}</option>`;
    }).join('');
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

window.onCatalogMerchantChange = () => {
    const select = document.getElementById('catalogMerchantSelect');
    if (!select) return;
    const merchant = window._catalogMerchantMap && window._catalogMerchantMap[select.value];
    if (merchant && merchant.category) fillCatalogCategoryOptions(merchant.category);
};

window.openCatalogProductModal = () => {
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    fillCatalogMerchantOptions();
    fillCatalogCategoryOptions('');
    const nameEl = document.getElementById('catalogNameAr');
    const descEl = document.getElementById('catalogDescriptionAr');
    const priceEl = document.getElementById('catalogBasePrice');
    const fileEl = document.getElementById('catalogRawImage');
    if (nameEl) nameEl.value = '';
    if (descEl) descEl.value = '';
    if (priceEl) priceEl.value = '';
    if (fileEl) fileEl.value = '';
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeCatalogProductModal = () => {
    const modal = document.getElementById('catalogProductModal');
    if (modal) modal.classList.add('hidden');
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
    const descriptionAr = String((document.getElementById('catalogDescriptionAr') || {}).value || '').trim();
    const priceRaw = String((document.getElementById('catalogBasePrice') || {}).value || '').trim();
    const category = String((document.getElementById('catalogCategory') || {}).value || '').trim();
    const fileInput = document.getElementById('catalogRawImage');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const btn = document.getElementById('catalogProductSubmitBtn');

    if (!merchant || !merchantId) return window.showToast('اختر تاجراً باتفاق نهائي', false);
    if (!nameAr) return window.showToast('أدخل اسم المنتج بالعربية', false);
    if (!descriptionAr) return window.showToast('أدخل وصف المنتج بالعربية', false);
    const basePrice = Number(priceRaw);
    if (priceRaw === '' || Number.isNaN(basePrice) || basePrice < 0) return window.showToast('أدخل سعراً صحيحاً', false);
    if (!category) return window.showToast('اختر فئة المنتج', false);
    if (!file) return window.showToast('ارفع صورة المنتج الأصلية', false);
    if (file.size > CATALOG_MAX_IMAGE_BYTES) return window.showToast('حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)', false);

    const prevHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الرفع والحفظ...';
    }
    try {
        const fileContent = await fileToBase64(file);
        const rawImageUrl = await uploadCatalogRawImage({
            merchantName: merchant.merchantName,
            fileName: file.name || 'product-raw.jpg',
            fileContent,
            mimeType: file.type || 'image/jpeg'
        });
        await window.addDoc(window.collection(window.db, CATALOG_COLLECTION), {
            merchantId: merchant.merchantId,
            merchantName: merchant.merchantName,
            name_ar: nameAr,
            description_ar: descriptionAr,
            base_price: basePrice,
            category,
            rawImageUrl,
            enhancedImageUrl: '',
            status: 'pending',
            createdAt: new Date(),
            createdBy: (window.currentUser && window.currentUser.name) || ''
        });
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

window.renderCatalogWidgets = () => {
    const repBanner = document.getElementById('catalogRepBanner');
    if (repBanner) repBanner.classList.toggle('hidden', !window.isCatalogRepUser());
};

window.addEventListener('click', (ev) => {
    if (ev.target && ev.target.id === 'catalogProductModal') window.closeCatalogProductModal();
});
window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') window.closeCatalogProductModal();
});
