/* ─── Interactive Duplicate-SKU Resolution Dashboard ───
   Visual replacement for the console-based dedupe helper. The admin opens the
   modal, sees every split-brain duplicate group side-by-side with full details
   (image, name, description, price, status, timestamps), then resolves each
   group with SMART MERGE / KEEP THIS / DELETE. Every removal goes through
   `window.KanjoCatalogDedupeAPI.remove`, which is REST-first and writes the
   Black Box (audit_logs) entry. Groups disappear from the view immediately,
   without a page reload. Read-only at rest: the badge is computed purely from
   the in-memory catalog cache (zero Firestore reads). */

let catalogDupState = {
    allGroups: [],
    allConflicts: [],
    groups: [],
    conflicts: [],
    busy: false
};

const catalogDupApi = () => window.KanjoCatalogDedupeAPI || null;

const catalogDupEscape = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const catalogDupFormatTime = (value) => {
    const api = catalogDupApi();
    const ms = api && typeof api.time === 'function'
        ? api.time(value)
        : (value ? new Date(value).getTime() : 0);
    if (!ms) return '—';
    try {
        return new Date(ms).toLocaleString('ar-EG', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    }
};

const catalogDupPrice = (p) => {
    const raw = p && (p.base_price != null ? p.base_price : p.price);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
};

const catalogDupStatusBadge = (status) => {
    const s = String(status || '');
    const map = {
        pending: ['قيد المراجعة', 'bg-amber-100 text-amber-700'],
        done: ['مكتمل', 'bg-emerald-100 text-emerald-700'],
        active: ['نشط', 'bg-emerald-100 text-emerald-700'],
        approved: ['معتمد', 'bg-emerald-100 text-emerald-700']
    };
    const entry = map[s] || [s || 'غير محدد', 'bg-slate-100 text-slate-600'];
    return '<span class="px-2 py-0.5 rounded-full text-[10px] font-black ' + entry[1] + '">' + catalogDupEscape(entry[0]) + '</span>';
};

const catalogDupImageBlock = (product) => {
    const api = catalogDupApi();
    const url = api && typeof api.imageUrl === 'function' ? api.imageUrl(product) : '';
    const count = api && typeof api.imageCount === 'function' ? api.imageCount(product) : 0;
    if (url) {
        return '<div class="relative w-full h-32 rounded-xl overflow-hidden bg-slate-100 border border-purple-100">'
            + '<img src="' + catalogDupEscape(url) + '" class="w-full h-full object-cover" loading="lazy" alt="" onerror="this.style.display=\'none\'">'
            + '<span class="absolute top-1 left-1 bg-[#230535]/85 text-[#FFD700] text-[10px] font-black px-2 py-0.5 rounded-full">' + catalogDupEscape(String(count)) + ' صورة</span>'
            + '</div>';
    }
    return '<div class="w-full h-32 rounded-xl bg-slate-100 border-2 border-dashed border-slate-200 grid place-items-center text-slate-300">'
        + '<div class="text-center"><i class="fa-regular fa-image text-2xl"></i><div class="text-[10px] font-black mt-1">لا توجد صورة</div></div>'
        + '</div>';
};

const catalogDupProductCard = (group, product) => {
    const keep = product.id === group.suggestedKeepId;
    const idAttr = catalogDupEscape(product.id);
    return '<div class="bg-white rounded-2xl border ' + (keep ? 'border-[#FFD700] ring-2 ring-[#FFD700]/40' : 'border-purple-100') + ' p-3 flex flex-col gap-2">'
        + (keep ? '<div class="self-start bg-[#FFD700] text-[#230535] text-[10px] font-black px-2 py-0.5 rounded-full">الأفضل (يُنصح بالاحتفاظ)</div>' : '')
        + catalogDupImageBlock(product)
        + '<div class="font-black text-sm text-[#230535] leading-snug">' + catalogDupEscape(product.name_ar || '(بدون اسم)') + '</div>'
        + '<div class="text-[11px] text-slate-500 font-bold">' + catalogDupEscape(product.name_en || '') + '</div>'
        + '<div class="text-[11px] text-slate-600 leading-relaxed max-h-16 overflow-y-auto">' + catalogDupEscape(product.description_ar || '(بدون وصف)') + '</div>'
        + '<div class="text-[11px] text-slate-400 leading-relaxed max-h-12 overflow-y-auto">' + catalogDupEscape(product.description_en || '') + '</div>'
        + '<div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">'
        + '<span class="text-xs font-black text-[#230535]">' + catalogDupEscape(String(catalogDupPrice(product))) + ' ج.م</span>'
        + catalogDupStatusBadge(product.status)
        + '</div>'
        + '<div class="text-[10px] text-slate-400 space-y-0.5">'
        + '<div>أُنشئ: ' + catalogDupFormatTime(product.createdAt) + '</div>'
        + '<div>آخر تعديل: ' + catalogDupFormatTime(product.updatedAt) + (product.updatedBy ? ' — ' + catalogDupEscape(product.updatedBy) : '') + '</div>'
        + '<div class="font-mono break-all">ID: ' + idAttr + '</div>'
        + '</div>'
        + '<div class="flex flex-col gap-2 mt-auto pt-2">'
        + (keep ? '' : '<button type="button" data-dup-action="keep" data-group="' + group.__index + '" data-id="' + idAttr + '" class="w-full bg-[#230535] text-[#FFD700] py-2 rounded-xl font-black text-xs hover:opacity-90 transition"><i class="fa-solid fa-check-double ml-1"></i> الاحتفاظ بهذا وحذف الباقي</button>')
        + '<button type="button" data-dup-action="delete" data-group="' + group.__index + '" data-id="' + idAttr + '" class="w-full bg-red-50 text-red-600 border border-red-200 py-2 rounded-xl font-black text-xs hover:bg-red-100 transition"><i class="fa-solid fa-trash-can ml-1"></i> حذف هذا المستند</button>'
        + '</div>'
        + '</div>';
};

const catalogDupGroupCard = (group) => {
    return '<div class="bg-kanjo-light rounded-3xl border border-purple-100 p-3 sm:p-4" data-dup-group="' + group.__index + '">'
        + '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">'
        + '<div class="flex flex-wrap items-center gap-2">'
        + '<span class="bg-[#230535] text-[#FFD700] text-[11px] font-black px-3 py-1 rounded-full font-mono">' + catalogDupEscape(group.sku) + '</span>'
        + (group.merchantName ? '<span class="text-xs font-black text-[#230535]">' + catalogDupEscape(group.merchantName) + '</span>' : '')
        + '<span class="text-[11px] font-bold text-slate-400">' + catalogDupEscape(String(group.products.length)) + ' مستندات متطابقة</span>'
        + '</div>'
        + '<button type="button" data-dup-action="auto-merge" data-group="' + group.__index + '" class="bg-[#FFD700] text-[#230535] px-3 py-2 rounded-xl font-black text-xs hover:opacity-90 transition shadow-sm"><i class="fa-solid fa-wand-magic-sparkles ml-1"></i> الدمج الذكي</button>'
        + '</div>'
        + '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">'
        + group.products.map((p) => catalogDupProductCard(group, p)).join('')
        + '</div>'
        + '</div>';
};

const catalogDupConflictSection = () => {
    if (!catalogDupState.conflicts.length) return '';
    const cards = catalogDupState.conflicts.map((conflict) => {
        const rows = conflict.products.map((p) => '<li class="flex flex-wrap items-center gap-2 py-1 border-b border-amber-100 last:border-0">'
            + '<span class="font-black text-[#230535] text-xs">' + catalogDupEscape(p.name_ar || '(بدون اسم)') + '</span>'
            + '<span class="text-[10px] text-slate-400 font-mono">' + catalogDupEscape(p.id) + '</span>'
            + '<span class="text-[10px] text-slate-400">' + catalogDupEscape(String(catalogDupPrice(p))) + ' ج.م</span>'
            + '</li>').join('');
        return '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3">'
            + '<div class="flex items-center gap-2 mb-1"><i class="fa-solid fa-triangle-exclamation text-amber-500"></i>'
            + '<span class="font-black text-xs text-amber-700">تعارض SKU (منتجات مختلفة) — يحتاج مراجعة يدوية</span>'
            + '<span class="font-mono text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">' + catalogDupEscape(conflict.sku) + '</span></div>'
            + '<ul class="text-[11px]">' + rows + '</ul>'
            + '</div>';
    }).join('');
    return '<div class="space-y-2"><div class="text-xs font-black text-amber-700"><i class="fa-solid fa-circle-exclamation ml-1"></i>تعارضات لا تُحل تلقائياً (' + catalogDupState.conflicts.length + ')</div>' + cards + '</div>';
};

const catalogDupEmptyState = () => '<div class="text-center py-16 text-slate-400">'
    + '<i class="fa-solid fa-circle-check text-5xl text-emerald-400 mb-3"></i>'
    + '<div class="font-black text-lg text-[#230535]">لا توجد تكرارات</div>'
    + '<div class="text-xs font-bold mt-1">' + (catalogDupState.allGroups.length ? 'لا نتائج ضمن الفلتر المحدد' : 'الكتالوج نظيف — لا توجد منتجات بنفس SKU والتاجر والاسم') + '</div>'
    + '</div>';

const catalogDupSpinner = () => '<div class="text-center py-16 text-slate-400">'
    + '<i class="fa-solid fa-circle-notch fa-spin text-4xl text-[#230535] mb-3"></i>'
    + '<div class="font-black text-sm">جاري فحص الكتالوج...</div>'
    + '</div>';

const catalogDupUpdateSummary = () => {
    const summary = document.getElementById('catalogDuplicatesSummary');
    if (!summary) return;
    const groups = catalogDupState.groups;
    const docs = groups.reduce((n, g) => n + g.products.length, 0);
    const extras = groups.reduce((n, g) => n + g.products.length - 1, 0);
    summary.innerHTML = 'مجموعات التكرار: <span class="text-[#230535]">' + groups.length + '</span>'
        + ' — مستندات زائدة قابلة للحذف: <span class="text-red-600">' + extras + '</span>'
        + ' — إجمالي المستندات المتطابقة: <span class="text-slate-700">' + docs + '</span>'
        + (catalogDupState.conflicts.length ? ' — تعارضات: <span class="text-amber-600">' + catalogDupState.conflicts.length + '</span>' : '');
};

const catalogDupReindex = () => {
    catalogDupState.groups.forEach((group, index) => { group.__index = index; });
};

const catalogDupRender = () => {
    const list = document.getElementById('catalogDuplicatesList');
    if (!list) return;
    catalogDupUpdateSummary();
    if (!catalogDupState.groups.length && !catalogDupState.conflicts.length) {
        list.innerHTML = catalogDupEmptyState();
        return;
    }
    list.innerHTML = catalogDupState.groups.map(catalogDupGroupCard).join('')
        + catalogDupConflictSection();
};

const catalogDupPopulateFilter = () => {
    const select = document.getElementById('catalogDuplicatesMerchantFilter');
    if (!select) return;
    const names = new Map();
    catalogDupState.allGroups.forEach((g) => {
        if (g.merchantName) names.set(g.merchantName, (names.get(g.merchantName) || 0) + 1);
    });
    catalogDupState.allConflicts.forEach((c) => {
        if (c.merchantName) names.set(c.merchantName, (names.get(c.merchantName) || 0) + 1);
    });
    const current = select.value;
    const html = ['<option value="">كل التجار</option>']
        .concat(Array.from(names.keys()).sort((a, b) => a.localeCompare(b, 'ar'))
            .map((name) => '<option value="' + catalogDupEscape(name) + '">' + catalogDupEscape(name) + ' (' + names.get(name) + ')</option>'))
        .join('');
    select.innerHTML = html;
    select.value = (current && names.has(current)) ? current : '';
};

const catalogDupApplyFilter = () => {
    const select = document.getElementById('catalogDuplicatesMerchantFilter');
    const merchant = select ? select.value : '';
    catalogDupState.groups = catalogDupState.allGroups.filter((g) => !merchant || g.merchantName === merchant);
    catalogDupState.conflicts = catalogDupState.allConflicts.filter((c) => !merchant || c.merchantName === merchant);
    catalogDupReindex();
    catalogDupRender();
};

const catalogDupSetBusy = (busy) => {
    catalogDupState.busy = busy;
    const root = document.getElementById('catalogDuplicatesModal');
    if (!root) return;
    root.querySelectorAll('[data-dup-action],[data-dup-toolbar]').forEach((btn) => { btn.disabled = busy; });
    root.classList.toggle('catalog-dup-busy', busy);
};

const catalogDupConfirm = async (title, html) => {
    if (!window.Swal || typeof window.Swal.fire !== 'function') {
        return window.confirm(title + '\n' + String(html || '').replace(/<[^>]*>/g, ' '));
    }
    const res = await window.Swal.fire({
        icon: 'warning',
        title,
        html,
        showCancelButton: true,
        confirmButtonText: 'نعم، متابعة',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#230535',
        cancelButtonColor: '#94a3b8',
        reverseButtons: true,
        focusCancel: true
    });
    return !!(res && res.isConfirmed);
};

const catalogDupRemoveDocs = async (group, keepId, docs) => {
    const api = catalogDupApi();
    const removedIds = [];
    if (!api) return removedIds;
    for (const doc of docs) {
        try {
            const ok = await api.remove(doc.id, {
                name: doc.name_ar || doc.sku,
                sku: group.sku,
                description: 'إزالة منتج مكرر (نفس SKU ' + group.sku + ') - أُبقي على ' + keepId
            });
            if (ok) removedIds.push(doc.id);
            else if (window.showToast) window.showToast('فشل حذف المستند ' + doc.id, false);
        } catch (err) {
            console.error('[catalogDuplicates] delete failed:', doc.id, err);
            if (window.showToast) window.showToast('فشل حذف المستند ' + doc.id, false);
        }
    }
    return removedIds;
};

const catalogDupApplyRemoved = (group, removedIds) => {
    if (!removedIds.length) return;
    const removedSet = new Set(removedIds);
    group.products = group.products.filter((p) => !removedSet.has(p.id));
    if (group.products.length <= 1) {
        const idx = catalogDupState.groups.indexOf(group);
        if (idx !== -1) catalogDupState.groups.splice(idx, 1);
    }
};

const catalogDupResolveGroup = async (groupIndex, keepId, skipConfirm) => {
    if (catalogDupState.busy) return;
    const group = catalogDupState.groups[groupIndex];
    if (!group) return;
    const keep = group.products.find((p) => p.id === keepId) || group.products[0];
    const remove = group.products.filter((p) => p.id !== keep.id);
    if (!remove.length) return;
    if (!skipConfirm) {
        const ok = await catalogDupConfirm('تأكيد الدمج', 'سيتم الاحتفاظ بالمستند <span class="font-mono text-xs">' + catalogDupEscape(keep.id) + '</span>'
            + ' وحذف <span class="font-black text-red-600">' + remove.length + '</span> مستند مكرر لنفس الـ SKU <span class="font-mono text-xs">' + catalogDupEscape(group.sku) + '</span>. لا يمكن التراجع.');
        if (!ok) return;
    }
    catalogDupSetBusy(true);
    try {
        const removedIds = await catalogDupRemoveDocs(group, keep.id, remove);
        if (removedIds.length) {
            catalogDupApplyRemoved(group, removedIds);
            catalogDupReindex();
            catalogDupRender();
            window.refreshCatalogDuplicatesBadge();
            if (window.showToast) window.showToast('تم حذف ' + removedIds.length + ' مستند مكرر');
        }
    } finally {
        catalogDupSetBusy(false);
    }
};

const catalogDupDeleteDoc = async (groupIndex, id) => {
    if (catalogDupState.busy) return;
    const group = catalogDupState.groups[groupIndex];
    if (!group) return;
    const doc = group.products.find((p) => p.id === id);
    if (!doc) return;
    const ok = await catalogDupConfirm('حذف مستند', 'سيتم حذف المستند <span class="font-mono text-xs">' + catalogDupEscape(doc.id) + '</span>'
        + ' («' + catalogDupEscape(doc.name_ar || '') + '»). لا يمكن التراجع.');
    if (!ok) return;
    catalogDupSetBusy(true);
    try {
        const removedIds = await catalogDupRemoveDocs(group, id, [doc]);
        if (removedIds.length) {
            catalogDupApplyRemoved(group, removedIds);
            catalogDupReindex();
            catalogDupRender();
            window.refreshCatalogDuplicatesBadge();
        }
    } finally {
        catalogDupSetBusy(false);
    }
};

window.openCatalogDuplicatesModal = async () => {
    const api = catalogDupApi();
    if (!api || !api.isAdmin()) {
        if (window.showToast) window.showToast('معالجة التكرارات متاحة للإدارة فقط', false);
        return;
    }
    const modal = document.getElementById('catalogDuplicatesModal');
    if (modal) modal.classList.remove('hidden');
    catalogDupBind();
    await window.loadCatalogDuplicates();
};

window.closeCatalogDuplicatesModal = () => {
    const modal = document.getElementById('catalogDuplicatesModal');
    if (modal) modal.classList.add('hidden');
};

window.loadCatalogDuplicates = async () => {
    const api = catalogDupApi();
    const list = document.getElementById('catalogDuplicatesList');
    if (!api) return;
    if (list) list.innerHTML = catalogDupSpinner();
    try {
        const scan = await api.scan({});
        catalogDupState.allGroups = scan.duplicateGroups || [];
        catalogDupState.allConflicts = scan.conflicts || [];
        catalogDupPopulateFilter();
        catalogDupApplyFilter();
    } catch (err) {
        console.error('[catalogDuplicates] scan failed:', err);
        if (list) {
            list.innerHTML = '<div class="text-center py-16 text-red-500 font-black"><i class="fa-solid fa-triangle-exclamation text-4xl mb-2"></i><div>فشل فحص التكرارات</div></div>';
        }
    }
    window.refreshCatalogDuplicatesBadge();
};

/* Zero-read badge: computed only from the in-memory catalog cache. */
window.refreshCatalogDuplicatesBadge = () => {
    const badge = document.getElementById('catalogDuplicatesBadge');
    if (!badge) return 0;
    const api = catalogDupApi();
    const products = Array.isArray(window.allCatalogProductsCache) ? window.allCatalogProductsCache : [];
    if (!api || !products.length) {
        badge.classList.add('hidden');
        badge.textContent = '0';
        return 0;
    }
    const groups = new Map();
    products.forEach((p) => {
        const sku = String(p.sku || '').trim();
        if (!sku) return;
        if (!groups.has(sku)) groups.set(sku, new Map());
        const byIdentity = groups.get(sku);
        const key = api.identityKey(p);
        if (!byIdentity.has(key)) byIdentity.set(key, []);
        byIdentity.get(key).push(p);
    });
    let count = 0;
    groups.forEach((byIdentity) => {
        byIdentity.forEach((list) => { if (list.length > 1) count += list.length - 1; });
    });
    badge.textContent = String(count);
    badge.classList.toggle('hidden', !count);
    return count;
};

const catalogDupAutoMergeGroup = async (groupIndex) => {
    const group = catalogDupState.groups[groupIndex];
    if (!group) return;
    await catalogDupResolveGroup(groupIndex, group.suggestedKeepId, false);
};

const catalogDupAutoMergeAll = async () => {
    if (catalogDupState.busy) return;
    if (!catalogDupState.groups.length) {
        if (window.showToast) window.showToast('لا توجد مجموعات تكرار للمعالجة');
        return;
    }
    const total = catalogDupState.groups.reduce((n, g) => n + g.products.length - 1, 0);
    const ok = await catalogDupConfirm('الدمج الذكي للكل',
        'سيتم تلقائياً الاحتفاظ بالمستند الأفضل في كل مجموعة (الأكثر صوراً / الأحدث) وحذف '
        + '<span class="font-black text-red-600">' + total + '</span> مستنداً مكرراً موزعة على '
        + '<span class="font-black">' + catalogDupState.groups.length + '</span> مجموعة. لا يمكن التراجع.');
    if (!ok) return;
    catalogDupSetBusy(true);
    try {
        for (let i = catalogDupState.groups.length - 1; i >= 0; i--) {
            const group = catalogDupState.groups[i];
            if (!group) continue;
            const remove = group.products.filter((p) => p.id !== group.suggestedKeepId);
            if (!remove.length) continue;
            const removedIds = await catalogDupRemoveDocs(group, group.suggestedKeepId, remove);
            catalogDupApplyRemoved(group, removedIds);
        }
        catalogDupReindex();
        catalogDupRender();
        window.refreshCatalogDuplicatesBadge();
        if (window.showToast) window.showToast('تم الدمج الذكي بنجاح');
    } finally {
        catalogDupSetBusy(false);
    }
};

const catalogDupHandleListClick = (event) => {
    const btn = event.target && event.target.closest ? event.target.closest('[data-dup-action]') : null;
    if (!btn) return undefined;
    const action = btn.getAttribute('data-dup-action');
    const groupIndex = Number(btn.getAttribute('data-group'));
    const id = btn.getAttribute('data-id');
    if (action === 'auto-merge') return catalogDupAutoMergeGroup(groupIndex);
    if (action === 'keep') return catalogDupResolveGroup(groupIndex, id, false);
    if (action === 'delete') return catalogDupDeleteDoc(groupIndex, id);
    return undefined;
};

let catalogDupBound = false;
const catalogDupBind = () => {
    if (catalogDupBound) return;
    const root = document.getElementById('catalogDuplicatesModal');
    if (!root) return;
    catalogDupBound = true;
    const list = document.getElementById('catalogDuplicatesList');
    if (list) list.addEventListener('click', catalogDupHandleListClick);
    root.addEventListener('change', (event) => {
        if (event.target && event.target.id === 'catalogDuplicatesMerchantFilter') catalogDupApplyFilter();
    });
    root.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-dup-toolbar]') : null;
        if (!btn) return undefined;
        const tool = btn.getAttribute('data-dup-toolbar');
        if (tool === 'refresh') return window.loadCatalogDuplicates();
        if (tool === 'auto-merge-all') return catalogDupAutoMergeAll();
        return undefined;
    });
};

/* Recompute the badge whenever the catalog cache is populated at boot. */
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.refreshCatalogDuplicatesBadge(), 0);
});
