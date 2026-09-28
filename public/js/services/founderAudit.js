/* ───────────────────────── FOUNDER AUDIT (PHASE 2) ─────────────────────────
   After the Pharmacy Inventory Intake engine (Phase 1) ingests a vendor sheet
   into `merchant_products`, founders manually audit the result: fill in the
   missing description and fix/replace the image before approving the row.

   This module owns that workflow:

     - ACCESS   : founders (and admin oversight) only. The content/image editor
                  (Youssef) is explicitly excluded, as are data-entry reps.
     - ROUTING  : pending intake rows are spread deterministically across four
                  founders with the hard (unmatched, empty description) and easy
                  (matched) rows interleaved, so the workload is balanced.
     - STATE    : everything (fetched rows, computed assignment) is kept in RAM.
                  Nothing is written to Firestore until a founder approves or
                  replaces an image, which keeps reads/writes minimal.
     - AUDIT    : approvals go through `window.kanjoRest.patch`, which the audit
                  layer already wraps for `merchant_products`; the SDK fallback
                  writes an explicit `audit_logs` entry. Nothing is silent.

   Collection: `merchant_products` (shared with the catalog pipeline). Rows are
   identified by `intakeSource === 'pharmacy_inventory_intake'`. */

const FOUNDER_AUDIT_COLLECTION = 'merchant_products';
const FOUNDER_AUDIT_INTAKE_SOURCE = 'pharmacy_inventory_intake';

/* The four designated audit founders. Routing is `index % 4` over this fixed
   order, so it is stable and reproducible across runs and devices. */
const FOUNDER_AUDIT_FOUNDERS = ['فتحي', 'رمزي', 'الخولي', 'رأفت'];
window.founderAuditFounders = FOUNDER_AUDIT_FOUNDERS;

/* Field mask for the audit queries — deliberately narrow so the (potentially
   large) intake rows never pull heavy/irrelevant fields over the wire. */
const FOUNDER_AUDIT_SELECT = [
    'name_ar', 'name_en', 'description_ar', 'description_en',
    'rawImageUrl', 'rawImageUrls', 'enhancedImageUrl', 'image_url',
    'category', 'intakeSource', 'status', 'merchantId', 'merchantName',
    'sku', 'base_price', 'createdAt', 'auditedBy', 'auditFounder',
    'auditedAt', 'updatedAt', 'is_active', 'requires_prescription'
];

/* In-RAM state only (see STATE note above). `editing` tracks which rows the
   founder has opened for description editing, so an unrelated re-render (image
   upload, founder switch) never collapses an open editor or loses the caret.
   `drafts` holds the uncommitted text while a row is being edited; it is only
   folded into the product's `description_ar` when the founder clicks "حفظ".
   `approved` holds the rows this founder has already signed off on (the
   "ما تم اعتماده" tab); it is loaded lazily per founder and kept in sync as
   approvals happen. */
const founderAuditState = {
    loaded: false,
    loading: false,
    products: [],
    assignments: [],
    approved: [],
    approvedLoadedFor: '',
    activeTab: 'pending',
    loadedAt: null,
    uploadingId: '',
    editing: new Set(),
    drafts: {},
    /* Uncommitted "يحتاج روشتة" toggle values (id -> boolean), folded into the
       product only on "اعتماد"/"حفظ التعديلات" like drafts. */
    prescriptions: {}
};
window._founderAuditState = founderAuditState;

/* Id of the product whose image is being replaced; wired to the shared input. */
let founderAuditUploadTargetId = '';

/* ──────────────────────────── SMALL HELPERS ─────────────────────────── */

const founderAuditEscapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* Eastern-Arabic numerals, matching the intake/contract screens. */
const founderAuditFormatNumber = (value) => {
    const num = Number(value) || 0;
    return num.toLocaleString('en-US').replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
};

/* DOM-safe, collision-free element id suffix for a product id. */
const founderAuditDocToken = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');

const founderAuditDescId = (id) => 'founderAuditDesc-' + founderAuditDocToken(id);
const founderAuditDescViewId = (id) => 'founderAuditDescView-' + founderAuditDocToken(id);

/* ── Prescription text is decoupled from the description ─────────────────────
   Older rows had the requirement typed straight into `description_ar` (e.g.
   "... | متطلبات الروشتة: إجباري (يتطلب روشتة طبية رسمية)"). The boolean is now
   the single source of truth, so the standard block is stripped from everything
   shown, edited or saved, and re-rendered dynamically from the flag. */
const FOUNDER_AUDIT_RX_STRICT_TEXT = 'متطلبات الروشتة: إجباري (يتطلب روشتة طبية رسمية)';
const FOUNDER_AUDIT_RX_OTC_TEXT = 'متطلبات الروشتة: لا يتطلب روشتة (OTC)';
const FOUNDER_AUDIT_RX_LEGACY_RE = /\s*\|?\s*متطلبات الروشتة\s*:[^\n]*/g;

const founderAuditStripPrescriptionText = (text) => String(text == null ? '' : text)
    .replace(FOUNDER_AUDIT_RX_LEGACY_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\|[ \t]*$/, '')
    .trim();
window.founderAuditStripPrescriptionText = founderAuditStripPrescriptionText;

/* One-time migration hint: when a document predates the boolean, infer its flag
   from the legacy baked-in text so no requirement is silently lost. */
const founderAuditPrescriptionFromText = (product) => {
    const raw = String((product && product.description_ar) || '');
    if (!raw) return null;
    if (/متطلبات الروشتة\s*:\s*إجباري/.test(raw) || /يتطلب روشتة طبية رسمية/.test(raw)) return true;
    if (/متطلبات الروشتة\s*:\s*لا يتطلب/.test(raw) || /\bOTC\b/i.test(raw)) return false;
    return null;
};

/* Value that should be persisted for a row: an open, unsaved draft wins (so a
   founder who types and directly hits "اعتماد" never loses their words), then
   the locked local value set by "حفظ", then the last server-known value. Always
   the BASE description — any legacy prescription block is stripped so it can
   never round-trip back into Firestore. */
const founderAuditDescriptionValue = (id, product) => {
    const drafts = founderAuditState.drafts;
    if (drafts && drafts[id] !== undefined) return founderAuditStripPrescriptionText(drafts[id]);
    return founderAuditStripPrescriptionText(product && product.description_ar);
};
window.founderAuditDescriptionValue = founderAuditDescriptionValue;

/* Effective "يحتاج روشتة" value for a row: an uncommitted toggle wins, then the
   persisted boolean, then a one-time inference from legacy description text,
   else false. Always a strict boolean. */
const founderAuditRxValue = (id, product) => {
    const pending = founderAuditState.prescriptions;
    if (pending && pending[id] !== undefined) return !!pending[id];
    if (product && typeof product.requires_prescription === 'boolean') return product.requires_prescription;
    const legacy = founderAuditPrescriptionFromText(product);
    return legacy === null ? false : legacy;
};
window.founderAuditRxValue = founderAuditRxValue;

/* A row can live in either the pending pool or the approved pool depending on
   which tab it belongs to; every per-row action looks it up through here. */
const founderAuditFindProduct = (id) => founderAuditState.products.find((p) => p.id === id)
    || (founderAuditState.approved || []).find((p) => p.id === id)
    || null;

/* Best-effort epoch-ms for a Firestore/REST time value, used to order the
   approved list newest-first. */
const founderAuditTimeMs = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') { const t = Date.parse(value); return Number.isNaN(t) ? 0 : t; }
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
};

const founderAuditDriveFileId = (urlOrId) => {
    const s = String(urlOrId || '').trim();
    if (!s) return '';
    const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m && m[1]) return m[1];
    if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
    return '';
};

const founderAuditThumbnailUrl = (urlOrId) => {
    const id = founderAuditDriveFileId(urlOrId);
    if (id) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w200-h200';
    return String(urlOrId || '');
};

/* Google's thumbnail service 404s (HTML body, which the browser blocks by ORB)
   when the requested size exceeds the stored image — so a row whose small card
   thumbnail renders at `w200-h200` can fail at `w1600`. Returning the ordered
   size chain lets the lightbox step down to a renderable size rather than
   falling through to the "no image" state. */
const founderAuditLightboxUrls = (urlOrId) => {
    const id = founderAuditDriveFileId(urlOrId);
    if (!id) return urlOrId ? [String(urlOrId)] : [];
    const sizes = ['w1600', 'w1000', 'w400', 'w200-h200'];
    const seen = new Set();
    const urls = [];
    sizes.forEach((s) => {
        const u = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=' + s;
        if (!seen.has(u)) { seen.add(u); urls.push(u); }
    });
    return urls;
};

const founderAuditProductImage = (p) => {
    if (!p) return '';
    return p.rawImageUrl
        || (Array.isArray(p.rawImageUrls) && p.rawImageUrls[0])
        || p.image_url
        || p.enhancedImageUrl
        || '';
};

const founderAuditProductName = (p) => String((p && (p.name_ar || p.name_en)) || '').trim();

/* "Matched" rows already carry a catalog description; "unmatched" rows are the
   hard ones (empty description). Balancing the two across founders is the whole
   point of the interleave below. */
const founderAuditHasDescription = (p) => String((p && p.description_ar) || '').trim() !== '';
window.founderAuditHasDescription = founderAuditHasDescription;

/* ─────────────────────── STABLE HASH ROUTING ─────────────────────── */

/* Assigns every pending product to one of the four founders by hashing its
   immutable identity (document id, else sku, else name). The mapping depends
   ONLY on the product, never on the array size, order or how many siblings were
   approved/deleted — so a row is permanently locked to the same founder. This
   kills the old shifting-index overlap where approving one row renumbered the
   rest and let two founders land on the same product. */
const founderAuditStableHash = (seed) => {
    const s = String(seed == null ? '' : seed);
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) hash += s.charCodeAt(i);
    return hash;
};
window.founderAuditStableHash = founderAuditStableHash;

/* Prefer the immutable document id; fall back to sku/name for drafts that have
   not been persisted yet, so a row stays on the same founder across its life. */
const founderAuditAssignmentKey = (p) => String(
    (p && (p.id || p.sku || p.name_ar || p.name_en)) || ''
);

const founderAuditAssign = (products) => {
    const n = FOUNDER_AUDIT_FOUNDERS.length;
    const list = Array.isArray(products) ? products.slice() : [];
    return list.map((product, index) => ({
        product,
        founder: FOUNDER_AUDIT_FOUNDERS[founderAuditStableHash(founderAuditAssignmentKey(product)) % n],
        kind: founderAuditHasDescription(product) ? 'matched' : 'unmatched',
        index
    }));
};
window.founderAuditAssign = founderAuditAssign;

/* ───────────────────────────── ACCESS CONTROL ───────────────────────────── */

/* Founders own the audit. Admin (محمود) gets oversight access; the four named
   founders are also accepted by name so they can log in through the shared
   founder identity and still be routed to their own chunk. The content editor
   (Youssef) and data-entry are excluded. */
window.isFounderAuditUser = () => {
    const u = window.currentUser;
    if (!u) return false;
    const role = String(u.role || '').trim();
    if (role === 'founder' || role === 'admin') return true;
    return FOUNDER_AUDIT_FOUNDERS.includes(String(u.name || '').trim());
};

/* Which founder's chunk is being viewed. If the logged-in identity is one of
   the four, that identity wins and cannot be switched; otherwise (generic
   founder/admin) the dropdown controls it, defaulting to the first founder. */
window.founderAuditCurrentFounder = () => {
    const u = window.currentUser || {};
    const name = String(u.name || '').trim();
    if (FOUNDER_AUDIT_FOUNDERS.includes(name)) return name;
    const select = document.getElementById('founderAuditFounderSelect');
    const chosen = select ? String(select.value || '').trim() : '';
    return FOUNDER_AUDIT_FOUNDERS.includes(chosen) ? chosen : FOUNDER_AUDIT_FOUNDERS[0];
};

/* ──────────────────────────────── FETCHING ──────────────────────────────── */

/* One query for pending intake rows, over REST with a field mask (SDK
   fallback). The `intakeSource` filter is applied client-side because there is
   no composite index for it — and the whole point is to conserve reads. */
const founderAuditFetchPending = async () => {
    let items = null;
    if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
        try {
            items = await window.kanjoRest.runQuery(
                FOUNDER_AUDIT_COLLECTION,
                [['status', '==', 'pending']],
                null,
                { select: FOUNDER_AUDIT_SELECT }
            );
        } catch (restErr) {
            console.warn('[founder-audit] REST pending fetch failed; trying SDK:', restErr);
        }
    }
    if (!items) {
        if (typeof window.getDocs !== 'function' || !window.db) return [];
        const ref = window.query(
            window.collection(window.db, FOUNDER_AUDIT_COLLECTION),
            window.where('status', '==', 'pending')
        );
        const snap = await window.getDocs(ref);
        items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    }
    return (items || []).filter(
        (p) => String((p && p.intakeSource) || '').trim() === FOUNDER_AUDIT_INTAKE_SOURCE
    );
};

/* Rows this founder has already approved (`status == 'done'` + `auditFounder`),
   over REST with the same narrow field mask (SDK fallback). Backed by the
   `auditFounder+status` composite index. `intakeSource` is filtered client-side. */
const founderAuditFetchApproved = async (founder) => {
    if (!founder) return [];
    let items = null;
    if (window.kanjoRest && typeof window.kanjoRest.runQuery === 'function') {
        try {
            items = await window.kanjoRest.runQuery(
                FOUNDER_AUDIT_COLLECTION,
                [['status', '==', 'done'], ['auditFounder', '==', founder]],
                null,
                { select: FOUNDER_AUDIT_SELECT }
            );
        } catch (restErr) {
            console.warn('[founder-audit] REST approved fetch failed; trying SDK:', restErr);
        }
    }
    if (!items) {
        if (typeof window.getDocs !== 'function' || !window.db) return [];
        try {
            const ref = window.query(
                window.collection(window.db, FOUNDER_AUDIT_COLLECTION),
                window.where('status', '==', 'done'),
                window.where('auditFounder', '==', founder)
            );
            const snap = await window.getDocs(ref);
            items = [];
            snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        } catch (sdkErr) {
            console.warn('[founder-audit] approved fetch failed:', sdkErr);
            return [];
        }
    }
    return (items || []).filter(
        (p) => String((p && p.intakeSource) || '').trim() === FOUNDER_AUDIT_INTAKE_SOURCE
    );
};

/* Newest-first so a founder's most recent approvals sit at the top. */
const founderAuditSortApproved = (list) => (Array.isArray(list) ? list.slice() : [])
    .sort((a, b) => founderAuditTimeMs(b.auditedAt || b.updatedAt || b.createdAt)
        - founderAuditTimeMs(a.auditedAt || a.updatedAt || a.createdAt));

window.founderAuditLoad = async (force) => {
    if (!window.isFounderAuditUser()) return;
    if (founderAuditState.loading) return;
    if (founderAuditState.loaded && !force) { founderAuditRenderChunk(); return; }
    const founder = window.founderAuditCurrentFounder();
    founderAuditState.loading = true;
    founderAuditSetStatus('جاري تحميل أصناف المراجعة...');
    try {
        const [products, approved] = await Promise.all([
            founderAuditFetchPending(),
            /* Approved is supplementary: if its query/index is unavailable the
               pending audit must still load, so a failure degrades to []. */
            founderAuditFetchApproved(founder).catch((approvedErr) => {
                console.warn('[founder-audit] approved pool unavailable:', approvedErr);
                return [];
            })
        ]);
        founderAuditState.products = products;
        founderAuditState.assignments = founderAuditAssign(products);
        founderAuditState.approved = founderAuditSortApproved(approved);
        founderAuditState.approvedLoadedFor = founder;
        founderAuditState.activeTab = 'pending';
        /* Fresh data supersedes any open editor/draft from the previous load. */
        founderAuditState.editing = new Set();
        founderAuditState.drafts = {};
        founderAuditState.prescriptions = {};
        founderAuditState.loaded = true;
        founderAuditState.loadedAt = new Date();
        founderAuditRenderChunk();
    } catch (err) {
        console.error('[founder-audit] load failed:', err);
        founderAuditSetStatus('فشل تحميل الأصناف، حاول مرة أخرى.');
        window.showToast('فشل تحميل أصناف المراجعة', false);
    } finally {
        founderAuditState.loading = false;
    }
};

/* ──────────────────────────────── WRITES ──────────────────────────────── */

/* Merge-patch a product over REST (auto-audited by the audit layer's patch
   wrapper). On any REST failure, fall back to the SDK and write an explicit
   audit entry so the transition is never unlogged. Returns true on success. */
const founderAuditPatchProduct = async (id, patch, auditMeta) => {
    if (window.kanjoRest && typeof window.kanjoRest.patch === 'function') {
        try {
            await window.kanjoRest.patch([FOUNDER_AUDIT_COLLECTION, id], patch);
            return true;
        } catch (restErr) {
            console.warn('[founder-audit] REST patch failed; falling back to SDK:', restErr);
        }
    }
    if (typeof window.updateDoc !== 'function' || !window.db) return false;
    await window.updateDoc(window.doc(window.db, FOUNDER_AUDIT_COLLECTION, id), patch);
    if (typeof window.kanjoAuditLog === 'function' && auditMeta) {
        window.kanjoAuditLog(auditMeta);
    }
    return true;
};

/* Permanently remove a product (moderation of prohibited/scheduled items). Both
   transports are audited by the deletion layer: `merchant_products` is a watched
   delete collection, so the REST mirror snapshots the document before the write
   and the `deleteDoc` wrapper does the same on the SDK path — the removal and the
   deleted contents land in `audit_logs` automatically. Returns true on success. */
const founderAuditRemoveProduct = async (id) => {
    if (window.kanjoRest && typeof window.kanjoRest.remove === 'function') {
        try {
            await window.kanjoRest.remove([FOUNDER_AUDIT_COLLECTION, id]);
            return true;
        } catch (restErr) {
            console.warn('[founder-audit] REST remove failed; falling back to SDK:', restErr);
        }
    }
    if (typeof window.deleteDoc !== 'function' || !window.db) return false;
    await window.deleteDoc(window.doc(window.db, FOUNDER_AUDIT_COLLECTION, id));
    return true;
};

/* Replace a product image: compress + upload through the shared GAS pipeline,
   then persist the new Drive URL onto the row. */
window.founderAuditHandleUpload = async (event) => {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    const id = founderAuditUploadTargetId;
    if (input) input.value = '';
    founderAuditUploadTargetId = '';
    if (!id || !file) return;
    if (typeof window.uploadCatalogRawImage !== 'function') {
        window.showToast('خدمة رفع الصور غير متاحة', false);
        return;
    }
    const product = founderAuditFindProduct(id);
    const merchantName = (product && (product.merchantName || product.merchant)) || 'Unknown';
    founderAuditState.uploadingId = id;
    founderAuditSetStatus('جاري رفع الصورة...');
    try {
        const url = await window.uploadCatalogRawImage(file, merchantName);
        const imagePatch = {
            rawImageUrl: url,
            rawImageUrls: [url],
            image_url: url,
            updatedAt: new Date()
        };
        const ok = await founderAuditPatchProduct(id, imagePatch, {
            actionType: 'update',
            targetEntity: 'منتج',
            targetId: id,
            targetName: founderAuditProductName(product),
            entityKind: 'منتج',
            description: 'استبدال صورة صنف مخزون صيدلية (مراجعة مؤسسين)',
            collection: FOUNDER_AUDIT_COLLECTION,
            newData: { rawImageUrl: url }
        });
        if (!ok) throw new Error('PATCH_FAILED');
        if (product) {
            product.rawImageUrl = url;
            product.rawImageUrls = [url];
            product.image_url = url;
        }
        window.showToast('تم تحديث الصورة');
        founderAuditRenderChunk();
    } catch (err) {
        console.error('[founder-audit] image upload failed:', err);
        window.showToast('فشل رفع الصورة، حاول مرة أخرى', false);
    } finally {
        founderAuditState.uploadingId = '';
        founderAuditSetStatus('');
    }
};

/* Zoom a row's image in the shared full-screen lightbox. Uses the existing
   `openImageViewer` overlay (backdrop/close-button dismissal) and the
   full-resolution URL so packaging details can be verified. */
window.founderAuditOpenImage = (id) => {
    const product = founderAuditFindProduct(id);
    const image = founderAuditProductImage(product);
    if (!image) { window.showToast('لا توجد صورة لهذا الصنف', false); return; }
    const urls = founderAuditLightboxUrls(image);
    if (typeof window.openImageViewer === 'function') {
        window.openImageViewer(urls[0] || '', urls.slice(1));
        return;
    }
    window.open(urls[0] || image, '_blank', 'noopener');
};

/* Open Google Images for the product name in a new tab, explicitly localized to
   Egypt: the " مصر" suffix plus `gl=eg` force Egyptian packaging results
   regardless of where the auditor's IP is geolocated. */
window.founderAuditSearchGoogle = (id) => {
    const product = founderAuditFindProduct(id);
    const name = founderAuditProductName(product);
    if (!name) { window.showToast('لا يوجد اسم للبحث عنه', false); return; }
    const url = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(name + ' مصر') + '&gl=eg';
    window.open(url, '_blank', 'noopener');
};

/* Approve a product: persist the edited description, set status=done and
   is_active=true, and remove it from this founder's pending chunk. */
window.founderAuditApprove = async (id) => {
    if (!window.isFounderAuditUser()) return;
    const product = founderAuditFindProduct(id);
    if (!product) return;
    /* Fold any open editor's text into its draft, then read what should be
       persisted: an unsaved draft wins, else the value locked by "حفظ", else
       the last server-known description. Only this button writes to Firestore. */
    founderAuditCaptureEdits();
    const description = founderAuditDescriptionValue(id, product);
    const requiresPrescription = founderAuditRxValue(id, product);
    const founder = window.founderAuditCurrentFounder();
    const actor = (window.currentUser && window.currentUser.name) || '';
    const patch = {
        status: 'done',
        is_active: true,
        description_ar: description,
        requires_prescription: requiresPrescription,
        auditedBy: actor,
        auditFounder: founder,
        auditedAt: new Date(),
        updatedAt: new Date()
    };
    founderAuditSetStatus('جاري اعتماد الصنف...');
    try {
        const ok = await founderAuditPatchProduct(id, patch, {
            actionType: 'update',
            targetEntity: 'منتج',
            targetId: id,
            targetName: founderAuditProductName(product),
            entityKind: 'منتج',
            description: 'اعتماد صنف مخزون صيدلية (مراجعة مؤسسين: ' + founder + ')',
            collection: FOUNDER_AUDIT_COLLECTION,
            previousData: { status: product.status, description_ar: product.description_ar || '', requires_prescription: !!product.requires_prescription },
            newData: { status: 'done', description_ar: description, is_active: true, requires_prescription: requiresPrescription }
        });
        if (!ok) throw new Error('PATCH_FAILED');

        /* Move it from the pending pool to the approved pool immediately: the
           "المكلف" card leaves the DOM and both tab counters update live. */
        product.status = 'done';
        product.is_active = true;
        product.description_ar = description;
        product.requires_prescription = requiresPrescription;
        product.auditedBy = actor;
        product.auditFounder = founder;
        product.auditedAt = new Date();
        founderAuditState.products = founderAuditState.products.filter((p) => p.id !== id);
        founderAuditState.assignments = founderAuditAssign(founderAuditState.products);
        if (!(founderAuditState.approved || []).some((p) => p.id === id)) {
            founderAuditState.approved = founderAuditSortApproved([product].concat(founderAuditState.approved || []));
        }
        if (founderAuditState.editing) founderAuditState.editing.delete(id);
        if (founderAuditState.drafts) delete founderAuditState.drafts[id];
        if (founderAuditState.prescriptions) delete founderAuditState.prescriptions[id];
        window.showToast('تم اعتماد الصنف');
        founderAuditRenderChunk();
    } catch (err) {
        console.error('[founder-audit] approve failed:', err);
        window.showToast('فشل اعتماد الصنف، حاول مرة أخرى', false);
    } finally {
        founderAuditSetStatus('');
    }
};

/* Update an ALREADY-approved row (the "ما تم اعتماده" safety net): persist the
   corrected description without touching `status` (it stays 'done') and log the
   edit so the change is traceable. */
window.founderAuditUpdate = async (id) => {
    if (!window.isFounderAuditUser()) return;
    const product = founderAuditFindProduct(id);
    if (!product) return;
    founderAuditCaptureEdits();
    const description = founderAuditDescriptionValue(id, product);
    const requiresPrescription = founderAuditRxValue(id, product);
    const founder = window.founderAuditCurrentFounder();
    const actor = (window.currentUser && window.currentUser.name) || '';
    const patch = {
        description_ar: description,
        requires_prescription: requiresPrescription,
        auditedBy: actor,
        auditedAt: new Date(),
        updatedAt: new Date()
    };
    founderAuditSetStatus('جاري حفظ التعديلات...');
    try {
        const ok = await founderAuditPatchProduct(id, patch, {
            actionType: 'update',
            targetEntity: 'منتج',
            targetId: id,
            targetName: founderAuditProductName(product),
            entityKind: 'منتج',
            description: 'تحديث بيانات صنف مخزون صيدلية معتمد (مراجعة مؤسسين: ' + founder + ')',
            collection: FOUNDER_AUDIT_COLLECTION,
            previousData: { description_ar: product.description_ar || '', requires_prescription: !!product.requires_prescription },
            newData: { description_ar: description, requires_prescription: requiresPrescription }
        });
        if (!ok) throw new Error('PATCH_FAILED');

        product.description_ar = description;
        product.requires_prescription = requiresPrescription;
        product.auditedBy = actor;
        product.auditedAt = new Date();
        product.updatedAt = new Date();
        if (founderAuditState.editing) founderAuditState.editing.delete(id);
        if (founderAuditState.drafts) delete founderAuditState.drafts[id];
        if (founderAuditState.prescriptions) delete founderAuditState.prescriptions[id];
        founderAuditState.approved = founderAuditSortApproved(founderAuditState.approved || []);
        window.showToast('تم حفظ التعديلات');
        founderAuditRenderChunk();
    } catch (err) {
        console.error('[founder-audit] update failed:', err);
        window.showToast('فشل حفظ التعديلات، حاول مرة أخرى', false);
    } finally {
        founderAuditSetStatus('');
    }
};

/* Moderated, audited hard-delete for prohibited/mistaken items. Offered on both
   the pending and the approved card (a "safety net" for a wrong approval), so it
   drops the row from whichever pool holds it — decrementing that tab's counter —
   after the founder confirms. */
window.founderAuditDelete = async (id) => {
    if (!window.isFounderAuditUser()) return;
    const product = founderAuditFindProduct(id);
    if (!product) return;
    const confirmFn = typeof window.confirm === 'function' ? window.confirm : null;
    if (confirmFn && !confirmFn('هل أنت متأكد من حذف هذا الصنف نهائياً؟')) return;
    founderAuditSetStatus('جاري حذف الصنف...');
    try {
        const ok = await founderAuditRemoveProduct(id);
        if (!ok) throw new Error('DELETE_FAILED');

        /* Drop it from both pools so the card leaves the DOM immediately; this
           decrements the pending counter and never touches the approved one. */
        founderAuditState.products = founderAuditState.products.filter((p) => p.id !== id);
        founderAuditState.approved = (founderAuditState.approved || []).filter((p) => p.id !== id);
        founderAuditState.assignments = founderAuditAssign(founderAuditState.products);
        if (founderAuditState.editing) founderAuditState.editing.delete(id);
        if (founderAuditState.drafts) delete founderAuditState.drafts[id];
        if (founderAuditState.prescriptions) delete founderAuditState.prescriptions[id];
        window.showToast('تم حذف الصنف');
        founderAuditRenderChunk();
    } catch (err) {
        console.error('[founder-audit] delete failed:', err);
        window.showToast('فشل حذف الصنف، حاول مرة أخرى', false);
    } finally {
        founderAuditSetStatus('');
    }
};

/* ──────────────────────────────── RENDER ──────────────────────────────── */

const founderAuditSetStatus = (text) => {
    const el = document.getElementById('founderAuditStatus');
    if (el) el.textContent = text || '';
};

const founderAuditSyncFounderSelect = () => {
    const select = document.getElementById('founderAuditFounderSelect');
    if (!select) return;
    const u = window.currentUser || {};
    const name = String(u.name || '').trim();
    const locked = FOUNDER_AUDIT_FOUNDERS.includes(name);
    const previous = select.value;
    select.innerHTML = FOUNDER_AUDIT_FOUNDERS
        .map((f) => '<option value="' + founderAuditEscapeHtml(f) + '">' + founderAuditEscapeHtml(f) + '</option>')
        .join('');
    select.value = locked
        ? name
        : (FOUNDER_AUDIT_FOUNDERS.includes(previous) ? previous : FOUNDER_AUDIT_FOUNDERS[0]);
    select.disabled = locked;
};

/* Tabs are the only filter now: "المكلف" (pending) and "ما تم اعتماده"
   (approved). The matched/unmatched split is informational text inside the
   pending tab, not a separate clickable pill. */
const founderAuditTabButton = (tab, active, labelHtml) => (
    '<button type="button" data-tab="' + tab + '" class="text-xs font-black px-3 py-2 rounded-xl border-2 transition flex flex-wrap items-center gap-1.5 '
    + (active
        ? 'bg-[#230535] text-[#FFD700] border-[#230535]'
        : 'bg-white text-[#230535] border-[#230535]/25 hover:border-[#230535]')
    + '">' + labelHtml + '</button>'
);

const founderAuditCardHtml = (product, mode) => {
    const approvedMode = mode === 'approved';
    const id = String(product.id);
    const token = founderAuditEscapeHtml(id);
    const name = founderAuditEscapeHtml(founderAuditProductName(product) || 'بدون اسم');
    const meta = [
        product.sku ? ('كود: ' + founderAuditEscapeHtml(product.sku)) : '',
        product.merchantName ? founderAuditEscapeHtml(product.merchantName) : '',
        product.base_price ? ('السعر: ' + founderAuditEscapeHtml(product.base_price)) : ''
    ].filter(Boolean).join(' • ');
    const image = founderAuditProductImage(product);
    const thumb = image ? founderAuditThumbnailUrl(image) : '';
    const imageHtml = thumb
        ? '<img src="' + founderAuditEscapeHtml(thumb) + '" alt="" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display=\'none\'">'
        : '<i class="fa-regular fa-image text-2xl text-slate-300"></i>';
    /* Clickable thumbnail with a hover affordance; opens the full-resolution
       lightbox. Rows without an image keep a plain, non-interactive box. */
    const thumbHtml = thumb
        ? '<button type="button" data-action="zoom" data-id="' + token + '" title="تكبير الصورة" aria-label="تكبير الصورة" '
            + 'class="group relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-kanjo-light border border-purple-100 flex items-center justify-center cursor-pointer transition hover:border-[#FFD700] hover:ring-2 hover:ring-[#FFD700] focus:outline-none focus:ring-2 focus:ring-[#FFD700]">'
            + imageHtml
            + '<span class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition"><i class="fa-solid fa-magnifying-glass-plus text-white text-sm opacity-0 group-hover:opacity-100 transition"></i></span>'
          + '</button>'
        : '<div class="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-kanjo-light border border-purple-100 flex items-center justify-center">' + imageHtml + '</div>';
    const matchBadge = approvedMode
        ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white">معتمد</span>'
        : (founderAuditHasDescription(product)
            ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">مطابق</span>'
            : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-200 text-orange-900">غير مطابق</span>');
    const uploading = founderAuditState.uploadingId === id;
    /* The description is READ-ONLY by default; the founder must click
       "تعديل الوصف" to open the editor, which prevents accidental keystrokes.
       While editing, the textarea edits a draft that is only folded into the
       product by "حفظ" (or by the final "اعتماد" / "حفظ التعديلات"). */
    const editing = !!(founderAuditState.editing && founderAuditState.editing.has(id));
    const rx = founderAuditRxValue(id, product);
    /* The editor only ever holds the BASE description; the toggle owns the
       prescription requirement, so any legacy baked-in block is stripped. */
    const draftText = (founderAuditState.drafts && founderAuditState.drafts[id] !== undefined)
        ? String(founderAuditState.drafts[id] || '')
        : founderAuditStripPrescriptionText(product.description_ar || '');
    const description = founderAuditEscapeHtml(founderAuditStripPrescriptionText(product.description_ar || ''));
    /* Read-only view: base description plus a dynamically injected requirement
       block. This text is NEVER part of `description_ar` in Firestore. */
    const rxBadgeHtml = ''
        + '<span dir="auto" class="inline-flex items-center gap-1 mt-1">'
        +   '<span class="text-slate-300 font-black">|</span>'
        +   '<span class="text-[10px] font-black px-2 py-0.5 rounded-full border '
        +     (rx ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-300') + '">'
        +     founderAuditEscapeHtml(rx ? FOUNDER_AUDIT_RX_STRICT_TEXT : FOUNDER_AUDIT_RX_OTC_TEXT)
        +   '</span>'
        + '</span>';
    const descriptionDisplay = (description
        ? '<p dir="auto" class="text-xs font-bold text-slate-700 whitespace-pre-wrap break-words leading-relaxed">' + description + '</p>'
        : '<p class="text-xs font-bold text-slate-400 italic">لا يوجد وصف بعد.</p>')
        + rxBadgeHtml;
    const descHtml = ''
        + '<div class="space-y-1.5">'
        +   '<div class="flex items-center justify-between gap-2">'
        +     '<div class="flex items-center gap-1.5 text-[10px] font-black text-[#230535]/70"><i class="fa-solid fa-pen-to-square"></i> الوصف</div>'
        +     '<button type="button" data-action="edit-desc" data-id="' + token + '" class="shrink-0 text-[10px] font-black text-[#230535] border border-[#230535]/30 rounded-lg px-2 py-1 hover:bg-[#230535] hover:text-[#FFD700] transition flex items-center gap-1' + (editing ? ' hidden' : '') + '"><i class="fa-solid fa-pen"></i> تعديل الوصف</button>'
        +   '</div>'
        +   '<div id="' + founderAuditDescViewId(id) + '" class="' + (editing ? 'hidden' : '') + '">' + descriptionDisplay + '</div>'
        +   '<textarea id="' + founderAuditDescId(id) + '" rows="3" dir="auto" placeholder="اكتب وصف الصنف..." '
        +     'class="w-full p-2.5 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-xs outline-none focus:border-[#230535] resize-y' + (editing ? '' : ' hidden') + '">'
        +     founderAuditEscapeHtml(draftText) + '</textarea>'
        +   '<div class="flex items-center gap-2' + (editing ? '' : ' hidden') + '">'
        +     '<button type="button" data-action="save-desc" data-id="' + token + '" class="text-[10px] font-black bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition flex items-center gap-1"><i class="fa-solid fa-floppy-disk"></i> حفظ</button>'
        +     '<button type="button" data-action="cancel-desc" data-id="' + token + '" class="text-[10px] font-black bg-white text-[#230535] border border-[#230535]/30 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition flex items-center gap-1"><i class="fa-solid fa-xmark"></i> إلغاء</button>'
        +   '</div>'
        + '</div>';

    /* "يحتاج روشتة" toggle — a strict boolean committed with the row on
       "اعتماد"/"حفظ التعديلات", never on its own. The label mirrors the state
       (green when required, neutral gray when not). */
    const rxHtml = ''
        + '<label class="flex items-center gap-2 cursor-pointer select-none w-max mt-1">'
        +   '<input type="checkbox" data-rx data-id="' + token + '" ' + (rx ? 'checked' : '') + ' class="sr-only">'
        +   '<span class="relative w-9 h-5 shrink-0 rounded-full transition ' + (rx ? 'bg-emerald-600' : 'bg-slate-300') + '">'
        +     '<span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition ' + (rx ? 'translate-x-4' : 'translate-x-0') + '"></span>'
        +   '</span>'
        +   '<span class="text-[10px] font-black ' + (rx ? 'text-emerald-700' : 'text-slate-500') + '">'
        +     (rx ? 'يحتاج روشتة' : 'لا يحتاج روشتة')
        +   '</span>'
        + '</label>';

    return ''
        + '<div class="bg-white border border-[#230535]/15 rounded-2xl p-3 flex gap-3" data-product-card="' + token + '">'
        +   thumbHtml
        +   '<div class="flex-1 min-w-0 space-y-2">'
        +     '<div class="flex items-start justify-between gap-2">'
        +       '<div class="min-w-0">'
        +         '<p class="font-black text-sm text-[#230535] truncate">' + name + '</p>'
        +         (meta ? '<p class="text-[11px] text-slate-500 font-bold truncate">' + meta + '</p>' : '')
        +       '</div>'
        +       matchBadge
        +     '</div>'
        +     descHtml
        +     rxHtml
        +     '<div class="flex flex-wrap gap-2">'
        +       '<button type="button" data-action="search" data-id="' + token + '" class="bg-white text-[#230535] border-2 border-[#230535] px-3 py-2 rounded-xl text-[11px] font-black hover:bg-[#230535] hover:text-[#FFD700] transition flex items-center gap-1.5"><i class="fa-solid fa-magnifying-glass"></i> البحث عن صورة</button>'
        +       '<button type="button" data-action="upload" data-id="' + token + '" ' + (uploading ? 'disabled' : '') + ' class="bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-1.5"><i class="fa-solid ' + (uploading ? 'fa-circle-notch fa-spin' : 'fa-cloud-arrow-up') + '"></i> رفع صورة</button>'
        +       (approvedMode
            ? '<button type="button" data-action="update" data-id="' + token + '" class="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[11px] font-black hover:bg-emerald-700 transition flex items-center gap-1.5"><i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات</button>'
            : '<button type="button" data-action="approve" data-id="' + token + '" class="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[11px] font-black hover:bg-emerald-700 transition flex items-center gap-1.5"><i class="fa-solid fa-check"></i> اعتماد</button>')
        +       '<button type="button" data-action="delete" data-id="' + token + '" class="bg-red-600 text-white px-3 py-2 rounded-xl text-[11px] font-black hover:bg-red-700 transition flex items-center gap-1.5"><i class="fa-solid fa-trash"></i> حذف</button>'
        +     '</div>'
        +   '</div>'
        + '</div>';
};

/* Snapshot the text currently in an open editor into its draft, so switching
   founder or replacing an image never discards typed text. Drafts NEVER touch
   the product here — that only happens on "حفظ"/"اعتماد" — which is what makes
   "إلغاء" a true revert. */
const founderAuditCaptureEdits = () => {
    const editing = founderAuditState.editing;
    if (!editing || !editing.size) return;
    if (!founderAuditState.drafts) founderAuditState.drafts = {};
    founderAuditState.products.concat(founderAuditState.approved || []).forEach((p) => {
        if (!editing.has(p.id)) return;
        const el = document.getElementById(founderAuditDescId(p.id));
        if (el) founderAuditState.drafts[p.id] = el.value;
    });
};

/* Record an uncommitted "يحتاج روشتة" toggle (id -> boolean). Local-only: the
   draft is folded into the document by "اعتماد"/"حفظ التعديلات", so toggling on
   its own never writes to Firestore. */
window.founderAuditSetPrescription = (id, checked) => {
    if (!window.isFounderAuditUser()) return;
    if (!founderAuditState.prescriptions) founderAuditState.prescriptions = {};
    founderAuditState.prescriptions[id] = !!checked;
    founderAuditRenderChunk();
};

const founderAuditRenderChunk = () => {
    founderAuditCaptureEdits();
    const list = document.getElementById('founderAuditList');
    const tabs = document.getElementById('founderAuditTabs');
    if (!list) return;
    const founder = window.founderAuditCurrentFounder();
    const pendingItems = founderAuditState.assignments
        .filter((a) => a.founder === founder)
        .map((a) => a.product);
    const matched = pendingItems.filter(founderAuditHasDescription).length;
    const unmatched = pendingItems.length - matched;
    const approvedItems = founderAuditState.approved || [];
    const active = founderAuditState.activeTab === 'approved' ? 'approved' : 'pending';

    if (tabs) {
        tabs.innerHTML = ''
            + founderAuditTabButton('pending', active === 'pending',
                '<span>المكلّف: ' + founderAuditFormatNumber(pendingItems.length) + '</span>'
                + '<span class="text-[10px] font-bold opacity-80">(مطابق: ' + founderAuditFormatNumber(matched)
                + ' | غير مطابق: ' + founderAuditFormatNumber(unmatched) + ')</span>')
            + founderAuditTabButton('approved', active === 'approved',
                '<span>ما تم اعتماده: ' + founderAuditFormatNumber(approvedItems.length) + '</span>');
    }

    if (!founderAuditState.loaded) {
        list.innerHTML = '<p class="text-center text-sm font-bold text-slate-400 py-8">جاري التحميل...</p>';
        return;
    }
    const items = active === 'approved' ? approvedItems : pendingItems;
    if (!items.length) {
        list.innerHTML = '<p class="text-center text-sm font-bold text-slate-400 py-8">'
            + (active === 'approved' ? 'لا توجد أصناف معتمدة بعد.' : 'لا توجد أصناف مكلّفة إليك حالياً.')
            + '</p>';
        return;
    }
    list.innerHTML = items.map((p) => founderAuditCardHtml(p, active)).join('');
};

/* Switch between the two tabs. Counters/contents are re-derived on render, so
   the pending and approved figures always reflect live RAM state. */
window.founderAuditSwitchTab = (tab) => {
    const next = tab === 'approved' ? 'approved' : 'pending';
    if (founderAuditState.activeTab === next) return;
    founderAuditState.activeTab = next;
    founderAuditRenderChunk();
};

/* Open a row's description editor on demand ("تعديل الوصف"). The id is kept in
   `editing` so the editor survives an unrelated re-render, then focus lands in
   the textarea with the caret at the end. */
window.founderAuditStartEditDescription = (id) => {
    if (!founderAuditState.editing) founderAuditState.editing = new Set();
    if (!founderAuditState.drafts) founderAuditState.drafts = {};
    const product = founderAuditFindProduct(id);
    /* Seed the draft from the locked value so "إلغاء" always reverts cleanly. */
    founderAuditState.drafts[id] = String((product && product.description_ar) || '');
    founderAuditState.editing.add(id);
    founderAuditRenderChunk();
    const ta = document.getElementById(founderAuditDescId(id));
    if (ta && typeof ta.focus === 'function') {
        try {
            ta.focus();
            const end = String(ta.value || '').length;
            if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(end, end);
        } catch (err) { /* focus/caret is best-effort */ }
    }
};

/* "حفظ": lock the draft into the product's local state and return to the
   read-only view. No Firestore write happens here — only "اعتماد" does that. */
window.founderAuditSaveDescription = (id) => {
    founderAuditCaptureEdits();
    const product = founderAuditFindProduct(id);
    if (!product) return;
    const draft = founderAuditState.drafts ? founderAuditState.drafts[id] : undefined;
    const ta = document.getElementById(founderAuditDescId(id));
    const value = String((draft !== undefined ? draft : (ta ? ta.value : product.description_ar)) || '').trim();
    product.description_ar = value;
    if (founderAuditState.drafts) delete founderAuditState.drafts[id];
    if (founderAuditState.editing) founderAuditState.editing.delete(id);
    founderAuditRenderChunk();
    window.showToast('تم حفظ الوصف');
};

/* "إلغاء": discard the draft and return to the read-only view showing the
   original, unedited value. */
window.founderAuditCancelEditDescription = (id) => {
    if (founderAuditState.drafts) delete founderAuditState.drafts[id];
    if (founderAuditState.editing) founderAuditState.editing.delete(id);
    founderAuditRenderChunk();
    window.showToast('تم إلغاء التعديل');
};

/* ───────────────────────────── WIDGET / EVENTS ───────────────────────────── */

window.renderFounderAuditWidget = () => {
    const widget = document.getElementById('founderAuditWidget');
    if (!widget) return;
    const allowed = window.isFounderAuditUser();
    widget.classList.toggle('hidden', !allowed);
    if (!allowed) return;
    founderAuditSyncFounderSelect();
    if (!founderAuditState.loaded) {
        window.founderAuditLoad();
    } else {
        founderAuditRenderChunk();
    }
};

const founderAuditInit = () => {
    const list = document.getElementById('founderAuditList');
    if (list) {
        list.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            if (action === 'search') window.founderAuditSearchGoogle(id);
            else if (action === 'zoom') window.founderAuditOpenImage(id);
            else if (action === 'edit-desc') window.founderAuditStartEditDescription(id);
            else if (action === 'save-desc') window.founderAuditSaveDescription(id);
            else if (action === 'cancel-desc') window.founderAuditCancelEditDescription(id);
            else if (action === 'upload') {
                founderAuditUploadTargetId = id;
                const input = document.getElementById('founderAuditFileInput');
                if (input) input.click();
            } else if (action === 'approve') window.founderAuditApprove(id);
            else if (action === 'update') window.founderAuditUpdate(id);
            else if (action === 'delete') window.founderAuditDelete(id);
        });
        /* "يحتاج روشتة" is a live native checkbox, so it needs `change`, not the
           delegated `click` dispatch above. */
        list.addEventListener('change', (event) => {
            const box = event.target.closest('[data-rx]');
            if (!box) return;
            window.founderAuditSetPrescription(box.getAttribute('data-id'), box.checked);
        });
    }
    const tabs = document.getElementById('founderAuditTabs');
    if (tabs) {
        tabs.addEventListener('click', (event) => {
            const tab = event.target.closest('[data-tab]');
            if (tab) window.founderAuditSwitchTab(tab.getAttribute('data-tab'));
        });
    }
    const select = document.getElementById('founderAuditFounderSelect');
    /* Approved rows are per-founder, so switching founder refetches that
       founder's pending + approved pools (and resets to the pending tab). */
    if (select) select.addEventListener('change', () => window.founderAuditLoad(true));
    const fileInput = document.getElementById('founderAuditFileInput');
    if (fileInput) fileInput.addEventListener('change', window.founderAuditHandleUpload);
    const refresh = document.getElementById('founderAuditRefreshBtn');
    if (refresh) refresh.addEventListener('click', () => window.founderAuditLoad(true));
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', founderAuditInit);
} else {
    founderAuditInit();
}
