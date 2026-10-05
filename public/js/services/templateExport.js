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

    /* Resolve an assigned category cell to the template's permitted IDs:
       exact name hit first, alias bridge second, first valid category on miss.
       Multiple categories are always joined with "; " as the importer expects. */
    const resolveCategory = (lookups, assigned) => {
        const names = String(assigned == null ? '' : assigned)
            .split(/[;,]/)
            .map(nameFromValue)
            .filter(Boolean);
        if (!names.length) return lookups.firstCategory || '';
        const out = [];
        const seen = new Set();
        names.forEach((name) => {
            let entry = lookups.byCategoryName.get(normKey(name));
            if (!entry) {
                const bridged = bridgeCategoryName(name);
                if (bridged) entry = lookups.byCategoryName.get(normKey(bridged));
            }
            if (!entry && lookups.categories.length) entry = lookups.categories[0];
            if (!entry) return;
            const key = normKey(entry.name);
            if (seen.has(key)) return;
            seen.add(key);
            out.push(entry.full);
        });
        return out.length ? out.join('; ') : (lookups.firstCategory || '');
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

    /* Parse a workbook buffer into { workbook, lookups, sheetNames }. Pure
       in-memory; used by the public entry point and by tests. */
    const parseTemplateWorkbook = (XLSX, buffer) => {
        const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true });
        const productsSheet = findSheetName(workbook, 'products');
        const variantsSheet = findSheetName(workbook, 'variants');
        const lookupsSheet = findSheetName(workbook, 'lookups');
        if (!productsSheet) throw new Error('لم يتم العثور على ورقة Products في القالب');
        if (!variantsSheet) throw new Error('لم يتم العثور على ورقة Variants في القالب');
        if (!lookupsSheet) throw new Error('لم يتم العثور على ورقة _lookups في القالب');
        const readAoa = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, raw: false }) || [];
        const lookups = extractLookups(readAoa(lookupsSheet));
        if (!lookups.all.length) throw new Error('ورقة _lookups لا تحتوي على أي معرّفات صالحة (ID:n | Name)');
        return { workbook, lookups, productsSheet, variantsSheet, lookupsSheet, readAoa };
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
        const { workbook, lookups, productsSheet, variantsSheet, readAoa } = parsed;

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
        const vendorTypeOf = (p) => String((p && (p.category || p.vendor_type || p.vendorType)) || o.vendorType || '').trim();
        const evaluations = filtered.map((p) => ({ product: p, match: api.matchProductCategory(p, vendorTypeOf(p)) }));
        const selections = {};
        const categoryResolver = (vendorType, assigned) => resolveCategory(lookups, assigned);
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

        const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
        const blob = new Blob([out], { type: MIME_XLSX });
        const merchantName = String(o.merchantName || (filtered[0] && api.merchantNameOf(filtered[0])) || '').trim();
        const fileName = templateOutputName(file.name, merchantName);
        triggerDownload(blob, fileName);
        toast('تم تعبئة قالب التاجر (' + built.productRows.length + ' منتج / ' + built.variantRows.length + ' متغير)');
        return { fileName: fileName, productCount: built.productRows.length, variantCount: built.variantRows.length, lookups: lookups };
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
        resolveCategory: resolveCategory,
        remapVariantCell: remapVariantCell,
        buildColumnMap: buildColumnMap,
        findHeaderRow: findHeaderRow,
        findSheetName: findSheetName,
        parseTemplateWorkbook: parseTemplateWorkbook,
        writeRowsIntoSheet: writeRowsIntoSheet,
        templateOutputName: templateOutputName
    };
})();
