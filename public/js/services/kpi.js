/* Kanjo Ops — Comprehensive KPI & Quality Tracking Engine
   ---------------------------------------------------------------------------
   Contains:
     1. RBAC gate for the KPI dashboard (Founders + Operations Manager only).
     2. Interaction-based active time tracker (localStorage + idle timeout) that
        syncs to rep_kpis/{repId}/daily_stats/{date}.
     3. Retroactive historical time calculator (calculateHistoricalTime).
     4. Image-editor (content team) work-time tracker.
     5. Strict anti-gaming quality validation (descriptions, images, variables).
     6. Full-page Master-Detail analytics dashboard with Chart.js visualizations.

   Precision contract: every metric is kept as RAW (unrounded) values under the
   hood; rounding (toFixed/formatting) happens ONLY at the final render step so
   financial bonus calculations are never skewed by intermediate rounding. */

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

const KPI_COLORS = {
    purple: '#230535',
    gold: '#FFD700',
    orange: '#E57723',
    green: '#37d99a',
    red: '#dc2626',
    amber: '#f59e0b',
    slate: '#cbd5e1',
    indigo: '#6D28D9'
};

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

const kpiEscape = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const kpiProductRepName = (p) => String(
    (p && (p.added_by || p.createdBy || p.addedBy || p.created_by || p.repName)) || ''
).trim() || 'غير معروف';

const kpiProductMerchantName = (p) => String(
    (p && (p.merchantName || p.merchant || p.merchant_name)) || ''
).trim();

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
window._kpiSelectedRepId = window._kpiSelectedRepId || null;
window._kpiCharts = window._kpiCharts || {};

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

/* Exact duration, always showing hours/mins/secs for bonus-grade precision. */
const kpiFormatDurationExact = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (h > 0) parts.push(h + ' س');
    parts.push(m + ' د');
    parts.push(s + ' ث');
    return parts.join(' ');
};

const kpiFormatDurationShort = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return h + ' س ' + m + ' د';
    if (m > 0) return m + ' د';
    return total + ' ث';
};

/* Raw minutes per product; formatting happens at the caller. */
const kpiMinutesPerProductRaw = (seconds, products) => {
    const count = Number(products) || 0;
    if (!count) return 0;
    return (Number(seconds) || 0) / 60 / count;
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
                emptyDescriptions: 0,
                dailyCounts: new Map()
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

        const createdMs = kpiToMillis(p.createdAt || p.created_at || p.updatedAt);
        if (createdMs) {
            const day = kpiLocalDateKey(createdMs);
            rep.dailyCounts.set(day, (rep.dailyCounts.get(day) || 0) + 1);
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
        // RAW ratios (0..1) — never pre-rounded.
        const imageRatioRaw = totalProducts ? (rep.withImage / totalProducts) : 0;
        const descBase = rep.nonEmptyDescriptions || totalProducts;
        const validRatioRaw = descBase ? (rep.validDescriptions / descBase) : 0;
        const junkRatioRaw = descBase ? (rep.junkDescriptions / descBase) : 0;
        const emptyRatioRaw = descBase ? (rep.emptyDescriptions / descBase) : 0;
        const avgVariablesRaw = totalProducts ? (rep.variationCount / totalProducts) : 0;
        const minutesPerProductRaw = kpiMinutesPerProductRaw(totalSeconds, totalProducts);
        const dailyCounts = Array.from(rep.dailyCounts.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
        rows.push({
            repId: rep.repId,
            name: rep.name,
            totalProducts,
            merchantsCount: rep.merchants.size,
            withImage: rep.withImage,
            withoutImage: Math.max(0, totalProducts - rep.withImage),
            variableProducts: rep.variableProducts,
            variationCount: rep.variationCount,
            validDescriptions: rep.validDescriptions,
            nonEmptyDescriptions: rep.nonEmptyDescriptions,
            junkDescriptions: rep.junkDescriptions,
            emptyDescriptions: rep.emptyDescriptions,
            activeSeconds: stats.activeSeconds,
            imageEditSeconds: stats.imageEditSeconds,
            historicalSeconds: rep.historicalSeconds || 0,
            totalSeconds,
            imageRatioRaw,
            validRatioRaw,
            junkRatioRaw,
            emptyRatioRaw,
            avgVariablesRaw,
            minutesPerProductRaw,
            avgSecondsPerProduct: totalProducts ? totalSeconds / totalProducts : 0,
            trackedDays: stats.days,
            activeDays: dailyCounts.length,
            dailyCounts,
            lastActiveDate: dailyCounts.length ? dailyCounts[dailyCounts.length - 1].date : null
        });
    }

    rows.sort((a, b) => b.totalProducts - a.totalProducts || a.name.localeCompare(b.name, 'ar'));

    const totals = rows.reduce((acc, r) => {
        acc.products += r.totalProducts;
        acc.merchants += r.merchantsCount;
        acc.seconds += r.totalSeconds;
        acc.activeSeconds += r.activeSeconds;
        acc.imageEditSeconds += r.imageEditSeconds;
        acc.historicalSeconds += r.historicalSeconds;
        acc.junk += r.junkDescriptions;
        acc.valid += r.validDescriptions;
        acc.empty += r.emptyDescriptions;
        acc.nonEmpty += r.nonEmptyDescriptions;
        acc.withImage += r.withImage;
        acc.withoutImage += r.withoutImage;
        return acc;
    }, {
        products: 0, merchants: 0, seconds: 0, activeSeconds: 0, imageEditSeconds: 0,
        historicalSeconds: 0, junk: 0, valid: 0, empty: 0, nonEmpty: 0, withImage: 0, withoutImage: 0
    });
    totals.reps = rows.length;
    totals.imageRatioRaw = totals.products ? (totals.withImage / totals.products) : 0;
    const globalDescBase = totals.nonEmpty || totals.products;
    totals.validRatioRaw = globalDescBase ? (totals.valid / globalDescBase) : 0;
    totals.junkRatioRaw = globalDescBase ? (totals.junk / globalDescBase) : 0;
    totals.minutesPerProductRaw = kpiMinutesPerProductRaw(totals.seconds, totals.products);

    return { rows, totals, generatedAt: new Date() };
};

/* ─────────────────── Chart.js helpers ─────────────────── */

const kpiDestroyCharts = () => {
    const charts = window._kpiCharts || {};
    Object.keys(charts).forEach((key) => {
        const inst = charts[key];
        if (inst && typeof inst.destroy === 'function') {
            try { inst.destroy(); } catch (_) { /* ignore */ }
        }
        delete charts[key];
    });
};

const kpiChartFont = () => ({
    family: "'Segoe UI', Tahoma, sans-serif",
    size: 11,
    weight: '700'
});

const kpiCanChart = () => typeof window.Chart !== 'undefined';

const kpiRenderProductivityChart = (row) => {
    const canvas = document.getElementById('kpiChartProductivity');
    if (!canvas || !kpiCanChart()) return;
    const data = (row.dailyCounts || []).slice(-30);
    const labels = data.map((d) => d.date.slice(5));
    const counts = data.map((d) => d.count);
    window._kpiCharts.productivity = new window.Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'منتجات / يوم',
                data: counts,
                backgroundColor: KPI_COLORS.purple,
                hoverBackgroundColor: KPI_COLORS.gold,
                borderRadius: 6,
                maxBarThickness: 34
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { rtl: true, titleFont: kpiChartFont(), bodyFont: kpiChartFont() }
            },
            scales: {
                x: { ticks: { font: kpiChartFont(), color: '#64748b' }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { precision: 0, font: kpiChartFont(), color: '#64748b' }, grid: { color: '#eef1f6' } }
            }
        }
    });
};

const kpiRenderQualityChart = (row) => {
    const canvas = document.getElementById('kpiChartQuality');
    if (!canvas || !kpiCanChart()) return;
    const valid = row.validDescriptions;
    const junk = row.junkDescriptions;
    const empty = row.emptyDescriptions;
    const hasData = (valid + junk + empty) > 0;
    window._kpiCharts.quality = new window.Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['وصف صحيح', 'وصف وهمي / مرفوض', 'بدون وصف'],
            datasets: [{
                data: hasData ? [valid, junk, empty] : [1],
                backgroundColor: hasData
                    ? [KPI_COLORS.green, KPI_COLORS.red, KPI_COLORS.slate]
                    : [KPI_COLORS.slate],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { font: kpiChartFont(), color: '#334155', usePointStyle: true, boxWidth: 10 } },
                tooltip: {
                    rtl: true,
                    titleFont: kpiChartFont(),
                    bodyFont: kpiChartFont(),
                    callbacks: {
                        label: (ctx) => {
                            if (!hasData) return ' لا توجد بيانات';
                            const total = valid + junk + empty;
                            const val = ctx.parsed || 0;
                            const pct = total ? (val / total) * 100 : 0;
                            return ' ' + ctx.label + ': ' + val + ' (' + pct.toFixed(1) + '%)';
                        }
                    }
                }
            }
        }
    });
};

const kpiRenderMediaChart = (row) => {
    const canvas = document.getElementById('kpiChartMedia');
    if (!canvas || !kpiCanChart()) return;
    const withImg = row.withImage;
    const withoutImg = row.withoutImage;
    const hasData = (withImg + withoutImg) > 0;
    window._kpiCharts.media = new window.Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['بصور', 'بدون صور'],
            datasets: [{
                data: hasData ? [withImg, withoutImg] : [1],
                backgroundColor: hasData ? [KPI_COLORS.indigo, KPI_COLORS.orange] : [KPI_COLORS.slate],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { font: kpiChartFont(), color: '#334155', usePointStyle: true, boxWidth: 10 } },
                tooltip: {
                    rtl: true,
                    titleFont: kpiChartFont(),
                    bodyFont: kpiChartFont(),
                    callbacks: {
                        label: (ctx) => {
                            if (!hasData) return ' لا توجد بيانات';
                            const total = withImg + withoutImg;
                            const val = ctx.parsed || 0;
                            const pct = total ? (val / total) * 100 : 0;
                            return ' ' + ctx.label + ': ' + val + ' (' + pct.toFixed(1) + '%)';
                        }
                    }
                }
            }
        }
    });
};

/* ─────────────────── dashboard UI ─────────────────── */

const kpiAvatarHtml = (name) => {
    const url = (window.userImageMap && window.userImageMap[name]) || '';
    const initial = (String(name || '').trim().charAt(0)) || '?';
    if (url) {
        return `<img src="${kpiEscape(url)}" alt="${kpiEscape(name)}" data-initial="${kpiEscape(initial)}" class="kpi-rep-avatar" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'kpi-rep-avatar kpi-rep-avatar-fallback',textContent:this.dataset.initial}))">`;
    }
    return `<div class="kpi-rep-avatar kpi-rep-avatar-fallback">${kpiEscape(initial)}</div>`;
};

const kpiMetricCard = (opts) => `
    <div class="kpi-stat-card">
        <div class="kpi-stat-icon" style="background:${opts.iconBg};color:${opts.iconColor};"><i class="fa-solid ${opts.icon}"></i></div>
        <div class="min-w-0">
            <div class="kpi-stat-value">${opts.value}</div>
            <div class="kpi-stat-label">${opts.label}</div>
            ${opts.hint ? `<div class="kpi-stat-hint">${opts.hint}</div>` : ''}
        </div>
    </div>`;

const kpiRatioColor = (ratio) => ratio >= 0.8 ? 'text-emerald-600' : ratio >= 0.5 ? 'text-amber-600' : 'text-red-600';
const kpiRatioBar = (ratio) => ratio >= 0.8 ? KPI_COLORS.green : ratio >= 0.5 ? KPI_COLORS.amber : KPI_COLORS.red;

const kpiGlobalSummaryHtml = (report) => {
    const t = report.totals;
    return `
    <section class="kpi-panel">
        <div class="kpi-panel-head">
            <div class="flex items-center gap-2">
                <span class="kpi-panel-icon"><i class="fa-solid fa-earth-africa"></i></span>
                <div>
                    <h3 class="font-black text-sm text-[#230535]">الملخص العام لكل الفريق</h3>
                    <p class="text-[11px] font-bold text-slate-400">أرقام إجمالية محسوبة من البيانات الخام بدون تقريب وسيط</p>
                </div>
            </div>
            <span class="kpi-chip">${report.rows.length} مندوب</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${kpiMetricCard({ icon: 'fa-box-open', iconBg: '#230535', iconColor: '#FFD700', value: t.products, label: 'إجمالي المنتجات' })}
            ${kpiMetricCard({ icon: 'fa-stopwatch', iconBg: '#FFD700', iconColor: '#230535', value: kpiFormatDurationShort(t.seconds), label: 'إجمالي الوقت الصافي', hint: 'نشط ' + kpiFormatDurationShort(t.activeSeconds) + ' • تاريخي ' + kpiFormatDurationShort(t.historicalSeconds) })}
            ${kpiMetricCard({ icon: 'fa-gauge-high', iconBg: '#230535', iconColor: '#37d99a', value: t.minutesPerProductRaw.toFixed(2) + ' د', label: 'الكفاءة العامة (دقيقة/منتج)' })}
            ${kpiMetricCard({ icon: 'fa-triangle-exclamation', iconBg: '#dc2626', iconColor: '#fff', value: t.junk, label: 'أوصاف وهمية / مرفوضة', hint: 'جودة الوصف ' + (t.validRatioRaw * 100).toFixed(1) + '%' })}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div class="kpi-mini"><span class="kpi-mini-label">التجار المُضافون</span><span class="kpi-mini-value">${t.merchants}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">منتجات بصور</span><span class="kpi-mini-value">${t.withImage} (${(t.imageRatioRaw * 100).toFixed(1)}%)</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">أوصاف صحيحة</span><span class="kpi-mini-value">${t.valid}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">بدون وصف</span><span class="kpi-mini-value">${t.empty}</span></div>
        </div>
    </section>`;
};

const kpiRepCardHtml = (row, selected) => {
    const initials = (String(row.name || '').trim().charAt(0)) || '?';
    return `
    <button type="button" class="kpi-rep-pick ${selected ? 'kpi-rep-pick-active' : ''}" data-kpi-rep="${kpiEscape(row.repId)}" onclick="selectKpiRep('${kpiEscape(row.repId)}')">
        <div class="flex items-center gap-3 min-w-0">
            <div class="kpi-avatar-ring">${kpiAvatarHtml(row.name)}</div>
            <div class="min-w-0 text-right">
                <div class="font-black text-sm text-[#230535] truncate">${kpiEscape(row.name || initials)}</div>
                <div class="text-[10px] font-bold text-slate-400">${row.merchantsCount} تاجر • ${row.activeDays || row.trackedDays || 0} يوم نشاط</div>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-3">
            <div class="kpi-mini"><span class="kpi-mini-label">المنتجات</span><span class="kpi-mini-value">${row.totalProducts}</span></div>
            <div class="kpi-mini"><span class="kpi-mini-label">الوقت الصافي</span><span class="kpi-mini-value">${kpiFormatDurationShort(row.totalSeconds)}</span></div>
        </div>
        ${row.junkDescriptions > 0 ? `<div class="mt-2"><span class="kpi-junk-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${row.junkDescriptions} وصف مرفوض</span></div>` : ''}
    </button>`;
};

const kpiRepSelectorHtml = (report) => `
    <section class="kpi-panel">
        <div class="kpi-panel-head">
            <div class="flex items-center gap-2">
                <span class="kpi-panel-icon"><i class="fa-solid fa-users-viewfinder"></i></span>
                <div>
                    <h3 class="font-black text-sm text-[#230535]">اختر المندوب لعرض التحليل التفصيلي</h3>
                    <p class="text-[11px] font-bold text-slate-400">اضغط على البطاقة لفتح القسم الثالث (Deep Dive)</p>
                </div>
            </div>
        </div>
        <div id="kpiRepSelectorGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            ${report.rows.map((r) => kpiRepCardHtml(r, r.repId === window._kpiSelectedRepId)).join('')}
        </div>
    </section>`;

const kpiDeepDiveHtml = (row) => {
    if (!row) {
        return `<section class="kpi-panel"><div class="text-center py-14 text-slate-400 font-bold">
            <i class="fa-solid fa-hand-pointer text-4xl text-[#230535]/20 mb-3"></i>
            <div>اختر مندوباً من القائمة أعلاه لعرض التحليل التفصيلي والمخططات</div>
        </div></section>`;
    }
    const descTotal = row.nonEmptyDescriptions || row.totalProducts || 0;
    const validPct = (row.validRatioRaw * 100);
    const junkPct = (row.junkRatioRaw * 100);
    const emptyPct = (row.emptyRatioRaw * 100);
    return `
    <section class="kpi-panel" id="kpiDeepDivePanel">
        <div class="kpi-deep-head">
            <div class="flex items-center gap-3 min-w-0">
                <div class="kpi-avatar-ring kpi-avatar-ring-lg">${kpiAvatarHtml(row.name)}</div>
                <div class="min-w-0">
                    <h3 class="font-black text-lg text-[#230535] truncate">${kpiEscape(row.name)}</h3>
                    <p class="text-[11px] font-bold text-slate-400">تحليل تفصيلي دقيق — صالح لحساب المكافآت المالية</p>
                </div>
            </div>
            <div class="flex flex-wrap gap-2">
                <span class="kpi-chip kpi-chip-dark">الوقت الصافي: ${kpiFormatDurationExact(row.totalSeconds)}</span>
                <span class="kpi-chip kpi-chip-gold">${(row.minutesPerProductRaw).toFixed(2)} دقيقة / منتج</span>
            </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            ${kpiMetricCard({ icon: 'fa-hourglass-half', iconBg: '#230535', iconColor: '#FFD700', value: kpiFormatDurationExact(row.totalSeconds), label: 'الوقت النشط الفعلي (دقيق)' })}
            ${kpiMetricCard({ icon: 'fa-bolt', iconBg: '#FFD700', iconColor: '#230535', value: (row.minutesPerProductRaw).toFixed(2) + ' د', label: 'الكفاءة الدقيقة / منتج' })}
            ${kpiMetricCard({ icon: 'fa-circle-xmark', iconBg: '#dc2626', iconColor: '#fff', value: row.junkDescriptions, label: 'خصم: أوصاف وهمية/مرفوضة' })}
            ${kpiMetricCard({ icon: 'fa-star', iconBg: '#37d99a', iconColor: '#fff', value: validPct.toFixed(1) + '%', label: 'جودة الأوصاف الفعلية' })}
        </div>

        <div class="kpi-financial-grid mt-4">
            <div class="kpi-fin-row"><span>عدد المنتجات المُدخلة</span><span class="kpi-fin-val">${row.totalProducts}</span></div>
            <div class="kpi-fin-row"><span>عدد التجار المُضافين</span><span class="kpi-fin-val">${row.merchantsCount}</span></div>
            <div class="kpi-fin-row"><span>أيام النشاط الفعلي</span><span class="kpi-fin-val">${row.activeDays || row.trackedDays || 0}</span></div>
            <div class="kpi-fin-row"><span>وقت إدخال التفاعل (دقيق)</span><span class="kpi-fin-val">${kpiFormatDurationExact(row.activeSeconds)}</span></div>
            <div class="kpi-fin-row"><span>وقت تحرير الصور (دقيق)</span><span class="kpi-fin-val">${kpiFormatDurationExact(row.imageEditSeconds)}</span></div>
            <div class="kpi-fin-row"><span>الوقت التاريخي المُحتسب</span><span class="kpi-fin-val">${kpiFormatDurationExact(row.historicalSeconds)}</span></div>
            <div class="kpi-fin-row"><span>أوصاف صحيحة / منظمة</span><span class="kpi-fin-val text-emerald-600">${row.validDescriptions} (${validPct.toFixed(1)}%)</span></div>
            <div class="kpi-fin-row"><span>أوصاف مرفوضة (عقوبة)</span><span class="kpi-fin-val text-red-600">${row.junkDescriptions} (${junkPct.toFixed(1)}%)</span></div>
            <div class="kpi-fin-row"><span>بدون وصف</span><span class="kpi-fin-val text-slate-500">${row.emptyDescriptions} (${emptyPct.toFixed(1)}%)</span></div>
            <div class="kpi-fin-row"><span>منتجات بصور / بدون صور</span><span class="kpi-fin-val">${row.withImage} / ${row.withoutImage}</span></div>
            <div class="kpi-fin-row"><span>متوسط الخيارات لكل منتج</span><span class="kpi-fin-val">${(row.avgVariablesRaw).toFixed(2)}</span></div>
            <div class="kpi-fin-row"><span>منتجات بخيارات (Variable)</span><span class="kpi-fin-val">${row.variableProducts}</span></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div class="kpi-chart-card kpi-chart-wide">
                <div class="kpi-chart-title"><i class="fa-solid fa-chart-column text-[#230535]"></i> إنتاجية المندوب يومياً</div>
                <div class="kpi-chart-box"><canvas id="kpiChartProductivity"></canvas></div>
            </div>
            <div class="kpi-chart-card">
                <div class="kpi-chart-title"><i class="fa-solid fa-chart-pie text-[#E57723]"></i> جودة الأوصاف</div>
                <div class="kpi-chart-box"><canvas id="kpiChartQuality"></canvas></div>
            </div>
            <div class="kpi-chart-card">
                <div class="kpi-chart-title"><i class="fa-solid fa-image text-[#6D28D9]"></i> جودة الوسائط (الصور)</div>
                <div class="kpi-chart-box"><canvas id="kpiChartMedia"></canvas></div>
            </div>
        </div>

        <div class="kpi-bars mt-4">
            <div class="kpi-bar-row"><span>نسبة المنتجات بالصور</span><span class="font-black ${kpiRatioColor(row.imageRatioRaw)}">${(row.imageRatioRaw * 100).toFixed(1)}%</span></div>
            <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${(row.imageRatioRaw * 100).toFixed(1)}%;background:${kpiRatioBar(row.imageRatioRaw)};"></div></div>
            <div class="kpi-bar-row"><span>نسبة الأوصاف الصحيحة</span><span class="font-black ${kpiRatioColor(row.validRatioRaw)}">${(row.validRatioRaw * 100).toFixed(1)}%</span></div>
            <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${(row.validRatioRaw * 100).toFixed(1)}%;background:${kpiRatioBar(row.validRatioRaw)};"></div></div>
        </div>
    </section>`;
};

const kpiRenderChartsForRow = (row) => {
    kpiDestroyCharts();
    if (!row) return;
    kpiRenderProductivityChart(row);
    kpiRenderQualityChart(row);
    kpiRenderMediaChart(row);
};

window.renderKpiDashboard = async () => {
    if (!window.canViewKpiDashboard()) {
        window.closeKpiDashboard();
        return;
    }
    const content = document.getElementById('kpiAnalyticsContent');
    if (!content) return;
    content.innerHTML = '<div class="text-center py-16 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3"></i><div>جاري تحميل المؤشرات...</div></div>';
    try {
        const report = await kpiBuildReport();
        window._kpiLatestReport = report;
        if (!window._kpiSelectedRepId || !report.rows.some((r) => r.repId === window._kpiSelectedRepId)) {
            window._kpiSelectedRepId = report.rows.length ? report.rows[0].repId : null;
        }
        const stampEl = document.getElementById('kpiLastUpdated');
        if (stampEl) stampEl.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');

        const selectedRow = report.rows.find((r) => r.repId === window._kpiSelectedRepId) || null;
        content.innerHTML =
            kpiGlobalSummaryHtml(report) +
            kpiRepSelectorHtml(report) +
            `<div id="kpiDeepDiveWrapper">${kpiDeepDiveHtml(selectedRow)}</div>`;

        requestAnimationFrame(() => kpiRenderChartsForRow(selectedRow));
    } catch (err) {
        console.error('[kpi] dashboard render failed:', err);
        content.innerHTML = '<div class="text-center py-14 text-red-500 font-bold">تعذر تحميل بيانات المؤشرات</div>';
    }
};

window.selectKpiRep = (repId) => {
    if (!window.canViewKpiDashboard()) return;
    const report = window._kpiLatestReport;
    if (!report) return;
    const row = report.rows.find((r) => r.repId === repId);
    if (!row) return;
    window._kpiSelectedRepId = repId;

    const grid = document.getElementById('kpiRepSelectorGrid');
    if (grid) {
        grid.querySelectorAll('[data-kpi-rep]').forEach((el) => {
            el.classList.toggle('kpi-rep-pick-active', el.getAttribute('data-kpi-rep') === repId);
        });
        const active = grid.querySelector('.kpi-rep-pick-active');
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    const wrapper = document.getElementById('kpiDeepDiveWrapper');
    if (wrapper) {
        wrapper.innerHTML = kpiDeepDiveHtml(row);
        requestAnimationFrame(() => kpiRenderChartsForRow(row));
    }
};

window.openKpiDashboard = async () => {
    if (!window.canViewKpiDashboard()) {
        if (window.showToast) window.showToast('لوحة المؤشرات متاحة للمؤسسين ومدير العمليات فقط', false);
        return;
    }
    const view = document.getElementById('kpiAnalyticsView');
    const dashboard = document.getElementById('dashboardSection');
    if (dashboard) dashboard.classList.add('hidden');
    if (view) view.classList.remove('hidden');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
    await window.renderKpiDashboard();
};

window.closeKpiDashboard = () => {
    kpiDestroyCharts();
    const view = document.getElementById('kpiAnalyticsView');
    const dashboard = document.getElementById('dashboardSection');
    if (view) view.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
};
