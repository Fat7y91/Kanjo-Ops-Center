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

window.onCatalogRawImageChange = (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const nameEl = document.getElementById('catalogRawImageName');
    if (nameEl) nameEl.textContent = file ? file.name : 'الكاميرا أو معرض الصور';
};

window.openCatalogProductModal = () => {
    if (!window.isCatalogRepUser()) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة للمناديب فقط', false);
        return;
    }
    fillCatalogMerchantOptions();
    fillCatalogCategoryOptions('');
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
    const nameEn = String((document.getElementById('catalogNameEn') || {}).value || '').trim();
    const descriptionAr = String((document.getElementById('catalogDescriptionAr') || {}).value || '').trim();
    const descriptionEn = String((document.getElementById('catalogDescriptionEn') || {}).value || '').trim();
    const sku = String((document.getElementById('catalogSku') || {}).value || '').trim();
    const productType = String((document.getElementById('catalogProductType') || {}).value || 'simple').trim() || 'simple';
    const priceRaw = String((document.getElementById('catalogBasePrice') || {}).value || '').trim();
    const category = String((document.getElementById('catalogCategory') || {}).value || '').trim();
    const fileInput = document.getElementById('catalogRawImage');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const btn = document.getElementById('catalogProductSubmitBtn');

    if (!merchant || !merchantId) return window.showToast('اختر تاجراً باتفاق نهائي', false);
    if (!nameAr) return window.showToast('أدخل اسم المنتج بالعربية', false);
    if (!nameEn) return window.showToast('أدخل اسم المنتج بالإنجليزية', false);
    if (!descriptionAr) return window.showToast('أدخل وصف المنتج بالعربية', false);
    if (!descriptionEn) return window.showToast('أدخل وصف المنتج بالإنجليزية', false);
    if (!sku) return window.showToast('أدخل كود المنتج / الباركود', false);
    if (!productType) return window.showToast('اختر نوع المنتج', false);
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
        const rawImageUrl = await uploadCatalogImageToGas({
            merchantName: merchant.merchantName,
            imageType: 'raw',
            fileName: file.name || 'product-raw.jpg',
            fileContent,
            mimeType: file.type || 'image/jpeg'
        });
        await window.addDoc(window.collection(window.db, CATALOG_COLLECTION), {
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

window.downloadCatalogRawImage = async (productId) => {
    const product = (window.merchantProductsCache || []).find((p) => p.id === productId);
    const url = product && product.rawImageUrl;
    if (!url) return window.showToast('لا يوجد رابط للصورة الأصلية', false);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('FETCH_FAILED');
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = obj;
        a.download = (product.name_ar || 'product') + '-raw';
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
    const file = input && input.files && input.files[0];
    const productId = window._catalogEnhancedProductId;
    if (!file || !productId) return;
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
    const card = document.getElementById('catalogPendingCard-' + productId);
    const cardBtn = document.getElementById('catalogEnhanceBtn-' + productId);
    const prevHtml = cardBtn ? cardBtn.innerHTML : '';
    if (cardBtn) {
        cardBtn.disabled = true;
        cardBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    }
    try {
        const fileContent = await fileToBase64(file);
        const enhancedImageUrl = await uploadCatalogImageToGas({
            merchantName: product.merchantName || '',
            imageType: 'enhanced',
            fileName: file.name || 'product-enhanced.jpg',
            fileContent,
            mimeType: file.type || 'image/jpeg'
        });
        await window.updateDoc(window.doc(window.db, CATALOG_COLLECTION, productId), {
            enhancedImageUrl,
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
        const thumb = catalogEscapeHtml(p.rawImageUrl);
        return `<div id="catalogPendingCard-${id}" class="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div class="flex gap-3 items-start">
                <div class="w-20 h-20 rounded-xl overflow-hidden bg-[#230535]/5 border border-[#FFD700]/40 shrink-0">
                    ${thumb ? `<img src="${thumb}" alt="" class="w-full h-full object-cover">` : `<div class="w-full h-full grid place-items-center text-[#230535]"><i class="fa-solid fa-image"></i></div>`}
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
                <button type="button" onclick="downloadCatalogRawImage('${id}')" class="flex-1 min-w-[140px] bg-white border border-[#230535]/15 text-[#230535] px-3 py-2 rounded-xl text-xs font-black hover:bg-[#230535]/5 transition flex items-center justify-center gap-1">
                    <i class="fa-solid fa-download"></i> تحميل الأصلية
                </button>
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

    if (window.isCatalogContentUser()) renderCatalogPendingCards();
};

window.exportDoneCatalogProducts = async () => {
    if (!window.isCatalogAdminUser()) {
        if (window.showToast) window.showToast('تصدير الكتالوج متاح للإدارة فقط', false);
        return;
    }
    try {
        const qRef = window.query(window.collection(window.db, CATALOG_COLLECTION), window.where('status', '==', 'done'));
        const snap = await window.getDocs(qRef);
        const exportData = [];
        snap.forEach((d) => {
            const p = d.data() || {};
            exportData.push({
                product_key: '',
                product_type: p.product_type || '',
                sku: p.sku || '',
                name_en: p.name_en || '',
                name_ar: p.name_ar || '',
                description_en: p.description_en || '',
                description_ar: p.description_ar || '',
                base_price: Number(p.base_price) || 0,
                main_image_url: p.enhancedImageUrl || '',
                category: p.category || '',
                status: p.status || 'done'
            });
        });
        if (exportData.length === 0) return window.showToast('لا توجد منتجات مكتملة للتصدير', false);
        const ws = XLSX.utils.json_to_sheet(exportData, { header: CATALOG_EXPORT_COLUMNS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kanjo Catalog');
        XLSX.writeFile(wb, 'Kanjo_Catalog_Done_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        window.showToast('تم تصدير كتالوج المنتجات بنجاح');
    } catch (err) {
        console.error('[catalog] export failed:', err);
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

window.addEventListener('click', (ev) => {
    if (ev.target && ev.target.id === 'catalogProductModal') window.closeCatalogProductModal();
});
window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') window.closeCatalogProductModal();
});
