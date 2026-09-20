/* Kanjo Ops — Black Box (system-wide audit trail)
 *
 * Founder-only, tamper-evident audit trail. Every meaningful write in the
 * operational app is mirrored into the `audit_logs` collection with WHO did it,
 * WHAT they touched and a human-readable Arabic description, so the Black Box can
 * reconstruct exactly what happened and when.
 *
 * Design rules:
 *   - The logger is a background side-effect: it wraps the REST write helpers in
 *     `window.kanjoRest` and never awaits anything on the caller's path, so it can
 *     never slow down or break a catalog edit / creation / deletion.
 *   - Writing to `audit_logs` is done through the ORIGINAL (unwrapped) create to
 *     avoid infinite recursion.
 *   - A retrospective routine rebuilds historical entries from the existing
 *     `merchant_products` timestamps/attribution when the log has no records for
 *     that period, so the Black Box is useful from day one.
 */

const AUDIT_COLLECTION = 'audit_logs';
const AUDIT_BACKFILL_KEY = 'kanjo_audit_backfilled_v1';

/* Collections whose REST writes are mirrored into the Black Box. `merchant_products`
   is the catalog pipeline (creations, edits, deletions, delete requests); the rest
   are operational records worth an audit trail. */
const AUDIT_WATCHED_COLLECTIONS = {
    merchant_products: 'منتج',
    merchants: 'تاجر',
    contracts: 'عقد',
    master_catalog: 'كتالوج رئيسي',
    staging_catalogs: 'كتالوج مرحلي'
};

let _auditOriginalCreate = null;
let _auditOriginalPatch = null;
let _auditOriginalRemove = null;
let _auditHooked = false;

/* Cached Black Box state for the viewer. */
const auditState = {
    loaded: false,
    loading: false,
    entries: [],
    reconstructed: [],
    includeReconstructed: true,
    filterText: '',
    filterAction: '',
    filterUser: '',
    visibleCount: 250,
    pageSize: 250
};

window.kanjoAuditState = auditState;

/* ─── Identity / access ─────────────────────────────────────────────── */

const auditCurrentIdentity = () => {
    const u = window.currentUser || {};
    return {
        userId: String(u.repId || u.id || u.name || ''),
        userName: String(u.name || ''),
        userRole: String(u.role || '')
    };
};

/* ─── Strict founder-only access ────────────────────────────────────────
 * The Black Box is reserved EXCLUSIVELY for the primary system founders/owners.
 * The `founder` role is mandatory, and the identity must additionally match the
 * explicit whitelist below (or carry the dedicated `isFounder` flag). Admins
 * such as محمود, reps, and every other manager are hard-blocked. Extend the
 * whitelist to onboard another owner. */
const AUDIT_FOUNDER_WHITELIST = {
    ids: ['3715', 'المؤسسين'],
    names: ['المؤسسين'],
    emails: []
};

const auditNormalizeIdentity = (value) => String(value == null ? '' : value).trim().toLowerCase();

window.kanjoAuditCanView = () => {
    const u = window.currentUser;
    if (!u) return false;
    /* Dedicated founder role flag is mandatory. */
    if (String(u.role || '') !== 'founder') return false;
    /* Explicit owner flag short-circuits the whitelist. */
    if (u.isFounder === true || u.kanjoFounder === true) return true;
    const id = auditNormalizeIdentity(u.id || u.uid || u.repId || '');
    const name = auditNormalizeIdentity(u.name);
    const email = auditNormalizeIdentity(u.email);
    const inList = (list, value) => !!value && list.map(auditNormalizeIdentity).includes(value);
    return inList(AUDIT_FOUNDER_WHITELIST.ids, id)
        || inList(AUDIT_FOUNDER_WHITELIST.names, name)
        || inList(AUDIT_FOUNDER_WHITELIST.emails, email);
};

/* ─── Value helpers ─────────────────────────────────────────────────── */

const auditToDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.toMillis === 'function') return new Date(value.toMillis());
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'object' && value.seconds != null) return new Date(value.seconds * 1000);
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

const auditEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const AUDIT_ACTIONS = {
    create: { label: 'إنشاء', color: '#37d99a', icon: 'fa-plus' },
    update: { label: 'تعديل', color: '#0ea5e9', icon: 'fa-pen' },
    delete: { label: 'حذف', color: '#dc2626', icon: 'fa-trash' },
    delete_request: { label: 'طلب حذف', color: '#E57723', icon: 'fa-triangle-exclamation' },
    delete_reject: { label: 'رفض حذف', color: '#6D28D9', icon: 'fa-rotate-left' },
    login: { label: 'دخول', color: '#230535', icon: 'fa-right-to-bracket' },
    generate: { label: 'أثر رجعي', color: '#64748b', icon: 'fa-clock-rotate-left' }
};

const auditActionMeta = (type) => AUDIT_ACTIONS[type] || { label: type || 'حدث', color: '#64748b', icon: 'fa-circle-info' };

/* ─── Product cache lookup (for human names + change detection) ──────── */

const auditFindProduct = (id) => {
    if (!id) return null;
    const pools = [
        window.repCatalogProductsCache,
        window.merchantProductsCache,
        window.allCatalogProductsCache,
        window.catalogDeleteRequestsCache
    ];
    for (const pool of pools) {
        if (Array.isArray(pool)) {
            const hit = pool.find((p) => p && p.id === id);
            if (hit) return hit;
        }
    }
    return null;
};

const auditProductName = (id) => {
    const p = auditFindProduct(id);
    if (p) return p.name_ar || p.name_en || p.name || id;
    return id;
};

/* Fields that are bookkeeping, not user intent. */
const AUDIT_NOISE_FIELDS = new Set(['updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'syncedFromDraft']);

const auditChangedFieldLabels = (before, after) => {
    const labels = [];
    const data = after || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
    const changed = (key, a, b) => has(key) && String(a == null ? '' : a) !== String(b == null ? '' : b);
    if (changed('name_ar', before.name_ar, data.name_ar) || changed('name_en', before.name_en, data.name_en)) labels.push('الاسم');
    if (changed('description_ar', before.description_ar, data.description_ar) || changed('description_en', before.description_en, data.description_en)) labels.push('الوصف');
    if (changed('base_price', before.base_price, data.base_price)) labels.push('السعر');
    if (changed('category', before.category, data.category)) labels.push('التصنيف');
    if (changed('merchantName', before.merchantName, data.merchantName) || changed('merchantId', before.merchantId, data.merchantId)) labels.push('التاجر');
    if (changed('status', before.status, data.status)) labels.push('الحالة');
    const imagesBefore = JSON.stringify(before.rawImageUrls || before.rawImageUrl || '');
    const imagesAfter = JSON.stringify(data.rawImageUrls || data.rawImageUrl || '');
    if ((has('rawImageUrls') || has('rawImageUrl')) && imagesBefore !== imagesAfter) labels.push('الصور');
    if (changed('enhancedImageUrl', before.enhancedImageUrl, data.enhancedImageUrl)) labels.push('الصور');
    if (has('variations') && JSON.stringify(before.variations || []) !== JSON.stringify(data.variations || [])) labels.push('الخيارات');
    return labels;
};

/* ─── Core writer ───────────────────────────────────────────────────── */

const auditAppendRaw = async (entry) => {
    if (!_auditOriginalCreate) return null;
    const id = auditCurrentIdentity();
    const now = new Date();
    /* Reconstruction passes the historical timestamp through; live logging uses
       the moment of the action. */
    const when = auditToDate(entry.timestamp) || now;
    const payload = {
        timestamp: when,
        ts: entry.ts || when.toISOString(),
        userId: entry.userId != null ? entry.userId : id.userId,
        userName: entry.userName != null ? entry.userName : id.userName,
        userRole: entry.userRole != null ? entry.userRole : id.userRole,
        actionType: entry.actionType || 'update',
        targetEntity: entry.targetEntity || '',
        targetId: entry.targetId || '',
        targetName: entry.targetName || '',
        description: entry.description || '',
        collection: entry.collection || '',
        source: entry.source || 'live'
    };
    return _auditOriginalCreate(AUDIT_COLLECTION, payload);
};

/* Fire-and-forget. Never throws into the caller. */
const auditWrite = (entry) => {
    try {
        Promise.resolve(auditAppendRaw(entry)).catch((err) => {
            console.warn('[audit] write skipped:', err && err.message ? err.message : err);
        });
    } catch (err) {
        console.warn('[audit] write threw:', err);
    }
};

/* ─── REST write mirror ─────────────────────────────────────────────── */

const auditDescribeCreate = (collectionId, data) => {
    const entity = AUDIT_WATCHED_COLLECTIONS[collectionId] || collectionId;
    const name = data && (data.name_ar || data.name_en || data.name || data.title) || '';
    const fromDraft = !!(data && data.syncedFromDraft);
    const desc = fromDraft
        ? `أنشأ ${entity}اً من مسودة${name ? ': ' + name : ''}`
        : `أضاف ${entity}${name ? ': ' + name : ''}`;
    return {
        actionType: 'create',
        targetEntity: entity,
        targetId: '',
        targetName: name,
        description: desc,
        collection: collectionId
    };
};

const auditDescribePatch = (collectionId, segments, data) => {
    const entity = AUDIT_WATCHED_COLLECTIONS[collectionId] || collectionId;
    const id = segments && segments[1];
    const name = (data && data.name_ar) || auditProductName(id);
    if (data && data.deleteRequested === true) {
        return {
            actionType: 'delete_request',
            targetEntity: entity,
            targetId: id || '',
            targetName: name,
            description: `طلب حذف ${entity} «${name}»`,
            collection: collectionId
        };
    }
    if (data && Object.prototype.hasOwnProperty.call(data, 'deleteRequested') && data.deleteRequested !== true) {
        return {
            actionType: 'delete_reject',
            targetEntity: entity,
            targetId: id || '',
            targetName: name,
            description: `رفض طلب حذف ${entity} «${name}» وأعاده للعمل`,
            collection: collectionId
        };
    }
    const before = auditFindProduct(id) || {};
    const labels = auditChangedFieldLabels(before, data || {});
    const detail = labels.length ? labels.join('، ') : 'بيانات';
    return {
        actionType: 'update',
        targetEntity: entity,
        targetId: id || '',
        targetName: name,
        description: `عدّل ${entity} «${name}» (${detail})`,
        collection: collectionId
    };
};

const auditDescribeRemove = (collectionId, segments) => {
    const entity = AUDIT_WATCHED_COLLECTIONS[collectionId] || collectionId;
    const id = segments && segments[1];
    const name = auditProductName(id);
    return {
        actionType: 'delete',
        targetEntity: entity,
        targetId: id || '',
        targetName: name,
        description: `حذف ${entity} «${name}» نهائياً`,
        collection: collectionId
    };
};

const auditMirrorWrite = (collectionId, entry) => {
    if (!collectionId || collectionId === AUDIT_COLLECTION) return;
    if (!AUDIT_WATCHED_COLLECTIONS[collectionId]) return;
    /* Every session's writes are recorded (reps do the catalog work); the
       founder gate applies to READING the Black Box, never to appending. */
    auditWrite(entry);
};

/* Install the REST write mirrors exactly once. The originals stay private so a
   bad hook can never recurse into `audit_logs`. */
const auditInstallHooks = () => {
    if (_auditHooked) return;
    if (!window.kanjoRest || typeof window.kanjoRest.create !== 'function') return;
    _auditOriginalCreate = window.kanjoRest.create;
    _auditOriginalPatch = window.kanjoRest.patch;
    _auditOriginalRemove = window.kanjoRest.remove;

    window.kanjoRest.create = function (collectionId, data) {
        return _auditOriginalCreate.call(this, collectionId, data).then((result) => {
            try { auditMirrorWrite(collectionId, auditDescribeCreate(collectionId, data)); } catch (_) {}
            return result;
        });
    };
    window.kanjoRest.patch = function (segments, data) {
        return _auditOriginalPatch.call(this, segments, data).then((result) => {
            try {
                const collectionId = Array.isArray(segments) ? segments[0] : segments;
                auditMirrorWrite(collectionId, auditDescribePatch(collectionId, segments, data));
            } catch (_) {}
            return result;
        });
    };
    window.kanjoRest.remove = function (segments) {
        return _auditOriginalRemove.call(this, segments).then((result) => {
            try {
                const collectionId = Array.isArray(segments) ? segments[0] : segments;
                auditMirrorWrite(collectionId, auditDescribeRemove(collectionId, segments));
            } catch (_) {}
            return result;
        });
    };
    _auditHooked = true;
};

/* ─── Public API ────────────────────────────────────────────────────── */

window.kanjoAuditLog = (entry) => {
    auditWrite(entry || {});
};

window.kanjoAuditLogLogin = () => {
    const u = window.currentUser;
    if (!u) return;
    auditWrite({
        actionType: 'login',
        targetEntity: 'جلسة',
        targetName: u.name || '',
        description: `سجّل «${u.name || 'مستخدم'}» الدخول إلى النظام`,
        collection: ''
    });
};

/* ─── Retrospective reconstruction ──────────────────────────────────── */

const auditCollectReconstructed = async () => {
    const out = [];
    if (!window.kanjoRest || typeof window.kanjoRest.list !== 'function') return out;
    const products = await window.kanjoRest.list(['merchant_products'], { pageSize: 300, maxPages: 20 });
    (products || []).forEach((p) => {
        if (!p || !p.id) return;
        const name = p.name_ar || p.name_en || p.name || p.id;
        const createdAt = auditToDate(p.createdAt || p.created_at);
        if (createdAt) {
            out.push({
                id: 'recon_create_' + p.id,
                timestamp: createdAt,
                ts: createdAt.toISOString(),
                userId: '',
                userName: String(p.createdBy || 'مستخدم سابق'),
                userRole: '',
                actionType: 'create',
                targetEntity: 'منتج',
                targetId: p.id,
                targetName: name,
                description: `أنشأ منتج «${name}» (أثر رجعي)`,
                collection: 'merchant_products',
                source: 'reconstructed'
            });
        }
        const updatedAt = auditToDate(p.updatedAt || p.updated_at);
        if (updatedAt && (!createdAt || (updatedAt.getTime() - createdAt.getTime()) > 60000)) {
            out.push({
                id: 'recon_update_' + p.id,
                timestamp: updatedAt,
                ts: updatedAt.toISOString(),
                userId: '',
                userName: String(p.updatedBy || p.createdBy || 'مستخدم سابق'),
                userRole: '',
                actionType: 'update',
                targetEntity: 'منتج',
                targetId: p.id,
                targetName: name,
                description: `عدّل بيانات منتج «${name}» (أثر رجعي)`,
                collection: 'merchant_products',
                source: 'reconstructed'
            });
        }
    });
    return out;
};

window.kanjoAuditReconstruct = async ({ persist = false } = {}) => {
    if (!window.kanjoAuditCanView()) return [];
    const entries = await auditCollectReconstructed();
    auditState.reconstructed = entries;
    if (persist && entries.length) {
        /* Persist the historical trail once so it becomes permanent. Bounded and
           sequential-ish to stay gentle on the REST endpoint. */
        const CHUNK = 8;
        let written = 0;
        try { localStorage.setItem(AUDIT_BACKFILL_KEY, '1'); } catch (_) {}
        for (let i = 0; i < entries.length && written < 2000; i += CHUNK) {
            const slice = entries.slice(i, i + CHUNK);
            await Promise.all(slice.map((e) => auditAppendRaw(Object.assign({}, e, { id: undefined })).catch(() => null)));
            written += slice.length;
        }
        entries.forEach((e) => { e.source = 'reconstructed'; });
    }
    return entries;
};

window.runBlackBoxReconstruction = async () => {
    if (!window.kanjoAuditCanView()) {
        if (window.showToast) window.showToast('This feature is available to founders only', false);
        return;
    }
    const btn = document.getElementById('blackBoxReconBtn');
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الفحص...'; }
    try {
        const alreadyBackfilled = auditState.entries.some((e) => e.source === 'reconstructed');
        let persist = false;
        if (!alreadyBackfilled && !localStorage.getItem(AUDIT_BACKFILL_KEY)) {
            persist = window.confirm('سيتم فحص كل المنتجات السابقة وتوليد سجل أثر رجعي وحفظه في Black Box. هل تريد المتابعة؟');
        }
        const entries = await window.kanjoAuditReconstruct({ persist });
        if (persist) {
            const live = entries.map((e) => Object.assign({}, e, { id: undefined }));
            auditState.entries = live.concat(auditState.entries);
        }
        auditState.includeReconstructed = true;
        auditRenderBlackBox();
        if (window.showToast) window.showToast(persist ? 'تم توليد وحفظ الأثر الرجعي' : 'تم توليد الأثر الرجعي للعرض');
    } catch (err) {
        console.error('[audit] reconstruction failed:', err);
        if (window.showToast) window.showToast('تعذر توليد الأثر الرجعي', false);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original || '<i class="fa-solid fa-clock-rotate-left"></i> توليد الأثر الرجعي'; }
    }
};

/* ─── Black Box viewer ──────────────────────────────────────────────── */

const auditMergeEntries = () => {
    const live = auditState.entries || [];
    let merged = live.slice();
    if (auditState.includeReconstructed && (auditState.reconstructed || []).length) {
        /* Reconstructed entries fill the gaps *before* the oldest real record,
           so a live entry always wins for the same moment. */
        let oldestLive = null;
        live.forEach((e) => {
            const d = auditToDate(e.timestamp) || auditToDate(e.ts);
            if (d && (!oldestLive || d < oldestLive)) oldestLive = d;
        });
        auditState.reconstructed.forEach((e) => {
            const d = auditToDate(e.timestamp) || auditToDate(e.ts);
            if (!oldestLive || !d || d < oldestLive) merged.push(e);
        });
    }
    merged.sort((a, b) => {
        const da = (auditToDate(a.timestamp) || auditToDate(a.ts) || new Date(0)).getTime();
        const db = (auditToDate(b.timestamp) || auditToDate(b.ts) || new Date(0)).getTime();
        return db - da;
    });
    return merged;
};

const auditApplyFilters = (entries) => {
    const text = auditState.filterText.trim().toLowerCase();
    return entries.filter((e) => {
        if (auditState.filterAction && e.actionType !== auditState.filterAction) return false;
        if (auditState.filterUser && String(e.userName || '') !== auditState.filterUser) return false;
        if (!text) return true;
        const haystack = [e.description, e.targetName, e.userName, e.targetEntity, e.targetId]
            .map((v) => String(v || '').toLowerCase()).join(' ');
        return haystack.includes(text);
    });
};

const auditFormatTime = (value) => {
    const d = auditToDate(value);
    if (!d) return '—';
    try {
        return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
        return d.toISOString();
    }
};

const auditRowHtml = (e) => {
    const meta = auditActionMeta(e.actionType);
    const sourceBadge = e.source === 'reconstructed'
        ? '<span class="audit-src-badge"><i class="fa-solid fa-clock-rotate-left"></i> أثر رجعي</span>'
        : '';
    const who = e.userName || 'مستخدم';
    const role = e.userRole ? ` (${auditEscapeHtml(e.userRole)})` : '';
    return `
    <div class="audit-row" data-action="${auditEscapeHtml(e.actionType || '')}">
        <div class="audit-row-line" style="background:${meta.color};"></div>
        <div class="audit-row-time">
            <i class="fa-solid fa-clock"></i>
            <span>${auditEscapeHtml(auditFormatTime(e.timestamp || e.ts))}</span>
        </div>
        <div class="audit-row-main">
            <div class="audit-row-top">
                <span class="audit-action-chip" style="background:${meta.color}1a;color:${meta.color};border-color:${meta.color}44;">
                    <i class="fa-solid ${meta.icon}"></i> ${auditEscapeHtml(meta.label)}
                </span>
                <span class="audit-row-user"><i class="fa-solid fa-user"></i> ${auditEscapeHtml(who)}${role}</span>
                ${sourceBadge}
            </div>
            <div class="audit-row-desc">${auditEscapeHtml(e.description || '')}</div>
            <div class="audit-row-target">
                ${e.targetEntity ? `<span><i class="fa-solid fa-crosshairs"></i> ${auditEscapeHtml(e.targetEntity)}</span>` : ''}
                ${e.targetName ? `<span><i class="fa-solid fa-tag"></i> ${auditEscapeHtml(e.targetName)}</span>` : ''}
                ${e.targetId ? `<span class="audit-row-id">#${auditEscapeHtml(e.targetId)}</span>` : ''}
            </div>
        </div>
    </div>`;
};

const auditPopulateUserFilter = (entries) => {
    const select = document.getElementById('blackBoxUserFilter');
    if (!select) return;
    const current = select.value;
    const names = Array.from(new Set(entries.map((e) => String(e.userName || '')).filter(Boolean))).sort();
    select.innerHTML = '<option value="">كل المستخدمين</option>' + names
        .map((n) => `<option value="${auditEscapeHtml(n)}">${auditEscapeHtml(n)}</option>`).join('');
    if (names.includes(current)) select.value = current;
};

const auditRenderBlackBox = () => {
    const list = document.getElementById('blackBoxList');
    const countEl = document.getElementById('blackBoxCount');
    const moreBtn = document.getElementById('blackBoxMoreBtn');
    if (!list) return;
    const merged = auditMergeEntries();
    auditPopulateUserFilter(merged);
    const filtered = auditApplyFilters(merged);
    if (countEl) countEl.textContent = filtered.length + ' حدث';
    if (!filtered.length) {
        list.innerHTML = `<div class="text-center py-12 text-slate-400 font-bold">
            <i class="fa-solid fa-box-open text-3xl mb-2 opacity-40"></i>
            <div>لا توجد أحداث مطابقة</div>
        </div>`;
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }
    const visible = filtered.slice(0, auditState.visibleCount);
    list.innerHTML = visible.map(auditRowHtml).join('');
    if (moreBtn) moreBtn.classList.toggle('hidden', filtered.length <= auditState.visibleCount);
};

window.blackBoxLoadMore = () => {
    auditState.visibleCount += auditState.pageSize;
    auditRenderBlackBox();
};

window.blackBoxSearch = (value) => {
    auditState.filterText = String(value || '');
    auditState.visibleCount = auditState.pageSize;
    auditRenderBlackBox();
};

window.blackBoxSetAction = (value) => {
    auditState.filterAction = String(value || '');
    auditState.visibleCount = auditState.pageSize;
    auditRenderBlackBox();
};

window.blackBoxSetUser = (value) => {
    auditState.filterUser = String(value || '');
    auditState.visibleCount = auditState.pageSize;
    auditRenderBlackBox();
};

window.blackBoxToggleReconstructed = (checked) => {
    auditState.includeReconstructed = !!checked;
    auditRenderBlackBox();
};

const auditLoadEntries = async () => {
    if (!window.kanjoRest || typeof window.kanjoRest.list !== 'function') return [];
    return window.kanjoRest.list([AUDIT_COLLECTION], { pageSize: 300, maxPages: 10 });
};

window.openBlackBox = async () => {
    if (!window.kanjoAuditCanView()) {
        if (window.showToast) window.showToast('Black Box is available to founders only', false);
        return;
    }
    const modal = document.getElementById('blackBoxModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const list = document.getElementById('blackBoxList');
    if (list) list.innerHTML = '<div class="text-center py-12 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i><div>جاري تحميل السجل...</div></div>';
    try {
        auditInstallHooks();
        const rows = await auditLoadEntries();
        auditState.entries = (rows || []).sort((a, b) => {
            const da = (auditToDate(a.timestamp) || auditToDate(a.ts) || new Date(0)).getTime();
            const db = (auditToDate(b.timestamp) || auditToDate(b.ts) || new Date(0)).getTime();
            return db - da;
        });
        auditState.loaded = true;
        /* When the log is empty (fresh collection) fall back to the retrospective
           view so the Black Box is never a blank screen. */
        if (!auditState.entries.length) {
            try {
                auditState.reconstructed = await auditCollectReconstructed();
            } catch (err) {
                console.warn('[audit] auto reconstruction failed:', err);
            }
        }
        auditRenderBlackBox();
    } catch (err) {
        console.error('[audit] load failed:', err);
        if (list) list.innerHTML = '<div class="text-center py-12 text-red-500 font-bold">Unable to load the Black Box log</div>';
    }
};

window.closeBlackBox = () => {
    const modal = document.getElementById('blackBoxModal');
    if (modal) modal.classList.add('hidden');
};

/* Install hooks at import time (REST helpers already exist) and re-assert once
   the first authenticated session is painted, in case the wrap was reset. */
auditInstallHooks();
if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => auditInstallHooks());
}

window.kanjoAudit = {
    canView: window.kanjoAuditCanView,
    log: window.kanjoAuditLog,
    logLogin: window.kanjoAuditLogLogin,
    reconstruct: window.kanjoAuditReconstruct,
    collection: AUDIT_COLLECTION
};
