/* ============================================================================
   Kanjo Ops — Dynamic category taxonomy sync (SINGLE-DOC, ZERO-WASTE).
   ----------------------------------------------------------------------------
   The main dashboard periodically exports its category table as a CSV. The Ops
   Manager uploads that CSV here so newly introduced categories (e.g. "أجهزة"
   under "مستحضرات التجميل") are recognised by the export pipeline WITHOUT a
   code deploy and WITHOUT one Firestore document per category.

   Cost model (deliberately minimal):
     - Upload  : parse locally, aggregate into ONE nested object keyed by
                 vendor_type, and merge-write it to the SINGLE document
                 `system_config/dynamic_taxonomy` (1 write).
     - Boot    : read that SAME document exactly ONCE per session (1 read) and
                 merge it into the in-memory `window.QEMA_TAXONOMY` dictionary.
     - Runtime : every matcher / index / template lookup then reads the merged
                 in-memory dictionary — zero further reads.

   The static `qemaTaxonomy.js` dictionary is the base layer and is never
   overwritten: dynamic entries only FILL names that are absent for a vendor.
   ============================================================================ */

(function () {
    'use strict';

    const SYSTEM_CONFIG_COLLECTION = 'system_config';
    const DYNAMIC_TAXONOMY_DOC = 'dynamic_taxonomy';
    const CACHE_STORAGE_KEY = 'kanjo_dynamic_taxonomy_v1';

    /* Column aliases accepted in the uploaded CSV. The canonical dashboard
       export uses exactly `id`, `name_ar`, `vendor_type`. */
    const CSV_COLUMN_ALIASES = {
        id: ['id', 'category_id', 'cat_id', 'categoryid', 'معرف', 'رقم', 'كود', 'المعرف'],
        name_ar: ['name_ar', 'namear', 'name', 'الاسم', 'اسم', 'التصنيف', 'القسم', 'الفئة', 'category', 'category_name'],
        vendor_type: ['vendor_type', 'vendortype', 'vendor', 'scope', 'نوع_التاجر', 'النوع', 'القطاع', 'نوع']
    };

    const normHeader = (value) => String(value == null ? '' : value)
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

    const normKey = (value) => String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    /* "ID:188" / 188 / "188.0" -> 188 (0 when there is no number). */
    const parseIdNum = (value) => {
        const m = String(value == null ? '' : value).match(/(\d+)/);
        return m ? Number(m[1]) : 0;
    };

    /* RFC-4180 CSV reader (quotes, escaped quotes, CRLF, embedded commas). */
    const parseCsvRows = (text) => {
        const clean = String(text == null ? '' : text).replace(/^\uFEFF/, '');
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < clean.length; i++) {
            const ch = clean[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (clean[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else {
                    field += ch;
                }
                continue;
            }
            if (ch === '"') { inQuotes = true; continue; }
            if (ch === ',') { row.push(field); field = ''; continue; }
            if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
            if (ch === '\r') { continue; }
            field += ch;
        }
        if (field.length || row.length) { row.push(field); rows.push(row); }
        return rows.filter((r) => r.some((cell) => String(cell || '').trim() !== ''));
    };

    const buildHeaderMap = (headerRow) => {
        const map = {};
        (headerRow || []).forEach((raw, idx) => {
            const key = normHeader(raw);
            Object.keys(CSV_COLUMN_ALIASES).forEach((field) => {
                if (map[field] !== undefined) return;
                if (CSV_COLUMN_ALIASES[field].indexOf(key) !== -1) map[field] = idx;
            });
        });
        return map;
    };

    /* CSV text -> [{ id, name, vendorType }] (only fully valid rows). */
    const parseEntries = (text) => {
        const rows = parseCsvRows(text);
        if (!rows.length) return [];
        const header = buildHeaderMap(rows[0]);
        if (header.id === undefined || header.name_ar === undefined || header.vendor_type === undefined) {
            throw new Error('أعمدة الملف غير مطابقة. المطلوب: id, name_ar, vendor_type');
        }
        const entries = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const id = parseIdNum(r[header.id]);
            const name = String(r[header.name_ar] == null ? '' : r[header.name_ar]).trim();
            const vendorType = String(r[header.vendor_type] == null ? '' : r[header.vendor_type]).trim();
            if (!id || !name || !vendorType) continue;
            entries.push({ id, name, vendorType });
        }
        return entries;
    };

    /* Group entries into the single-document payload shape:
       { "<vendor_type>": { "<name_ar>": "ID:<id>" } }. */
    const buildNode = (entries) => {
        const node = {};
        (entries || []).forEach((entry) => {
            if (!entry || !entry.id || !entry.name || !entry.vendorType) return;
            if (!node[entry.vendorType]) node[entry.vendorType] = {};
            if (node[entry.vendorType][entry.name] === undefined) {
                node[entry.vendorType][entry.name] = 'ID:' + entry.id;
            }
        });
        return node;
    };

    /* Top-level merge that mirrors a Firestore `{ merge: true }` write: a vendor
       key present in `incoming` replaces that vendor's map, other vendors stay. */
    const mergeNodesByVendor = (current, incoming) => {
        const out = Object.assign({}, current || {});
        Object.keys(incoming || {}).forEach((vendor) => { out[vendor] = incoming[vendor]; });
        return out;
    };

    /* Fill-only merge into the static in-memory dictionary. Existing keys are
       never overwritten. Returns how many new category names were added. */
    const mergeIntoQema = (node) => {
        const taxonomy = (typeof window !== 'undefined' && window.QEMA_TAXONOMY) || null;
        if (!taxonomy) return 0;
        if (!taxonomy.DASHBOARD_CATEGORIES_TAXONOMY) taxonomy.DASHBOARD_CATEGORIES_TAXONOMY = {};
        const dict = taxonomy.DASHBOARD_CATEGORIES_TAXONOMY;
        let added = 0;
        Object.keys(node || {}).forEach((vendor) => {
            const cats = node[vendor] || {};
            if (!dict[vendor]) dict[vendor] = {};
            Object.keys(cats).forEach((name) => {
                if (dict[vendor][name] === undefined) { dict[vendor][name] = cats[name]; added++; }
            });
        });
        return added;
    };

    const readCache = () => {
        try {
            const raw = (typeof window !== 'undefined' && window.localStorage)
                ? window.localStorage.getItem(CACHE_STORAGE_KEY) : null;
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) { return null; }
    };

    const writeCache = (node) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(node || {}));
            }
        } catch (_) { /* storage may be unavailable (private mode) */ }
    };

    /* Drop the REST `id` field so only vendor maps remain. */
    const stripDocId = (doc) => {
        if (!doc || typeof doc !== 'object') return {};
        const copy = Object.assign({}, doc);
        delete copy.id;
        /* Accept an occasional wrapper shape ({ categories: {...} }). */
        if (copy.categories && typeof copy.categories === 'object' && !Array.isArray(copy.categories)) {
            return copy.categories;
        }
        return copy;
    };

    let loadPromise = null;

    /* Read the single document ONCE per session, merge it in memory, and cache
       it locally as a fallback. Never throws (a missing doc / offline network
       simply leaves the static dictionary in place). */
    const load = () => {
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            let node = null;
            try {
                if (typeof window !== 'undefined' && window.kanjoRest && typeof window.kanjoRest.getDocument === 'function') {
                    const doc = await window.kanjoRest.getDocument([SYSTEM_CONFIG_COLLECTION, DYNAMIC_TAXONOMY_DOC]);
                    if (doc) node = stripDocId(doc);
                }
            } catch (err) {
                console.warn('[dynamicTaxonomy] read failed; using local cache:', err);
            }
            if (!node) node = readCache();
            if (node && typeof node === 'object') {
                window.KANJO_DYNAMIC_TAXONOMY = node;
                window.KANJO_DYNAMIC_TAXONOMY_ADDED = mergeIntoQema(node);
                writeCache(node);
            } else {
                window.KANJO_DYNAMIC_TAXONOMY = window.KANJO_DYNAMIC_TAXONOMY || {};
            }
            return window.KANJO_DYNAMIC_TAXONOMY || {};
        })();
        return loadPromise;
    };

    /* Resolve an activity label ("💄 كوزماتكس") to a dynamic node key
       ("مستحضرات التجميل") using the catalog vendor resolver when available. */
    const resolveVendorKey = (vendorType, node) => {
        const raw = String(vendorType == null ? '' : vendorType).trim();
        if (!raw) return '';
        if (node[raw]) return raw;
        const api = (typeof window !== 'undefined' && window.KanjoCatalogExportAPI) || null;
        if (api && typeof api.resolveVendorType === 'function') {
            try {
                const mapped = api.resolveVendorType(raw);
                if (mapped) return mapped;
            } catch (_) { /* fall through to the normalized comparison */ }
        }
        const target = normKey(raw);
        return Object.keys(node).find((k) => normKey(k) === target) || '';
    };

    /* Dynamic categories for a vendor as [{ id, name }] (numeric id). */
    const entriesForVendor = (vendorType) => {
        const node = (typeof window !== 'undefined' && window.KANJO_DYNAMIC_TAXONOMY) || {};
        const key = resolveVendorKey(vendorType, node);
        const cats = (key && node[key]) || {};
        return Object.keys(cats).map((name) => ({ id: parseIdNum(cats[name]), name }))
            .filter((entry) => entry.id && entry.name);
    };

    /* Every synced entry, tagged with its vendor type. */
    const allEntries = () => {
        const node = (typeof window !== 'undefined' && window.KANJO_DYNAMIC_TAXONOMY) || {};
        const out = [];
        Object.keys(node).forEach((vendor) => {
            Object.keys(node[vendor] || {}).forEach((name) => {
                const id = parseIdNum(node[vendor][name]);
                if (id && name) out.push({ id, name, vendorType: vendor });
            });
        });
        return out;
    };

    /* Parse + persist (1 write) + merge in memory. Returns a summary. */
    const syncFromCsv = async (text, options) => {
        const o = options || {};
        const entries = parseEntries(text);
        if (!entries.length) {
            throw new Error('لم يتم العثور على تصنيفات صالحة (تأكد من الأعمدة: id, name_ar, vendor_type)');
        }
        const node = buildNode(entries);
        const vendorCount = Object.keys(node).length;
        const categoryCount = Object.keys(node).reduce((n, v) => n + Object.keys(node[v]).length, 0);

        if (o.persist !== false) {
            if (typeof window !== 'undefined' && window.kanjoRest && typeof window.kanjoRest.patch === 'function') {
                /* REST PATCH + updateMask == setDoc(ref, data, { merge: true }). */
                await window.kanjoRest.patch([SYSTEM_CONFIG_COLLECTION, DYNAMIC_TAXONOMY_DOC], node);
            } else if (typeof window !== 'undefined' && typeof window.setDoc === 'function'
                && typeof window.doc === 'function' && window.db) {
                await window.setDoc(window.doc(window.db, SYSTEM_CONFIG_COLLECTION, DYNAMIC_TAXONOMY_DOC), node, { merge: true });
            } else {
                throw new Error('تعذّر الاتصال بقاعدة البيانات لحفظ التصنيفات');
            }
        }

        const merged = mergeNodesByVendor(window.KANJO_DYNAMIC_TAXONOMY || {}, node);
        window.KANJO_DYNAMIC_TAXONOMY = merged;
        const added = mergeIntoQema(node);
        writeCache(merged);
        return { vendors: vendorCount, categories: categoryCount, added };
    };

    /* ─── UI wiring for the export modal's CSV button/input ─── */
    const notify = (message, ok) => {
        if (typeof window === 'undefined') return;
        if (typeof window.showToast === 'function') { window.showToast(message, ok !== false); return; }
        if (ok === false && typeof window.alert === 'function') window.alert(message);
    };

    const setStatus = (text) => {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
        const el = document.getElementById('kanjoDynamicTaxonomyStatus');
        if (!el) return;
        el.textContent = String(text || '');
        el.classList.toggle('hidden', !text);
    };

    const handleFile = async (event) => {
        const target = event && event.target;
        const file = target && target.files && target.files[0];
        if (!file) return;
        if (typeof window.isCatalogAdminUser === 'function' && !window.isCatalogAdminUser()) {
            notify('تحديث تصنيفات النظام متاح للإدارة فقط', false);
            try { target.value = ''; } catch (_) { /* ignore */ }
            return;
        }
        setStatus('جارٍ قراءة الملف...');
        try {
            const text = await (typeof file.text === 'function'
                ? file.text()
                : Promise.resolve(''));
            const result = await syncFromCsv(text);
            setStatus('تم تحديث ' + result.categories + ' تصنيف في ' + result.vendors + ' قطاع'
                + (result.added ? ' (+' + result.added + ' جديد)' : ''));
            notify('تم تحديث تصنيفات النظام (' + result.categories + ' تصنيف)');
        } catch (err) {
            setStatus('');
            console.error('[dynamicTaxonomy] CSV sync failed:', err);
            const message = String((err && err.message) || err);
            if (typeof window.Swal === 'object' && window.Swal && typeof window.Swal.fire === 'function') {
                window.Swal.fire({ icon: 'error', title: 'فشل تحديث التصنيفات', html: message, confirmButtonText: 'حسناً', confirmButtonColor: '#230535' });
            } else {
                notify(message, false);
            }
        } finally {
            try { target.value = ''; } catch (_) { /* ignore */ }
        }
    };

    const wireUi = () => {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
        const input = document.getElementById('kanjoDynamicTaxonomyFileInput');
        if (!input || input.__kanjoDynamicWired) return;
        input.__kanjoDynamicWired = true;
        input.addEventListener('change', handleFile);
    };

    if (typeof window !== 'undefined') {
        window.KANJO_DYNAMIC_TAXONOMY = window.KANJO_DYNAMIC_TAXONOMY || {};
        window.KanjoDynamicCategories = {
            load: load,
            ready: load,
            syncFromCsv: syncFromCsv,
            entriesForVendor: entriesForVendor,
            allEntries: allEntries,
            resolveVendorKey: resolveVendorKey,
            mergeIntoQema: mergeIntoQema,
            buildNode: buildNode,
            parseEntries: parseEntries,
            parseCsvRows: parseCsvRows,
            parseIdNum: parseIdNum,
            wireUi: wireUi,
            getNode: () => window.KANJO_DYNAMIC_TAXONOMY || {}
        };
    }

    /* Boot: one read per session (idempotent). Waits for the auth baseline so
       the strict Firestore rules accept the read. */
    const boot = () => {
        wireUi();
        const ready = (typeof window !== 'undefined' && window.authReady) || Promise.resolve();
        Promise.resolve(ready).then(load).catch(() => load());
    };

    if (typeof document !== 'undefined' && document && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else if (typeof document !== 'undefined') {
        boot();
    }
})();
