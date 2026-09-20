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

/* Only real word tokens (Arabic or Latin, 3+ letters) make a description valid. */
const KPI_WORD_RE = /[a-zA-Z\u0600-\u06FF]{3,}/;

/* Kanjo Score weights — MUST sum to exactly 100. The former 20-pt volume block
   is split into 10 pts of raw quantity + 10 pts of average description length,
   so the total budget (and every other weight) is unchanged. */
const KPI_VOLUME_MAX = 10;   // normalized against the top rep's product count
const KPI_LENGTH_MAX = 10;   // absolute target: avg >= KPI_DESC_TARGET_LENGTH chars
const KPI_EFFORT_MAX = 10;   // normalized against the top rep's net time
const KPI_TEXT_MAX = 35;     // valid-description ratio
const KPI_MEDIA_MAX = 35;    // products-with-images ratio
const KPI_DESC_TARGET_LENGTH = 50; // healthy average description length (chars)

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

/* Field reps (مندوب) are the primary audience of the personal performance
   screen. They are hard-locked to their own identity everywhere below. */
window.isFieldRepUser = () => {
    const u = window.currentUser;
    return !!(u && u.role === 'rep');
};

/* The personal screen is now LIVE for field reps, and stays available to the
   Founders / Ops Manager as a preview + admin deep-dive. */
window.canViewPersonalKpi = () => {
    if (typeof window.canViewKpiDashboard === 'function' && window.canViewKpiDashboard()) return true;
    return window.isFieldRepUser();
};

/* Resolve which rep a personal screen belongs to. Reps can only ever open
   their OWN screen; managers may inspect any rep (deep-dive). */
window.kpiResolvePersonalRepId = (requestedRepId) => {
    if (window.isFieldRepUser()) return kpiRepId((window.currentUser && window.currentUser.name) || '');
    return String(requestedRepId || '');
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

/* Merge-write a document over direct REST when available, mirroring
   `setDoc(ref, data, { merge: true })`. Keeps KPI writes off the SDK streaming
   transport (the blocked channel behind the offline/timeout console noise).
   Returns true when the REST write was used. */
const kpiRestMerge = async (segments, data) => {
    if (!window.kanjoRest || typeof window.kanjoRest.patch !== 'function') return false;
    await window.kanjoRest.patch(segments, data);
    return true;
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

/* Normalize a name/description for the copy-paste comparison: trim, lowercase
   and collapse internal whitespace so "Nike  Air" === "nike air". */
const kpiNormalizeForCompare = (value) => String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/* A description that is a 100% case-insensitive copy of the product name is a
   fake "وصف وهمي" regardless of its length. `name` may be a single string or a
   list of candidates (Arabic/Latin name fields). */
const kpiDescriptionCopiesName = (description, name) => {
    const normalizedDesc = kpiNormalizeForCompare(description);
    if (!normalizedDesc) return false;
    const candidates = Array.isArray(name) ? name : [name];
    return candidates.some((candidate) => {
        const normalizedName = kpiNormalizeForCompare(candidate);
        return normalizedName !== '' && normalizedName === normalizedDesc;
    });
};

/* Strict description validation — anti-gaming. A description is valid ONLY if
   it is longer than 10 characters, contains a real word token, AND is not a
   copy of the product name. Anything non-empty that fails (e.g. "-", ".", "جيد"
   or a name echo) is flagged as junk/fake. Passing `name` is optional; when it
   is omitted only the length/word rules apply (backwards compatible). */
window.kpiValidateDescription = (description, name) => {
    const text = String(description == null ? '' : description).trim();
    const isEmpty = text.length === 0;
    const lengthOk = text.length > 10;
    const hasWords = KPI_WORD_RE.test(text);
    const copiesName = !isEmpty && kpiDescriptionCopiesName(text, name);
    const isValid = !isEmpty && lengthOk && hasWords && !copiesName;
    return {
        text,
        length: text.length,
        isEmpty,
        lengthOk,
        hasWords,
        copiesName,
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

/* localStorage writes are synchronous and block the main thread, so we no longer
   write on every 1s tick. The in-memory counter updates every second, but it is
   persisted at most once per 30s (plus explicitly on tab hide / unload). */
const KPI_PERSIST_INTERVAL_MS = 30000;
window._kpiLastPersistAt = Date.now();

const kpiPersistActive = () => {
    const today = kpiLocalDateKey();
    const store = kpiReadActiveStore();
    if (store.date !== today) window._kpiActiveSeconds = 0;
    kpiWriteActiveStore({ date: today, seconds: Math.max(0, Number(window._kpiActiveSeconds) || 0) });
    window._kpiLastPersistAt = Date.now();
};

const kpiMaybePersistActive = () => {
    if ((Date.now() - (Number(window._kpiLastPersistAt) || 0)) >= KPI_PERSIST_INTERVAL_MS) {
        kpiPersistActive();
    }
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
        if (!(await kpiRestMerge([KPI_REP_COLLECTION, repId, KPI_STATS_SUBCOLLECTION, today], payload))) {
            const ref = window.doc(window.db, KPI_REP_COLLECTION, repId, KPI_STATS_SUBCOLLECTION, today);
            await window.setDoc(ref, payload, { merge: true });
        }
    } catch (err) {
        console.error('[kpi] active time sync failed:', err);
    }
};

window.kpiStartActiveTracker = () => {
    if (window._kpiTrackerStarted) return;
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return;
    window._kpiTrackerStarted = true;
    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'keydown', 'wheel', 'pointerdown'];
    const onVisibility = () => {
        if (document.hidden) {
            kpiPersistActive();
            window.kpiSyncActiveTime();
        }
    };
    const onOnline = () => window.kpiSyncActiveTime();
    const onUnload = () => {
        kpiPersistActive();
        window.kpiSyncActiveTime();
    };
    events.forEach((ev) => window.addEventListener(ev, kpiMarkActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onUnload);
    window._kpiTickHandle = setInterval(() => {
        if (document.hidden) return;
        if ((Date.now() - window._kpiLastActivity) > KPI_IDLE_MS) {
            window._kpiIdle = true;
            return;
        }
        window._kpiActiveSeconds += 1;
        kpiMaybePersistActive();
        if (window._kpiActiveSeconds % 60 === 0) window.kpiSyncActiveTime();
    }, 1000);
    window.kpiSyncActiveTime();
    /* Never leak the 1s tick, the input listeners or the lifecycle listeners
       across logout / re-auth: register a single teardown that also re-arms
       the tracker for the next session. */
    if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];
    window._appListenerUnsubscribers.push(() => {
        events.forEach((ev) => window.removeEventListener(ev, kpiMarkActivity));
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('beforeunload', onUnload);
        if (window._kpiTickHandle) {
            clearInterval(window._kpiTickHandle);
            window._kpiTickHandle = null;
        }
        window._kpiTrackerStarted = false;
    });
};

/* ─────────────────── image editor workflow time tracker ───────────────────
   The editor (Youssef) edits images in EXTERNAL software (e.g. Photoshop), so
   the generic UI active-time tracker cannot see that work. This dedicated
   workflow tracker measures download -> upload per product:
     - start: localStorage['edit_start_<productId>'] = Date.now()
     - stop : duration = (now - start) / 1000, capped at 30 minutes; a 5-minute
              fair average is used when no start time is found (different device
              / cleared cache). The per-product key is cleared after every stop.
   The resulting seconds are folded into the day's image-edit total, which the
   KPI dashboard surfaces inside "وقت تحرير الصور" and the net total time. */

const KPI_EDIT_START_PREFIX = 'edit_start_';
const KPI_EDIT_DURATION_CAP_SECONDS = 30 * 60; // 1800s cap (lunch break / next-day guard)
const KPI_EDIT_FALLBACK_SECONDS = 5 * 60;      // 300s fallback average when no start exists

const kpiEditStartKey = (productId) => KPI_EDIT_START_PREFIX + String(productId || '');

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
    if (!store || store.date !== today) return { date: today, seconds: 0 };
    store.seconds = Math.max(0, Number(store.seconds) || 0);
    return store;
};

function kpiImageEditSecondsToday() {
    const store = kpiReadImageStore();
    return store.date === kpiLocalDateKey() ? Math.max(0, Number(store.seconds) || 0) : 0;
}
window.kpiImageEditSecondsToday = kpiImageEditSecondsToday;

/* Start timer — called when the editor views/downloads the source image.
   The first start wins so repeated downloads don't keep resetting the clock. */
window.kpiMarkImageSourceOpened = (productId, imageIndex) => {
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return;
    if (!productId) return;
    try {
        const key = kpiEditStartKey(productId);
        if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now()));
    } catch (_) { /* ignore */ }
};

/* Stop timer — called when the edited image is uploaded/saved. Computes the
   duration, applies the 30-minute cap / 5-minute fallback, adds it to the
   day's image-edit total, syncs to Firestore, then clears the per-product key. */
window.kpiCompleteImageEdit = (productId, imageIndex) => {
    if (!window.isKpiTrackedUser || !window.isKpiTrackedUser()) return 0;
    if (!productId) return 0;
    const key = kpiEditStartKey(productId);
    let startTime = 0;
    try { startTime = Number(localStorage.getItem(key)) || 0; } catch (_) { startTime = 0; }

    let seconds;
    if (startTime > 0 && Number.isFinite(startTime)) {
        seconds = Math.round((Date.now() - startTime) / 1000);
        if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
        if (seconds > KPI_EDIT_DURATION_CAP_SECONDS) seconds = KPI_EDIT_DURATION_CAP_SECONDS;
    } else {
        seconds = KPI_EDIT_FALLBACK_SECONDS;
    }

    try { localStorage.removeItem(key); } catch (_) { /* ignore */ }

    const store = kpiEnsureImageStore();
    store.seconds = Math.max(0, Number(store.seconds) || 0) + seconds;
    kpiWriteImageStore(store);
    window.kpiSyncActiveTime({ imageEditSeconds: store.seconds });
    return seconds;
};

/* ─────────────────── retroactive historical time ─────────────────── */

/* Does this product carry a completed/enhanced image edited by the image
   editor? Accepts both the app's camelCase fields and common snake_case
   variants, plus image_done-style statuses. */
const kpiProductHasEnhancedImage = (p) => {
    if (!p) return false;
    const lists = [p.enhancedImageUrls, p.enhanced_image_urls];
    for (const list of lists) {
        if (Array.isArray(list) && list.some((u) => String(u || '').trim())) return true;
    }
    const singles = [p.enhancedImageUrl, p.enhanced_image_url, p.enhancedImage, p.enhanced_image];
    if (singles.some((u) => typeof u === 'string' && u.trim())) return true;
    if (p.has_enhanced_image === true || p.hasEnhancedImage === true) return true;
    const status = String(p.status || p.image_status || p.imageStatus || '').toLowerCase();
    if (['done', 'image_done', 'completed', 'complete', 'approved', 'enhanced'].includes(status)) return true;
    return false;
};

/* Best-effort millisecond timestamp for WHEN the enhanced image was produced.
   Prefers a dedicated image timestamp, then the document's updatedAt, and only
   then falls back to createdAt. Returns 0 when no usable timestamp exists. */
const kpiProductImageEditedMillis = (p) => {
    if (!p) return 0;
    const candidates = [
        p.imageUpdatedAt, p.image_updated_at,
        p.enhancedImageUpdatedAt, p.enhanced_image_updated_at,
        p.imagesUpdatedAt, p.images_updated_at,
        p.imageEditCompletedAt, p.image_edit_completed_at,
        p.enhancedAt, p.enhanced_at,
        p.updatedAt, p.updated_at,
        p.createdAt, p.created_at
    ];
    for (const value of candidates) {
        const ms = kpiToMillis(value);
        if (ms > 0) return ms;
    }
    return 0;
};

/* Raw (original) image presence — mirrors the catalog's rawImageUrl(s) fields
   plus the common snake_case / legacy aliases. */
const kpiProductHasRawImage = (p) => {
    if (!p) return false;
    const lists = [p.rawImageUrls, p.raw_image_urls];
    for (const list of lists) {
        if (Array.isArray(list) && list.some((u) => String(u || '').trim())) return true;
    }
    const singles = [p.rawImageUrl, p.raw_image_url, p.image_url, p.main_image_url, p.image, p.rawImage];
    return singles.some((u) => typeof u === 'string' && u.trim());
};

/* A product needs a raw image ONLY when it has no original image AND the media
   editor has not touched it yet (never interfere with Youssef's workflow). */
const kpiProductNeedsRawImage = (p) => !kpiProductHasRawImage(p) && !kpiProductHasEnhancedImage(p);

const kpiIsEditorName = (name) => {
    const n = String(name || '');
    const l = n.toLowerCase();
    return n.includes('يوسف') || l.includes('youssef') || l.includes('yousef');
};

/* Resolve the image editor's display name (يوسف) from the users table, falling
   back to the known default. */
const kpiResolveImageEditorName = () => {
    const table = window.users;
    if (table && typeof table === 'object') {
        for (const key of Object.keys(table)) {
            const name = String((table[key] && table[key].name) || '');
            if (kpiIsEditorName(name)) return name;
        }
    }
    const current = String((window.currentUser && window.currentUser.name) || '');
    if (kpiIsEditorName(current)) return current;
    return 'يوسف';
};

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
        let enhancedCount = 0;
        const editedStamps = [];   // timestamps of every enhanced image, globally
        let untimedEnhanced = 0;   // enhanced products with no usable timestamp
        snap.forEach((d) => {
            const p = { id: d.id, ...(d.data() || {}) };
            const rep = kpiProductRepName(p);
            const ms = kpiToMillis(p.createdAt || p.created_at || p.updatedAt);
            if (!byRep.has(rep)) byRep.set(rep, []);
            byRep.get(rep).push(ms);
            /* Global image-edit audit: counted regardless of who added the
               product on the field (the editor works on reps' products). */
            if (kpiProductHasEnhancedImage(p)) {
                enhancedCount += 1;
                const editedMs = kpiProductImageEditedMillis(p);
                if (editedMs > 0) editedStamps.push(editedMs);
                else untimedEnhanced += 1;
            }
        });

        const records = new Map(); // repId -> { rep, seconds, count, editorCredit, enhancedCount }
        for (const [rep, stamps] of byRep.entries()) {
            stamps.sort((a, b) => a - b);
            let totalMs = 0;
            stamps.forEach((ms, i) => {
                if (i === 0) { totalMs += KPI_STANDARD_ADD_MS; return; }
                const diff = ms - stamps[i - 1];
                if (diff > 0 && diff < KPI_SESSION_BREAK_MS) totalMs += diff;
                else totalMs += KPI_STANDARD_ADD_MS;
            });
            records.set(kpiRepId(rep), {
                rep,
                seconds: Math.round(totalMs / 1000),
                count: stamps.length,
                editorCredit: 0,
                enhancedCount: 0
            });
        }

        /* Realistic retroactive time for the image editor, derived from the
           upload/update timestamps themselves instead of a flat multiplier.
           Sort every enhanced image chronologically and, for each one:
             - if it started a new session (first image or a gap > 30 min),
               credit the standard 5-minute session-start fallback;
             - otherwise credit the EXACT elapsed delta since the previous
               image (a continuous editing workflow).
           Enhanced products without any timestamp get the 5-minute fallback.
           The original reps keep their own data-entry time — this credit is
           additive and never subtracted from them. */
        const sortedStamps = editedStamps.slice().sort((a, b) => a - b);
        let editorMs = 0;
        sortedStamps.forEach((ms, i) => {
            if (i === 0) { editorMs += KPI_EDIT_FALLBACK_SECONDS * 1000; return; }
            const delta = ms - sortedStamps[i - 1];
            if (delta > 0 && delta <= KPI_EDIT_DURATION_CAP_SECONDS * 1000) editorMs += delta;
            else editorMs += KPI_EDIT_FALLBACK_SECONDS * 1000;
        });
        editorMs += untimedEnhanced * KPI_EDIT_FALLBACK_SECONDS * 1000;
        const editorCredit = Math.round(editorMs / 1000);

        const editorName = kpiResolveImageEditorName();
        const editorId = kpiRepId(editorName);
        const editorRecord = records.get(editorId) || { rep: editorName, seconds: 0, count: 0, editorCredit: 0, enhancedCount: 0 };
        editorRecord.rep = editorRecord.rep || editorName;
        editorRecord.seconds += editorCredit;
        editorRecord.editorCredit = editorCredit;
        editorRecord.enhancedCount = enhancedCount;
        records.set(editorId, editorRecord);

        const results = [];
        for (const [repId, info] of records.entries()) {
            await window.setDoc(window.doc(window.db, KPI_REP_COLLECTION, repId), {
                repId,
                repName: info.rep,
                historicalSeconds: Math.max(0, Number(info.seconds) || 0),
                historicalProductCount: info.count,
                historicalEnhancedCount: info.enhancedCount || 0,
                historicalEditorCreditSeconds: info.editorCredit || 0,
                historicalComputedAt: new Date()
            }, { merge: true });
            results.push({ rep: info.rep, repId, seconds: info.seconds, count: info.count });
        }

        const creditMinutes = Math.round(editorCredit / 60);
        if (window.showToast) {
            window.showToast('تم احتساب الوقت التاريخي: ' + results.length + ' مندوب • ' +
                enhancedCount + ' صورة محسّنة (' + creditMinutes + ' دقيقة للمحرر ' + editorName + ')');
        }
        return { results, enhancedCount, editorCredit, editorName };
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
    if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
        try {
            return await window.kanjoRest.runQuery(KPI_PRODUCTS_COLLECTION, []);
        } catch (restErr) {
            console.warn('[kpi] REST products fetch failed; trying SDK:', restErr);
        }
    }
    const snap = await window.getDocs(window.collection(window.db, KPI_PRODUCTS_COLLECTION));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    return items;
};

/* Secure, rep-scoped product fetch. A field rep only ever loads the products
   they personally added (queries are scoped by the logged-in User ID via the
   common author fields). Managers keep the full view. */
const kpiFetchProductsForRep = async (repName) => {
    const name = String(repName || '').trim();
    if (!name) return [];
    const found = new Map();
    const authorFields = ['added_by', 'createdBy'];
    const useRest = !!(window.kanjoRest && typeof window.kanjoRest.runQuery === 'function');
    /* Query both author aliases concurrently instead of serially. */
    const results = await Promise.all(authorFields.map((field) => {
        if (useRest) {
            return window.kanjoRest.runQuery(KPI_PRODUCTS_COLLECTION, [[field, '==', name]]).catch(() => null);
        }
        if (typeof window.query !== 'function' || typeof window.where !== 'function') return Promise.resolve(null);
        return window.getDocs(window.query(
            window.collection(window.db, KPI_PRODUCTS_COLLECTION),
            window.where(field, '==', name)
        )).then((snap) => {
            const items = [];
            snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
            return items;
        }).catch(() => null);
    }));
    results.forEach((items) => { if (items) items.forEach((it) => found.set(it.id, it)); });
    return Array.from(found.values());
};

/* Reps get a scoped fetch of their own products; managers get the full set
   for the cross-rep audit tools. */
const kpiFetchProductsForScope = async (repName) => {
    if (window.isFieldRepUser()) return kpiFetchProductsForRep(repName);
    return kpiFetchAllProducts();
};

const kpiFetchParentRecords = async () => {
    const map = new Map();
    const useRest = !!(window.kanjoRest && (typeof window.kanjoRest.runQuery === 'function' || typeof window.kanjoRest.getDocument === 'function'));
    try {
        /* Field reps are hard-scoped to their own parent record; only managers
           may enumerate every rep. Mirrors the rep_kpis security rules. */
        if (window.isFieldRepUser() && window.currentUser && window.currentUser.name) {
            const ownId = kpiRepId(window.currentUser.name);
            let data = null;
            if (useRest && typeof window.kanjoRest.getDocument === 'function') {
                const doc = await window.kanjoRest.getDocument([KPI_REP_COLLECTION, ownId]);
                if (doc) { const { id, ...rest } = doc; data = rest; }
            } else {
                const snap = await window.getDoc(window.doc(window.db, KPI_REP_COLLECTION, ownId));
                data = (snap && snap.exists && snap.exists()) ? (snap.data() || {}) : null;
            }
            if (data) map.set(ownId, data);
            return map;
        }
        if (useRest && typeof window.kanjoRest.runQuery === 'function') {
            const items = await window.kanjoRest.runQuery(KPI_REP_COLLECTION, []);
            items.forEach((it) => { const { id, ...data } = it; map.set(id, data); });
            return map;
        }
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
        let items = null;
        if (!repId) return { activeSeconds, imageEditSeconds, days };
        if (window.kanjoRest && typeof window.kanjoRest.list === 'function') {
            items = await window.kanjoRest.list([KPI_REP_COLLECTION, repId, KPI_STATS_SUBCOLLECTION]);
        } else {
            const snap = await window.getDocs(window.collection(window.db, KPI_REP_COLLECTION, repId, KPI_STATS_SUBCOLLECTION));
            items = [];
            snap.forEach((d) => items.push(d.data() || {}));
        }
        (items || []).forEach((data) => {
            activeSeconds += Math.max(0, Number(data.activeSeconds) || 0);
            imageEditSeconds += Math.max(0, Number(data.imageEditSeconds) || 0);
            days += 1;
        });
    } catch (err) {
        console.error('[kpi] daily stats fetch failed for ' + repId + ':', err);
    }
    return { activeSeconds, imageEditSeconds, days };
};

/* ───────────── Team leaderboard (gamification) ─────────────
   Reps may see each other on a shared board, but NOT each other's products or
   pricing. We publish only non-sensitive raw stats onto rep_kpis/{repId}:
   product count, net seconds and the two quality ratios. The Kanjo score is
   then recomputed client-side over the team so every viewer sees the exact
   same ranking without ever reading merchant_products. */
const KPI_TEAM_SUMMARY_FIELDS = [
    'repId', 'repName', 'team', 'isEditor',
    'publicTotalProducts', 'publicTotalSeconds',
    'publicAvgDescriptionLength', 'publicValidRatio', 'publicImageRatio', 'publicUpdatedAt'
];

const kpiRepTeamName = (repName) => {
    const name = String(repName || '').trim();
    if (!name) return '';
    const payroll = Array.isArray(window.KANJO_REP_PAYROLL) ? window.KANJO_REP_PAYROLL : [];
    const match = payroll.find((p) => String(p.name || '').trim() === name);
    if (match && match.team) return String(match.team).trim();
    if (window.currentUser && String(window.currentUser.name || '').trim() === name) {
        return String(window.currentUser.team || '').trim();
    }
    return '';
};

const kpiSummaryPayload = (row) => {
    const team = kpiRepTeamName(row.name);
    if (!team) return null;
    return {
        repId: row.repId,
        repName: row.name,
        team,
        isEditor: !!row.isEditor,
        publicTotalProducts: Math.max(0, Number(row.totalProducts) || 0),
        publicTotalSeconds: Math.max(0, Number(row.totalSeconds) || 0),
        publicAvgDescriptionLength: Math.max(0, Number(row.avgDescriptionLength) || 0),
        publicValidRatio: Math.max(0, Number(row.validRatioRaw) || 0),
        publicImageRatio: Math.max(0, Number(row.imageRatioRaw) || 0),
        publicUpdatedAt: new Date()
    };
};

const kpiPublishSummary = async (row) => {
    const payload = kpiSummaryPayload(row);
    if (!payload) return;
    try {
        if (!(await kpiRestMerge([KPI_REP_COLLECTION, payload.repId], payload))) {
            await window.setDoc(window.doc(window.db, KPI_REP_COLLECTION, payload.repId), payload, { merge: true });
        }
    } catch (err) {
        /* Non-fatal: a rep publishes only their own row; managers publish all. */
        console.error('[kpi] leaderboard summary publish failed for ' + payload.repId + ':', err);
    }
};

/* Reps publish only their own row; managers publish the whole roster so the
   board is populated even for reps who have not opened their screen. */
const kpiPublishSummaries = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const isRep = window.isFieldRepUser();
    const ownId = isRep ? window.kpiResolvePersonalRepId('') : '';
    const targets = isRep ? list.filter((r) => r.repId === ownId) : list;
    return Promise.all(targets.map(kpiPublishSummary));
};

/* Read every rep's published leaderboard summary (GLOBAL leaderboard). The
   payroll roster seeds the list so every rep is counted in the denominator even
   before they have published a summary. Rule-gated by `allow read` for all
   signed-in users. Never lets a failure throw into the dashboard render path. */
const kpiFetchLeaderboardSummaries = async () => {
    try {
        const byId = new Map();
        /* Seed the full company roster so the rank denominator is the total
           number of reps, not just those who have published a summary yet. */
        (Array.isArray(window.KANJO_REP_PAYROLL) ? window.KANJO_REP_PAYROLL : [])
            .filter((p) => p && p.name)
            .forEach((p) => {
                const repId = kpiRepId(p.name);
                byId.set(repId, {
                    repId,
                    name: p.name,
                    team: String(p.team || '').trim(),
                    isEditor: false,
                    totalProducts: 0,
                    totalSeconds: 0,
                    avgDescriptionLength: 0,
                    validRatio: 0,
                    imageRatio: 0
                });
            });
        /* No team filter: rank against every rep company-wide. */
        let rows = null;
        if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
            try {
                rows = await window.kanjoRest.runQuery(KPI_REP_COLLECTION, []);
            } catch (restErr) {
                console.warn('[kpi] REST leaderboard fetch failed; trying SDK:', restErr);
            }
        }
        if (!rows) {
            const snap = await window.getDocs(window.collection(window.db, KPI_REP_COLLECTION));
            rows = [];
            snap.forEach((d) => rows.push({ id: d.id, ...(d.data() || {}) }));
        }
        rows.forEach((row) => {
            const { id, ...data } = row;
            byId.set(id, {
                repId: id,
                name: data.repName || id,
                team: data.team || '',
                isEditor: !!data.isEditor,
                totalProducts: Math.max(0, Number(data.publicTotalProducts) || 0),
                totalSeconds: Math.max(0, Number(data.publicTotalSeconds) || 0),
                avgDescriptionLength: Math.max(0, Number(data.publicAvgDescriptionLength) || 0),
                validRatio: Math.max(0, Number(data.publicValidRatio) || 0),
                imageRatio: Math.max(0, Number(data.publicImageRatio) || 0)
            });
        });
        return Array.from(byId.values());
    } catch (err) {
        console.error('[kpi] leaderboard fetch failed:', err);
        return [];
    }
};

/* Anonymous benchmarking: reps compare each of their four scored metrics
   against the single best company-wide value, without ever seeing a peer's
   name, rank, individual bar or medal. The best value is derived ONLY from the
   published, non-sensitive rep_kpis summaries (product count, net seconds and
   the two quality ratios) — never from merchant_products. The rep's OWN side of
   every comparison is injected from the live local report row so it always
   matches the values on their top cards, even when their published rep_kpis
   document is stale. */
const kpiComputeBenchmark = (summaries, ownRow) => {
    const field = (summaries || []).filter((r) => !r.isEditor);
    const own = {
        score: ownRow && !ownRow.isEditor ? (Number(ownRow.kanjoScore) || 0) : 0,
        validRatio: ownRow ? (Number(ownRow.validRatioRaw) || 0) : 0,
        imageRatio: ownRow ? (Number(ownRow.imageRatioRaw) || 0) : 0,
        speedSeconds: ownRow && (Number(ownRow.totalProducts) || 0) > 0
            ? (Number(ownRow.avgSecondsPerProduct) || 0)
            : 0
    };
    const best = { score: 0, validRatio: 0, imageRatio: 0, speedSeconds: 0 };
    let hasSpeed = false;
    let hasBenchmark = false;
    field.forEach((r) => {
        const products = Number(r.totalProducts) || 0;
        if (products <= 0) return;
        hasBenchmark = true;
        const seconds = Number(r.totalSeconds) || 0;
        const valid = Number(r.validRatio) || 0;
        const image = Number(r.imageRatio) || 0;
        /* Mirror the score a rep sees on their own top card: the live local
           report normalises volume/effort against the rep themselves, so the
           only variable parts are the description-length target and the two
           quality ratios (10 + 35 + 35). */
        const avgLen = Number(r.avgDescriptionLength) || 0;
        const lengthPts = Math.min(1, avgLen / KPI_DESC_TARGET_LENGTH) * KPI_LENGTH_MAX;
        const selfScore = (seconds > 0 ? KPI_EFFORT_MAX : 0) + KPI_VOLUME_MAX + lengthPts + (valid * KPI_TEXT_MAX) + (image * KPI_MEDIA_MAX);
        best.score = Math.max(best.score, selfScore);
        best.validRatio = Math.max(best.validRatio, valid);
        best.imageRatio = Math.max(best.imageRatio, image);
        if (seconds > 0) {
            const sp = seconds / products;
            if (!hasSpeed || sp < best.speedSeconds) { best.speedSeconds = sp; hasSpeed = true; }
        }
    });
    return { own, best, hasBenchmark };
};

const kpiBenchmarkMetricHtml = (opts) => {
    const fill = Math.max(0, Math.min(100, opts.ownPct));
    return `<div class="kpi-benchmark-card">
        <div class="kpi-benchmark-title"><i class="fa-solid ${opts.icon}" style="color:${opts.color}"></i> ${opts.label}</div>
        <div class="kpi-benchmark-values">
            <div class="kpi-benchmark-side kpi-benchmark-side-own">
                <span class="kpi-benchmark-side-label">أنت</span>
                <span class="kpi-benchmark-side-value">${opts.ownValue}</span>
            </div>
            <div class="kpi-benchmark-vs">VS</div>
            <div class="kpi-benchmark-side kpi-benchmark-side-best">
                <span class="kpi-benchmark-side-label"><i class="fa-solid fa-crown"></i> أفضل أداء</span>
                <span class="kpi-benchmark-side-value">${opts.bestValue}</span>
            </div>
        </div>
        <div class="kpi-benchmark-track"><span style="width:${fill}%"></span></div>
        <div class="kpi-benchmark-note ${opts.atBest ? 'kpi-benchmark-note-best' : 'kpi-benchmark-note-gap'}">${opts.note}</div>
    </div>`;
};

const kpiBenchmarkHtml = (benchmark) => {
    const head = `<div class="kpi-panel-head">
        <div class="flex items-center gap-2">
            <span class="kpi-panel-icon"><i class="fa-solid fa-scale-balanced"></i></span>
            <div>
                <h3 class="font-black text-sm text-[#230535]">أنت مقابل أفضل أداء في الشركة</h3>
            </div>
        </div>
    </div>`;
    if (!benchmark || !benchmark.hasBenchmark) {
        return `<section class="kpi-panel kpi-benchmark">${head}
            <div class="kpi-benchmark-empty"><i class="fa-solid fa-hourglass-half"></i> لا توجد بيانات للمقارنة بعد.</div>
        </section>`;
    }
    const own = benchmark.own || {};
    const best = benchmark.best || {};
    /* Higher-is-better metrics: fill shows how close the rep is to the best. */
    const higher = (ownVal, bestVal, ownText, bestText, fmt, unit) => {
        const has = bestVal > 0;
        const ownPct = has ? (ownVal / bestVal) * 100 : (ownVal > 0 ? 100 : 0);
        const atBest = has && ownVal >= bestVal * 0.999;
        const note = atBest
            ? '<i class="fa-solid fa-trophy"></i> أنت في مقدمة الشركة في هذا المؤشر'
            : has
                ? 'تفصلك ' + fmt(Math.max(0, bestVal - ownVal)) + ' ' + unit + ' عن أفضل أداء'
                : 'لا توجد قيمة مرجعية بعد';
        return { ownValue: ownText, bestValue: bestText, ownPct, atBest, note };
    };
    /* Lower-is-better metric (speed): being at or under the best fills
       the bar; slower reps get a proportionally shorter fill. */
    const lower = (ownVal, bestVal, ownText, bestText, fmt, unit) => {
        const hasBest = bestVal > 0;
        const hasOwn = ownVal > 0;
        const ownPct = hasBest && hasOwn ? (bestVal / ownVal) * 100 : 0;
        const atBest = hasBest && hasOwn && ownVal <= bestVal * 1.001;
        const note = !hasBest
            ? 'لا توجد قيمة مرجعية بعد'
            : !hasOwn
                ? 'لا يوجد وقت مُتتبع لقياس سرعتك بعد'
                : atBest
                    ? '<i class="fa-solid fa-bolt"></i> أنت الأسرع في الشركة'
                    : 'تفصلك ' + fmt(Math.max(0, ownVal - bestVal)) + ' ' + unit + ' عن أفضل أداء';
        return { ownValue: ownText, bestValue: bestText, ownPct, atBest, note };
    };
    const score = higher(own.score, best.score, own.score.toFixed(1) + '%', best.score.toFixed(1) + '%', (v) => v.toFixed(1), 'نقطة');
    const quality = higher(own.validRatio, best.validRatio, (own.validRatio * 100).toFixed(1) + '%', (best.validRatio * 100).toFixed(1) + '%', (v) => (v * 100).toFixed(1), 'نقطة مئوية');
    const images = higher(own.imageRatio, best.imageRatio, (own.imageRatio * 100).toFixed(1) + '%', (best.imageRatio * 100).toFixed(1) + '%', (v) => (v * 100).toFixed(1), 'نقطة مئوية');
    const speed = lower(own.speedSeconds, best.speedSeconds, own.speedSeconds > 0 ? (own.speedSeconds / 60).toFixed(2) + ' د' : '—', best.speedSeconds > 0 ? (best.speedSeconds / 60).toFixed(2) + ' د' : '—', (v) => (v / 60).toFixed(2), 'دقيقة/منتج');
    return `<section class="kpi-panel kpi-benchmark">${head}
        <div class="kpi-benchmark-grid">
            ${kpiBenchmarkMetricHtml(Object.assign({ icon: 'fa-award', color: '#6D28D9', label: 'التقييم الشامل' }, score))}
            ${kpiBenchmarkMetricHtml(Object.assign({ icon: 'fa-star', color: '#37d99a', label: 'جودة الأوصاف' }, quality))}
            ${kpiBenchmarkMetricHtml(Object.assign({ icon: 'fa-image', color: '#230535', label: 'نسبة الصور' }, images))}
            ${kpiBenchmarkMetricHtml(Object.assign({ icon: 'fa-bolt', color: '#E57723', label: 'مؤشر السرعة' }, speed))}
        </div>
    </section>`;
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
    /* Reps only load their own catalog products; managers get the full set.
       Fetch products and parent records concurrently. */
    const [products, parents] = await Promise.all([
        kpiFetchProductsForScope((window.currentUser && window.currentUser.name) || ''),
        kpiFetchParentRecords()
    ]);

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
                descriptionCharsTotal: 0,
                dailyCounts: new Map()
            });
        }
        return reps.get(repId);
    };

    let editedImagesTotal = 0;
    products.forEach((p) => {
        const rep = ensureRep(kpiProductRepName(p));
        rep.totalProducts += 1;
        const merchant = kpiProductMerchantName(p);
        if (merchant) rep.merchants.add(merchant);

        if (kpiProductHasImage(p)) rep.withImage += 1;

        /* Global image-edit count: independent of the data-entry metric and
           attributed to the image editor, not to the product's creator. */
        if (kpiProductHasEnhancedImage(p)) editedImagesTotal += 1;

        const variations = kpiProductVariations(p);
        if (variations.length > 0) {
            rep.variableProducts += 1;
            rep.variationCount += variations.length;
        }

        const desc = window.kpiValidateDescription(
            p.description_ar || p.description_en || p.description || '',
            [p.name_ar, p.name_en, p.name]
        );
        /* Count the raw character length of every product (empty = 0) so the
           average reflects the whole dataset, not only the non-empty rows. */
        rep.descriptionCharsTotal += desc.length;
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

    /* Attribute the global edited-images count to the image editor's own row,
       ensuring the row exists even when he created no products himself. */
    const editorRowName = kpiResolveImageEditorName();
    const editorRankId = kpiRepId(editorRowName);
    ensureRep(editorRowName).editedImagesCount = editedImagesTotal;

    /* Materialize every payroll rep for managers so the leaderboard still lists
       teammates who have not added a product yet (they render with zeros). */
    if (!window.isFieldRepUser()) {
        (Array.isArray(window.KANJO_REP_PAYROLL) ? window.KANJO_REP_PAYROLL : [])
            .forEach((p) => { if (p && p.name) ensureRep(p.name); });
    }

    /* Always materialize the signed-in rep's own row so their personal screen
       renders (with zeros) even before they add their first product. */
    if (window.isFieldRepUser() && window.currentUser && window.currentUser.name) {
        ensureRep(window.currentUser.name);
    }

    /* A field rep may only resolve daily stats for their own repId; managers
       enumerate the whole team. Every daily-stats read runs concurrently — the
       old serial `await` inside a for-loop scaled report time with headcount. */
    const repList = window.isFieldRepUser()
        ? [reps.get(kpiRepId((window.currentUser && window.currentUser.name) || ''))].filter(Boolean)
        : Array.from(reps.values());
    const rows = await Promise.all(repList.map(async (rep) => {
        const stats = await kpiFetchDailyStats(rep.repId);
        const totalSeconds = stats.activeSeconds + stats.imageEditSeconds + (rep.historicalSeconds || 0);
        const totalProducts = rep.totalProducts;
        // RAW ratios (0..1) — never pre-rounded.
        const imageRatioRaw = totalProducts ? (rep.withImage / totalProducts) : 0;
        const descBase = rep.nonEmptyDescriptions || totalProducts;
        const validRatioRaw = descBase ? (rep.validDescriptions / descBase) : 0;
        const junkRatioRaw = descBase ? (rep.junkDescriptions / descBase) : 0;
        const emptyRatioRaw = descBase ? (rep.emptyDescriptions / descBase) : 0;
        const avgDescriptionLength = totalProducts ? (rep.descriptionCharsTotal / totalProducts) : 0;
        const avgVariablesRaw = totalProducts ? (rep.variationCount / totalProducts) : 0;
        const minutesPerProductRaw = kpiMinutesPerProductRaw(totalSeconds, totalProducts);
        const dailyCounts = Array.from(rep.dailyCounts.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return {
            repId: rep.repId,
            name: rep.name,
            isEditor: rep.repId === editorRankId,
            totalProducts,
            editedImagesCount: rep.editedImagesCount || 0,
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
            avgDescriptionLength,
            avgVariablesRaw,
            minutesPerProductRaw,
            avgSecondsPerProduct: totalProducts ? totalSeconds / totalProducts : 0,
            trackedDays: stats.days,
            activeDays: dailyCounts.length,
            dailyCounts,
            lastActiveDate: dailyCounts.length ? dailyCounts[dailyCounts.length - 1].date : null
        };
    }));

    /* ─────────── Kanjo Weighted Score (out of 100) & competitive ranking ───────────
       Normalize the absolute counts against the top field performer so counts and
       percentages can be mixed on one scale (weights sum to exactly 100):
         a) Volume    10 pts = (products / maxProducts) * 10
         b) Length    10 pts = min(avg desc chars / 50, 1) * 10
         c) Effort    10 pts = (net time / maxTime) * 10
         d) Text      35 pts = valid-descriptions ratio * 35
         e) Media     35 pts = products-with-images ratio * 35
       The Media Editor (يوسف) is EXCLUDED from max-product/max-time normalization,
       scoring and the ranking loop; he only keeps his personal stats card. */
    const fieldRows = rows.filter((r) => !r.isEditor);
    const maxProducts = fieldRows.reduce((m, r) => Math.max(m, r.totalProducts), 0);
    const maxTime = fieldRows.reduce((m, r) => Math.max(m, r.totalSeconds), 0);

    rows.forEach((row) => {
        if (row.isEditor) {
            row.kanjoScore = null;
            row.kanjoBreakdown = null;
            row.rank = null;
            return;
        }
        const volumeWeight = maxProducts > 0 ? (row.totalProducts / maxProducts) * KPI_VOLUME_MAX : 0;
        const lengthWeight = Math.min(1, (Number(row.avgDescriptionLength) || 0) / KPI_DESC_TARGET_LENGTH) * KPI_LENGTH_MAX;
        const effortWeight = maxTime > 0 ? (row.totalSeconds / maxTime) * KPI_EFFORT_MAX : 0;
        const textWeight = row.validRatioRaw * KPI_TEXT_MAX;
        const mediaWeight = row.imageRatioRaw * KPI_MEDIA_MAX;
        row.kanjoBreakdown = { volumeWeight, lengthWeight, effortWeight, textWeight, mediaWeight };
        /* Keep the normalization baselines on the row so the transparent
           "Score Breakdown" modal can explain the exact math (X / max). */
        row.kanjoMaxProducts = maxProducts;
        row.kanjoMaxTime = maxTime;
        // RAW 0..100 — rounding happens only at render time.
        row.kanjoScore = volumeWeight + lengthWeight + effortWeight + textWeight + mediaWeight;
    });

    // Ranking (1st/2nd/3rd…) applies to FIELD REPS ONLY, strictly by Kanjo score.
    fieldRows
        .slice()
        .sort((a, b) => b.kanjoScore - a.kanjoScore || a.name.localeCompare(b.name, 'ar'))
        .forEach((row, idx) => { row.rank = idx + 1; });

    // Display order: ranked field reps first (score desc), then unranked editor(s).
    rows.sort((a, b) => {
        if (a.isEditor !== b.isEditor) return a.isEditor ? 1 : -1;
        if (a.isEditor && b.isEditor) return a.name.localeCompare(b.name, 'ar');
        return (b.kanjoScore - a.kanjoScore) || a.name.localeCompare(b.name, 'ar');
    });

    const topScorer = fieldRows.slice().sort((a, b) => b.kanjoScore - a.kanjoScore)[0] || null;

    const totals = rows.reduce((acc, r) => {
        acc.products += r.totalProducts;
        acc.editedImages += r.editedImagesCount;
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
        products: 0, editedImages: 0, merchants: 0, seconds: 0, activeSeconds: 0, imageEditSeconds: 0,
        historicalSeconds: 0, junk: 0, valid: 0, empty: 0, nonEmpty: 0, withImage: 0, withoutImage: 0
    });
    totals.reps = fieldRows.length;
    totals.editors = rows.length - fieldRows.length;
    totals.topScorerName = topScorer ? topScorer.name : null;
    totals.topScorerScore = topScorer ? topScorer.kanjoScore : 0;
    totals.imageRatioRaw = totals.products ? (totals.withImage / totals.products) : 0;
    const globalDescBase = totals.nonEmpty || totals.products;
    totals.validRatioRaw = globalDescBase ? (totals.valid / globalDescBase) : 0;
    totals.junkRatioRaw = globalDescBase ? (totals.junk / globalDescBase) : 0;
    totals.minutesPerProductRaw = kpiMinutesPerProductRaw(totals.seconds, totals.products);

    /* Fire-and-forget so ranking never waits on the network. Reps publish only
       their own summary; managers publish the whole roster. */
    kpiPublishSummaries(rows).catch(() => { /* non-fatal */ });

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
            labels: ['وصف صحيح', 'وصف وهمي', 'بدون وصف'],
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
            <div class="flex flex-wrap items-center gap-2">
                <span class="kpi-chip">${t.reps} مندوب${t.editors ? ' + ' + t.editors + ' محرر' : ''}</span>
                ${t.topScorerName ? `<span class="kpi-chip kpi-chip-gold"><i class="fa-solid fa-crown"></i> المتصدر: ${kpiEscape(t.topScorerName)} — ${Number(t.topScorerScore || 0).toFixed(1)}%</span>` : ''}
            </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
            ${kpiMetricCard({ icon: 'fa-box-open', iconBg: '#230535', iconColor: '#FFD700', value: t.products, label: 'إجمالي المنتجات' })}
            ${kpiMetricCard({ icon: 'fa-stopwatch', iconBg: '#FFD700', iconColor: '#230535', value: kpiFormatDurationShort(t.seconds), label: 'إجمالي الوقت الصافي', hint: 'نشط ' + kpiFormatDurationShort(t.activeSeconds) + ' • صور مُحررة: ' + t.editedImages })}
            ${kpiMetricCard({ icon: 'fa-gauge-high', iconBg: '#230535', iconColor: '#37d99a', value: t.minutesPerProductRaw.toFixed(2) + ' د', label: 'الكفاءة (دقيقة/منتج)' })}
            ${kpiMetricCard({ icon: 'fa-star', iconBg: '#37d99a', iconColor: '#fff', value: (t.validRatioRaw * 100).toFixed(1) + '%', label: 'جودة الأوصاف' })}
            ${kpiMetricCard({ icon: 'fa-triangle-exclamation', iconBg: '#dc2626', iconColor: '#fff', value: t.junk, label: 'أوصاف وهمية', hint: 'التجار: ' + t.merchants + ' • بصور: ' + (t.imageRatioRaw * 100).toFixed(0) + '%' })}
        </div>
    </section>`;
};

const kpiRepCardHtml = (row, selected) => {
    const initials = (String(row.name || '').trim().charAt(0)) || '?';
    const badge = row.junkDescriptions > 0
        ? `<span class="kpi-junk-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${row.junkDescriptions} وصف وهمي</span>`
        : `<span class="kpi-clean-badge"><i class="fa-solid fa-circle-check"></i> لا يوجد وصف وهمي</span>`;
    const editedPart = row.editedImagesCount ? ' • ' + row.editedImagesCount + ' صورة مُحررة' : '';
    const scoreHtml = row.isEditor
        ? `<div class="kpi-rep-score-editor"><i class="fa-solid fa-wand-magic-sparkles"></i> محرر الوسائط - خارج التقييم التنافسي</div>`
        : `<div class="kpi-rep-score"><i class="fa-solid fa-award"></i> التقييم الشامل: ${Number(row.kanjoScore || 0).toFixed(1)}%</div>`;
    const rankPill = (!row.isEditor && row.rank)
        ? `<span class="kpi-rank-pill kpi-rank-pill-${row.rank <= 3 ? row.rank : 'x'}">${row.rank === 1 ? '<i class="fa-solid fa-crown"></i> ' : ''}#${row.rank}</span>`
        : '';
    return `
    <button type="button" class="kpi-rep-pick ${selected ? 'kpi-rep-pick-active' : ''} ${row.isEditor ? 'kpi-rep-pick-editor' : ''}" data-kpi-rep="${kpiEscape(row.repId)}" onclick="selectKpiRep('${kpiEscape(row.repId)}')">
        <div class="flex items-center gap-2.5 min-w-0 w-full">
            <div class="kpi-avatar-ring">${kpiAvatarHtml(row.name)}</div>
            <div class="min-w-0 text-right flex-1">
                <div class="flex items-center justify-between gap-1.5">
                    <div class="font-black text-[13px] text-[#230535] truncate">${kpiEscape(row.name || initials)}</div>
                    ${rankPill}
                </div>
                <div class="text-[10px] font-bold text-slate-400 truncate">${row.merchantsCount} تاجر • ${row.totalProducts} منتج${editedPart}</div>
                <div class="text-[11px] font-black text-[#6D28D9] mt-0.5">${kpiFormatDurationShort(row.totalSeconds)}</div>
            </div>
        </div>
        ${scoreHtml}
        <div class="mt-2 w-full flex justify-start">${badge}</div>
    </button>`;
};

const kpiRepSelectorHtml = (report) => `
    <section class="kpi-panel">
        <div class="kpi-panel-head">
            <div class="flex items-center gap-2">
                <span class="kpi-panel-icon"><i class="fa-solid fa-users-viewfinder"></i></span>
                <div>
                    <h3 class="font-black text-sm text-[#230535]">الترتيب حسب التقييم الشامل (Kanjo Score / 100)</h3>
                    <p class="text-[11px] font-bold text-slate-400">اضغط على البطاقة لفتح القسم الثالث (Deep Dive)</p>
                </div>
            </div>
        </div>
        <div id="kpiRepSelectorGrid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-start">
            ${report.rows.map((r) => kpiRepCardHtml(r, r.repId === window._kpiSelectedRepId)).join('')}
        </div>
    </section>`;

const kpiDeepDiveHtml = (row) => {
    if (!row) {
        return `<section class="kpi-panel"><div class="text-center py-10 text-slate-400 font-bold">
            <i class="fa-solid fa-hand-pointer text-3xl text-[#230535]/20 mb-2"></i>
            <div>اختر مندوباً من القائمة أعلاه لعرض التحليل التفصيلي والمخططات</div>
        </div></section>`;
    }
    const validPct = (row.validRatioRaw * 100);
    const junkPct = (row.junkRatioRaw * 100);
    const emptyPct = (row.emptyRatioRaw * 100);
    return `
    <section class="kpi-panel" id="kpiDeepDivePanel">
        <div class="kpi-deep-head">
            <div class="flex items-center gap-2.5 min-w-0">
                <div class="kpi-avatar-ring">${kpiAvatarHtml(row.name)}</div>
                <div class="min-w-0">
                    <h3 class="font-black text-base text-[#230535] truncate">${kpiEscape(row.name)}</h3>
                    <p class="text-[10px] font-bold text-slate-400">${row.isEditor ? 'محرر الوسائط - خارج التقييم التنافسي' : 'تحليل تفصيلي دقيق — صالح لحساب المكافآت المالية'}</p>
                </div>
            </div>
            <div class="flex flex-wrap gap-2">
                ${row.isEditor
                    ? '<span class="kpi-chip kpi-chip-gold"><i class="fa-solid fa-wand-magic-sparkles"></i> محرر الوسائط - خارج التقييم التنافسي</span>'
                    : `<span class="kpi-chip kpi-chip-gold"><i class="fa-solid fa-award"></i> التقييم الشامل: ${Number(row.kanjoScore || 0).toFixed(1)}%</span>
                       ${row.rank ? `<span class="kpi-chip kpi-chip-dark"><i class="fa-solid fa-ranking-star"></i> المركز #${row.rank}</span>` : ''}`}
                <span class="kpi-chip kpi-chip-dark">الوقت الصافي: ${kpiFormatDurationExact(row.totalSeconds)}</span>
                <span class="kpi-chip">${(row.minutesPerProductRaw).toFixed(2)} دقيقة / منتج</span>
            </div>
        </div>

        <!-- Bento grid: [exact text metrics] [productivity chart] [doughnuts] -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4 items-start">

            <!-- Column 1 — deep-dive text metrics & precision table -->
            <div class="kpi-col-metrics space-y-3">
                ${row.isEditor ? '' : `
                <button type="button" class="kpi-kanjo-score-banner kpi-kanjo-score-clickable" onclick="openKpiScoreBreakdown('${kpiEscape(row.repId)}')">
                    <div class="kpi-kanjo-score-value">${Number(row.kanjoScore || 0).toFixed(1)}</div>
                    <div class="kpi-kanjo-score-meta">
                        <span class="font-black text-[#FFD700]">التقييم الشامل (Kanjo Score)</span>
                        <span class="text-slate-400">من 100 نقطة${row.rank ? ' • المركز #' + row.rank : ''}</span>
                        <span class="kpi-kanjo-score-hint"><i class="fa-solid fa-circle-info"></i> اضغط لعرض تفاصيل الحساب</span>
                    </div>
                </button>`}
                <div class="grid grid-cols-2 gap-2">
                    ${kpiMetricCard({ icon: 'fa-hourglass-half', iconBg: '#230535', iconColor: '#FFD700', value: kpiFormatDurationExact(row.totalSeconds), label: 'الوقت النشط الفعلي (دقيق)' })}
                    ${kpiMetricCard({ icon: 'fa-bolt', iconBg: '#FFD700', iconColor: '#230535', value: (row.minutesPerProductRaw).toFixed(2) + ' د', label: 'الكفاءة الدقيقة / منتج' })}
                    ${kpiMetricCard({ icon: 'fa-circle-xmark', iconBg: '#dc2626', iconColor: '#fff', value: row.junkDescriptions, label: 'أوصاف وهمية' })}
                    ${kpiMetricCard({ icon: 'fa-star', iconBg: '#37d99a', iconColor: '#fff', value: validPct.toFixed(1) + '%', label: 'جودة الأوصاف الفعلية' })}
                </div>

                <div class="kpi-financial-grid">
                    <div class="kpi-fin-row"><span>عدد المنتجات المُدخلة</span><span class="kpi-fin-val">${row.totalProducts}</span></div>
                    <div class="kpi-fin-row"><span>عدد الصور المُحررة (عبر كل المناديب)</span><span class="kpi-fin-val text-[#6D28D9]">${row.editedImagesCount || 0}</span></div>
                    <div class="kpi-fin-row"><span>عدد التجار المُضافين</span><span class="kpi-fin-val">${row.merchantsCount}</span></div>
                    <div class="kpi-fin-row"><span>أيام النشاط الفعلي</span><span class="kpi-fin-val">${row.activeDays || row.trackedDays || 0}</span></div>
                    <div class="kpi-fin-row"><span>وقت إدخال التفاعل (دقيق)</span><span class="kpi-fin-val">${kpiFormatDurationExact(row.activeSeconds)}</span></div>
                    <div class="kpi-fin-row"><span>وقت تحرير الصور (دقيق)</span><span class="kpi-fin-val">${kpiFormatDurationExact(row.imageEditSeconds)}</span></div>
                    <div class="kpi-fin-row"><span>الوقت التاريخي المُحتسب</span><span class="kpi-fin-val">${kpiFormatDurationExact(row.historicalSeconds)}</span></div>
                    <div class="kpi-fin-row"><span>أوصاف صحيحة</span><span class="kpi-fin-val text-emerald-600">${row.validDescriptions} (${validPct.toFixed(1)}%)</span></div>
                    <div class="kpi-fin-row"><span>أوصاف وهمية</span><span class="kpi-fin-val text-red-600">${row.junkDescriptions} (${junkPct.toFixed(1)}%)</span></div>
                    <div class="kpi-fin-row"><span>بدون وصف</span><span class="kpi-fin-val text-slate-500">${row.emptyDescriptions} (${emptyPct.toFixed(1)}%)</span></div>
                    <div class="kpi-fin-row"><span>متوسط طول الوصف</span><span class="kpi-fin-val">${Math.round(Number(row.avgDescriptionLength) || 0)} حرف</span></div>
                    <div class="kpi-fin-row"><span>منتجات بصور / بدون صور</span><span class="kpi-fin-val">${row.withImage} / ${row.withoutImage}</span></div>
                    <div class="kpi-fin-row"><span>متوسط الخيارات لكل منتج</span><span class="kpi-fin-val">${(row.avgVariablesRaw).toFixed(2)}</span></div>
                    <div class="kpi-fin-row"><span>منتجات بخيارات (Variable)</span><span class="kpi-fin-val">${row.variableProducts}</span></div>
                    ${row.kanjoBreakdown ? `
                    <div class="kpi-fin-row"><span>وزن الكمية (10 نقاط)</span><span class="kpi-fin-val">${row.kanjoBreakdown.volumeWeight.toFixed(2)}</span></div>
                    <div class="kpi-fin-row"><span>وزن متوسط طول الوصف (10 نقاط)</span><span class="kpi-fin-val">${row.kanjoBreakdown.lengthWeight.toFixed(2)}</span></div>
                    <div class="kpi-fin-row"><span>وزن الجهد / الوقت (10 نقاط)</span><span class="kpi-fin-val">${row.kanjoBreakdown.effortWeight.toFixed(2)}</span></div>
                    <div class="kpi-fin-row"><span>وزن جودة النص (35 نقطة)</span><span class="kpi-fin-val">${row.kanjoBreakdown.textWeight.toFixed(2)}</span></div>
                    <div class="kpi-fin-row"><span>وزن جودة الوسائط (35 نقطة)</span><span class="kpi-fin-val">${row.kanjoBreakdown.mediaWeight.toFixed(2)}</span></div>
                    <div class="kpi-fin-row"><span class="text-[#230535]">إجمالي التقييم الشامل (100)</span><span class="kpi-fin-val text-[#230535]">${row.kanjoScore.toFixed(2)}</span></div>
                    ` : ''}
                </div>

                <div class="kpi-bars">
                    <div class="kpi-bar-row"><span>نسبة المنتجات بالصور</span><span class="font-black ${kpiRatioColor(row.imageRatioRaw)}">${(row.imageRatioRaw * 100).toFixed(1)}%</span></div>
                    <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${(row.imageRatioRaw * 100).toFixed(1)}%;background:${kpiRatioBar(row.imageRatioRaw)};"></div></div>
                    <div class="kpi-bar-row"><span>نسبة الأوصاف الصحيحة</span><span class="font-black ${kpiRatioColor(row.validRatioRaw)}">${(row.validRatioRaw * 100).toFixed(1)}%</span></div>
                    <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${(row.validRatioRaw * 100).toFixed(1)}%;background:${kpiRatioBar(row.validRatioRaw)};"></div></div>
                </div>
            </div>

            <!-- Column 2 — productivity trend -->
            <div class="kpi-chart-card">
                <div class="kpi-chart-title"><i class="fa-solid fa-chart-column text-[#230535]"></i> إنتاجية المندوب يومياً</div>
                <div class="relative h-64 lg:h-[19rem] w-full"><canvas id="kpiChartProductivity"></canvas></div>
            </div>

            <!-- Column 3 — compact stacked doughnuts -->
            <div class="space-y-3">
                <div class="kpi-chart-card">
                    <div class="kpi-chart-title"><i class="fa-solid fa-chart-pie text-[#E57723]"></i> جودة الأوصاف</div>
                    <div class="relative h-40 w-full"><canvas id="kpiChartQuality"></canvas></div>
                </div>
                <div class="kpi-chart-card">
                    <div class="kpi-chart-title"><i class="fa-solid fa-image text-[#6D28D9]"></i> جودة الوسائط (الصور)</div>
                    <div class="relative h-40 w-full"><canvas id="kpiChartMedia"></canvas></div>
                </div>
            </div>
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

/* ─────────────────── rep personal KPI preview (manager-only, temporary) ─────────────────── */

/* TEMPORARY rollout guard: the gamified personal screen is a manager preview
   only until it is officially released to field reps. To ship it to reps,
   simply relax this predicate. */
window.canPreviewRepPersonalKpi = () => {
    const u = window.currentUser;
    if (!u) return false;
    if (u.role === 'admin') return true;
    if (typeof window.isMahmoudUser === 'function' && window.isMahmoudUser()) return true;
    if (typeof window.isMahmoudOpsUser === 'function' && window.isMahmoudOpsUser()) return true;
    return false;
};

window._kpiRepPreviewMode = false;

const KPI_SPEED_LABEL = 'مؤشر السرعة والدقة (للعلم والإحصاء فقط)';

const kpiPersonalRank = (row, report) => {
    const fieldRows = (report.rows || []).filter((r) => !r.isEditor);
    /* `report.totals.reps` survives report scoping (the rep's report only
       carries their own row), so the "X of Y" denominator stays correct. */
    const totalFromTeam = report && report.totals ? Number(report.totals.teamReps) : 0;
    const totalFromTotals = report && report.totals ? Number(report.totals.reps) : 0;
    const total = totalFromTeam > 0 ? totalFromTeam : (totalFromTotals > 0 ? totalFromTotals : fieldRows.length);
    return { rank: row.isEditor ? null : (row.rank || null), total };
};

/* Exact rank for a rep's OWN screen. A field rep only receives their own row,
   so peers are taken from the published, non-sensitive rep_kpis summaries and
   scored with the same Kanjo formula the manager leaderboard uses. Only the
   resulting rank number and the total are ever exposed — never a peer name,
   team or identity. Editors are never ranked. */
const kpiComputePersonalRank = (summaries, ownRow) => {
    if (!ownRow || ownRow.isEditor) return { rank: null, total: 0 };
    const peers = (summaries || [])
        .filter((r) => r && !r.isEditor && r.repId !== ownRow.repId)
        .map((r) => ({
            repId: r.repId,
            totalProducts: Math.max(0, Number(r.totalProducts) || 0),
            totalSeconds: Math.max(0, Number(r.totalSeconds) || 0),
            avgDescriptionLength: Math.max(0, Number(r.avgDescriptionLength) || 0),
            validRatio: Math.max(0, Number(r.validRatio) || 0),
            imageRatio: Math.max(0, Number(r.imageRatio) || 0)
        }))
        .filter((r) => r.totalProducts > 0);
    const own = {
        repId: ownRow.repId,
        totalProducts: Math.max(0, Number(ownRow.totalProducts) || 0),
        totalSeconds: Math.max(0, Number(ownRow.totalSeconds) || 0),
        avgDescriptionLength: Math.max(0, Number(ownRow.avgDescriptionLength) || 0),
        validRatio: Math.max(0, Number(ownRow.validRatioRaw) || 0),
        imageRatio: Math.max(0, Number(ownRow.imageRatioRaw) || 0)
    };
    const active = own.totalProducts > 0 ? peers.concat([own]) : peers;
    if (!active.length) return { rank: null, total: 0 };
    const maxProducts = active.reduce((m, r) => Math.max(m, r.totalProducts), 0);
    const maxTime = active.reduce((m, r) => Math.max(m, r.totalSeconds), 0);
    const scoreOf = (r) => (maxProducts > 0 ? (r.totalProducts / maxProducts) * KPI_VOLUME_MAX : 0)
        + Math.min(1, (Number(r.avgDescriptionLength) || 0) / KPI_DESC_TARGET_LENGTH) * KPI_LENGTH_MAX
        + (maxTime > 0 ? (r.totalSeconds / maxTime) * KPI_EFFORT_MAX : 0)
        + r.validRatio * KPI_TEXT_MAX + r.imageRatio * KPI_MEDIA_MAX;
    if (own.totalProducts <= 0) return { rank: null, total: active.length };
    own.score = scoreOf(own);
    return { rank: 1 + peers.filter((r) => scoreOf(r) > own.score).length, total: active.length };
};

const kpiPersonalSmartTips = (row, report) => {
    if (row.isEditor) {
        return [{ tone: 'info', icon: 'fa-wand-magic-sparkles', text: 'أنت مسؤول عن تحرير صور المنتجات — التقييم التنافسي مخصص للمناديب فقط، وتحتفظ شاشتك بإحصائياتك الخاصة.' }];
    }
    const t = report.totals || {};
    const tips = [];
    const avgProducts = t.reps ? (t.products / t.reps) : 0;
    if (row.junkDescriptions > 0) {
        tips.push({ tone: 'danger', icon: 'fa-wand-magic-sparkles', text: 'لديك ' + row.junkDescriptions + ' وصف وهمي — اضغط على صندوق التنبيه بالأعلى لإصلاحها فوراً.' });
    }
    if (row.totalProducts < avgProducts) {
        tips.push({ tone: 'info', icon: 'fa-arrow-trend-up', text: 'نصيحة: يمكنك تحسين ترتيبك بزيادة عدد المنتجات المضافة اليوم.' });
    }
    if (row.emptyDescriptions > 0) {
        tips.push({ tone: 'info', icon: 'fa-pen-to-square', text: 'نصيحة: ' + row.emptyDescriptions + ' منتج بدون وصف — أضف وصفاً حقيقياً ليرتفع مؤشر الجودة.' });
    }
    if (row.totalProducts > 0 && (Number(row.avgDescriptionLength) || 0) < KPI_DESC_TARGET_LENGTH) {
        tips.push({ tone: 'info', icon: 'fa-text-width', text: 'نصيحة: متوسط طول وصفك ' + Math.round(Number(row.avgDescriptionLength) || 0) + ' حرف — اكتب أوصافاً أطول (' + KPI_DESC_TARGET_LENGTH + '+ حرفاً) لرفع نقاط جودة الوصف.' });
    }
    if (row.imageRatioRaw < 0.8) {
        tips.push({ tone: 'info', icon: 'fa-image', text: 'نصيحة: أضف صوراً لمنتجاتك لرفع نسبة الجاهزية والترتيب.' });
    }
    if (row.totalProducts > 0 && t.minutesPerProductRaw > 0 && row.minutesPerProductRaw > t.minutesPerProductRaw * 1.5) {
        tips.push({ tone: 'muted', icon: 'fa-gauge-high', text: 'ملاحظة إحصائية: متوسط وقتك لكل منتج أعلى من متوسط الفريق — هذا المؤشر للعلم والإحصاء فقط وليس خصماً.' });
    }
    if (!tips.length) {
        tips.push({ tone: 'success', icon: 'fa-trophy', text: 'أداء ممتاز! لا توجد ملاحظات حالياً — حافظ على هذه الجودة لتتصدر الترتيب.' });
    }
    return tips;
};

const kpiPersonalCard = (opts) => `
    <div class="kpi-personal-card kpi-personal-card-${opts.tone || 'purple'}${opts.onclick ? ' kpi-personal-card-clickable' : ''}"${opts.onclick ? ` role="button" tabindex="0" onclick="${opts.onclick}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${opts.onclick.replace(/"/g, '&quot;')}}"` : ''}>
        <div class="kpi-personal-card-icon"><i class="fa-solid ${opts.icon}"></i></div>
        <div class="kpi-personal-card-value">${opts.value}</div>
        <div class="kpi-personal-card-label">${opts.label}</div>
        ${opts.foot ? `<div class="kpi-personal-card-foot">${opts.foot}</div>` : ''}
        ${opts.onclick ? '<div class="kpi-personal-card-hint"><i class="fa-solid fa-circle-info"></i> اضغط لعرض طريقة الحساب</div>' : ''}
    </div>`;

/* ------------------------------------------------------------------ *
 *  Kanjo Score Breakdown Modal — transparent, auditable math.
 *  Points shown here MUST sum exactly to row.kanjoScore (raw 0..100).
 * ------------------------------------------------------------------ */
const KPI_SCORE_CRITERIA = [
    { key: 'volumeWeight', icon: 'fa-box-open', color: '#6D28D9', max: KPI_VOLUME_MAX, name: 'حجم المنتجات (الكمية)' },
    { key: 'lengthWeight', icon: 'fa-text-width', color: '#0ea5e9', max: KPI_LENGTH_MAX, name: 'متوسط طول الوصف' },
    { key: 'effortWeight', icon: 'fa-stopwatch', color: '#E57723', max: KPI_EFFORT_MAX, name: 'الجهد / الكفاءة الزمنية' },
    { key: 'textWeight', icon: 'fa-star', color: '#37d99a', max: KPI_TEXT_MAX, name: 'جودة الأوصاف الصحيحة' },
    { key: 'mediaWeight', icon: 'fa-image', color: '#230535', max: KPI_MEDIA_MAX, name: 'جودة الوسائط (الصور)' },
];

const kpiScoreCriterionHtml = (crit, earned, basis) => {
    const pct = crit.max > 0 ? Math.max(0, Math.min(100, (earned / crit.max) * 100)) : 0;
    const barColor = pct >= 80 ? '#37d99a' : pct >= 50 ? '#E57723' : '#dc2626';
    return `
    <div class="kpi-score-crit">
        <div class="flex items-center justify-between gap-2">
            <span class="kpi-score-crit-name"><i class="fa-solid ${crit.icon}" style="color:${crit.color};"></i> ${crit.name}</span>
            <span class="kpi-score-crit-val">${earned.toFixed(2)} <span class="text-slate-400">/ ${crit.max}</span></span>
        </div>
        <div class="kpi-score-track"><div class="kpi-score-fill" style="width:${pct.toFixed(1)}%;background:${barColor};"></div></div>
        <div class="kpi-score-crit-basis">${basis}</div>
    </div>`;
};

const kpiScoreBreakdownHtml = (row) => {
    const b = row.kanjoBreakdown || {};
    const score = Number(row.kanjoScore || 0);
    const validPct = (row.validRatioRaw * 100);
    const imgPct = (row.imageRatioRaw * 100);
    const maxProducts = Number(row.kanjoMaxProducts || row.totalProducts || 0);
    const maxTime = Number(row.kanjoMaxTime || row.totalSeconds || 0);
    const earned = {
        volumeWeight: Number(b.volumeWeight || 0),
        lengthWeight: Number(b.lengthWeight || 0),
        effortWeight: Number(b.effortWeight || 0),
        textWeight: Number(b.textWeight || 0),
        mediaWeight: Number(b.mediaWeight || 0),
    };
    const basis = {
        volumeWeight: `${row.totalProducts} منتج — مقارنةً بأعلى مندوب (${maxProducts} منتج) × ${KPI_VOLUME_MAX} نقاط`,
        lengthWeight: `متوسط ${Math.round(Number(row.avgDescriptionLength) || 0)} حرف/منتج — الهدف ${KPI_DESC_TARGET_LENGTH}+ حرف × ${KPI_LENGTH_MAX} نقاط`,
        effortWeight: `وقت صافٍ ${kpiFormatDurationShort(row.totalSeconds)} — مقارنةً بالأعلى (${kpiFormatDurationShort(maxTime)}) × ${KPI_EFFORT_MAX} نقاط`,
        textWeight: `${validPct.toFixed(1)}% أوصاف صحيحة (${row.validDescriptions} وصف صحيح من ${row.totalProducts}) × ${KPI_TEXT_MAX} نقطة`,
        mediaWeight: `${imgPct.toFixed(1)}% منتجات بصور (${row.withImage} بصور • ${row.withoutImage} بدون) × ${KPI_MEDIA_MAX} نقطة`,
    };
    return `
    <div class="kpi-score-final">
        <div class="kpi-score-final-label"><i class="fa-solid fa-award"></i> التقييم الشامل النهائي (Kanjo Score)</div>
        <div class="kpi-score-final-value">${score.toFixed(1)}<span> / 100</span></div>
        <div class="kpi-score-final-sub">${row.rank ? 'المركز #' + row.rank + ' بين المناديب المقيّمين' : 'مندوب مقيّم'} • ${kpiEscape(row.name)}</div>
    </div>

    <div class="kpi-score-crit-list">
        ${KPI_SCORE_CRITERIA.map((c) => kpiScoreCriterionHtml(c, earned[c.key], basis[c.key])).join('')}
    </div>

    <div class="kpi-score-total">
        <span>الإجمالي المحتسب</span>
        <span>${score.toFixed(2)} / 100</span>
    </div>

    <div class="kpi-score-info">
        <div class="kpi-score-info-row"><i class="fa-solid fa-layer-group"></i> <span>متوسط الخيارات لكل منتج</span><span class="font-black">${(row.avgVariablesRaw || 0).toFixed(2)}</span></div>
        <div class="kpi-score-info-row"><i class="fa-solid fa-code-branch"></i> <span>منتجات بخيارات (Variable)</span><span class="font-black">${row.variableProducts || 0}</span></div>
    </div>
    <p class="kpi-score-note"><i class="fa-solid fa-circle-info"></i> الخيارات معروضة للعلم فقط ولا تُحتسب ضمن النقاط. النقاط محسوبة كنسب من أعلى قيمة بين المناديب، ثم تُجمع لتكوّن التقييم من 100.</p>`;
};

window.openKpiScoreBreakdown = (repId) => {
    const report = window._kpiLatestReport;
    const row = report && (report.rows || []).find((r) => r.repId === repId);
    const modal = document.getElementById('kpiScoreBreakdownModal');
    const body = document.getElementById('kpiScoreBreakdownBody');
    if (!modal || !body) return;
    if (!row || row.isEditor) {
        if (window.showToast) window.showToast('تفاصيل التقييم الشامل متاحة للمناديب المقيّمين فقط', false);
        return;
    }
    body.innerHTML = kpiScoreBreakdownHtml(row);
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        const card = document.getElementById('kpiScoreBreakdownCard');
        if (card) card.classList.remove('opacity-0', 'scale-95');
    });
};

window.closeKpiScoreBreakdown = () => {
    const modal = document.getElementById('kpiScoreBreakdownModal');
    if (!modal) return;
    const card = document.getElementById('kpiScoreBreakdownCard');
    if (card) card.classList.add('opacity-0', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 150);
};

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('kpiScoreBreakdownModal');
    if (modal && !modal.classList.contains('hidden')) window.closeKpiScoreBreakdown();
});

const kpiPersonalPanelHtml = (report, row, opts) => {
    const liveMode = !!(opts && opts.liveMode);
    if (!row) {
        return `<section class="kpi-panel"><div class="text-center py-10 text-slate-400 font-bold">
            <i class="fa-solid fa-mobile-screen-button text-3xl text-[#230535]/20 mb-2"></i>
            <div>${liveMode ? 'لا توجد بيانات بعد — ابدأ بإضافة منتجاتك لتظهر مؤشراتك هنا' : 'اختر مندوباً من القائمة أعلاه لمعاينة شاشته الشخصية'}</div>
        </div></section>`;
    }
    const rankInfo = (opts && opts.personalRank) ? opts.personalRank : kpiPersonalRank(row, report);
    const isEditor = !!row.isEditor;
    /* A rep always sees their own exact rank (e.g. "المركز الثاني من 3"); peers
       stay private, so only the number and the total are ever rendered. */
    const medalIcon = rankInfo.rank === 1 ? 'fa-crown' : (rankInfo.rank && rankInfo.rank <= 3) ? 'fa-medal' : 'fa-ranking-star';
    const validPct = row.validRatioRaw * 100;
    const avgProducts = report.totals.reps ? (report.totals.products / report.totals.reps) : 0;
    const diffProducts = Math.round(row.totalProducts - avgProducts);
    const diffFoot = diffProducts > 0
        ? '<i class="fa-solid fa-arrow-up"></i> أعلى من متوسط الفريق بـ ' + diffProducts
        : diffProducts < 0
            ? '<i class="fa-solid fa-arrow-down"></i> أقل من متوسط الفريق بـ ' + Math.abs(diffProducts)
            : 'متوافق مع متوسط الفريق';
    const tips = kpiPersonalSmartTips(row, report);
    const junk = row.junkDescriptions;
    const missingImages = isEditor ? 0 : (row.withoutImage || 0);
    const breakdown = row.kanjoBreakdown || {};
    const avgDescLength = Math.round(Number(row.avgDescriptionLength) || 0);
    const breakdownCall = "openKpiScoreBreakdown('" + kpiEscape(row.repId) + "')";

    const warningHtml = junk > 0
        ? `<button type="button" class="kpi-warn-box" onclick="openKpiFixDescriptions('${kpiEscape(row.repId)}')">
                <span class="kpi-warn-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>
                <span class="flex-1 text-right min-w-0">
                    <span class="block font-black text-sm">تنبيه: لديك ${junk} وصف وهمي</span>
                    <span class="block text-[11px] font-bold opacity-80">اضغط هنا لإصلاح الأوصاف الآن وتحسين مؤشر الجودة فوراً</span>
                </span>
                <span class="kpi-warn-cta"><i class="fa-solid fa-wrench"></i> إصلاح الآن</span>
            </button>`
        : `<div class="kpi-ok-box">
                <span class="kpi-ok-icon"><i class="fa-solid fa-circle-check"></i></span>
                <span class="min-w-0">
                    <span class="block font-black text-sm">لا توجد أوصاف وهمية</span>
                    <span class="block text-[11px] font-bold opacity-80">واصل هذا الأداء الممتاز</span>
                </span>
            </div>`;

    const imgWarnHtml = missingImages > 0
        ? `<button type="button" class="kpi-warn-box kpi-warn-box-gold" onclick="openKpiFixImages('${kpiEscape(row.repId)}')">
                <span class="kpi-warn-icon kpi-warn-icon-gold"><i class="fa-solid fa-image"></i></span>
                <span class="flex-1 text-right min-w-0">
                    <span class="block font-black text-sm">تنبيه: لديك ${missingImages} منتج بدون صور</span>
                    <span class="block text-[11px] font-bold opacity-80">اضغط هنا لرفع الصور الآن ورفع نسبة جاهزية منتجاتك</span>
                </span>
                <span class="kpi-warn-cta"><i class="fa-solid fa-upload"></i> رفع صورة</span>
            </button>`
        : '';

    return `
    <section class="kpi-panel kpi-personal">
        <div class="kpi-panel-head">
            <div class="flex items-center gap-2">
                <span class="kpi-panel-icon"><i class="fa-solid ${liveMode ? 'fa-house-chimney-user' : 'fa-mobile-screen-button'}"></i></span>
                <div>
                    <h3 class="font-black text-sm text-[#230535]">${liveMode ? 'لوحة أدائي' : 'معاينة شاشة المندوب الشخصية'}</h3>
                    <p class="text-[11px] font-bold text-slate-400">${liveMode ? 'تابع إنتاجك وجودة أوصافك وصورك لحظياً' : 'هذه المعاينة متاحة للمدير فقط قبل إتاحتها للمناديب'}</p>
                </div>
            </div>
            ${liveMode ? '' : '<span class="kpi-chip kpi-chip-gold"><i class="fa-solid fa-eye"></i> وضع المعاينة</span>'}
        </div>

        <div class="kpi-personal-hero">
            <div class="kpi-avatar-ring kpi-avatar-ring-lg">${kpiAvatarHtml(row.name)}</div>
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-black text-lg text-[#FFD700] truncate">${kpiEscape(row.name)}</h4>
                    ${isEditor
                        ? '<span class="kpi-rank-badge kpi-rank-badge-editor"><i class="fa-solid fa-wand-magic-sparkles"></i> محرر الوسائط - خارج التقييم التنافسي</span>'
                        : rankInfo.rank
                            ? `<span class="kpi-rank-badge"><i class="fa-solid ${medalIcon}"></i> المركز ${rankInfo.rank} من ${rankInfo.total}</span>`
                            : '<span class="kpi-rank-badge"><i class="fa-solid fa-chart-simple"></i> مؤشراتك لحظياً</span>'}
                </div>
                <p class="text-[11px] font-bold text-white/70 mt-1">${isEditor ? 'إحصائياتك الشخصية كاملة بدون تقييم تنافسي' : 'تابع إنتاجك وجودة أوصافك وصورك'}</p>
            </div>
            <div class="text-center shrink-0">
                ${isEditor
                    ? `<div class="text-[10px] font-black text-white/60">الصور المُحررة</div>
                       <div class="font-black text-base text-white">${row.editedImagesCount || 0}</div>`
                    : `<div class="text-[10px] font-black text-white/60">التقييم الشامل</div>
                       <div class="font-black text-xl text-[#FFD700]">${Number(row.kanjoScore || 0).toFixed(1)}%</div>`}
                <div class="text-[10px] font-black text-white/60 mt-1">الوقت الصافي</div>
                <div class="font-black text-xs text-white">${kpiFormatDurationShort(row.totalSeconds)}</div>
            </div>
        </div>

        <div class="kpi-personal-cards">
            ${isEditor
                ? kpiPersonalCard({ tone: 'indigo', icon: 'fa-wand-magic-sparkles', value: row.editedImagesCount || 0, label: 'عدد الصور المُحررة', foot: 'إجمالي الصور التي حررتها' })
                : kpiPersonalCard({ tone: 'purple', icon: 'fa-award', value: Number(row.kanjoScore || 0).toFixed(1) + '%', label: 'التقييم الشامل (Kanjo Score)', foot: (rankInfo.rank ? 'المركز #' + rankInfo.rank + ' من ' + rankInfo.total : diffFoot), onclick: breakdownCall })}
            ${isEditor ? '' : kpiPersonalCard({ tone: 'indigo', icon: 'fa-box-open', value: Number(breakdown.volumeWeight || 0).toFixed(1) + ' / ' + KPI_VOLUME_MAX, label: 'حجم المنتجات', foot: row.totalProducts + ' منتج مسجل', onclick: breakdownCall })}
            ${isEditor ? '' : kpiPersonalCard({ tone: 'purple', icon: 'fa-text-width', value: Number(breakdown.lengthWeight || 0).toFixed(1) + ' / ' + KPI_LENGTH_MAX, label: 'متوسط طول الوصف', foot: 'متوسط ' + avgDescLength + ' حرف/منتج', onclick: breakdownCall })}
            ${isEditor
                ? kpiPersonalCard({ tone: 'green', icon: 'fa-star', value: validPct.toFixed(1) + '%', label: 'جودة الأوصاف الصحيحة', foot: junk > 0 ? junk + ' وصف يحتاج إصلاح' : 'لا توجد أوصاف وهمية' })
                : kpiPersonalCard({ tone: 'green', icon: 'fa-star', value: Number(breakdown.textWeight || 0).toFixed(1) + ' / ' + KPI_TEXT_MAX, label: 'جودة الأوصاف', foot: validPct.toFixed(1) + '% وصف صحيح' + (junk > 0 ? ' • ' + junk + ' وهمي' : ''), onclick: breakdownCall })}
            ${isEditor
                ? kpiPersonalCard({ tone: 'indigo', icon: 'fa-image', value: (row.imageRatioRaw * 100).toFixed(0) + '%', label: 'نسبة المنتجات بالصور', foot: row.withImage + ' بصور • ' + row.withoutImage + ' بدون صور' })
                : kpiPersonalCard({ tone: 'indigo', icon: 'fa-image', value: Number(breakdown.mediaWeight || 0).toFixed(1) + ' / ' + KPI_MEDIA_MAX, label: 'جودة الوسائط (الصور)', foot: row.withImage + ' بصور • ' + row.withoutImage + ' بدون صور', onclick: breakdownCall })}
            ${kpiPersonalCard({ tone: 'gold', icon: 'fa-stopwatch', value: row.minutesPerProductRaw.toFixed(2) + ' د', label: KPI_SPEED_LABEL, foot: 'لا تُخصم من وقتك أو مكافآتك' })}
        </div>

        ${warningHtml}

        ${imgWarnHtml}

        <div class="kpi-tips">
            <div class="kpi-tips-head"><i class="fa-solid fa-lightbulb text-[#FFD700]"></i> نصائح ذكية لتحسين أدائك</div>
            <ul class="kpi-tips-list">
                ${tips.map((t) => `<li class="kpi-tip kpi-tip-${t.tone}"><i class="fa-solid ${t.icon}"></i> <span>${t.text}</span></li>`).join('')}
            </ul>
        </div>
    </section>`;
};

window.toggleKpiRepPreview = async () => {
    if (!window.canPreviewRepPersonalKpi()) {
        if (window.showToast) window.showToast('هذه المعاينة متاحة للمدير فقط', false);
        return;
    }
    window._kpiRepPreviewMode = !window._kpiRepPreviewMode;
    await window.renderKpiDashboard();
};

const kpiFixItemHtml = (p) => {
    const name = p.name_ar || p.name_en || p.name || p.id;
    const merchant = p.merchantName || p.merchant || p.merchant_name || '—';
    const current = p.description_ar || p.description_en || p.description || '';
    const pid = kpiEscape(p.id);
    return `
    <div class="kpi-fix-item" data-fix-id="${pid}">
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <div class="font-black text-[13px] text-[#230535]">${kpiEscape(name)}</div>
                <div class="kpi-fix-merchant"><i class="fa-solid fa-store"></i> ${kpiEscape(merchant)}</div>
            </div>
            <span class="kpi-chip kpi-chip-red shrink-0"><i class="fa-solid fa-triangle-exclamation"></i> وصف وهمي</span>
        </div>
        <div class="kpi-fix-current"><span class="font-black text-[#230535]">الوصف الحالي:</span> ${current ? kpiEscape(current) : '<span class="opacity-50">—</span>'}</div>
        <textarea id="kpiFixInput_${pid}" rows="2" class="kpi-fix-input" placeholder="اكتب وصفاً حقيقياً للمنتج (أكثر من 10 أحرف)..."></textarea>
        <div class="flex justify-end mt-2">
            <button type="button" id="kpiFixSave_${pid}" onclick="kpiSaveFixedDescription('${pid}')" class="kpi-fix-save"><i class="fa-solid fa-floppy-disk"></i> حفظ الوصف</button>
        </div>
    </div>`;
};

window.openKpiFixDescriptions = async (repId) => {
    if (!window.canViewPersonalKpi()) {
        if (window.showToast) window.showToast('هذه الأداة غير متاحة لحسابك', false);
        return;
    }
    const modal = document.getElementById('kpiFixModal');
    const list = document.getElementById('kpiFixList');
    const sub = document.getElementById('kpiFixSubtitle');
    if (!modal || !list) return;
    /* Reps are hard-locked to their own identity, so they can never audit or
       edit another rep's products through this workflow. */
    repId = window.kpiResolvePersonalRepId(repId);
    window._kpiFixRepId = repId;
    modal.classList.remove('hidden');
    list.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i><div>جاري تحميل المنتجات...</div></div>';
    try {
        const report = window._kpiLatestReport || await kpiBuildReport();
        const row = (report.rows || []).find((r) => r.repId === repId);
        const repName = window.isFieldRepUser()
            ? String((window.currentUser && window.currentUser.name) || repId)
            : (row ? row.name : repId);
        if (sub) sub.textContent = repName + ' • جاري التحميل...';
        const all = await kpiFetchProductsForScope(repName);
        const junk = all.filter((p) => kpiProductRepName(p) === repName
            && window.kpiValidateDescription(
                p.description_ar || p.description_en || p.description || '',
                [p.name_ar, p.name_en, p.name]
            ).isJunk);
        window._kpiFixAllowedIds = new Set(junk.map((p) => p.id));
        /* Keep each product's name candidates so a "fix" cannot simply re-enter
           the product name as the description (that is still a fake description). */
        window._kpiFixNames = new Map(junk.map((p) => [p.id, [p.name_ar, p.name_en, p.name]]));
        if (sub) sub.textContent = repName + ' • ' + junk.length + ' منتج بحاجة لإصلاح';
        if (!junk.length) {
            list.innerHTML = '<div class="text-center py-10 text-emerald-600 font-black"><i class="fa-solid fa-circle-check text-3xl mb-2"></i><div>لا توجد أوصاف وهمية — عمل رائع!</div></div>';
            return;
        }
        list.innerHTML = junk.map(kpiFixItemHtml).join('');
    } catch (err) {
        console.error('[kpi] open fix descriptions failed:', err);
        list.innerHTML = '<div class="text-center py-10 text-red-500 font-bold">تعذر تحميل المنتجات</div>';
    }
};

window.closeKpiFixDescriptions = () => {
    const modal = document.getElementById('kpiFixModal');
    if (modal) modal.classList.add('hidden');
};

window.kpiSaveFixedDescription = async (productId) => {
    if (!window.canViewPersonalKpi()) return;
    /* Reps may only fix products that were loaded into their own scoped list. */
    if (window.isFieldRepUser()) {
        const allowed = window._kpiFixAllowedIds;
        if (!(allowed instanceof Set) || !allowed.has(productId)) {
            if (window.showToast) window.showToast('لا يمكنك تعديل هذا المنتج', false);
            return;
        }
    }
    const input = document.getElementById('kpiFixInput_' + productId);
    const value = (input ? input.value : '').trim();
    const nameCandidates = window._kpiFixNames instanceof Map ? window._kpiFixNames.get(productId) : null;
    const check = window.kpiValidateDescription(value, nameCandidates);
    if (!check.isValid) {
        if (window.showToast) window.showToast('الرجاء إدخال وصف حقيقي (أكثر من 10 أحرف وغير مطابق لاسم المنتج)', false);
        if (input) input.focus();
        return;
    }
    const btn = document.getElementById('kpiFixSave_' + productId);
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الحفظ...'; }
    try {
        const descPatch = { description_ar: value };
        if (!(await kpiRestMerge([KPI_PRODUCTS_COLLECTION, productId], descPatch))) {
            await window.updateDoc(window.doc(window.db, KPI_PRODUCTS_COLLECTION, productId), descPatch);
        }
        const item = document.querySelector('[data-fix-id="' + productId + '"]');
        if (item) item.remove();
        const remaining = document.querySelectorAll('#kpiFixList [data-fix-id]').length;
        if (window.showToast) window.showToast('تم حفظ الوصف بنجاح — تحسّن مؤشرك', true);
        await window.renderKpiDashboard();
        if (remaining === 0) {
            window.closeKpiFixDescriptions();
        } else {
            const sub = document.getElementById('kpiFixSubtitle');
            if (sub && window._kpiLatestReport) {
                const r = (window._kpiLatestReport.rows || []).find((x) => x.repId === window._kpiFixRepId);
                sub.textContent = (r ? r.name : '') + ' • تبقّى ' + remaining + ' منتج بحاجة لإصلاح';
            }
        }
    } catch (err) {
        console.error('[kpi] fix description failed:', err);
        if (window.showToast) window.showToast('تعذر حفظ الوصف', false);
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
};

/* ─────────── "Fix missing images" workflow (manager preview only) ───────────
   STRICT eligibility (never touches Youssef's pipeline):
     a) added by this rep,
     b) no original image (rawImageUrl/rawImageUrls/image_url…), AND
     c) not edited by the media editor (no enhanced image, status not image_done). */

const kpiFixImageItemHtml = (p) => {
    const name = p.name_ar || p.name_en || p.name || p.id;
    const merchant = p.merchantName || p.merchant || p.merchant_name || '—';
    const pid = kpiEscape(p.id);
    return `
    <div class="kpi-fix-item kpi-fix-item-image" data-fix-img-id="${pid}">
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <div class="font-black text-[13px] text-[#230535]">${kpiEscape(name)}</div>
                <div class="kpi-fix-merchant"><i class="fa-solid fa-store"></i> ${kpiEscape(merchant)}</div>
            </div>
            <span class="kpi-chip kpi-chip-red shrink-0"><i class="fa-solid fa-image"></i> بدون صورة</span>
        </div>
        <div class="flex justify-end mt-2">
            <input type="file" id="kpiImgInput_${pid}" accept="image/*" class="hidden" onchange="kpiUploadMissingImage('${pid}', this)">
            <button type="button" id="kpiImgUpload_${pid}" onclick="document.getElementById('kpiImgInput_${pid}').click()" class="kpi-fix-save"><i class="fa-solid fa-upload"></i> رفع صورة</button>
        </div>
    </div>`;
};

window.openKpiFixImages = async (repId) => {
    if (!window.canViewPersonalKpi()) {
        if (window.showToast) window.showToast('هذه الأداة غير متاحة لحسابك', false);
        return;
    }
    const modal = document.getElementById('kpiFixImagesModal');
    const list = document.getElementById('kpiFixImagesList');
    const sub = document.getElementById('kpiFixImagesSubtitle');
    if (!modal || !list) return;
    repId = window.kpiResolvePersonalRepId(repId);
    window._kpiFixImagesRepId = repId;
    modal.classList.remove('hidden');
    list.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i><div>جاري تحميل المنتجات...</div></div>';
    try {
        const report = window._kpiLatestReport || await kpiBuildReport();
        const row = (report.rows || []).find((r) => r.repId === repId);
        const repName = window.isFieldRepUser()
            ? String((window.currentUser && window.currentUser.name) || repId)
            : (row ? row.name : repId);
        if (sub) sub.textContent = repName + ' • جاري التحميل...';
        const all = await kpiFetchProductsForScope(repName);
        const missing = all.filter((p) => kpiProductRepName(p) === repName && kpiProductNeedsRawImage(p));
        window._kpiFixImageAllowedIds = new Set(missing.map((p) => p.id));
        if (sub) sub.textContent = repName + ' • ' + missing.length + ' منتج بدون صور';
        if (!missing.length) {
            list.innerHTML = '<div class="text-center py-10 text-emerald-600 font-black"><i class="fa-solid fa-circle-check text-3xl mb-2"></i><div>كل المنتجات لديها صور أو مُحررة بالفعل — لا شيء مطلوب</div></div>';
            return;
        }
        list.innerHTML = missing.map(kpiFixImageItemHtml).join('');
    } catch (err) {
        console.error('[kpi] open fix images failed:', err);
        list.innerHTML = '<div class="text-center py-10 text-red-500 font-bold">تعذر تحميل المنتجات</div>';
    }
};

window.closeKpiFixImages = () => {
    const modal = document.getElementById('kpiFixImagesModal');
    if (modal) modal.classList.add('hidden');
};

window.kpiUploadMissingImage = async (productId, input) => {
    if (!window.canViewPersonalKpi()) return;
    /* Reps may only upload to products inside their own scoped list. */
    if (window.isFieldRepUser()) {
        const allowed = window._kpiFixImageAllowedIds;
        if (!(allowed instanceof Set) || !allowed.has(productId)) {
            if (window.showToast) window.showToast('لا يمكنك تعديل هذا المنتج', false);
            if (input) input.value = '';
            return;
        }
    }
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
        if (window.showToast) window.showToast('الرجاء اختيار ملف صورة صالح', false);
        if (input) input.value = '';
        return;
    }
    if (typeof window.uploadCatalogRawImage !== 'function') {
        if (window.showToast) window.showToast('خدمة الرفع غير متاحة حالياً', false);
        return;
    }
    const btn = document.getElementById('kpiImgUpload_' + productId);
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الرفع...'; }
    try {
        const all = await kpiFetchProductsForScope(
            String((window.currentUser && window.currentUser.name) || '')
        );
        const product = all.find((p) => p.id === productId);
        /* Re-check the strict guard right before writing — never overwrite the editor. */
        if (!product || !kpiProductNeedsRawImage(product)) {
            if (window.showToast) window.showToast('تم تحديث هذا المنتج بالفعل — لا حاجة للرفع', false);
            if (btn) { btn.disabled = false; btn.innerHTML = original; }
            if (input) input.value = '';
            return;
        }
        const merchantName = product.merchantName || product.merchant || product.merchant_name || 'Unknown';
        const url = await window.uploadCatalogRawImage(file, merchantName);
        const imagePatch = {
            rawImageUrl: url,
            rawImageUrls: [url],
            image_url: url,
            status: 'pending',
            updatedAt: new Date()
        };
        if (!(await kpiRestMerge([KPI_PRODUCTS_COLLECTION, productId], imagePatch))) {
            await window.updateDoc(window.doc(window.db, KPI_PRODUCTS_COLLECTION, productId), imagePatch);
        }
        const item = document.querySelector('[data-fix-img-id="' + productId + '"]');
        if (item) item.remove();
        const remaining = document.querySelectorAll('#kpiFixImagesList [data-fix-img-id]').length;
        if (window.showToast) window.showToast('تم رفع الصورة بنجاح — تحسّن مؤشرك', true);
        await window.renderKpiDashboard();
        if (remaining === 0) {
            window.closeKpiFixImages();
        } else {
            const sub = document.getElementById('kpiFixImagesSubtitle');
            if (sub && window._kpiLatestReport) {
                const r = (window._kpiLatestReport.rows || []).find((x) => x.repId === window._kpiFixImagesRepId);
                sub.textContent = (r ? r.name : '') + ' • تبقّى ' + remaining + ' منتج بدون صور';
            }
        }
    } catch (err) {
        console.error('[kpi] upload missing image failed:', err);
        const tooLarge = String(err && err.message) === 'TOO_LARGE';
        if (window.showToast) window.showToast(tooLarge ? 'حجم الصورة كبير جداً (الحد الأقصى 15 ميجا)' : 'تعذر رفع الصورة', false);
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        if (input) input.value = '';
    }
};

/* Restrict a report to a single rep's own row before rendering it on their
   personal screen. `totals` is preserved only for team-average comparisons;
   the rep never receives any other rep's row. */
const kpiScopeReportForRep = (report, repId) => {
    const row = (report.rows || []).find((r) => r.repId === repId) || null;
    return {
        rows: row ? [row] : [],
        totals: report.totals || {},
        generatedAt: report.generatedAt || new Date()
    };
};

window.renderKpiDashboard = async () => {
    const isRep = window.isFieldRepUser();
    if (!window.canViewPersonalKpi()) {
        window.closeKpiDashboard();
        return;
    }
    const content = document.getElementById('kpiAnalyticsContent');
    if (!content) return;

    /* Managers keep the preview toggle; reps get the live personal screen. */
    const canPreview = window.canPreviewRepPersonalKpi();
    if (!canPreview) window._kpiRepPreviewMode = false;
    const previewBtn = document.getElementById('kpiRepPreviewBtn');
    const previewLabel = document.getElementById('kpiRepPreviewBtnLabel');
    if (previewBtn) previewBtn.classList.toggle('hidden', !canPreview || isRep);
    if (previewLabel) previewLabel.textContent = window._kpiRepPreviewMode ? 'العودة للتحليل الإداري' : 'معاينة شاشة المناديب';
    const historicalBtn = document.getElementById('kpiHistoricalBtn');
    if (historicalBtn) historicalBtn.classList.toggle('hidden', isRep);
    const viewTitle = document.getElementById('kpiViewTitle');
    if (viewTitle) viewTitle.textContent = isRep ? 'لوحة أدائي' : 'مركز تحليل الأداء والجودة';

    content.innerHTML = '<div class="text-center py-16 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3"></i><div>جاري تحميل المؤشرات...</div></div>';
    try {
        /* The rep's personal view needs the published leaderboard, and those
           two reads are independent — start both before awaiting either so the
           rank/benchmark round-trip overlaps the report build. */
        const summariesPromise = isRep ? kpiFetchLeaderboardSummaries() : null;
        const report = await kpiBuildReport();
        const stampEl = document.getElementById('kpiLastUpdated');
        if (stampEl) stampEl.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-EG');

        /* Live rep view: their own row, their exact rank, and a nameless
           comparison against the company best. Peers are never shown. */
        if (isRep) {
            const ownId = window.kpiResolvePersonalRepId('');
            const ownReport = kpiScopeReportForRep(report, ownId);
            const ownRow = ownReport.rows[0] || null;
            /* Published summaries feed the rank and the best-value side; the
               rep's own side comes from the live local report above. */
            const summaries = await summariesPromise;
            const benchmark = kpiComputeBenchmark(summaries, ownRow);
            const personalRank = kpiComputePersonalRank(summaries, ownRow);
            window._kpiLatestReport = ownReport;
            content.innerHTML =
                `<div id="kpiDeepDiveWrapper">${kpiPersonalPanelHtml(ownReport, ownRow, { liveMode: true, personalRank })}</div>` +
                kpiBenchmarkHtml(benchmark);
            return;
        }

        window._kpiLatestReport = report;
        if (!window._kpiSelectedRepId || !report.rows.some((r) => r.repId === window._kpiSelectedRepId)) {
            window._kpiSelectedRepId = report.rows.length ? report.rows[0].repId : null;
        }
        const selectedRow = report.rows.find((r) => r.repId === window._kpiSelectedRepId) || null;
        const previewMode = window._kpiRepPreviewMode && canPreview;
        if (previewMode) {
            content.innerHTML =
                kpiRepSelectorHtml(report) +
                `<div id="kpiDeepDiveWrapper">${kpiPersonalPanelHtml(report, selectedRow, { liveMode: false })}</div>`;
        } else {
            content.innerHTML =
                kpiGlobalSummaryHtml(report) +
                kpiRepSelectorHtml(report) +
                `<div id="kpiDeepDiveWrapper">${kpiDeepDiveHtml(selectedRow)}</div>`;
            requestAnimationFrame(() => kpiRenderChartsForRow(selectedRow));
        }
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
        if (window._kpiRepPreviewMode && window.canPreviewRepPersonalKpi()) {
            wrapper.innerHTML = kpiPersonalPanelHtml(report, row, { liveMode: false });
        } else {
            wrapper.innerHTML = kpiDeepDiveHtml(row);
            requestAnimationFrame(() => kpiRenderChartsForRow(row));
        }
    }
};

window.openKpiDashboard = async () => {
    if (!window.canViewPersonalKpi()) {
        if (window.showToast) window.showToast('لوحة المؤشرات غير متاحة لحسابك', false);
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
