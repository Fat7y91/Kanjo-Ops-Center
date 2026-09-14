/* Kanjo Ops — Comprehensive KPI & Quality Tracking Engine
   ---------------------------------------------------------------------------
   Contains:
     1. RBAC gate for the KPI dashboard (Founders + Operations Manager only).
     2. Interaction-based active time tracker (localStorage + idle timeout) that
        syncs to rep_kpis/{repId}/daily_stats/{date}.
     3. Retroactive historical time calculator (calculateHistoricalTime).
     4. Image-editor (content team) work-time tracker.
     5. Strict anti-gaming quality validation (descriptions, images, variables).
     6. Rendering of the premium admin KPI dashboard. */

const KPI_REP_COLLECTION = 'rep_kpis';
const KPI_STATS_SUBCOLLECTION = 'daily_stats';
const KPI_PRODUCTS_COLLECTION = 'merchant_products';
const KPI_ACTIVE_TIME_KEY = 'kanjo_kpi_active_time_v1';
const KPI_IMAGE_EDIT_KEY = 'kanjo_kpi_image_edit_v1';

const KPI_IDLE_MS = 3 * 60 * 1000;          // pause after 3 minutes of inactivity
const KPI_SESSION_BREAK_MS = 15 * 60 * 1000; // gap larger than this = new session
const KPI_STANDARD_ADD_MS = 4 * 60 * 1000;   // assumed time for the first product / new session
const KPI_IMAGE_EDIT_MAX_SECONDS = 4 * 60 * 60; // clamp a single edit to 4h (anti-gaming)

/* Only real word tokens (Arabic or Latin, 3+ letters) make a description valid. */
const KPI_WORD_RE = /[a-zA-Z\u0600-\u06FF]{3,}/;

/* ───────────────────────────── RBAC ───────────────────────────── */

window.canViewKpiDashboard = () => {
    const u = window.currentUser;
    if (!u) return false;
    if (u.role === 'rep' || u.role === 'data_entry' || u.role === 'accounting') return false;
    if (typeof window.isCatalogFounderUser === 'function' && window.isCatalogFounderUser()) return true;
    if (typeof window.isMahmoudUser === 'function' && window.isMahmoudUser()) return true;
    if (typeof window.isMahmoudOpsUser === 'function' && window.isMahmoudOpsUser()) return true;
    return false;
};

/* Reps and the content/editor role (يوسف) are the only roles whose time is
   actively tracked. */
window.isKpiTrackedUser = () => {
    const u = window.currentUser;
    if (!u || u.role === 'data_entry') return false;
    if (u.role === 'rep') return true;
    return typeof window.isCatalogContentUser === 'function' && window.isCatalogContentUser();
};

/* ─────────────────────── shared helpers ─────────────────────── */

const kpiLocalDateKey = (value) => {
    const d = value ? new Date(value) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
};

const kpiRepId = (name) => {
    const clean = String(name || '').trim().replace(/[\/\s]+/g, '_').replace(/[^\u0600-\u06FFa-zA-Z0-9_.-]/g, '');
    return clean || 'unknown';
};

const kpiToMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
};

const kpiProductRepName = (p) => String(
    (p && (p.added_by || p.createdBy || p.addedBy || p.created_by || p.repName)) || ''
).trim() || 'غير معروف';

const kpiImageUrls = (p) => {
    if (!p) return [];
    const lists = [];
    if (Array.isArray(p.enhancedImageUrls)) lists.push(...p.enhancedImageUrls);
    if (Array.isArray(p.rawImageUrls)) lists.push(...p.rawImageUrls);
    if (Array.isArray(p.images)) lists.push(...p.images);
    [p.enhancedImageUrl, p.rawImageUrl, p.image_url, p.image].forEach((u) => { if (u) lists.push(u); });
    return lists.map((u) => String(u || '').trim()).filter(Boolean)
        .filter((u, i, arr) => arr.indexOf(u) === i);
};

const kpiProductHasImage = (p) => kpiImageUrls(p).length > 0;

const kpiProductVariations = (p) => (Array.isArray(p && p.variations) ? p.variations : [])
    .filter((v) => v && String(v.name || '').trim());

const kpiProductMerchantName = (p) => String(
    (p && (p.merchantName || p.merchant || p.merchant_name)) || ''
).trim();

/* Strict description validation — anti-gaming. A description is valid ONLY if
   it is longer than 10 characters AND contains a real word token. Anything
   non-empty that fails (e.g. "-", ".", "جيد") is flagged as junk/fake. */
window.kpiValidateDescription = (description) => {
    const text = String(description == null ? '' : description).trim();
    const isEmpty = text.length === 0;
    const lengthOk = text.length > 10;
    const hasWords = KPI_WORD_RE.test(text);
    const isValid = !isEmpty && lengthOk && hasWords;
    return {
        text,
        length: text.length,
        isEmpty,
        lengthOk,
        hasWords,
        isValid,
        isJunk: !isEmpty && !isValid
    };
};

/* ─────────────────── active time tracker ─────────────────── */

const kpiReadActiveStore = () => {
    const today = kpiLocalDateKey();
    try {
        const raw = localStorage.getItem(KPI_ACTIVE_TIME_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || parsed.date !== today) return { date: today, seconds: 0 };
        return { date: today, seconds: Math.max(0, Number(parsed.seconds) || 0) };
    } catch (_) {
        return { date: today, seconds: 0 };
    }
};

const kpiWriteActiveStore = (store) => {
    try { localStorage.setItem(KPI_ACTIVE_TIME_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ }
};

window._kpiActiveSeconds = kpiReadActiveStore().seconds;
window._kpiLastActivity = Date.now();
window._kpiIdle = false;
window._kpiTrackerStarted = false;

const kpiPersistActive = () => {
    const today = kpiLocalDateKey();
    const store = kpiReadActiveStore();
    if (store.date !== today) window._kpiActiveSeconds = 0;
    kpiWriteActiveStore({ date: today, seconds: Math.max(0, Number(window._kpiActiveSeconds) || 0) });
};

const kpiMarkActivity = () => {
    window._kpiLastActivity = Date.now();
    if (window._kpiIdle) {
        window._kpiIdle = false;
        window.kpiSyncActiveTime();
    }
};

window.kpiSyncActiveTime = async (extra) => {
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof window.setDoc !== 'function' || !window.db || !window.currentUser) return;
    const today = kpiLocalDateKey();
    const store = kpiReadActiveStore();
    if (store.date !== today) return;
    const repName = String(window.currentUser.name || '').trim();
    const repId = kpiRepId(repName);
    try {
        const ref = window.doc(window.db, KPI_REP_COLLECTION, repId, KPI_STATS_SUBCOLLECTION, today);
        const payload = {
            repId,
            repName,
            team: String(window.currentUser.team || ''),
            date: today,
            activeSeconds: Math.max(0, Number(window._kpiActiveSeconds) || 0),
            imageEditSeconds: kpiImageEditSecondsToday(),
            updatedAt: new Date()
        };
        if (extra && typeof extra === 'object') Object.assign(payload, extra);
        await window.setDoc(ref, payload, { merge: true });
    } catch (err) {
        console.error('[kpi] active time sync failed:', err);
    }
};

window.kpiStartActiveTracker = () => {
    if (window._kpiTrackerStarted) return;
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return;
    window._kpiTrackerStarted = true;
    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'keydown', 'wheel', 'pointerdown'];
    events.forEach((ev) => window.addEventListener(ev, kpiMarkActivity, { passive: true }));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) window.kpiSyncActiveTime();
    });
    window.addEventListener('online', () => window.kpiSyncActiveTime());
    window.addEventListener('beforeunload', kpiPersistActive);
    window._kpiTickHandle = setInterval(() => {
        if (document.hidden) return;
        if ((Date.now() - window._kpiLastActivity) > KPI_IDLE_MS) {
            window._kpiIdle = true;
            return;
        }
        window._kpiActiveSeconds += 1;
        kpiPersistActive();
        if (window._kpiActiveSeconds % 60 === 0) window.kpiSyncActiveTime();
    }, 1000);
    window.kpiSyncActiveTime();
};

/* ─────────────────── image editor time tracker ─────────────────── */

const kpiReadImageStore = () => {
    try {
        const raw = localStorage.getItem(KPI_IMAGE_EDIT_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
};

const kpiWriteImageStore = (store) => {
    try { localStorage.setItem(KPI_IMAGE_EDIT_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ }
};

const kpiEnsureImageStore = () => {
    const today = kpiLocalDateKey();
    const store = kpiReadImageStore();
    if (!store || store.date !== today) return { date: today, seconds: 0, open: {} };
    if (!store.open || typeof store.open !== 'object') store.open = {};
    store.seconds = Math.max(0, Number(store.seconds) || 0);
    return store;
};

const kpiOpenKey = (productId, imageIndex) => String(productId || '') + ':' + (Number(imageIndex) || 0);

function kpiImageEditSecondsToday() {
    const store = kpiReadImageStore();
    return store.date === kpiLocalDateKey() ? Math.max(0, Number(store.seconds) || 0) : 0;
}
window.kpiImageEditSecondsToday = kpiImageEditSecondsToday;

/* Called when the editor opens/downloads a source image. */
window.kpiMarkImageSourceOpened = (productId, imageIndex) => {
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return;
    const store = kpiEnsureImageStore();
    store.open[kpiOpenKey(productId, imageIndex)] = { at: Date.now(), date: kpiLocalDateKey() };
    kpiWriteImageStore(store);
};

/* Called when the edited image is uploaded. Adds (upload - open) seconds to the
   day's image-editing total, but ONLY when both happen on the same calendar day. */
window.kpiCompleteImageEdit = (productId, imageIndex) => {
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return 0;
    const store = kpiEnsureImageStore();
    const key = kpiOpenKey(productId, imageIndex);
    const opened = store.open[key];
    if (!opened) return 0;
    delete store.open[key];
    const today = kpiLocalDateKey();
    if (opened.date !== today) {
        kpiWriteImageStore(store);
        return 0;
    }
    let seconds = Math.round((Date.now() - Number(opened.at || Date.now())) / 1000);
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    if (seconds > KPI_IMAGE_EDIT_MAX_SECONDS) seconds = KPI_IMAGE_EDIT_MAX_SECONDS;
    store.seconds = (Number(store.seconds) || 0) + seconds;
    kpiWriteImageStore(store);
    window.kpiSyncActiveTime({ imageEditSeconds: store.seconds });
    return seconds;
};

/* ─────────────────── retroactive historical time ─────────────────── */

window.calculateHistoricalTime = async () => {
    if (!window.canViewKpiDashboard()) {
        if (window.showToast) window.showToast('هذه الأداة متاحة للمؤسسين ومدير العمليات فقط', false);
        return null;
    }
    if (window._kpiHistoricalRunning) return null;
    window._kpiHistoricalRunning = true;
    try {
        const snap = await window.getDocs(window.collection(window.db, KPI_PRODUCTS_COLLECTION));
        const byRep = new Map();
        snap.forEach((d) => {
            const p = { id: d.id, ...(d.data() || {}) };
            const rep = kpiProductRepName(p);
            const ms = kpiToMillis(p.createdAt || p.created_at || p.updatedAt);
            if (!byRep.has(rep)) byRep.set(rep, []);
            byRep.get(rep).push(ms);
        });
        const results = [];
        for (const [rep, stamps] of byRep.entries()) {
            stamps.sort((a, b) => a - b);
            let totalMs = 0;
            stamps.forEach((ms, i) => {
                if (i === 0) { totalMs += KPI_STANDARD_ADD_MS; return; }
                const diff = ms - stamps[i - 1];
                if (diff > 0 && diff < KPI_SESSION_BREAK_MS) totalMs += diff;
                else totalMs += KPI_STANDARD_ADD_MS;
            });
            const seconds = Math.round(totalMs / 1000);
            const repId = kpiRepId(rep);
            await window.setDoc(window.doc(window.db, KPI_REP_COLLECTION, repId), {
                repId,
                repName: rep,
                historicalSeconds: seconds,
                historicalProductCount: stamps.length,
                historicalComputedAt: new Date()
            }, { merge: true });
            results.push({ rep, repId, seconds, count: stamps.length });
        }
        if (window.showToast) window.showToast('تم احتساب الوقت التاريخي لـ ' + results.length + ' مندوب');
        return results;
    } catch (err) {
        console.error('[kpi] historical calculation failed:', err);
        if (window.showToast) window.showToast('فشل احتساب الوقت التاريخي', false);
        return null;
    } finally {
        window._kpiHistoricalRunning = false;
    }
};

window.runKpiHistoricalCalculation = async () => {
    const btn = document.getElementById('kpiHistoricalBtn');
    const label = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري الاحتساب...';
    }
    try {
        await window.calculateHistoricalTime();
        await window.renderKpiDashboard();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = label || 'احتساب الوقت التاريخي';
        }
    }
};

/* ─────────────────── dashboard computation ─────────────────── */

window._kpiLatestReport = window._kpiLatestReport || null;

const kpiFetchAllProducts = async () => {
    const snap = await window.getDocs(window.collection(window.db, KPI_PRODUCTS_COLLECTION));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    return items;
};

const kpiFetchParentRecords = async () => {
    const map = new Map();
    try {
        const snap = await window.getDocs(window.collection(window.db, KPI_REP_COLLECTION));
        snap.forEach((d) => map.set(d.id, d.data() || {}));
    } catch (err) {
        console.error('[kpi] rep_kpis fetch failed:', err);
    }
    return map;
};

const kpiFetchDailyStats = async (repId) => {
    let activeSeconds = 0;
    let imageEditSeconds = 0;
    let days = 0;
    try {
        const snap = await window.getDocs(window.collection(window.db, KPI_REP_COLLECTION, repId, KPI_STATS_SUBCOLLECTION));
        snap.forEach((d) => {
            const data = d.data() || {};
            activeSeconds += Math.max(0, Number(data.activeSeconds) || 0);
            imageEditSeconds += Math.max(0, Number(data.imageEditSeconds) || 0);
            days += 1;
        });
    } catch (err) {
        console.error('[kpi] daily stats fetch failed for ' + repId + ':', err);
    }
    return { activeSeconds, imageEditSeconds, days };
};

const kpiFormatDuration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return h + ' س ' + m + ' د';
    if (m > 0) return m + ' د';
    return total + ' ث';
};

const kpiBuildReport = async () => {
    const products = await kpiFetchAllProducts();
    const parents = await kpiFetchParentRecords();

    const reps = new Map();
    const ensureRep = (name) => {
        const repId = kpiRepId(name);
        if (!reps.has(repId)) {
            reps.set(repId, {
                repId,
                name,
                totalProducts: 0,
                merchants: new Set(),
                withImage: 0,
                variationCount: 0,
                variableProducts: 0,
                validDescriptions: 0,
                nonEmptyDescriptions: 0,
                junkDescriptions: 0,
                emptyDescriptions: 0
            });
        }
        return reps.get(repId);
    };

    products.forEach((p) => {
        const rep = ensureRep(kpiProductRepName(p));
        rep.totalProducts += 1;
        const merchant = kpiProductMerchantName(p);
        if (merchant) rep.merchants.add(merchant);

        if (kpiProductHasImage(p)) rep.withImage += 1;

        const variations = kpiProductVariations(p);
        if (variations.length > 0) {
            rep.variableProducts += 1;
            rep.variationCount += variations.length;
        }

        const desc = window.kpiValidateDescription(p.description_ar || p.description_en || p.description || '');
        if (desc.isEmpty) rep.emptyDescriptions += 1;
        else {
            rep.nonEmptyDescriptions += 1;
            if (desc.isJunk) rep.junkDescriptions += 1;
            if (desc.isValid) rep.validDescriptions += 1;
        }
    });

    parents.forEach((data, repId) => {
        const rep = ensureRep(data.repName || repId);
        rep.historicalSeconds = Math.max(0, Number(data.historicalSeconds) || 0);
        rep.historicalComputedAt = data.historicalComputedAt || null;
    });

    const rows = [];
    for (const rep of reps.values()) {
        const stats = await kpiFetchDailyStats(rep.repId);
        const totalSeconds = stats.activeSeconds + stats.imageEditSeconds + (rep.historicalSeconds || 0);
        const totalProducts = rep.totalProducts;
        const imageRatio = totalProducts ? Math.round((rep.withImage / totalProducts) * 100) : 0;
        const avgVariables = totalProducts ? (rep.variationCount / totalProducts) : 0;
        const validDescRatio = rep.nonEmptyDescriptions
            ? Math.round((rep.validDescriptions / rep.nonEmptyDescriptions) * 100)
            : (totalProducts ? Math.round((rep.validDescriptions / totalProducts) * 100) : 0);
        const avgSecondsPerProduct = totalProducts ? Math.round(totalSeconds / totalProducts) : 0;
        rows.push({
            ...rep,
            merchantsCount: rep.merchants.size,
            activeSeconds: stats.activeSeconds,
            imageEditSeconds: stats.imageEditSeconds,
            historicalSeconds: rep.historicalSeconds || 0,
            totalSeconds,
            imageRatio,
            avgVariables,
            validDescRatio,
            avgSecondsPerProduct,
            trackedDays: stats.days
        });
    }

    rows.sort((a, b) => b.totalProducts - a.totalProducts || a.name.localeCompare(b.name, 'ar'));
    return { rows, generatedAt: new Date() };
};

/* ─────────────────── dashboard UI ─────────────────── */

const kpiMetricCard = (opts) => `
    <div class="kpi-stat-card">
        <div class="kpi-stat-icon" style="background:${opts.iconBg};color:${opts.iconColor};"><i class="fa-solid ${opts.icon}"></i></div>
        <div class="min-w-0">
            <div class="kpi-stat-value">${opts.value}</div>
            <div class="kpi-stat-label">${opts.label}</div>
        </div>
    </div>`;

const kpiRepCard = (row) => {
    const junkBadge = row.junkDescriptions > 0
        ? `<span class="kpi-junk-badge"><i class="fa-solid fa-triangle-exclamation"></i> وصف وهمي: ${row.junkDescriptions}</span>`
        : `<span class="kpi-clean-badge"><i class="fa-solid fa-circle-check"></i> لا يوجد وصف وهمي</span>`;
    return `
    <div class="kpi-rep-card">
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-11 h-11 rounded-2xl bg-[#230535] text-[#FFD700] grid place-items-center text-lg shrink-0"><i class="fa-solid fa-user-tie"></i></div>
                <div class="min-w-0">
                    <div class="font-black text-base text-[#230535] truncate">${kpiEscape(row.name)}</div>
                    <div class="text-[10px] font-bold text-slate-400">${row.merchantsCount} تاجر — ${row.trackedDays} يوم نشاط</div>
                </div>
            </div>
            <div class="text-left shrink-0">
                <div class="text-[10px] font-black text-slate-400">صافي الوقت</div>
                <div class="font-black text-sm text-[#230535]">${kpiFormatDuration(row.totalSeconds)}</div>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-3">
            <div class="kpi-mini"><span class="kpi-mini-label">إجمالي المنتجات</span><span class="kpi-mini-value">${row.totalProducts}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">التجار المضافون</span><span class="kpi-mini-value">${row.merchantsCount}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">وقت نشط (جديد)</span><span class="kpi-mini-value">${kpiFormatDuration(row.activeSeconds + row.imageEditSeconds)}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">وقت تاريخي</span><span class="kpi-mini-value">${kpiFormatDuration(row.historicalSeconds)}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">كفاءة الوقت</span><span class="kpi-mini-value">${row.avgSecondsPerProduct ? (row.avgSecondsPerProduct / 60).toFixed(1) + ' د/منتج' : '—'}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">متوسط الخيارات</span><span class="kpi-mini-value">${row.avgVariables.toFixed(2)}</span></div>
        </div>
        <div class="mt-3 space-y-2">
            <div class="kpi-bar-row">
                <span>صور المنتجات</span><span class="font-black ${row.imageRatio >= 80 ? 'text-emerald-600' : row.imageRatio >= 50 ? 'text-amber-600' : 'text-red-600'}">${row.imageRatio}%</span>
            </div>
            <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${row.imageRatio}%;background:#230535;"></div></div>
            <div class="kpi-bar-row">
                <span>وصف صحيح</span><span class="font-black ${row.validDescRatio >= 80 ? 'text-emerald-600' : row.validDescRatio >= 50 ? 'text-amber-600' : 'text-red-600'}">${row.validDescRatio}%</span>
            </div>
            <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${row.validDescRatio}%;background:#E57723;"></div></div>
        </div>
        <div class="mt-3">${junkBadge}</div>
    </div>`;
};

const kpiEscape = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.renderKpiDashboard = async () => {
    if (!window.canViewKpiDashboard()) {
        window.closeKpiDashboard();
        return;
    }
    const content = document.getElementById('kpiDashboardContent');
    if (!content) return;
    content.innerHTML = '<div class="text-center py-16 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3"></i><div>جاري تحميل المؤشرات...</div></div>';
    try {
        const report = await kpiBuildReport();
        window._kpiLatestReport = report;
        const rows = report.rows;
        const totals = rows.reduce((acc, r) => {
            acc.products += r.totalProducts;
            acc.merchants += r.merchantsCount;
            acc.seconds += r.totalSeconds;
            acc.junk += r.junkDescriptions;
            acc.valid += r.validDescriptions;
            acc.nonEmpty += r.nonEmptyDescriptions;
            acc.withImage += r.withImage;
            return acc;
        }, { products: 0, merchants: 0, seconds: 0, junk: 0, valid: 0, nonEmpty: 0, withImage: 0 });
        const overallImage = totals.products ? Math.round((totals.withImage / totals.products) * 100) : 0;
        const overallDesc = totals.nonEmpty ? Math.round((totals.valid / totals.nonEmpty) * 100) : 0;
        const stampEl = document.getElementById('kpiLastUpdated');
        if (stampEl) stampEl.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');

        const summary = `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                ${kpiMetricCard({ icon: 'fa-box-open', iconBg: '#230535', iconColor: '#FFD700', value: totals.products, label: 'إجمالي المنتجات' })}
                ${kpiMetricCard({ icon: 'fa-store', iconBg: '#FFD700', iconColor: '#230535', value: totals.merchants, label: 'تجار تم إضافتهم' })}
                ${kpiMetricCard({ icon: 'fa-image', iconBg: '#230535', iconColor: '#37d99a', value: overallImage + '%', label: 'نسبة المنتجات بالصور' })}
                ${kpiMetricCard({ icon: 'fa-triangle-exclamation', iconBg: '#E57723', iconColor: '#fff', value: totals.junk, label: 'أوصاف وهمية / مرفوضة' })}
            </div>`;

        const overview = `
            <div class="kpi-overview">
                <div class="flex items-center gap-2 mb-2">
                    <i class="fa-solid fa-gauge-high text-[#FFD700]"></i>
                    <h4 class="font-black text-sm text-[#FFD700]">ملخص شامل</h4>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-white">
                    <div><div class="text-[10px] font-bold text-white/70">صافي الوقت الكلي</div><div class="font-black text-lg">${kpiFormatDuration(totals.seconds)}</div></div>
                    <div><div class="text-[10px] font-bold text-white/70">متوسط جودة الوصف</div><div class="font-black text-lg">${overallDesc}%</div></div>
                    <div><div class="text-[10px] font-bold text-white/70">عدد المناديب</div><div class="font-black text-lg">${rows.length}</div></div>
                </div>
            </div>`;

        const cards = rows.length
            ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${rows.map(kpiRepCard).join('')}</div>`
            : '<div class="text-center py-14 text-slate-400 font-bold"><i class="fa-solid fa-chart-simple text-4xl text-[#230535]/20 mb-3"></i><div>لا توجد بيانات كافية بعد</div></div>';

        content.innerHTML = summary + overview + cards;
    } catch (err) {
        console.error('[kpi] dashboard render failed:', err);
        content.innerHTML = '<div class="text-center py-14 text-red-500 font-bold">تعذر تحميل بيانات المؤشرات</div>';
    }
};

window.openKpiDashboard = async () => {
    if (!window.canViewKpiDashboard()) {
        if (window.showToast) window.showToast('لوحة المؤشرات متاحة للمؤسسين ومدير العمليات فقط', false);
        return;
    }
    const modal = document.getElementById('kpiDashboardModal');
    if (modal) modal.classList.remove('hidden');
    await window.renderKpiDashboard();
};

window.closeKpiDashboard = () => {
    const modal = document.getElementById('kpiDashboardModal');
    if (modal) modal.classList.add('hidden');
};
