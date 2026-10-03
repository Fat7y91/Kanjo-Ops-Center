/* Kanjo Ops — Client-side Vendor ZIP Export
   ----------------------------------------------
   Builds a single .zip for a vendor entirely in the browser (ZERO backend
   calls beyond the reads the dashboard already performs):

     - the Products/Variants Excel workbook (same rows/columns as the normal
       catalog export, produced in-memory instead of downloaded), and
     - the merchant logo (base64 task logo when available, otherwise fetched), and
     - every official document already uploaded to the merchant's Drive folder
       (Commercial Register / Tax Card / Menu).

   Google Drive file ids/urls are persisted on the merchant record by
   merchantDocs.js; here we convert each `file/d/<ID>/view` link to the
   `uc?export=download&id=<ID>` endpoint and fetch it as a blob. Any file whose
   fetch fails (CORS / large-file interstitial / revoked access) is SKIPPED with
   a warning while the ZIP is still produced, and its Drive link is always kept
   in the manifest so nothing is silently lost.
   ---------------------------------------------- */

const vendorZipToast = (message, ok = true) => {
    if (typeof window.showToast === 'function') window.showToast(message, ok);
};

const vendorZipSafeName = (value, fallback) => {
    const safe = String(value == null ? '' : value)
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
    return safe || fallback;
};

const vendorZipExtFromMime = (mime) => {
    const m = String(mime || '').toLowerCase();
    if (m.indexOf('png') !== -1) return 'png';
    if (m.indexOf('jpeg') !== -1 || m.indexOf('jpg') !== -1) return 'jpg';
    if (m.indexOf('webp') !== -1) return 'webp';
    if (m.indexOf('gif') !== -1) return 'gif';
    if (m.indexOf('svg') !== -1) return 'svg';
    return 'bin';
};

/* Drive webViewLink/open link -> direct download endpoint. Falls back to the
   stored id, then to the original url. */
const vendorZipDriveUrl = (file) => {
    const id = String((file && (file.id || file.driveFileId)) || '').trim();
    if (id) return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id);
    const url = String((file && (file.url || file.driveFileUrl)) || '').trim();
    if (!url) return '';
    const match = /\/d\/([^/]+)/.exec(url) || /[?&]id=([^&]+)/.exec(url);
    if (match) return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(match[1]);
    return url;
};

const vendorZipFetchBlob = async (url) => {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    /* Drive responds 200 with an HTML "can't scan for viruses" interstitial for
       some large files; treat HTML as a failed fetch so we fall back to a link. */
    const type = String(blob.type || '').toLowerCase();
    if (type.indexOf('text/html') !== -1) throw new Error('DRIVE_INTERSTITIAL');
    return blob;
};

const vendorZipResolveDocuments = async (merchantId, merchantName) => {
    let record = null;
    if (merchantId && window.merchantsById && typeof window.merchantsById.get === 'function') {
        const cached = window.merchantsById.get(merchantId);
        if (cached) record = cached;
    }
    if ((!record || !record.documents) && merchantId && window.getDoc && window.doc && window.db) {
        try {
            const snap = await window.getDoc(window.doc(window.db, 'merchants', merchantId));
            if (snap && snap.exists && snap.exists()) record = snap.data() || {};
        } catch (err) {
            console.warn('[vendorExport] merchant read failed:', err);
        }
    }
    const documents = (record && record.documents && typeof record.documents === 'object') ? record.documents : {};
    const driveFolderLink = (record && record.driveFolderLink) || '';
    return { documents, driveFolderLink, merchantName: (record && record.name) || merchantName || '' };
};

window.exportVendorZip = async (opts) => {
    const o = opts || {};
    if (!(window.isCatalogAdminUser ? window.isCatalogAdminUser() : false)) {
        vendorZipToast('تصدير التاجر متاح للإدارة فقط', false);
        return;
    }
    if (typeof window.JSZip !== 'function') {
        vendorZipToast('مكتبة الضغط غير محمّلة، أعد تحميل الصفحة', false);
        return;
    }
    const merchantName = String(o.merchantName || '').trim();
    const merchantId = String(o.merchantId || '').trim();
    if (!merchantName && !merchantId) {
        vendorZipToast('تعذر تحديد بيانات التاجر', false);
        return;
    }
    vendorZipToast('جاري تجهيز ملف ZIP للتاجر…', true);
    try {
        const zip = new window.JSZip();
        const warnings = [];
        const resolved = await vendorZipResolveDocuments(merchantId, merchantName);
        const displayName = resolved.merchantName || merchantName || merchantId || 'التاجر';
        const dateStamp = new Date().toISOString().slice(0, 10);

        /* 1) Excel workbook (same content as the catalog export). */
        let excelName = '';
        if (typeof window.kanjoBuildVendorWorkbookBlob === 'function') {
            try {
                const built = await window.kanjoBuildVendorWorkbookBlob({ merchantId, merchantName: displayName, includePending: true });
                if (built && built.blob) {
                    excelName = built.fileName || ('Products_' + vendorZipSafeName(displayName, 'vendor') + '.xlsx');
                    zip.file(excelName, built.blob);
                } else {
                    warnings.push('لا توجد منتجات لهذا التاجر، تم تخطي ملف Excel');
                }
            } catch (err) {
                console.warn('[vendorExport] excel build failed:', err);
                warnings.push('تعذر توليد ملف Excel: ' + (err && err.message ? err.message : 'خطأ'));
            }
        }

        /* 2) Logo: prefer the already-embedded base64 task logo. */
        const logoSource = String(o.logo || '').trim();
        if (logoSource) {
            try {
                let blob;
                if (logoSource.indexOf('data:') === 0) {
                    blob = await (await fetch(logoSource)).blob();
                } else {
                    const logoUrl = vendorZipDriveUrl({ url: logoSource });
                    blob = await vendorZipFetchBlob(logoUrl);
                }
                zip.file('logo.' + vendorZipExtFromMime(blob.type), blob);
            } catch (err) {
                console.warn('[vendorExport] logo fetch failed:', err);
                warnings.push('تعذر إضافة شعار التاجر');
            }
        }

        /* 3) Official documents, grouped by their Arabic label. */
        const docLabels = { commercial: 'السجل التجاري', tax: 'البطاقة الضريبية', menu: 'المنيو' };
        const documents = resolved.documents || {};
        const linkLines = [];
        const docKeys = Object.keys(documents).filter((key) => documents[key]);
        /* First pass: collect the manifest links (so they survive even when the
           binary fetch below fails). */
        docKeys.forEach((key) => {
            const entry = documents[key];
            const label = docLabels[key] || key;
            const files = Array.isArray(entry.files) ? entry.files : [];
            const fallbackNames = Array.isArray(entry.names) ? entry.names : [];
            const list = files.length ? files : fallbackNames.map((n) => ({ name: n }));
            list.forEach((file, idx) => {
                const url = vendorZipDriveUrl(file);
                if (!url) return;
                linkLines.push('[' + label + '] ' + ((file && file.name) || fallbackNames[idx] || ('document_' + (idx + 1))) + ': ' + url);
            });
        });
        /* Second pass: sequential fetch (order matters for readable progress). */
        for (const key of docKeys) {
            const entry = documents[key];
            const label = docLabels[key] || key;
            const folderName = vendorZipSafeName(label, key);
            const files = Array.isArray(entry.files) ? entry.files : [];
            const fallbackNames = Array.isArray(entry.names) ? entry.names : [];
            const list = files.length ? files : fallbackNames.map((n) => ({ name: n }));
            for (let idx = 0; idx < list.length; idx++) {
                const file = list[idx];
                const url = vendorZipDriveUrl(file);
                if (!url) continue;
                const rawName = (file && file.name) || fallbackNames[idx] || ('document_' + (idx + 1));
                const baseName = vendorZipSafeName(rawName, 'document');
                const path = 'المستندات/' + folderName + '/' + baseName;
                try {
                    const blob = await vendorZipFetchBlob(url);
                    zip.file(path, blob, { binary: true });
                } catch (err) {
                    console.warn('[vendorExport] doc fetch skipped:', baseName, err && err.message);
                    warnings.push('تعذر تنزيل: ' + baseName);
                    /* Keep a pointer file so the attachment is still reachable. */
                    zip.file(path + '.link.txt', 'Google Drive: ' + url);
                }
            }
        }

        /* 4) Manifest with counts, links and any skipped items. */
        const manifest = [
            'Kanjo Ops — Vendor Export',
            'Merchant: ' + displayName,
            'Merchant ID: ' + (merchantId || '-'),
            'Date: ' + dateStamp,
            'Excel: ' + (excelName || 'غير متوفر'),
            'Drive folder: ' + (resolved.driveFolderLink || o.driveFolderLink || '-'),
            '',
            'Document links:',
            linkLines.length ? linkLines.join('\n') : '(لا توجد مستندات محفوظة)',
            '',
            warnings.length ? ('Warnings:\n- ' + warnings.join('\n- ')) : 'Warnings: none'
        ].join('\n');
        zip.file('README.txt', manifest);

        const zipName = 'Vendor_' + vendorZipSafeName(displayName, 'vendor') + '_' + dateStamp + '.zip';
        const blob = await zip.generateAsync({ type: 'blob' });
        if (typeof window.saveAs === 'function') {
            window.saveAs(blob, zipName);
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        vendorZipToast(warnings.length
            ? ('تم إنشاء ملف ZIP مع تنبيهات (' + warnings.length + ')')
            : 'تم إنشاء ملف ZIP للتاجر بنجاح');
    } catch (err) {
        console.error('[vendorExport] zip build failed:', err);
        vendorZipToast('تعذر إنشاء ملف ZIP: ' + (err && err.message ? err.message : 'خطأ'), false);
    }
};

window.exportVendorZipForTask = async (taskId) => {
    const id = String(taskId || '');
    let task = (Array.isArray(window.allTasksCache) ? window.allTasksCache : []).find((t) => t && t.id === id) || null;
    if (!task && window.tasksMemory && typeof window.tasksMemory.get === 'function' && window.tasksMemory.get(id)) {
        task = Object.assign({ id }, window.tasksMemory.get(id));
    }
    if (!task) {
        vendorZipToast('تعذر العثور على بيانات التاجر', false);
        return;
    }
    const name = task.name || task.merchantName || '';
    const baseName = (typeof window.getBaseName === 'function' && name) ? window.getBaseName(name) : name;
    const merchantId = task.merchantId
        || (window.findMerchantIdForBase ? (window.findMerchantIdForBase(baseName) || '') : '');
    return window.exportVendorZip({
        merchantId,
        merchantName: baseName || name,
        logo: task.merchantLogo || task.logoDataUri || '',
        driveFolderLink: task.driveFolderLink || ''
    });
};

/* Bridge used by every merchant export surface (the dashboard export dropdown
   and the merchant-profile card). It resolves the selected merchant name to its
   most recent task and hands the task id straight to exportVendorZipForTask, so
   all exports share the one ZIP pipeline. When no task is in memory it still
   builds the full ZIP straight from the merchant record (including the stored
   logo), so the bundle is never downgraded to a bare .xlsx. */
window.exportVendorZipForMerchant = (merchantName) => {
    const name = String(merchantName || '').trim();
    if (!name) {
        vendorZipToast('اختر التاجر أولاً', false);
        return;
    }
    const base = (typeof window.getBaseName === 'function') ? window.getBaseName(name) : name;
    const tasks = Array.isArray(window.allTasksCache) ? window.allTasksCache : [];
    const baseOf = (t) => {
        const raw = (t && (t.name || t.merchantName)) || '';
        return (typeof window.getBaseName === 'function') ? window.getBaseName(raw) : raw;
    };
    const matches = tasks.filter((t) => t && (baseOf(t) === base || (t.merchantId && t.merchantId === base)));
    const task = matches.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    if (task && task.id) return window.exportVendorZipForTask(task.id);
    const logoTask = matches.find((t) => t.merchantLogo);
    const merchantId = (window.findMerchantIdForBase ? (window.findMerchantIdForBase(base) || '') : '');
    return window.exportVendorZip({
        merchantId,
        merchantName: base || name,
        logo: logoTask ? logoTask.merchantLogo : ''
    });
};

export { };
