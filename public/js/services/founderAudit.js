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

/* Field mask for the pending query — deliberately narrow so the (potentially
   large) intake rows never pull heavy/irrelevant fields over the wire. */
const FOUNDER_AUDIT_SELECT = [
    'name_ar', 'name_en', 'description_ar', 'description_en',
    'rawImageUrl', 'rawImageUrls', 'enhancedImageUrl', 'image_url',
    'category', 'intakeSource', 'status', 'merchantId', 'merchantName',
    'sku', 'base_price', 'createdAt', 'auditedBy', 'auditFounder'
];

/* In-RAM state only (see STATE note above). `editing` tracks which rows the
   founder has opened for description editing, so an unrelated re-render (image
   upload, founder switch) never collapses an open editor or loses the caret. */
const founderAuditState = {
    loaded: false,
    loading: false,
    products: [],
    assignments: [],
    loadedAt: null,
    uploadingId: '',
    editing: new Set()
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

/* Live value of a row's description editor. Always prefer the in-DOM textarea
   so an edit is never lost; fall back to the stored value only when the editor
   is absent (e.g. before the first render). */
const founderAuditDescriptionValue = (id, product) => {
    const el = document.getElementById(founderAuditDescId(id));
    if (el) return String(el.value || '').trim();
    return String((product && product.description_ar) || '').trim();
};
window.founderAuditDescriptionValue = founderAuditDescriptionValue;

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

/* Full-resolution variant for the click-to-zoom lightbox: same Drive source
   rendered large (w1600) so packaging details are legible. Falls back to the
   raw URL for non-Drive sources. */
const founderAuditFullImageUrl = (urlOrId) => {
    const id = founderAuditDriveFileId(urlOrId);
    if (id) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600';
    return String(urlOrId || '');
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

/* ─────────────────────── DETERMINISTIC FAIR ROUTING ─────────────────────── */

/* Assigns every pending product to one of the four founders.

   Ordering is fully deterministic: rows are sorted by id, then split into
   matched (has description) and unmatched (hard, empty description). Each group
   is round-robined across the founders independently; the unmatched rotation is
   offset by `matched.length % 4` so the founders who received fewer matched rows
   are the ones who receive the extra unmatched rows. The result is an equal
   share of BOTH kinds per founder (never differing by more than one), and —
   because the order never depends on network/return order — the same row always
   lands on the same founder. */
const founderAuditAssign = (products) => {
    const n = FOUNDER_AUDIT_FOUNDERS.length;
    const list = Array.isArray(products) ? products.slice() : [];
    list.sort((a, b) => String((a && a.id) || '').localeCompare(String((b && b.id) || '')));

    const matched = [];
    const unmatched = [];
    list.forEach((p) => {
        (founderAuditHasDescription(p) ? matched : unmatched).push(p);
    });

    const out = [];
    matched.forEach((product, i) => out.push({
        product,
        founder: FOUNDER_AUDIT_FOUNDERS[i % n],
        kind: 'matched'
    }));

    /* Offset the hard rows so they top up the founders short on easy rows. */
    const offset = matched.length % n;
    unmatched.forEach((product, i) => out.push({
        product,
        founder: FOUNDER_AUDIT_FOUNDERS[(offset + i) % n],
        kind: 'unmatched'
    }));

    out.sort((a, b) => String(a.product.id).localeCompare(String(b.product.id)));
    return out.map((entry, index) => Object.assign({}, entry, { index }));
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

window.founderAuditLoad = async (force) => {
    if (!window.isFounderAuditUser()) return;
    if (founderAuditState.loading) return;
    if (founderAuditState.loaded && !force) { founderAuditRenderChunk(); return; }
    founderAuditState.loading = true;
    founderAuditSetStatus('جاري تحميل أصناف الصيدليات المعلّقة...');
    try {
        const products = await founderAuditFetchPending();
        founderAuditState.products = products;
        founderAuditState.assignments = founderAuditAssign(products);
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
    const product = founderAuditState.products.find((p) => p.id === id);
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
    const product = founderAuditState.products.find((p) => p.id === id);
    const image = founderAuditProductImage(product);
    if (!image) { window.showToast('لا توجد صورة لهذا الصنف', false); return; }
    const full = founderAuditFullImageUrl(image);
    if (typeof window.openImageViewer === 'function') {
        window.openImageViewer(full);
        return;
    }
    window.open(full, '_blank', 'noopener');
};

/* Open Google Images for the product name in a new tab, explicitly localized to
   Egypt: the " مصر" suffix plus `gl=eg` force Egyptian packaging results
   regardless of where the auditor's IP is geolocated. */
window.founderAuditSearchGoogle = (id) => {
    const product = founderAuditState.products.find((p) => p.id === id);
    const name = founderAuditProductName(product);
    if (!name) { window.showToast('لا يوجد اسم للبحث عنه', false); return; }
    const url = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(name + ' مصر') + '&gl=eg';
    window.open(url, '_blank', 'noopener');
};

/* Approve a product: persist the edited description, set status=done and
   is_active=true, and remove it from this founder's pending chunk. */
window.founderAuditApprove = async (id) => {
    if (!window.isFounderAuditUser()) return;
    const product = founderAuditState.products.find((p) => p.id === id);
    if (!product) return;
    /* Read the founder's freshly typed value straight from the DOM textarea so
       their correction is persisted in the same transition. */
    const description = founderAuditDescriptionValue(id, product);
    const founder = window.founderAuditCurrentFounder();
    const actor = (window.currentUser && window.currentUser.name) || '';
    const patch = {
        status: 'done',
        is_active: true,
        description_ar: description,
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
            previousData: { status: product.status, description_ar: product.description_ar || '' },
            newData: { status: 'done', description_ar: description, is_active: true }
        });
        if (!ok) throw new Error('PATCH_FAILED');

        /* Drop it from RAM so the chunk shrinks immediately; no refetch needed. */
        founderAuditState.products = founderAuditState.products.filter((p) => p.id !== id);
        founderAuditState.assignments = founderAuditAssign(founderAuditState.products);
        if (founderAuditState.editing) founderAuditState.editing.delete(id);
        window.showToast('تم اعتماد الصنف');
        founderAuditRenderChunk();
    } catch (err) {
        console.error('[founder-audit] approve failed:', err);
        window.showToast('فشل اعتماد الصنف، حاول مرة أخرى', false);
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

const founderAuditStatBadge = (label, value, tone) => (
    '<span class="text-xs font-black px-3 py-1 rounded-full ' + tone + '">'
    + founderAuditEscapeHtml(label) + ' ' + founderAuditFormatNumber(value) + '</span>'
);

const founderAuditCardHtml = (product) => {
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
    const matchBadge = founderAuditHasDescription(product)
        ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">مطابق</span>'
        : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-200 text-orange-900">غير مطابق</span>';
    const uploading = founderAuditState.uploadingId === id;
    /* The description is READ-ONLY by default; the founder must click
       "تعديل الوصف" to open the editor, which prevents accidental keystrokes. */
    const editing = !!(founderAuditState.editing && founderAuditState.editing.has(id));
    const description = founderAuditEscapeHtml(product.description_ar || '');
    const descriptionDisplay = description
        ? '<p dir="auto" class="text-xs font-bold text-slate-700 whitespace-pre-wrap break-words leading-relaxed">' + description + '</p>'
        : '<p class="text-xs font-bold text-slate-400 italic">لا يوجد وصف بعد.</p>';
    const descHtml = ''
        + '<div class="space-y-1.5">'
        +   '<div class="flex items-center justify-between gap-2">'
        +     '<div class="flex items-center gap-1.5 text-[10px] font-black text-[#230535]/70"><i class="fa-solid fa-pen-to-square"></i> الوصف</div>'
        +     '<button type="button" data-action="edit-desc" data-id="' + token + '" class="shrink-0 text-[10px] font-black text-[#230535] border border-[#230535]/30 rounded-lg px-2 py-1 hover:bg-[#230535] hover:text-[#FFD700] transition flex items-center gap-1' + (editing ? ' hidden' : '') + '"><i class="fa-solid fa-pen"></i> تعديل الوصف</button>'
        +   '</div>'
        +   '<div id="' + founderAuditDescViewId(id) + '" class="' + (editing ? 'hidden' : '') + '">' + descriptionDisplay + '</div>'
        +   '<textarea id="' + founderAuditDescId(id) + '" rows="3" dir="auto" placeholder="اكتب وصف الصنف..." '
        +     'class="w-full p-2.5 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-xs outline-none focus:border-[#230535] resize-y' + (editing ? '' : ' hidden') + '">'
        +     description + '</textarea>'
        + '</div>';

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
        +     '<div class="flex flex-wrap gap-2">'
        +       '<button type="button" data-action="search" data-id="' + token + '" class="bg-white text-[#230535] border-2 border-[#230535] px-3 py-2 rounded-xl text-[11px] font-black hover:bg-[#230535] hover:text-[#FFD700] transition flex items-center gap-1.5"><i class="fa-solid fa-magnifying-glass"></i> البحث عن صورة</button>'
        +       '<button type="button" data-action="upload" data-id="' + token + '" ' + (uploading ? 'disabled' : '') + ' class="bg-[#230535] text-[#FFD700] px-3 py-2 rounded-xl text-[11px] font-black hover:opacity-90 transition flex items-center gap-1.5"><i class="fa-solid ' + (uploading ? 'fa-circle-notch fa-spin' : 'fa-cloud-arrow-up') + '"></i> رفع صورة</button>'
        +       '<button type="button" data-action="approve" data-id="' + token + '" class="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[11px] font-black hover:bg-emerald-700 transition flex items-center gap-1.5"><i class="fa-solid fa-check"></i> اعتماد</button>'
        +     '</div>'
        +   '</div>'
        + '</div>';
};

/* Snapshot in-progress description edits from the DOM before a re-render, so
   switching founder or replacing an image never discards typed text. Only rows
   currently in edit mode sync from the DOM; read-only rows keep their stored
   value untouched (the textarea is merely a mirror there). */
const founderAuditCaptureEdits = () => {
    const editing = founderAuditState.editing;
    if (!editing || !editing.size) return;
    founderAuditState.products.forEach((p) => {
        if (!editing.has(p.id)) return;
        const el = document.getElementById(founderAuditDescId(p.id));
        if (el) p.description_ar = el.value;
    });
};

const founderAuditRenderChunk = () => {
    founderAuditCaptureEdits();
    const list = document.getElementById('founderAuditList');
    const stats = document.getElementById('founderAuditStats');
    if (!list) return;
    const founder = window.founderAuditCurrentFounder();
    const mine = founderAuditState.assignments
        .filter((a) => a.founder === founder)
        .map((a) => a.product);
    const matched = mine.filter(founderAuditHasDescription).length;
    const unmatched = mine.length - matched;

    if (stats) {
        stats.innerHTML = ''
            + founderAuditStatBadge('المكلّف', mine.length, 'bg-[#FFD700]/30 text-[#230535]')
            + founderAuditStatBadge('مطابق', matched, 'bg-emerald-100 text-emerald-700')
            + founderAuditStatBadge('غير مطابق', unmatched, 'bg-orange-200 text-orange-900');
    }

    if (!founderAuditState.loaded) {
        list.innerHTML = '<p class="text-center text-sm font-bold text-slate-400 py-8">جاري التحميل...</p>';
        return;
    }
    if (!mine.length) {
        list.innerHTML = '<p class="text-center text-sm font-bold text-slate-400 py-8">لا توجد أصناف مكلّفة إليك حالياً.</p>';
        return;
    }
    list.innerHTML = mine.map(founderAuditCardHtml).join('');
};

/* Open a row's description editor on demand ("تعديل الوصف"). The id is kept in
   `editing` so the editor survives an unrelated re-render, then focus lands in
   the textarea with the caret at the end. */
window.founderAuditStartEditDescription = (id) => {
    if (!founderAuditState.editing) founderAuditState.editing = new Set();
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
            else if (action === 'upload') {
                founderAuditUploadTargetId = id;
                const input = document.getElementById('founderAuditFileInput');
                if (input) input.click();
            } else if (action === 'approve') window.founderAuditApprove(id);
        });
    }
    const select = document.getElementById('founderAuditFounderSelect');
    if (select) select.addEventListener('change', founderAuditRenderChunk);
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
