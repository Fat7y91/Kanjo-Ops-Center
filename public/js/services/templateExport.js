/* ============================================================================
   Kanjo Ops — Vendor import-template filler (ISOLATED, ZERO Firestore).
   ----------------------------------------------------------------------------
   The admin uploads the platform's official per-vendor import template
   (e.g. product-import-template-v1.1.xlsx). This module parses its `Products`,
   `Variants` and `_lookups` sheets, resolves every category/attribute value
   against the IDs the template itself permits, fills the template's existing
   sheet structure in memory with the selected merchant's rows, and downloads the
   populated workbook.

   Isolation contract:
     - Never reads or writes Firestore; the only data source is the already
       loaded in-memory catalog exposed by window.KanjoCatalogExportAPI.
     - Never touches the existing export routes or their helpers; all parsing,
       mapping and workbook writing happens here (SheetJS in-memory only).
     - Additive only: it consumes a few read-only references from catalog.js.
   ============================================================================ */

(function () {
    'use strict';

    const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const ATTR_MARK = /ATTR\s*:\s*(\d+)/i;

    const SHEET_ALIASES = {
        products: ['products', 'product', 'المنتجات', 'منتجات'],
        variants: ['variants', 'variant', 'المتغيرات', 'متغيرات'],
        additions: ['additions', 'addition', 'add_ons', 'addons', 'الإضافات', 'الاضافات', 'إضافات', 'اضافات'],
        lookups: ['_lookups', 'lookups', 'lookup', '_lookup', 'القوائم', 'قوائم', 'قائمة']
    };

    /* Normalised comparison key (case/space insensitive; Arabic text kept as-is
       so diacritic-insensitive matching is not required for the template IDs). */
    const normKey = (value) => String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');

    const nameFromValue = (value) => {
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return '';
        const idx = raw.lastIndexOf('|');
        return (idx === -1 ? raw : raw.slice(idx + 1)).trim();
    };

    /* "ID:186 | ميلك شيك" / "ID:1 | ATTR:1 | صغير" -> { id, name, full, attr }.
       Returns null for any cell that is not an ID token, so arbitrary template
       cells (notes, headers) are ignored by the lookup scan. */
    const parseIdToken = (raw) => {
        const text = String(raw == null ? '' : raw).trim();
        if (!text) return null;
        const idMatch = text.match(/ID\s*:\s*(\d+)/i);
        if (!idMatch) return null;
        const attrMatch = text.match(ATTR_MARK);
        let name = nameFromValue(text);
        name = name.replace(/^ATTR\s*:\s*\d+\s*\|\s*/i, '').trim();
        if (!name) name = text;
        return {
            id: 'ID:' + idMatch[1],
            name: name,
            full: text,
            attr: attrMatch ? Number(attrMatch[1]) : 0,
            isVariant: !!attrMatch
        };
    };

    /* Scans a raw AOA (all cells of the `_lookups` sheet) and splits the ID
       tokens into the category scope and the variant/attribute scope. */
    const extractLookups = (aoaRows) => {
        const all = [];
        const categories = [];
        const variants = [];
        const byCategoryName = new Map();
        const byVariantName = new Map();
        const byVariantNameAttr = new Map();
        const seen = new Set();
        (aoaRows || []).forEach((row) => {
            const cells = Array.isArray(row) ? row : [row];
            cells.forEach((cell) => {
                const parsed = parseIdToken(cell);
                if (!parsed || seen.has(parsed.full)) return;
                seen.add(parsed.full);
                all.push(parsed);
                if (parsed.isVariant) {
                    variants.push(parsed);
                    const nk = normKey(parsed.name);
                    if (nk && !byVariantName.has(nk)) byVariantName.set(nk, parsed);
                    const ak = nk + '::' + parsed.attr;
                    if (nk && !byVariantNameAttr.has(ak)) byVariantNameAttr.set(ak, parsed);
                } else {
                    categories.push(parsed);
                    const nk = normKey(parsed.name);
                    if (nk && !byCategoryName.has(nk)) byCategoryName.set(nk, parsed);
                }
            });
        });
        const firstCategory = categories.length ? categories[0].full : (all.length ? all[0].full : '');
        return { all, categories, variants, byCategoryName, byVariantName, byVariantNameAttr, firstCategory };
    };

    /* Extend a template's category lookup with the CSV-synced dynamic categories
       for this vendor. A name already present in the template's `_lookups` always
       wins; a dynamic entry is only a fallback so a freshly-synced category is
       recognised without regenerating the workbook. Mutates `lookups` in place. */
    const applyDynamicLookups = (lookups, vendorType) => {
        if (!lookups || !lookups.byCategoryName) return;
        const provider = (typeof window !== 'undefined' && window.KanjoDynamicCategories) || null;
        if (!provider || typeof provider.entriesForVendor !== 'function') return;
        let entries = [];
        try { entries = provider.entriesForVendor(vendorType) || []; } catch (_) { return; }
        entries.forEach((entry) => {
            if (!entry || !entry.id || !entry.name) return;
            const nk = normKey(entry.name);
            if (!nk || lookups.byCategoryName.has(nk)) return;
            const parsed = {
                id: 'ID:' + entry.id,
                name: entry.name,
                full: 'ID:' + entry.id + ' | ' + entry.name,
                attr: 0,
                isVariant: false,
                dynamic: true
            };
            lookups.byCategoryName.set(nk, parsed);
            lookups.categories.push(parsed);
            lookups.all.push(parsed);
        });
    };

    /* Generic -> brand spelling bridge reused from the app's SMART_ALIASES
       (e.g. "ميرندا" -> "صودا"), applied ONLY when the template has no literal
       entry, then resolution falls back to the template's first valid category. */
    const bridgeCategoryName = (name) => {
        const taxonomy = (typeof window !== 'undefined' && window.QEMA_TAXONOMY) || null;
        const aliases = taxonomy && taxonomy.SMART_ALIASES && taxonomy.SMART_ALIASES.categories;
        if (!aliases) return '';
        const nk = normKey(name);
        const key = Object.keys(aliases).find((k) => normKey(k) === nk);
        return key ? aliases[key] : '';
    };

    /* Resolve an assigned category cell to THIS template's permitted IDs:
       exact name hit first, alias bridge second. STRICT by design — a name with
       no entry in the template's `_lookups` resolves to '' (never a silent
       fallback to `firstCategory`). The caller treats '' as "needs audit" and
       routes the product through the interactive category modal, so the workbook
       can never contain a random or guessed category. Multiple categories are
       always joined with "; " as the importer expects. */
    const resolveCategory = (lookups, assigned) => {
        const names = String(assigned == null ? '' : assigned)
            .split(/[;,]/)
            .map(nameFromValue)
            .filter(Boolean);
        if (!names.length) return '';
        const out = [];
        const seen = new Set();
        names.forEach((name) => {
            let entry = lookups.byCategoryName.get(normKey(name));
            if (!entry) {
                const bridged = bridgeCategoryName(name);
                if (bridged) entry = lookups.byCategoryName.get(normKey(bridged));
            }
            if (!entry) return;
            const key = normKey(entry.name);
            if (seen.has(key)) return;
            seen.add(key);
            out.push(entry.full);
        });
        return out.join('; ');
    };

    /* Remap a variant attribute VALUE cell (carries an ATTR:<group> marker) to
       this template's exact ID string. Attribute-name cells are structural group
       headers and are left untouched; unmatched values are returned untouched so
       no data is invented and no valid static value is lost. */
    const remapVariantCell = (lookups, cell) => {
        const parsed = parseIdToken(cell);
        if (!parsed || !parsed.isVariant) return cell;
        const nk = normKey(parsed.name);
        const entry = lookups.byVariantNameAttr.get(nk + '::' + parsed.attr) || lookups.byVariantName.get(nk);
        return entry ? entry.full : cell;
    };

    const COLUMN_ALIASES = {
        product_key: ['product_key', 'product key', 'productkey', 'المفتاح', 'مفتاح المنتج'],
        product_type: ['product_type', 'product type', 'producttype', 'النوع', 'نوع المنتج'],
        sku: ['sku', 'الرمز', 'رمز', 'رمز المنتج'],
        name_en: ['name_en', 'name en', 'nameen', 'الاسم بالانجليزية', 'الاسم الانجليزي'],
        name_ar: ['name_ar', 'name ar', 'namear', 'الاسم', 'الاسم العربي'],
        description_en: ['description_en', 'description en', 'descriptionen', 'الوصف بالانجليزية'],
        description_ar: ['description_ar', 'description ar', 'descriptionar', 'الوصف', 'الوصف العربي'],
        base_price: ['base_price', 'base price', 'baseprice', 'السعر', 'سعر'],
        main_image_url: ['main_image_url', 'main image url', 'mainimageurl', 'الصورة', 'رابط الصورة', 'صورة'],
        category: ['category', 'categories', 'التصنيف', 'القسم', 'الفئة', 'التصنيفات'],
        status: ['status', 'الحالة'],
        variant_sku: ['variant_sku', 'variant sku', 'variantsku', 'رمز المتغير'],
        attribute_1_name: ['attribute_1_name', 'attribute 1 name'], attribute_1_value: ['attribute_1_value', 'attribute 1 value'],
        attribute_2_name: ['attribute_2_name', 'attribute 2 name'], attribute_2_value: ['attribute_2_value', 'attribute 2 value'],
        attribute_3_name: ['attribute_3_name', 'attribute 3 name'], attribute_3_value: ['attribute_3_value', 'attribute 3 value'],
        attribute_4_name: ['attribute_4_name', 'attribute 4 name'], attribute_4_value: ['attribute_4_value', 'attribute 4 value'],
        branch: ['branch', 'الفرع'], price: ['price', 'السعر', 'سعر'], stock: ['stock', 'المخزون'],
        thumbnail_url: ['thumbnail_url', 'thumbnail url', 'صورة المتغير']
    };

    /* header row -> { ourKey: columnIndex } using the alias table. Exact key
       matches win over aliases so a template that already uses our canonical
       headers maps 1:1. */
    const buildColumnMap = (headerRow) => {
        const map = {};
        const cells = (headerRow || []).map((h) => normKey(h));
        Object.keys(COLUMN_ALIASES).forEach((key) => {
            const candidates = [key].concat(COLUMN_ALIASES[key]).map(normKey);
            let idx = -1;
            for (let i = 0; i < candidates.length && idx === -1; i++) {
                idx = cells.indexOf(candidates[i]);
            }
            if (idx !== -1) map[key] = idx;
        });
        return map;
    };

    const findHeaderRow = (aoa, requiredKeys) => {
        const limit = Math.min(aoa.length, 20);
        for (let i = 0; i < limit; i++) {
            const map = buildColumnMap(aoa[i]);
            const hits = (requiredKeys || []).filter((k) => k in map).length;
            if (hits >= Math.min(2, (requiredKeys || []).length || 1)) return i;
        }
        return 0;
    };

    /* Header detection for an arbitrary secondary sheet (e.g. Additions) whose
       columns we do not model: the first row with at least two non-empty cells
       is treated as the header, so a single title cell above it is preserved. */
    const findGenericHeaderRow = (aoa) => {
        const limit = Math.min(aoa.length, 20);
        for (let i = 0; i < limit; i++) {
            const cells = (aoa[i] || []).filter((v) => String(v == null ? '' : v).trim() !== '');
            if (cells.length >= 2) return i;
        }
        return 0;
    };

    /* Truncate a worksheet to its header row only: every cell BELOW the header
       (placeholder/example rows such as simple-example / variant-example) is
       removed, the sheet object and header formatting/notes are preserved, and
       `!ref` is reset to header-only. Used when a secondary sheet receives no
       real data for the vendor, so strict validation never sees a product_key
       that references a row we did not write. */
    const purgeDataRows = (XLSX, worksheet, headerRowIndex) => {
        if (!worksheet) return worksheet;
        const header = Math.max(0, headerRowIndex || 0);
        let maxCol = 0;
        Object.keys(worksheet).forEach((addr) => {
            if (addr.charAt(0) === '!') return;
            const cell = XLSX.utils.decode_cell(addr);
            if (cell.r > header) { delete worksheet[addr]; return; }
            maxCol = Math.max(maxCol, cell.c);
        });
        worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: header, c: maxCol } });
        return worksheet;
    };

    const findSheetName = (workbook, kind) => {
        const names = (workbook && workbook.SheetNames) || [];
        const aliases = SHEET_ALIASES[kind] || [];
        const direct = new Map(names.map((n) => [normKey(n), n]));
        for (let i = 0; i < aliases.length; i++) {
            const hit = direct.get(normKey(aliases[i]));
            if (hit) return hit;
        }
        for (let i = 0; i < names.length; i++) {
            const nk = normKey(names[i]);
            if (aliases.some((a) => nk.indexOf(a) !== -1)) return names[i];
        }
        return '';
    };

    /* Overwrite the data region of an existing worksheet while preserving the
       sheet object (headers, notes, data-validation) untouched. */
    const writeRowsIntoSheet = (XLSX, worksheet, headerRowIndex, columnMap, rows) => {
        Object.keys(worksheet).forEach((addr) => {
            if (addr.charAt(0) === '!') return;
            const cell = XLSX.utils.decode_cell(addr);
            if (cell.r > headerRowIndex) delete worksheet[addr];
        });
        let maxRow = headerRowIndex;
        let maxCol = 0;
        Object.keys(columnMap).forEach((key) => { maxCol = Math.max(maxCol, columnMap[key]); });
        (rows || []).forEach((row, index) => {
            const r = headerRowIndex + 1 + index;
            maxRow = r;
            Object.keys(columnMap).forEach((key) => {
                const value = row[key];
                if (value == null || value === '') return;
                const c = columnMap[key];
                worksheet[XLSX.utils.encode_cell({ r: r, c: c })] = {
                    t: typeof value === 'number' ? 'n' : 's',
                    v: value
                };
            });
        });
        worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
        return worksheet;
    };

    const templateOutputName = (templateName, merchantName) => {
        const base = String(templateName || 'template').replace(/\.xlsx?$/i, '').trim() || 'template';
        const who = String(merchantName || '').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
        const stamp = new Date().toISOString().slice(0, 10);
        return base + (who ? '_' + who : '') + '_' + stamp + '.xlsx';
    };

    const triggerDownload = (blob, fileName) => {
        if (typeof window.saveAs === 'function') { window.saveAs(blob, fileName); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    const toast = (message, ok) => {
        if (typeof window.showToast === 'function') window.showToast(message, ok !== false);
    };

    /* ===== Active template (session memory, ZERO Firestore) =====
       The most recently parsed vendor template becomes the authority the ZIP
       export consults when a scoped product cannot be resolved: its `_lookups`
       category tokens are the ONLY values the operator may pick from. */
    let activeTemplate = null;
    const setActiveTemplate = (fileName, lookups) => {
        const cats = (lookups && lookups.categories) || [];
        activeTemplate = {
            fileName: String(fileName || ''),
            categories: cats.map((c) => ({ token: c.full, name: c.name })),
            variants: ((lookups && lookups.variants) || []).map((v) => ({ token: v.full, name: v.name, attr: v.attr })),
            setAt: Date.now()
        };
        if (typeof window !== 'undefined') window.kanjoActiveTemplate = activeTemplate;
        return activeTemplate;
    };
    const getActiveTemplate = () => activeTemplate;

    const escapeHtml = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /* Interactive batch picker used by the ZIP export remediation. `items` is
       [{ productId, label, vendorName, options:[{ token, label }] }]. Resolves to
       a map of { productId: token } on confirm, or null on cancel/unavailable. */
    const pickTemplateCategories = async (items) => {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return {};
        const Swal = (typeof window !== 'undefined') ? window.Swal : null;
        if (!Swal || typeof Swal.fire !== 'function') return null;
        /* Fuzzy SUGGESTION only: never auto-commits. When a product's unresolved
           category is a close typo of a template `_lookups` option we pre-select
           that option and flag it "مقترح"; the operator still reviews every row
           and clicks Submit. Exact logic upstream is untouched. */
        const fuzzyBest = (typeof window !== 'undefined' && typeof window.kanjoFuzzyBest === 'function')
            ? window.kanjoFuzzyBest
            : null;
        const body = list.map((item, i) => {
            const options = Array.isArray(item.options) ? item.options : [];
            const suggestion = (fuzzyBest && item.category && options.length)
                ? fuzzyBest(item.category, options, { minScore: 0.8 })
                : null;
            const optionsHtml = options.map((opt) => {
                const token = escapeHtml(opt.token);
                const label = escapeHtml(opt.label || opt.name || opt.token);
                const isSuggestion = !!(suggestion && String(suggestion.token) === String(opt.token));
                return '<option value="' + token + '"' + (isSuggestion ? ' selected' : '') + '>'
                    + label + (isSuggestion ? ' — مقترح' : '') + '</option>';
            }).join('');
            const who = item.vendorName ? ' <span style="font-weight:600;color:#64748b">[' + escapeHtml(item.vendorName) + ']</span>' : '';
            const hint = suggestion
                ? '<div style="margin-top:6px;font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 8px">'
                    + 'اقتراح تلقائي: <b>' + escapeHtml(item.category) + '</b> ← <b>' + escapeHtml(suggestion.name) + '</b> — يرجى المراجعة</div>'
                : '';
            return '<div style="margin:10px 0;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#faf7ff">'
                + '<div style="font-weight:800;color:#230535;margin-bottom:6px">' + escapeHtml(item.label || item.productId) + who + '</div>'
                + '<select id="kanjoTplPick' + i + '" style="width:100%;padding:8px;border:1px solid #c4b5fd;border-radius:8px;background:#fff">'
                + '<option value="">— اختر تصنيفاً —</option>' + optionsHtml + '</select>' + hint + '</div>';
        }).join('');
        const result = await Swal.fire({
            icon: 'question',
            title: 'تصنيفات غير مطابقة — اختيار يدوي مطلوب',
            html: '<div style="text-align:right;direction:rtl;font-size:13px;line-height:1.7">'
                + '<p>تعذّر مطابقة التصنيفات التالية. يرجى اختيار تصنيف صالح من قالب التاجر النشط لكل منتج '
                + '(من ورقة <b>_lookups</b>):</p>'
                + '<div style="max-height:60vh;overflow:auto">' + body + '</div></div>',
            confirmButtonText: 'متابعة التصدير',
            confirmButtonColor: '#230535',
            showCancelButton: true,
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                const out = {};
                for (let i = 0; i < list.length; i++) {
                    const select = document.getElementById('kanjoTplPick' + i);
                    const value = select ? String(select.value || '') : '';
                    if (!value) {
                        if (typeof Swal.showValidationMessage === 'function') Swal.showValidationMessage('يرجى تحديد تصنيف لكل المنتجات قبل المتابعة');
                        return false;
                    }
                    out[String(list[i].productId || '')] = value;
                }
                return out;
            }
        });
        if (!result || !result.isConfirmed || !result.value) return null;
        return result.value;
    };
    window.kanjoPickTemplateCategories = pickTemplateCategories;

    /* Parse a workbook buffer into { workbook, lookups, sheetNames }. Pure
       in-memory; used by the public entry point and by tests. */
    const parseTemplateWorkbook = (XLSX, buffer) => {
        const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true });
        const productsSheet = findSheetName(workbook, 'products');
        const variantsSheet = findSheetName(workbook, 'variants');
        const additionsSheet = findSheetName(workbook, 'additions');
        const lookupsSheet = findSheetName(workbook, 'lookups');
        if (!productsSheet) throw new Error('لم يتم العثور على ورقة Products في القالب');
        if (!variantsSheet) throw new Error('لم يتم العثور على ورقة Variants في القالب');
        if (!lookupsSheet) throw new Error('لم يتم العثور على ورقة _lookups في القالب');
        const readAoa = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, raw: false }) || [];
        const lookups = extractLookups(readAoa(lookupsSheet));
        if (!lookups.all.length) throw new Error('ورقة _lookups لا تحتوي على أي معرّفات صالحة (ID:n | Name)');
        return { workbook, lookups, productsSheet, variantsSheet, additionsSheet, lookupsSheet, readAoa };
    };

    /* Public entry point. opts = { file, merchantId, merchantName, vendorType,
       includePending, source }. No Firestore access: products come from the
       already-loaded in-memory API (cache-first). */
    window.kanjoPopulateVendorTemplate = async (opts) => {
        const o = opts || {};
        const XLSX = window.XLSX;
        if (!XLSX || !XLSX.utils) throw new Error('مكتبة Excel غير محمّلة، أعد تحميل الصفحة');
        if (typeof window.isCatalogAdminUser === 'function' && !window.isCatalogAdminUser()) {
            toast('تعبئة قالب التاجر متاحة للإدارة فقط', false);
            return { fileName: '', productCount: 0, variantCount: 0 };
        }
        const api = window.KanjoCatalogExportAPI;
        if (!api) throw new Error('واجهة تصدير الكتالوج غير متاحة');
        const file = o.file;
        if (!file || typeof file.arrayBuffer !== 'function') throw new Error('لا يوجد ملف قالب صالح');

        const buffer = await file.arrayBuffer();
        const parsed = parseTemplateWorkbook(XLSX, buffer);
        const { workbook, lookups, productsSheet, variantsSheet, additionsSheet, readAoa } = parsed;
        /* Remember this template as the session-authoritative source of IDs so
           the ZIP export can offer its `_lookups` categories for manual fixes. */
        setActiveTemplate(file.name, lookups);

        const source = Array.isArray(o.source)
            ? o.source
            : (o.includePending === false ? await api.fetchDoneProducts() : await api.fetchAllProducts());
        let filtered = source || [];
        if (o.merchantId) {
            filtered = filtered.filter((p) => String((p && p.merchantId) || '') === String(o.merchantId));
        } else if (o.merchantName) {
            filtered = filtered.filter((p) => api.merchantNameOf(p) === o.merchantName);
        }
        if (!filtered.length) {
            toast('لا توجد منتجات لهذا التاجر', false);
            return { fileName: '', productCount: 0, variantCount: 0 };
        }

        filtered = filtered.map((p) => api.withNormalizedText(p));
        /* Merge the CSV-synced dynamic taxonomy (read ONCE per session) before
           matching, then extend this template's category lookup with its entries
           for the merchant's vendor so a new category resolves without an audit. */
        if (window.KanjoDynamicCategories && typeof window.KanjoDynamicCategories.load === 'function') {
            try { await window.KanjoDynamicCategories.load(); } catch (_) { /* static fallback */ }
        }
        const vendorTypeOf = (p) => String((p && (p.category || p.vendor_type || p.vendorType)) || o.vendorType || '').trim();
        const exportVendorType = String(o.vendorType || vendorTypeOf(filtered[0]) || '').trim();
        applyDynamicLookups(lookups, exportVendorType);
        setActiveTemplate(file.name, lookups);
        const evaluations = filtered.map((p) => ({ product: p, match: api.matchProductCategory(p, vendorTypeOf(p)) }));
        /* Assigned category cell per row: explicit audit selection wins, then the
           matcher/stored/learned decision (same precedence as the normal export). */
        const assignedFor = (product, match, selection) => (typeof api.assignedFor === 'function'
            ? api.assignedFor(product, match, selection)
            : (match && match.status === 'matched' ? String(match.category || '') : ''));
        const categoryResolver = (vendorType, assigned) => resolveCategory(lookups, assigned);

        /* Builds the workbook from a (possibly audit-populated) selection map.
           STRICT: every row's category MUST resolve to an ID present in this
           template's `_lookups`. There is no silent fallback to a default/blank
           category — an unresolvable row aborts with a precise message. */
        const finish = async (selected) => {
            const selections = selected || {};
            const unresolved = evaluations.filter((e) => !categoryResolver(
                vendorTypeOf(e.product),
                assignedFor(e.product, e.match, selections[String((e.product && e.product.id) || '')])
            ));
            if (unresolved.length) {
                const labels = unresolved.map((e) => String((e.product && (e.product.name_ar || e.product.name_en)) || (e.product && e.product.id) || '')).filter(Boolean);
                throw new Error('التصنيفات التالية غير موجودة في ورقة _lookups بقالب التاجر ('
                    + unresolved.length + ' منتج). أضفها إلى القالب ثم أعد المحاولة: '
                    + labels.slice(0, 5).join('، ') + (labels.length > 5 ? ' …' : ''));
            }
            const built = await api.buildExportRows(evaluations, selections, undefined, { categoryResolver });

            (built.variantRows || []).forEach((row) => {
                for (let i = 1; i <= 4; i++) {
                    const nameKey = 'attribute_' + i + '_name';
                    const valueKey = 'attribute_' + i + '_value';
                    if (row[nameKey]) row[nameKey] = remapVariantCell(lookups, row[nameKey]);
                    if (row[valueKey]) row[valueKey] = remapVariantCell(lookups, row[valueKey]);
                }
            });

            const productsAoa = readAoa(productsSheet);
            const variantsAoa = readAoa(variantsSheet);
            const productsHeader = findHeaderRow(productsAoa, ['sku', 'product_key', 'name_ar', 'category', 'product_type']);
            const variantsHeader = findHeaderRow(variantsAoa, ['variant_sku', 'product_key', 'attribute_1_name', 'price']);
            const productsMap = buildColumnMap(productsAoa[productsHeader]);
            const variantsMap = buildColumnMap(variantsAoa[variantsHeader]);
            if (!Object.keys(productsMap).length) throw new Error('تعذر مطابقة أعمدة ورقة Products مع القالب');
            if (!Object.keys(variantsMap).length) throw new Error('تعذر مطابقة أعمدة ورقة Variants مع القالب');

            writeRowsIntoSheet(XLSX, workbook.Sheets[productsSheet], productsHeader, productsMap, built.productRows);
            writeRowsIntoSheet(XLSX, workbook.Sheets[variantsSheet], variantsHeader, variantsMap, built.variantRows);

            /* Purge template placeholder/example rows from secondary sheets that
               received no real data for this vendor (ZERO reads; in-memory only), so
               strict validation never reports "product_key must reference a product
               row" against a dummy example we did not write. */
            if (!(built.variantRows || []).length) {
                purgeDataRows(XLSX, workbook.Sheets[variantsSheet], variantsHeader);
            }
            if (additionsSheet) {
                const additionsHeader = findGenericHeaderRow(readAoa(additionsSheet));
                purgeDataRows(XLSX, workbook.Sheets[additionsSheet], additionsHeader);
            }

            const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
            const blob = new Blob([out], { type: MIME_XLSX });
            const merchantName = String(o.merchantName || (filtered[0] && api.merchantNameOf(filtered[0])) || '').trim();
            const fileName = templateOutputName(file.name, merchantName);
            triggerDownload(blob, fileName);
            toast('تم تعبئة قالب التاجر (' + built.productRows.length + ' منتج / ' + built.variantRows.length + ' متغير)');
            return { fileName: fileName, productCount: built.productRows.length, variantCount: built.variantRows.length, lookups: lookups };
        };

        /* STRICT GATE: any row the matcher cannot resolve to a category that
           exists in THIS template routes through the SAME interactive audit modal
           the normal export uses, BEFORE any workbook is produced. We never guess
           and never leave a blank cell. Cancelling the modal simply produces no
           file (the operator retries). */
        const needingAudit = evaluations.filter((e) => !categoryResolver(
            vendorTypeOf(e.product),
            assignedFor(e.product, e.match, undefined)
        ));
        if (needingAudit.length) {
            if (typeof api.openCategoryAudit !== 'function') {
                throw new Error('تعذّر فتح نافذة مراجعة التصنيفات. يرجى تصنيف ' + needingAudit.length + ' منتج يدوياً قبل تعبئة القالب.');
            }
            api.openCategoryAudit(
                needingAudit.map((e) => ({ product: e.product, vendorType: vendorTypeOf(e.product) })),
                (picked) => {
                    finish(picked || {}).catch((err) => {
                        console.error('[templateExport] audited build failed:', err);
                        if (typeof window.Swal === 'object' && window.Swal && typeof window.Swal.fire === 'function') {
                            window.Swal.fire({ icon: 'error', title: 'فشل تعبئة القالب', html: String((err && err.message) || err), confirmButtonText: 'حسناً', confirmButtonColor: '#230535' });
                        } else {
                            toast(String((err && err.message) || err), false);
                        }
                    });
                }
            );
            return { fileName: '', productCount: 0, variantCount: 0, pendingAudit: needingAudit.length, lookups: lookups };
        }
        return finish({});
    };

    /* DOM wiring for the export modal's template button/input. Guarded so the
       module stays usable (and testable) without a DOM. */
    const wireUi = () => {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
        const input = document.getElementById('kanjoTemplateFileInput');
        if (!input || input.__kanjoTemplateWired) return;
        input.__kanjoTemplateWired = true;
        input.addEventListener('change', async (event) => {
            const target = event && event.target;
            const file = target && target.files && target.files[0];
            if (!file) return;
            const select = document.getElementById('merchantExportFilter');
            const merchantName = String((select && select.value) || '').trim();
            const pendingBox = document.getElementById('exportIncludePending');
            try {
                await window.kanjoPopulateVendorTemplate({
                    file: file,
                    merchantName: merchantName,
                    includePending: !!(pendingBox && pendingBox.checked)
                });
            } catch (err) {
                console.error('[templateExport] failed:', err);
                if (typeof window.Swal === 'object' && window.Swal && typeof window.Swal.fire === 'function') {
                    window.Swal.fire({ icon: 'error', title: 'فشل تعبئة القالب', html: String((err && err.message) || err), confirmButtonText: 'حسناً', confirmButtonColor: '#230535' });
                } else {
                    toast(String((err && err.message) || err), false);
                }
            } finally {
                try { target.value = ''; } catch (e) { /* ignore */ }
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireUi);
    } else {
        wireUi();
    }

    window.addEventListener('kanjo:template-wire', wireUi);

    /* Pure helpers exposed for regression tests (no side effects). */
    window.KanjoTemplateExport = {
        parseIdToken: parseIdToken,
        extractLookups: extractLookups,
        applyDynamicLookups: applyDynamicLookups,
        resolveCategory: resolveCategory,
        remapVariantCell: remapVariantCell,
        buildColumnMap: buildColumnMap,
        findHeaderRow: findHeaderRow,
        findGenericHeaderRow: findGenericHeaderRow,
        findSheetName: findSheetName,
        purgeDataRows: purgeDataRows,
        parseTemplateWorkbook: parseTemplateWorkbook,
        writeRowsIntoSheet: writeRowsIntoSheet,
        templateOutputName: templateOutputName,
        pickTemplateCategories: pickTemplateCategories,
        setActiveTemplate: setActiveTemplate,
        getActiveTemplate: getActiveTemplate
    };
})();
