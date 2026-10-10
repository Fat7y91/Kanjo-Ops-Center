/* Kanjo Ops — Marketing Agency Portal (standalone, READ-ONLY)
   ---------------------------------------------------------------------------
   Serves the `marketing_agency` role on its own isolated page (agency.html).
   It exposes exactly two things: the vendor directory (`merchants`) and a
   paginated product catalog (`merchant_products`).

   Anti-scraping posture:
     - every product request is server-paginated at 24 items (limit + offset);
     - all export / edit / delete / admin controls are absent from this page;
     - the grid text is non-selectable and images reject right-click + drag;
     - the grid/lightbox never expose a download affordance.
   Firestore rules (firestore.rules `isMarketingAgency()`) additionally deny
   every write and every sensitive read for this role.
   This module is intentionally self-contained: it never imports the ops
   dashboard's 470 KB catalog bundle. */

import './config/firebase.js';
import { users, categories } from './config/constants.js';

const SESSION_KEY = 'kanjo_agency_session';
const VENDORS_COLLECTION = 'merchants';
const PRODUCTS_COLLECTION = 'merchant_products';
const PAGE_SIZE = 24;
const IDLE_TIMEOUT = 30 * 60 * 1000;

const PRODUCT_FIELDS = [
    'name_ar', 'name_en', 'description_ar', 'description_en', 'category',
    'merchantId', 'merchantName', 'base_price', 'price',
    'rawImageUrl', 'rawImageUrls', 'enhancedImageUrl', 'enhancedImageUrls',
    'variations', 'status'
];
const VENDOR_FIELDS = ['name', 'merchantId', 'createdAt', 'logoUrl', 'logo', 'contractStatus', 'productCount'];

/* Contracted vendors only — the portal deliberately hides every merchant that
   is not a final agreement ('final') or an under-contract VIP pre-agreement
   ('vip'). Status is denormalized onto `merchants.contractStatus` by
   scripts/sync-merchant-status.mjs, so no operational data is ever read here. */
const VENDOR_SECTIONS = [
    {
        key: 'success',
        title: 'شركاء النجاح',
        subtitle: 'تعاقد نهائي · الكتالوج متاح',
        icon: 'fa-trophy',
        match: (v) => v.contractStatus === 'final' && v.productCount > 0
    },
    {
        key: 'under',
        title: 'شركاء تحت التعاقد',
        subtitle: 'عرض مبدئي · VIP',
        icon: 'fa-file-signature',
        match: (v) => v.contractStatus === 'vip'
    },
    {
        key: 'prep',
        title: 'جاري تجهيز الكتالوج',
        subtitle: 'تعاقد نهائي · بانتظار المنتجات',
        icon: 'fa-screwdriver-wrench',
        match: (v) => v.contractStatus === 'final' && !(v.productCount > 0)
    }
];

const state = {
    view: 'vendors',
    category: '',
    vendorId: '',
    vendorName: '',
    page: 1,
    items: [],
    total: 0,
    vendors: [],
    vendorLogos: new Map(),
    vendorsLoaded: false
};

let requestSeq = 0;
let idleTimer = null;

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── Image helpers (mirror the dashboard's Drive thumbnail strategy) ─────── */
const driveFileId = (value) => {
    const s = String(value || '');
    if (!s) return '';
    const m1 = s.match(/[?&]id=([^&]+)/);
    if (m1 && m1[1]) return decodeURIComponent(m1[1]);
    const m2 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return m2[1];
    if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
    return '';
};
const driveThumb = (value, size) => {
    const id = driveFileId(value);
    if (!id) return /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=' + (size || 'w400');
};
const firstOf = (maybeArray, fallback) => {
    if (Array.isArray(maybeArray) && maybeArray.length) {
        const v = maybeArray.find((x) => x && String(x).trim());
        if (v) return v;
    }
    return fallback || '';
};
const productImage = (p) => {
    const enhanced = firstOf(p.enhancedImageUrls, p.enhancedImageUrl);
    const raw = firstOf(p.rawImageUrls, p.rawImageUrl);
    const variant = Array.isArray(p.variations)
        ? (p.variations.map((v) => v && (v.image_url || v.imageUrl)).find(Boolean) || '')
        : '';
    return driveThumb(enhanced || raw || variant, 'w400');
};
const productName = (p) => {
    const ar = String(p.name_ar || '').trim();
    const en = String(p.name_en || '').trim();
    return ar || en || 'منتج بدون اسم';
};
const productVendor = (p) => String(p.merchantName || p.merchant_name || '').trim();

const monogram = (name) => {
    const clean = String(name || '?').trim();
    if (!clean) return '?';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (/^[\u0600-\u06FF]/.test(clean)) return clean.slice(0, 1);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
};
const monogramColor = (name) => {
    const palette = [
        ['#4B0082', '#7C3AED'], ['#230535', '#4B0082'], ['#6D28D9', '#A855F7'],
        ['#7C2D12', '#C2410C'], ['#1E3A8A', '#2563EB'], ['#065F46', '#059669'],
        ['#9D174D', '#DB2777'], ['#854D0E', '#D97706']
    ];
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const pair = palette[h % palette.length];
    return 'linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')';
};

/* Vendor logo: accepts a direct http(s) URL, a Drive link/id, or a data URI.
   Returns '' when no usable source is present so the caller falls back to a
   monogram. Real logos are optional — merchants without one stay monogrammed. */
const vendorLogoSrc = (v) => {
    const raw = String((v && (v.logoUrl || v.logo)) || '').trim();
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;
    return driveThumb(raw, 'w200');
};

/* ── Session / login ─────────────────────────────────────────────────────── */
const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (currentUser) logout(); }, IDLE_TIMEOUT);
};
let currentUser = null;

const registerEnrollmentHint = async (user) => {
    try {
        const uid = window.auth && window.auth.currentUser && window.auth.currentUser.uid;
        if (!uid || !window.kanjoRest || typeof window.kanjoRest.patch !== 'function') return;
        await window.kanjoRest.patch(['enrollment_requests', uid], {
            uid,
            name: user.name || '',
            role: 'marketing_agency',
            team: '',
            at: new Date()
        });
    } catch (_) { /* untrusted hint — safe to ignore */ }
};

const logout = () => {
    clearTimeout(idleTimer);
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    location.reload();
};

const showApp = () => {
    $('agencyLogin').classList.add('hidden');
    $('agencyApp').classList.remove('hidden');
    $('agencyUserName').textContent = (currentUser && currentUser.name) || 'ماجنت';
};

const showLoginError = (msg) => {
    const el = $('agencyLoginError');
    el.textContent = msg;
    el.classList.remove('hidden');
};

const doLogin = async (pin) => {
    const key = String(pin || '').trim();
    const user = key ? users[key] : null;
    if (!user || user.role !== 'marketing_agency') {
        showLoginError('رمز الدخول غير صحيح أو غير مصرّح لهذه البوابة.');
        return;
    }
    currentUser = { name: user.name, role: user.role, pin: key };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch (_) {}
    showApp();
    resetIdleTimer();
    registerEnrollmentHint(currentUser);
    boot();
};

const restoreSession = () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) {}
    if (!saved || !saved.pin) return false;
    const user = users[String(saved.pin)];
    if (!user || user.role !== 'marketing_agency') return false;
    currentUser = { name: user.name, role: user.role, pin: String(saved.pin) };
    showApp();
    resetIdleTimer();
    boot();
    return true;
};

/* ── Rendering ───────────────────────────────────────────────────────────── */
const vendorCardHtml = (v) => {
    const name = escapeHtml(v.name || v.id);
    const display = v.name || v.id;
    const color = monogramColor(display);
    const initials = escapeHtml(monogram(display));
    const src = vendorLogoSrc(v);
    const media = src
        ? `<img class="monogram-logo" src="${escapeHtml(src)}" alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror="this.style.display='none';var m=this.nextElementSibling;if(m){m.style.display='flex';}"><div class="monogram" style="display:none;background:${color}">${initials}</div>`
        : `<div class="monogram" style="background:${color}">${initials}</div>`;
    return `
    <button type="button" class="vendor-card" data-vendor-id="${escapeHtml(v.id)}" data-vendor-name="${name}">
        ${media}
        <div class="text-[#230535] font-bold text-sm leading-snug line-clamp-2 min-h-[2.4rem] px-1">${name}</div>
        <div class="text-[11px] text-purple-500/80 mt-1 font-semibold">عرض المنتجات <i class="fa-solid fa-arrow-left mr-0.5"></i></div>
    </button>`;
};

const renderVendors = () => {
    const grid = $('vendorsGrid');
    const list = state.vendors;
    $('vendorsCount').textContent = String(list.length);
    $('vendorsLoading').classList.add('hidden');
    if (!list.length) {
        grid.innerHTML = '';
        $('vendorsEmpty').classList.remove('hidden');
        return;
    }
    $('vendorsEmpty').classList.add('hidden');
    grid.innerHTML = VENDOR_SECTIONS.map((section) => {
        const items = list.filter(section.match);
        if (!items.length) return '';
        return `
        <section class="vendor-section" data-section="${section.key}">
            <div class="vendor-section-head accent-${section.key}">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="vendor-section-icon"><i class="fa-solid ${section.icon}"></i></span>
                    <div class="min-w-0">
                        <h3 class="vendor-section-title">${section.title}</h3>
                        <p class="vendor-section-sub">${section.subtitle}</p>
                    </div>
                </div>
                <span class="vendor-section-count">${items.length}</span>
            </div>
            <div class="vendor-grid">${items.map(vendorCardHtml).join('')}</div>
        </section>`;
    }).join('');
};

const populateVendorSelect = () => {
    const sel = $('filterVendor');
    const current = state.vendorId;
    sel.innerHTML = '<option value="">كل الموردين</option>' + state.vendors
        .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name || v.id)}</option>`).join('');
    sel.value = current;
};

const populateCategorySelect = () => {
    const sel = $('filterCategory');
    sel.innerHTML = '<option value="">كل الفئات</option>' + categories
        .slice().sort().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    sel.value = state.category;
};

const cardsSkeleton = (n) => Array.from({ length: n }).map(() => `
    <div class="rounded-2xl overflow-hidden skeleton" style="aspect-ratio:4/5"></div>`).join('');

const renderProducts = () => {
    const grid = $('productsGrid');
    $('productsCount').textContent = String(state.total);
    $('productsLoading').classList.add('hidden');
    if (!state.items.length) {
        grid.innerHTML = '';
        $('productsEmpty').classList.remove('hidden');
        return;
    }
    $('productsEmpty').classList.add('hidden');
    grid.innerHTML = state.items.map((p) => {
        const img = productImage(p);
        const vendor = productVendor(p);
        const cat = String(p.category || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'غير مصنف';
        const vlogo = state.vendorLogos.get(String(p.merchantId || ''));
        const vendorBadge = vlogo
            ? `<img class="vendor-badge" src="${escapeHtml(vlogo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" onerror="this.outerHTML='<i class=&quot;fa-solid fa-store&quot;></i>'">`
            : `<i class="fa-solid fa-store"></i>`;
        const thumb = img
            ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="ph" style="display:none"><i class="fa-solid fa-image"></i></span>`
            : `<span class="ph"><i class="fa-solid fa-image"></i></span>`;
        return `
        <div class="product-card" data-product-id="${escapeHtml(p.id || '')}">
            <div class="product-thumb">${thumb}</div>
            <div class="p-3 flex-1 flex flex-col">
                <div class="text-[#230535] font-bold text-sm leading-snug line-clamp-2 min-h-[2.5rem]">${escapeHtml(productName(p))}</div>
                <div class="mt-2 flex items-center gap-1 text-[11px] text-purple-600 font-bold"><i class="fa-solid fa-tag"></i> <span class="truncate">${escapeHtml(cat)}</span></div>
                ${vendor ? `<div class="mt-1 flex items-center gap-1 text-[11px] text-slate-500 font-semibold">${vendorBadge} <span class="truncate">${escapeHtml(vendor)}</span></div>` : ''}
            </div>
        </div>`;
    }).join('');
    bindProductCards();
};

const renderPager = () => {
    const pager = $('productsPager');
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.total <= PAGE_SIZE) { pager.classList.add('hidden'); return; }
    pager.classList.remove('hidden');
    $('pagerInfo').textContent = `صفحة ${state.page} من ${totalPages}`;
    $('pagerPrev').disabled = state.page <= 1;
    $('pagerNext').disabled = state.page >= totalPages;
};

const setLoading = (on) => {
    const grid = $('productsGrid');
    $('productsEmpty').classList.add('hidden');
    if (on) {
        $('productsLoading').classList.remove('hidden');
        $('productsPager').classList.add('hidden');
        grid.innerHTML = cardsSkeleton(PAGE_SIZE > 12 ? 12 : PAGE_SIZE);
    } else {
        $('productsLoading').classList.add('hidden');
    }
};

/* ── Data ────────────────────────────────────────────────────────────────── */
const loadVendors = async () => {
    if (state.vendorsLoaded) return;
    try {
        await window.authReady;
        const rows = await window.kanjoRest.list([VENDORS_COLLECTION], { pageSize: 300, maxPages: 20, select: VENDOR_FIELDS });
        state.vendors = (rows || [])
            .filter((r) => r && (r.name || r.id))
            .map((r) => ({
                id: r.id || r.merchantId,
                name: r.name || r.merchantId || r.id,
                logoUrl: r.logoUrl || r.logo || '',
                contractStatus: String(r.contractStatus || ''),
                productCount: Number(r.productCount) || 0
            }))
            .filter((v) => v.contractStatus === 'final' || v.contractStatus === 'vip')
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
        state.vendorsLoaded = true;
        state.vendorLogos = new Map();
        state.vendors.forEach((v) => {
            const src = vendorLogoSrc(v);
            if (src) state.vendorLogos.set(String(v.id), src);
        });
        renderVendors();
        populateVendorSelect();
    } catch (err) {
        $('vendorsLoading').classList.add('hidden');
        $('vendorsEmpty').classList.remove('hidden');
        console.error('[agency] vendors load failed:', err);
    }
};

const loadProducts = async () => {
    const seq = ++requestSeq;
    setLoading(true);
    try {
        await window.authReady;
        const filters = [];
        if (state.category) filters.push(['category', '==', state.category]);
        if (state.vendorId) filters.push(['merchantId', '==', state.vendorId]);
        const offset = (state.page - 1) * PAGE_SIZE;
        const [rows, total] = await Promise.all([
            window.kanjoRest.runQuery(PRODUCTS_COLLECTION, filters, PAGE_SIZE, { offset, select: PRODUCT_FIELDS }),
            window.kanjoRest.count(PRODUCTS_COLLECTION, filters)
        ]);
        if (seq !== requestSeq) return;
        state.items = rows || [];
        state.total = Number(total) || 0;
        renderProducts();
        renderPager();
    } catch (err) {
        if (seq !== requestSeq) return;
        console.error('[agency] products load failed:', err);
        state.items = [];
        state.total = 0;
        renderProducts();
        renderPager();
        if (typeof window.showToast !== 'function') {
            const grid = $('productsGrid');
            grid.innerHTML = '<div class="col-span-full text-center text-rose-200 font-bold py-10">تعذّر تحميل المنتجات، حاول مرة أخرى.</div>';
        }
    }
};

/* ── Navigation / filters ────────────────────────────────────────────────── */
const setView = (view) => {
    state.view = view;
    $('navVendors').classList.toggle('active', view === 'vendors');
    $('navProducts').classList.toggle('active', view === 'products');
    $('vendorsView').classList.toggle('hidden', view !== 'vendors');
    $('productsView').classList.toggle('hidden', view !== 'products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'vendors') loadVendors();
    else loadProducts();
};

const resetToProducts = () => {
    state.page = 1;
    loadProducts();
};

const selectVendor = (id, name) => {
    state.vendorId = id || '';
    state.vendorName = name || '';
    state.category = '';
    state.page = 1;
    $('filterVendor').value = state.vendorId;
    $('filterCategory').value = '';
    updateActiveChip();
    setView('products');
};

const updateActiveChip = () => {
    const chip = $('activeVendorChip');
    if (state.vendorId) {
        $('activeVendorName').textContent = state.vendorName || state.vendorId;
        chip.classList.remove('hidden');
    } else {
        chip.classList.add('hidden');
    }
    const hasFilter = !!(state.vendorId || state.category);
    $('clearFilters').classList.toggle('hidden', !hasFilter);
};

const clearFilters = () => {
    state.category = '';
    state.vendorId = '';
    state.vendorName = '';
    state.page = 1;
    $('filterCategory').value = '';
    $('filterVendor').value = '';
    updateActiveChip();
    loadProducts();
};

/* ── Lightbox ────────────────────────────────────────────────────────────── */
const openLightbox = (product) => {
    const box = $('agencyLightbox');
    const img = $('lbImage');
    const full = driveThumb(
        firstOf(product.enhancedImageUrls, product.enhancedImageUrl) ||
        firstOf(product.rawImageUrls, product.rawImageUrl) ||
        '', 'w1000'
    );
    img.src = full || '';
    img.style.display = full ? 'block' : 'none';
    $('lbName').textContent = productName(product);
    const cat = String(product.category || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'غير مصنف';
    const vendor = productVendor(product);
    $('lbMeta').innerHTML =
        `<span class="inline-flex items-center gap-1 ml-3 font-bold text-[#4B0082]"><i class="fa-solid fa-tag"></i> ${escapeHtml(cat)}</span>` +
        (vendor ? `<span class="inline-flex items-center gap-1 font-bold text-slate-500"><i class="fa-solid fa-store"></i> ${escapeHtml(vendor)}</span>` : '');
    box.classList.remove('hidden');
    box.classList.add('flex');
};
const closeLightbox = () => {
    const box = $('agencyLightbox');
    box.classList.add('hidden');
    box.classList.remove('flex');
    $('lbImage').src = '';
};

const bindProductCards = () => {
    $('productsGrid').querySelectorAll('.product-card').forEach((card) => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-product-id');
            const product = state.items.find((p) => p.id === id);
            if (product) openLightbox(product);
        });
    });
};

/* ── Scraping friction ───────────────────────────────────────────────────── */
const installGuards = () => {
    const guarded = (target) => target && target.closest && target.closest('#productsGrid,#vendorsGrid,#agencyLightbox');
    document.addEventListener('contextmenu', (e) => { if (guarded(e.target)) e.preventDefault(); });
    document.addEventListener('dragstart', (e) => { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); });
    document.addEventListener('keydown', (e) => {
        const isSave = (e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(String(e.key).toLowerCase());
        if (isSave) e.preventDefault();
        if (e.key === 'Escape') closeLightbox();
    });
    document.addEventListener('selectstart', (e) => { if (guarded(e.target)) e.preventDefault(); });
};

/* ── Init ────────────────────────────────────────────────────────────────── */
const boot = () => {
    installGuards();
    populateCategorySelect();
    loadVendors();
    setView('vendors');
};

const bind = () => {
    $('agencyLoginBtn').addEventListener('click', () => doLogin($('agencyPin').value));
    $('agencyPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin($('agencyPin').value); });
    $('agencyLogout').addEventListener('click', logout);
    $('navVendors').addEventListener('click', () => setView('vendors'));
    $('navProducts').addEventListener('click', () => setView('products'));
    $('filterCategory').addEventListener('change', (e) => { state.category = e.target.value; resetToProducts(); updateActiveChip(); });
    $('filterVendor').addEventListener('change', (e) => {
        state.vendorId = e.target.value;
        state.vendorName = e.target.value ? (state.vendors.find((v) => v.id === e.target.value) || {}).name || '' : '';
        resetToProducts();
        updateActiveChip();
    });
    $('clearFilters').addEventListener('click', clearFilters);
    $('pagerPrev').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadProducts(); } });
    $('pagerNext').addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
        if (state.page < totalPages) { state.page += 1; loadProducts(); }
    });
    $('lbClose').addEventListener('click', closeLightbox);
    $('agencyLightbox').addEventListener('click', (e) => { if (e.target === $('agencyLightbox')) closeLightbox(); });
    $('vendorsGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.vendor-card');
        if (card) selectVendor(card.getAttribute('data-vendor-id'), card.getAttribute('data-vendor-name'));
    });
};

bind();
restoreSession();
