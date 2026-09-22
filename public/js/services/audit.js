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

/* Collections covered by the deletion auditor. Tasks are the day-to-day
   merchant records and are written/deleted through the SDK (never the REST
   mirror), so they MUST be listed here to be captured on delete. */
const AUDIT_DELETE_COLLECTIONS = Object.assign({
    tasks: 'مهمة',
    transferRequests: 'طلب نقل'
}, AUDIT_WATCHED_COLLECTIONS);

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
    view: { label: 'عرض', color: '#0d9488', icon: 'fa-eye' },
    deploy: { label: 'تحديث نظام', color: '#7c3aed', icon: 'fa-rocket' },
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

/* ─── Exact change tracking (old vs. new) ─────────────────────────────── */

/* Maps a watched collection to the entity kind used by the UI to open the right
   preview modal for a clickable entity. */
const AUDIT_ENTITY_KINDS = {
    merchant_products: 'product',
    merchants: 'merchant',
    contracts: 'contract',
    master_catalog: 'master_product',
    staging_catalogs: 'staging',
    tasks: 'task',
    system: 'system'
};
const auditEntityKind = (collectionId) => AUDIT_ENTITY_KINDS[collectionId] || '';

/* Friendly Arabic labels for the fields that show up in diffs. Unknown fields
   fall back to their raw key so nothing is ever silently dropped. */
const AUDIT_FIELD_LABELS = {
    name_ar: 'الاسم العربي', name_en: 'الاسم الإنجليزي', name: 'الاسم', title: 'العنوان',
    description_ar: 'الوصف العربي', description_en: 'الوصف الإنجليزي', description: 'الوصف',
    base_price: 'السعر', price: 'السعر', category: 'التصنيف', cat: 'التصنيف', subcategory: 'التصنيف الفرعي',
    merchantName: 'التاجر', merchantId: 'معرف التاجر',
    status: 'الحالة', rawImageUrls: 'الصور الأصلية', rawImageUrl: 'الصورة الأصلية',
    enhancedImageUrl: 'الصورة المحسّنة', enhancedImageUrls: 'الصور المحسّنة', variations: 'الخيارات',
    barcode: 'الباركود', unit: 'الوحدة', stock: 'المخزون',
    isSigned: 'التعاقد النهائي', isProvisional: 'اتفاق مبدئي', achieved: 'المُحقّق', target: 'المستهدف',
    address: 'العنوان', phone: 'الهاتف', contactPhone: 'هاتف التواصل', contactName: 'مسؤول التواصل',
    contactRole: 'صفة مسؤول التواصل', team: 'الفريق', notes: 'ملاحظات',
    fbPage: 'فيسبوك', fbGroup: 'جروب فيسبوك', insta: 'إنستجرام', website: 'الموقع الإلكتروني',
    driveFolderLink: 'مجلد الملفات', driveFolderId: 'معرف مجلد الملفات', deleteRequested: 'طلب الحذف',
    archived: 'مؤرشف', syncedFromDraft: 'من مسودة',
    commit: 'إصدار الكود', version: 'الإصدار', message: 'وصف التحديث', actor: 'بواسطة',
    branch: 'الفرع', runUrl: 'رابط التنفيذ'
};
const auditFieldLabel = (field) => AUDIT_FIELD_LABELS[field] || field;

/* Heavy/opaque fields are summarised instead of dumped, so a diff remains a
   compact, readable text log even for logo/image/attendance payloads. */
const AUDIT_HEAVY_FIELDS = new Set([
    'merchantLogo', 'rawImageUrl', 'rawImageUrls', 'enhancedImageUrl', 'enhancedImageUrls',
    'documents', 'variations', 'reports', 'attendances'
]);

const auditClip = (text, max = 400) => {
    const s = String(text == null ? '' : text);
    return s.length > max ? s.slice(0, max) + '… (' + s.length + ' حرف)' : s;
};

const auditSanitizeValue = (field, value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return auditClip(value, AUDIT_HEAVY_FIELDS.has(field) ? 160 : 400);
    if (Array.isArray(value)) {
        if (field === 'rawImageUrls' || field === 'enhancedImageUrls' || field === 'rawImageUrl' || field === 'enhancedImageUrl') {
            return 'عدد العناصر: ' + value.length;
        }
        try { return auditClip(JSON.stringify(value)); } catch (_) { return '[بيانات]'; }
    }
    if (typeof value === 'object') {
        try { return auditClip(JSON.stringify(value)); } catch (_) { return '[بيانات]'; }
    }
    return auditClip(String(value));
};

/* Turn a full record into { field: displayValue }, skipping bookkeeping noise. */
const auditSanitizeRecord = (record, maxFields = 40) => {
    if (!record || typeof record !== 'object') return null;
    const out = {};
    let count = 0;
    Object.keys(record).forEach((field) => {
        if (AUDIT_NOISE_FIELDS.has(field) || field === 'id' || field === 'merchantLogo') return;
        if (count >= maxFields) return;
        out[field] = auditSanitizeValue(field, record[field]);
        count += 1;
    });
    return count ? out : null;
};

const auditValuesEqual = (a, b) => {
    const norm = (v) => {
        if (v === undefined || v === null) return '';
        if (typeof v === 'string') return v;
        try { return JSON.stringify(v); } catch (_) { return String(v); }
    };
    return norm(a) === norm(b);
};

/* Field-level diff for an Update: only the fields actually present in the patch
   and whose value changed. */
const auditBuildChanges = (previous, next) => {
    const prev = previous || {};
    const data = next || {};
    const changes = [];
    Object.keys(data).forEach((field) => {
        if (AUDIT_NOISE_FIELDS.has(field)) return;
        if (!auditValuesEqual(prev[field], data[field])) {
            changes.push({
                field,
                label: auditFieldLabel(field),
                before: auditSanitizeValue(field, prev[field]),
                after: auditSanitizeValue(field, data[field])
            });
        }
    });
    return changes;
};

const auditChangesToData = (changes) => {
    const previousData = {};
    const newData = {};
    (changes || []).forEach((c) => {
        previousData[c.field] = c.before;
        newData[c.field] = c.after;
    });
    return { previousData, newData };
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
        entityKind: entry.entityKind || '',
        description: entry.description || '',
        collection: entry.collection || '',
        source: entry.source || 'live',
        /* Exact change tracking: old vs. new values + a ready-to-render diff. */
        previousData: entry.previousData || null,
        newData: entry.newData || null,
        changes: Array.isArray(entry.changes) && entry.changes.length ? entry.changes : null
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
        entityKind: auditEntityKind(collectionId),
        targetEntity: entity,
        targetId: '',
        targetName: name,
        description: desc,
        collection: collectionId,
        newData: auditSanitizeRecord(data)
    };
};

const auditDescribePatch = (collectionId, segments, data, previous) => {
    const entity = AUDIT_WATCHED_COLLECTIONS[collectionId] || collectionId;
    const id = segments && segments[1];
    const prev = previous || {};
    const name = (data && data.name_ar) || prev.name_ar || prev.name || auditProductName(id);
    const kind = auditEntityKind(collectionId);
    if (data && data.deleteRequested === true) {
        return {
            actionType: 'delete_request',
            entityKind: kind,
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
            entityKind: kind,
            targetEntity: entity,
            targetId: id || '',
            targetName: name,
            description: `رفض طلب حذف ${entity} «${name}» وأعاده للعمل`,
            collection: collectionId
        };
    }
    /* Prefer the authoritative pre-write document; fall back to the client cache
       so a failed pre-read still yields a best-effort diff. */
    const before = (previous && Object.keys(previous).length) ? previous : (auditFindProduct(id) || {});
    const changes = auditBuildChanges(before, data || {});
    const { previousData, newData } = auditChangesToData(changes);
    const detail = changes.length ? changes.map((c) => c.label).join('، ') : 'بيانات';
    return {
        actionType: 'update',
        entityKind: kind,
        targetEntity: entity,
        targetId: id || '',
        targetName: name,
        description: `عدّل ${entity} «${name}» (${detail})`,
        collection: collectionId,
        previousData: Object.keys(previousData).length ? previousData : null,
        newData: Object.keys(newData).length ? newData : null,
        changes: changes.length ? changes : null
    };
};

const auditDescribeRemove = (collectionId, segments) => {
    const entity = AUDIT_WATCHED_COLLECTIONS[collectionId] || collectionId;
    const id = segments && segments[1];
    const name = auditProductName(id);
    return {
        actionType: 'delete',
        entityKind: auditEntityKind(collectionId),
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
        const collectionId = Array.isArray(segments) ? segments[0] : segments;
        const watched = !!(collectionId && AUDIT_WATCHED_COLLECTIONS[collectionId]);
        const write = () => _auditOriginalPatch.call(this, segments, data);
        if (!watched) return write();
        /* Capture the document BEFORE the write so the Update entry carries the
           exact old vs. new values. The pre-read is best-effort: if it fails the
           write still proceeds and the diff falls back to the client cache. */
        let before;
        try {
            before = (window.kanjoRest && typeof window.kanjoRest.getDocument === 'function')
                ? window.kanjoRest.getDocument(segments)
                : Promise.resolve(null);
        } catch (_) {
            before = Promise.resolve(null);
        }
        return Promise.resolve(before).catch(() => null).then((prevDoc) => write().then((result) => {
            try { auditMirrorWrite(collectionId, auditDescribePatch(collectionId, segments, data, prevDoc)); } catch (_) {}
            return result;
        }));
    };
    window.kanjoRest.remove = function (segments) {
        const collectionId = Array.isArray(segments) ? segments[0] : segments;
        const watched = !!(collectionId && AUDIT_DELETE_COLLECTIONS[collectionId]);
        const write = () => _auditOriginalRemove.call(this, segments);
        if (!watched) return write();
        /* Snapshot the document BEFORE it is removed so the Delete entry carries
           the deleted record's final contents (the SDK delete hook does the
           same; this keeps the REST path equivalent). */
        let before;
        try {
            before = (window.kanjoRest && typeof window.kanjoRest.getDocument === 'function')
                ? window.kanjoRest.getDocument(segments)
                : Promise.resolve(null);
        } catch (_) {
            before = Promise.resolve(null);
        }
        return Promise.resolve(before).catch(() => null).then((prevDoc) => write().then((result) => {
            try {
                const entry = auditDescribeRemove(collectionId, segments);
                if (prevDoc && typeof prevDoc === 'object') {
                    entry.previousData = auditSanitizeRecord(prevDoc);
                    const nm = prevDoc.name_ar || prevDoc.name_en || prevDoc.name || prevDoc.title;
                    if (nm) entry.targetName = nm;
                }
                auditMirrorWrite(collectionId, entry);
            } catch (_) {}
            return result;
        }));
    };
    _auditHooked = true;
};

/* ─── Deletion auditing (authoritative, call-site independent) ─────────
 * The REST mirror only sees `kanjoRest` writes, so SDK deletions made with
 * `deleteDoc` / `batch.delete` were silently bypassing the Black Box. Deletions
 * are the most sensitive event in the system, so they are captured centrally:
 *   - `window.deleteDoc` is wrapped once, so EVERY SDK document deletion is
 *     audited no matter which module calls it (bare `deleteDoc` resolves to the
 *     same global property, so it is covered too);
 *   - the document is snapshotted BEFORE the write, because afterwards it no
 *     longer exists anywhere — this is what makes the deletion recoverable as a
 *     record (contents, not the live doc);
 *   - bulk `batch.delete` sweeps call `window.kanjoAuditDelete` explicitly.
 * Failures here can never block or break the actual deletion. */

const auditCollectionEntity = (collectionId, override) =>
    override || AUDIT_DELETE_COLLECTIONS[collectionId] || collectionId;

/* Best-effort in-memory lookup so the snapshot avoids a heavy network read
   (task docs embed Base64 logos). Returns null when nothing is cached. */
const auditLocateCachedDoc = (collectionId, id) => {
    if (!id) return null;
    try {
        if (collectionId === 'tasks' && window.tasksMemory && typeof window.tasksMemory.get === 'function') {
            const hit = window.tasksMemory.get(String(id));
            if (hit) return hit.id ? hit : Object.assign({ id: String(id) }, hit);
        }
        const pools = {
            tasks: [window.allTasksCache],
            merchant_products: [
                window.repCatalogProductsCache,
                window.merchantProductsCache,
                window.allCatalogProductsCache,
                window.catalogDeleteRequestsCache
            ],
            merchants: [window.merchantsById instanceof Map ? Array.from(window.merchantsById.values()) : null],
            master_catalog: [window.masterCatalogCache],
            staging_catalogs: [window.stagingCatalogsCache, window.allStagingCatalogsCache]
        }[collectionId] || [];
        for (const pool of pools) {
            if (!Array.isArray(pool)) continue;
            const hit = pool.find((p) => p && String(p.id) === String(id));
            if (hit) return hit;
        }
    } catch (_) {}
    return null;
};

const auditBuildDeleteEntry = ({ collectionId, id, name, entity, entityKind, snapshot, description }) => {
    const entityLabel = auditCollectionEntity(collectionId, entity);
    const displayName = name
        || (snapshot && (snapshot.name_ar || snapshot.name_en || snapshot.name || snapshot.title))
        || id || '';
    return {
        actionType: 'delete',
        entityKind: entityKind || auditEntityKind(collectionId),
        targetEntity: entityLabel,
        targetId: id || '',
        targetName: displayName,
        description: description || `حذف ${entityLabel} «${displayName || id}» نهائياً`,
        collection: collectionId || '',
        previousData: snapshot ? auditSanitizeRecord(snapshot) : null,
        newData: null
    };
};

/* Public API for call sites that delete through a batch or already hold the
   document contents (e.g. bulk sweeps, pre-captured snapshots). */
window.kanjoAuditDelete = (entry) => {
    try {
        auditWrite(auditBuildDeleteEntry(entry || {}));
    } catch (err) {
        console.warn('[audit] delete entry failed:', err);
    }
};

/* Resolve a Firestore DocumentReference (or a raw path string) to
   [collectionId, documentId]. */
const auditRefPath = (ref) => {
    let path = '';
    if (ref && typeof ref.path === 'string') path = ref.path;
    else if (ref && ref.parent && typeof ref.id === 'string') path = `${ref.parent.path || ref.parent.id || ''}/${ref.id}`;
    if (!path) return ['', ''];
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return ['', ''];
    return [parts[parts.length - 2], parts[parts.length - 1]];
};

const auditCaptureDeletedDoc = async (collectionId, id) => {
    if (!id) return null;
    const cached = auditLocateCachedDoc(collectionId, id);
    if (cached) return cached;
    try {
        if (window.kanjoRest && typeof window.kanjoRest.getDocument === 'function') {
            return await window.kanjoRest.getDocument([collectionId, id]);
        }
    } catch (_) {}
    return null;
};

let _auditOriginalDeleteDoc = null;
let _auditDeleteHooked = false;

const auditInstallDeleteHooks = () => {
    if (_auditDeleteHooked) return;
    if (typeof window.deleteDoc !== 'function') return;
    _auditOriginalDeleteDoc = window.deleteDoc;
    window.deleteDoc = function (ref) {
        const args = Array.prototype.slice.call(arguments);
        const [collectionId, id] = auditRefPath(ref);
        const run = () => _auditOriginalDeleteDoc.apply(this, args);
        /* Never audit the audit trail itself, and never touch non-document refs. */
        if (!collectionId || collectionId === AUDIT_COLLECTION) return run();
        return Promise.resolve(auditCaptureDeletedDoc(collectionId, id))
            .catch(() => null)
            .then((snapshot) => Promise.resolve(run()).then((result) => {
                window.kanjoAuditDelete({ collectionId, id, snapshot });
                return result;
            }));
    };
    _auditDeleteHooked = true;
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

/* Navigation / read tracking: log when a user opens a merchant profile, a
   contract, a product's details or a catalog screen. Fire-and-forget, text-only. */
window.kanjoAuditLogView = (entry) => {
    if (!window.currentUser) return;
    const e = entry || {};
    auditWrite({
        actionType: 'view',
        entityKind: e.entityKind || '',
        targetEntity: e.targetEntity || '',
        targetId: e.targetId || '',
        targetName: e.targetName || '',
        description: e.description || '',
        collection: e.collection || ''
    });
};

/* ─── Retrospective reconstruction ──────────────────────────────────── */

const AUDIT_RECON_CACHE_KEY = 'audit:reconstructed';
const AUDIT_RECON_CACHE_TTL = 5 * 60 * 1000;

/* Building the retrospective trail scans merchant_products, so the result is
   memoized for a short window (see auditCollectReconstructed) to keep repeated
   Black Box opens / re-renders cheap. */
const auditFetchReconstructed = async () => {
    const out = [];
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

const auditCollectReconstructed = async (force) => {
    if (!window.kanjoRest || typeof window.kanjoRest.list !== 'function') return [];
    return window.kanjoCache.get(AUDIT_RECON_CACHE_KEY, AUDIT_RECON_CACHE_TTL, auditFetchReconstructed, !!force);
};

window.kanjoAuditReconstruct = async ({ persist = false, force = false } = {}) => {
    if (!window.kanjoAuditCanView()) return [];
    const entries = await auditCollectReconstructed(force);
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
        const entries = await window.kanjoAuditReconstruct({ persist, force: true });
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

/* Clickable entity: products open the product-details modal, merchants open the
   merchant profile. Uses data-attributes + a delegated listener so names with
   quotes/apostrophes can never break the markup. */
const auditEntityButtonHtml = (e) => {
    const name = e.targetName || e.targetId || '';
    const kind = String(e.entityKind || '');
    const clickable = !!e.targetId && (kind === 'product' || kind === 'merchant');
    if (!clickable) return auditEscapeHtml(name);
    const title = kind === 'product' ? 'عرض تفاصيل المنتج' : 'عرض ملف التاجر';
    return `<button type="button" class="audit-entity-link" title="${title}" data-bb-kind="${auditEscapeHtml(kind)}" data-bb-id="${auditEscapeHtml(e.targetId)}" data-bb-name="${auditEscapeHtml(e.targetName || '')}"><i class="fa-solid fa-up-right-from-square"></i> ${auditEscapeHtml(name)}</button>`;
};

/* Expandable old vs. new diff for Update entries. Legacy updates written before
   the diff patch carry no `changes`/`previousData`, so we show a muted notice
   instead of an empty/broken row. */
const auditLegacyUpdateBadgeHtml = () =>
    '<div class="audit-legacy-badge"><i class="fa-solid fa-circle-question"></i> تفاصيل هذا التعديل غير مسجلة (نسخة قديمة)</div>';

const auditChangesFromSnapshots = (e) => {
    const before = (e && e.previousData) || null;
    const after = (e && e.newData) || null;
    if (!before && !after) return [];
    const fields = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
    const changes = [];
    fields.forEach((field) => {
        changes.push({
            field,
            label: auditFieldLabel(field),
            before: (before || {})[field],
            after: (after || {})[field]
        });
    });
    return changes;
};

const auditDiffHtml = (e) => {
    let changes = Array.isArray(e.changes) ? e.changes : [];
    if (!changes.length) changes = auditChangesFromSnapshots(e);
    if (!changes.length) {
        return String((e && e.actionType) || '') === 'update' ? auditLegacyUpdateBadgeHtml() : '';
    }
    const rows = changes.map((c) => {
        const before = (c.before === '' || c.before == null) ? '—' : c.before;
        const after = (c.after === '' || c.after == null) ? '—' : c.after;
        return `<div class="audit-diff-row">
            <div class="audit-diff-field">${auditEscapeHtml(c.label || c.field || '')}</div>
            <div class="audit-diff-old" dir="auto">${auditEscapeHtml(before)}</div>
            <div class="audit-diff-arrow"><i class="fa-solid fa-arrow-left-long"></i></div>
            <div class="audit-diff-new" dir="auto">${auditEscapeHtml(after)}</div>
        </div>`;
    }).join('');
    return `<details class="audit-diff"><summary><i class="fa-solid fa-code-compare"></i> عرض التغييرات (${changes.length})</summary><div class="audit-diff-body">${rows}</div></details>`;
};

const auditRowHtml = (e) => {
    const meta = auditActionMeta(e.actionType);
    const sourceBadge = e.source === 'reconstructed'
        ? '<span class="audit-src-badge"><i class="fa-solid fa-clock-rotate-left"></i> أثر رجعي</span>'
        : (e.source === 'ci'
            ? '<span class="audit-src-badge"><i class="fa-solid fa-rocket"></i> نشر آلي</span>'
            : '');
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
                ${(e.targetName || e.targetId) ? `<span><i class="fa-solid fa-tag"></i> ${auditEntityButtonHtml(e)}</span>` : ''}
                ${e.targetId ? `<span class="audit-row-id">#${auditEscapeHtml(e.targetId)}</span>` : ''}
            </div>
            ${auditDiffHtml(e)}
        </div>
    </div>`;
};

/* Open the standard preview modal for a logged entity (founder inspection). */
window.blackBoxOpenEntity = (kind, id, name) => {
    try {
        if (kind === 'product' && typeof window.openCatalogProductDetails === 'function') {
            window.openCatalogProductDetails(id);
            return;
        }
        if (kind === 'merchant' && typeof window.openMerchantProfile === 'function') {
            window.openMerchantProfile(name || id);
        }
    } catch (err) {
        console.warn('[audit] entity preview failed:', err);
    }
};

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('.audit-entity-link') : null;
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        window.blackBoxOpenEntity(
            btn.getAttribute('data-bb-kind'),
            btn.getAttribute('data-bb-id'),
            btn.getAttribute('data-bb-name')
        );
    });
}

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

/* Black Box entry reads are cached briefly so re-opening the modal (or an
   accidental double open) does not re-scan the whole audit_logs collection.
   The explicit "تحديث" button passes force=true to bypass the cache. */
const AUDIT_ENTRIES_CACHE_KEY = 'audit:entries';
const AUDIT_ENTRIES_CACHE_TTL = 60 * 1000;

const auditLoadEntries = async (force) => {
    if (!window.kanjoRest || typeof window.kanjoRest.list !== 'function') return [];
    return window.kanjoCache.get(
        AUDIT_ENTRIES_CACHE_KEY,
        AUDIT_ENTRIES_CACHE_TTL,
        () => window.kanjoRest.list([AUDIT_COLLECTION], { pageSize: 300, maxPages: 10 }),
        !!force
    );
};

window.openBlackBox = async (force) => {
    if (!window.kanjoAuditCanView()) {
        if (window.showToast) window.showToast('Black Box is available to founders only', false);
        return;
    }
    const modal = document.getElementById('blackBoxModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    /* Raise the entity preview modals above the Black Box while it is open, so a
       founder can inspect a product/merchant without leaving the log. */
    if (document.body) document.body.classList.add('black-box-open');
    const list = document.getElementById('blackBoxList');
    if (list) list.innerHTML = '<div class="text-center py-12 text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i><div>جاري تحميل السجل...</div></div>';
    try {
        auditInstallHooks();
        const rows = await auditLoadEntries(!!force);
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
    if (document.body) document.body.classList.remove('black-box-open');
};

/* Install hooks at import time (REST helpers already exist) and re-assert once
   the first authenticated session is painted, in case the wrap was reset. */
auditInstallHooks();
auditInstallDeleteHooks();
if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => { auditInstallHooks(); auditInstallDeleteHooks(); });
}

window.kanjoAudit = {
    canView: window.kanjoAuditCanView,
    log: window.kanjoAuditLog,
    logLogin: window.kanjoAuditLogLogin,
    logView: window.kanjoAuditLogView,
    logDelete: window.kanjoAuditDelete,
    reconstruct: window.kanjoAuditReconstruct,
    collection: AUDIT_COLLECTION
};
