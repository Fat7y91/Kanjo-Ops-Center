/* Kanjo Ops — Merchant Documents & Google Drive Integration
   ----------------------------------------------
   Uploads official merchant documents (Commercial Register / Tax ID / Menu)
   to a dedicated, automatically-created Google Drive folder and stores the
   folder link back on the merchant's permanent record.

   Identity model:
   - Every merchant has an immutable `merchantId` (e.g. KJ-XXXXXX) that is the
     permanent key for backend lookups and Drive binding. It is NEVER derived
     from the merchant name, so admins can rename merchants without breaking
     the Drive link.
   - The Drive folder is named with the human-readable merchant name (plus the
     merchantId for uniqueness) so it stays easy to browse in Drive.
   - The authoritative record lives in Firestore `merchants/{merchantId}`; the
     link is also mirrored onto the merchant's `tasks` docs so cards render
     instantly from the already-in-memory data.
   ---------------------------------------------- */

/* ─── Unique Merchant ID (immutable primary key) ─── */

const MERCHANT_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

window.generateMerchantId = () => {
    const rand = new Uint8Array(6);
    if (window.crypto && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(rand);
    } else {
        for (let i = 0; i < rand.length; i++) rand[i] = Math.floor(Math.random() * 256);
    }
    let code = '';
    for (let i = 0; i < rand.length; i++) code += MERCHANT_ID_ALPHABET[rand[i] % MERCHANT_ID_ALPHABET.length];
    return 'KJ-' + code;
};

/* Find an already-assigned merchantId for a base-name group (if any).
   Immutability rule: the merchantId is the permanent, unchanging identity of a
   merchant. It is NEVER regenerated or overwritten once persisted. This lookup
   checks BOTH the in-memory task docs and the authoritative `merchants`
   collection, so even when no task doc for this base name is currently loaded
   (e.g. legacy rows or a merchant whose tasks were just created), the stored
   merchantId is reused instead of minting a fresh one. */
window.findMerchantIdForBase = (baseName) => {
    if (!baseName) return null;
    baseName = getBaseName(baseName);
    if (window.tasksMemory && window.tasksMemory.size > 0) {
        for (const [, td] of window.tasksMemory) {
            if (td && td.merchantId && getBaseName(td.name) === baseName) return td.merchantId;
        }
    }
    if (window.merchantsById && window.merchantsById.size > 0) {
        for (const [mid, rec] of window.merchantsById) {
            if (rec && rec.name && getBaseName(rec.name) === baseName) return mid;
        }
    }
    return null;
};

/* Reuse an existing merchantId for the group, otherwise mint a fresh one.
   Caller is responsible for persisting it on the doc it creates. */
window.getOrCreateMerchantId = (baseName, taskData) => {
    const existing = window.findMerchantIdForBase(baseName);
    if (existing) return existing;
    return (taskData && taskData.merchantId) || window.generateMerchantId();
};

/* One-time client-side backfill: assign a merchantId to every task doc that
   still lacks one, grouped by base-name, and upsert the authoritative merchant
   record. Chunked to stay under Firestore's 500-op batch limit. Runs safely
   alongside the existing signed-contract migration. */
window.ensureMerchantIds = async () => {
    if (!window.tasksMemory || window.tasksMemory.size === 0) return;
    if (window._merchantIdMigrationRunning) return;
    window._merchantIdMigrationRunning = true;

    const groups = new Map();
    window.tasksMemory.forEach((td, id) => {
        const base = getBaseName(td.name);
        if (!base) return;
        if (!groups.has(base)) {
            groups.set(base, { ids: [], merchantId: window.findMerchantIdForBase(base) });
        }
        groups.get(base).ids.push(id);
    });

    const updates = [];
    groups.forEach((g, base) => {
        if (!g.merchantId) g.merchantId = window.generateMerchantId();
        g.ids.forEach((id) => {
            const td = window.tasksMemory.get(id);
            if (!td || td.merchantId === g.merchantId) return;
            updates.push({ ref: doc(db, "tasks", id), data: { merchantId: g.merchantId } });
        });
    });

    try {
        for (let i = 0; i < updates.length; i += 450) {
            const chunk = updates.slice(i, i + 450);
            const batch = writeBatch(db);
            chunk.forEach((u) => batch.update(u.ref, u.data));
            await batch.commit();
        }
        if (updates.length > 0) {
            updates.forEach((u) => {
                const td = window.tasksMemory.get(u.ref.id);
                if (td) td.merchantId = u.data.merchantId;
            });
            console.log(`[merchantId] assigned to ${updates.length} task doc(s)`);
        }
    } catch (err) {
        console.error("[merchantId] migration write failed (will retry on next snapshot):", err);
    } finally {
        window._merchantIdMigrationRunning = false;
    }
};

/* ─── Drive folder lookup helpers ─── */

/* Builds a fast lookup map baseName / merchantId → { merchantId, driveFolderLink,
   driveFolderId }. Prefer the authoritative merchants record, fall back to the
   drive link mirrored on task docs. */
window.buildDriveLookup = () => {
    const map = new Map();
    if (window.tasksMemory && window.tasksMemory.size > 0) {
        window.tasksMemory.forEach((td) => {
            if (!td || !td.driveFolderLink) return;
            const base = getBaseName(td.name);
            const rec = {
                merchantId: td.merchantId || '',
                driveFolderLink: td.driveFolderLink,
                driveFolderId: td.driveFolderId || '',
                base
            };
            const key = td.merchantId || base;
            if (!map.has(key)) map.set(key, rec);
            if (base && !map.has(base)) map.set(base, rec);
        });
    }
    if (window.merchantsById && window.merchantsById.size > 0) {
        window.merchantsById.forEach((r, mid) => {
            if (!r || !r.driveFolderLink) return;
            const rec = {
                merchantId: mid,
                driveFolderLink: r.driveFolderLink,
                driveFolderId: r.driveFolderId || '',
                base: r.name || ''
            };
            map.set(mid, rec);
            if (rec.base && !map.has(rec.base)) map.set(rec.base, rec);
        });
    }
    return map;
};

window.getMerchantDocsInfo = (task) => {
    const lookup = window.buildDriveLookup();
    const base = getBaseName(task ? task.name : '');
    const mid = (task && task.merchantId) || window.findMerchantIdForBase(base) || '';
    return (mid && lookup.get(mid)) || lookup.get(base) || { merchantId: mid, driveFolderLink: '', driveFolderId: '' };
};

/* Renders the "ملفات التاجر الرسمية" action button into a given container
   (used by the merchant profile modal). Keyed on the permanent merchantId. */
window.renderDriveFolderSection = (container, merchantBaseName) => {
    if (!container) return;
    const mid = (window.findMerchantIdForBase ? window.findMerchantIdForBase(merchantBaseName) : '') || '';
    const info = window.getMerchantDocsInfo({ name: merchantBaseName, merchantId: mid });
    if (info && info.driveFolderLink) {
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <i class="fa-brands fa-google-drive text-emerald-600 text-xl"></i>
                    <div>
                        <div class="text-xs font-black text-emerald-900">ملفات التاجر الرسمية</div>
                        <div class="text-[10px] text-emerald-700 font-bold">السجل التجاري — البطاقة الضريبية — المنيو</div>
                    </div>
                </div>
                <button onclick="openDriveFolder('${window.safeString(info.merchantId || '')}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm">
                    <i class="fa-solid fa-folder-open"></i> فتح المجلد
                </button>
            </div>`;
    } else {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
};

/* Open the merchant's Google Drive folder in a new tab. Accepts either a
   merchantId string or a task object / task id. */
window.openDriveFolder = (ref) => {
    let info = null;
    if (ref && typeof ref === 'object') {
        info = window.getMerchantDocsInfo(ref);
    } else if (typeof ref === 'string' && ref) {
        if (window.merchantsById && window.merchantsById.has(ref)) {
            const rec = window.merchantsById.get(ref);
            if (rec && rec.driveFolderLink) info = { merchantId: ref, driveFolderLink: rec.driveFolderLink };
        }
        if (!info) {
            const task = (window.allTasksCache || []).find(t => t.id === ref)
                || (window.tasksMemory && window.tasksMemory.get(ref))
                || (window.allTasksCache || []).find(t => (t.merchantId || '') === ref);
            if (task) info = window.getMerchantDocsInfo(task);
        }
    }
    if (info && info.driveFolderLink) {
        window.open(info.driveFolderLink, '_blank', 'noopener,noreferrer');
    } else {
        showToast("لم يتم رفع مستندات لهذا التاجر بعد", false);
    }
};

/* ─── Upload modal state ─── */

const DOC_TYPES = [
    { key: 'commercial', label: 'السجل التجاري' },
    { key: 'tax', label: 'البطاقة الضريبية' },
    { key: 'menu', label: 'المنيو' }
];

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

window.resetMerchantDocsUI = () => {
    if (!window.merchantDocsDraft) window.merchantDocsDraft = { taskId: '', baseName: '', merchantId: '', files: {} };
    window.merchantDocsDraft.files = {};
    ['commercial', 'tax', 'menu'].forEach((k) => {
        const input = document.getElementById('md' + k.charAt(0).toUpperCase() + k.slice(1));
        if (input) input.value = '';
        const chip = document.getElementById('md' + k.charAt(0).toUpperCase() + k.slice(1) + 'Chip');
        if (chip) {
            chip.classList.add('hidden');
            chip.querySelector('span').innerText = '';
        }
    });
    const btn = document.getElementById('mdSubmitBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-google-drive ml-1"></i>رفع إلى Google Drive';
    }
};

window.openMerchantDocsModal = (taskId) => {
    if (!window.KANJO_DRIVE_SCRIPT_URL || !window.KANJO_DRIVE_SCRIPT_URL.trim()) {
        showToast("ميزة رفع المستندات غير مفعّلة بعد — الرجاء إعداد رابط Google Drive من الإدارة", false);
        return;
    }

    let task = (window.allTasksCache || []).find(t => t.id === taskId);
    if (!task && window.tasksMemory && window.tasksMemory.has(taskId)) {
        task = { id: taskId, ...window.tasksMemory.get(taskId) };
    }
    if (!task) return showToast("تعذر العثور على بيانات التاجر", false);

    const baseName = getBaseName(task.name);
    const merchantId = window.getOrCreateMerchantId(baseName, task);

    window.merchantDocsDraft = { taskId, baseName, merchantId, files: {} };

    document.getElementById('mdMerchantName').innerText = baseName;
    document.getElementById('mdMerchantId').innerText = merchantId;

    window.resetMerchantDocsUI();

    const info = window.getMerchantDocsInfo(task);
    const existing = document.getElementById('mdExistingFolder');
    if (info && info.driveFolderLink) {
        existing.classList.remove('hidden');
        existing.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <i class="fa-brands fa-google-drive text-emerald-600 text-xl"></i>
                    <div>
                        <div class="text-xs font-black text-emerald-900">يوجد مجلد مخصص لهذا التاجر</div>
                        <div class="text-[10px] text-emerald-700 font-bold">سيتم إضافة المستندات الجديدة إلى نفس المجلد</div>
                    </div>
                </div>
                <button onclick="openDriveFolder('${window.safeString(merchantId)}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm">
                    <i class="fa-solid fa-folder-open"></i> فتح المجلد
                </button>
            </div>`;
    } else {
        existing.classList.add('hidden');
        existing.innerHTML = '';
    }

    document.getElementById('merchantDocsModal').classList.remove('hidden');
};

window.closeMerchantDocsModal = () => {
    document.getElementById('merchantDocsModal').classList.add('hidden');
    if (window.merchantDocsDraft) window.merchantDocsDraft.files = {};
};

const docTypeLabel = (key) => {
    const dt = DOC_TYPES.find(d => d.key === key);
    return dt ? dt.label : key;
};

/* Update the selection chip for a doc type (count + total size). */
const updateMerchantDocsChip = (docType) => {
    const files = (window.merchantDocsDraft && window.merchantDocsDraft.files[docType]) || [];
    const cap = docType.charAt(0).toUpperCase() + docType.slice(1);
    const chip = document.getElementById('md' + cap + 'Chip');
    if (!chip) return;
    if (files.length === 0) {
        chip.classList.add('hidden');
        chip.querySelector('span').innerText = '';
        return;
    }
    chip.classList.remove('hidden');
    const totalKB = files.reduce((s, f) => s + Math.ceil((f.size || 0) / 1024), 0);
    const names = files.map(f => f.name).join('، ');
    chip.querySelector('span').innerText = `${files.length} ملف — إجمالي ${totalKB} KB: ${names}`;
};

window.handleMerchantDocSelect = (docType, event) => {
    const input = event.target;
    const fileList = input && input.files ? Array.from(input.files) : [];
    if (fileList.length === 0) return;
    if (!window.merchantDocsDraft) {
        input.value = '';
        return;
    }

    const oversized = fileList.find(f => f.size > MAX_FILE_BYTES);
    if (oversized) {
        showToast(`حجم الملف ${oversized.name} كبير جداً (الحد الأقصى 15 ميجا للملف الواحد)`, false);
        input.value = '';
        return;
    }

    if (!Array.isArray(window.merchantDocsDraft.files[docType])) {
        window.merchantDocsDraft.files[docType] = [];
    }
    const filesArr = window.merchantDocsDraft.files[docType];

    let pending = fileList.length;
    let readFailed = false;
    fileList.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = String(e.target.result || '');
            const commaIdx = dataUrl.indexOf(',');
            const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
            filesArr.push({
                name: file.name,
                size: file.size,
                mime: file.type || 'application/octet-stream',
                base64
            });
            pending--;
            if (pending === 0) updateMerchantDocsChip(docType);
        };
        reader.onerror = () => {
            pending--;
            readFailed = true;
            if (pending === 0) {
                input.value = '';
                updateMerchantDocsChip(docType);
                showToast("فشل قراءة ملف، حاول مرة أخرى", false);
            }
        };
        reader.readAsDataURL(file);
    });
};

/* Call the Google Apps Script Web App endpoint. Uses a text/plain body so the
   browser does not trigger a CORS preflight against the Apps Script host. */
const callDriveScript = async (payload) => {
    const url = (window.KANJO_DRIVE_SCRIPT_URL || '').trim();
    if (!url) throw new Error('NO_SCRIPT_URL');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { /* Apps Script may return text on failure */ }
        if (!res.ok) {
            throw new Error((data && data.message) || ('HTTP ' + res.status));
        }
        if (!data || data.success !== true) {
            throw new Error((data && data.message) || 'DRIVE_SCRIPT_REJECTED');
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
};

window.persistDriveFolder = async (merchantId, folderId, folderLink, merchantName, docs = []) => {
    const now = new Date();
    const by = (window.currentUser && window.currentUser.name) || '';

    /* Build a per-docType audit map (commercial / tax / menu). Merge with any
       previously tracked documents so re-uploads append without wiping data. */
    const docsByType = {};
    (Array.isArray(docs) ? docs : []).forEach((d) => {
        if (!d || !d.docType) return;
        const key = String(d.docType);
        if (!docsByType[key]) docsByType[key] = [];
        if (d.name) docsByType[key].push(d.name);
    });
    let documents = {};
    if (window.merchantsById && window.merchantsById.has(merchantId)) {
        const existingRec = window.merchantsById.get(merchantId);
        if (existingRec && existingRec.documents && typeof existingRec.documents === 'object') {
            documents = { ...existingRec.documents };
        }
    }
    Object.entries(docsByType).forEach(([key, names]) => {
        const prev = (documents[key] && typeof documents[key] === 'object') ? documents[key] : {};
        documents[key] = {
            uploaded: true,
            count: (Number(prev.count) || 0) + names.length,
            names: (Array.isArray(prev.names) ? prev.names : []).concat(names),
            lastUploadAt: now,
            lastUploadedBy: by
        };
    });

    const merchantRec = {
        merchantId,
        name: merchantName,
        driveFolderId: folderId,
        driveFolderLink: folderLink,
        docsUpdatedAt: now,
        docsUpdatedBy: by
    };

    if (Object.keys(documents).length > 0) merchantRec.documents = documents;

    /* Authoritative merchant record (upsert). */
    try {
        await setDoc(doc(db, "merchants", merchantId), merchantRec, { merge: true });
    } catch (err) {
        console.error("[merchantDocs] merchants upsert failed:", err);
    }

    /* Mirror the link onto every task doc of the merchant so the dashboard
       cards can render the Drive button instantly from in-memory data. */
    const batch = writeBatch(db);
    let count = 0;
    if (window.tasksMemory && window.tasksMemory.size > 0) {
        window.tasksMemory.forEach((td, id) => {
            const matchById = td.merchantId === merchantId;
            const matchByBase = getBaseName(td.name) === merchantName;
            if (matchById || matchByBase) {
                /* Immutability rule: never overwrite a task's existing merchantId
                   with a different value. Only stamp the field when the task has
                   no merchantId yet or already holds the same one. */
                const updatePayload = {
                    driveFolderId: folderId,
                    driveFolderLink: folderLink,
                    docsUpdatedAt: now,
                    docsUpdatedBy: by
                };
                if (!td.merchantId || td.merchantId === merchantId) {
                    updatePayload.merchantId = merchantId;
                }
                batch.update(doc(db, "tasks", id), updatePayload);
                count++;
            }
        });
    }
    if (count > 0) {
        try {
            await batch.commit();
        } catch (err) {
            console.error("[merchantDocs] task mirror failed:", err);
        }
    }

    /* Update local in-memory state. */
    if (window.tasksMemory) {
        window.tasksMemory.forEach((td) => {
            if (td.merchantId === merchantId || getBaseName(td.name) === merchantName) {
                td.merchantId = merchantId;
                td.driveFolderId = folderId;
                td.driveFolderLink = folderLink;
                td.docsUpdatedAt = now;
                td.docsUpdatedBy = by;
            }
        });
    }
    if (window.allTasksCache) {
        window.allTasksCache.forEach((t) => {
            if (t.merchantId === merchantId || getBaseName(t.name) === merchantName) {
                t.merchantId = merchantId;
                t.driveFolderLink = folderLink;
            }
        });
    }
    if (window.merchantsById) window.merchantsById.set(merchantId, merchantRec);

    if (window.lastSnapshot && typeof window.renderDashboard === 'function') {
        window.renderDashboard(window.lastSnapshot);
    }
};

window.submitMerchantDocs = async () => {
    if (!window.merchantDocsDraft) return;

    const draftFiles = window.merchantDocsDraft.files || {};
    const allFiles = [];
    Object.entries(draftFiles).forEach(([docType, arr]) => {
        (Array.isArray(arr) ? arr : []).forEach((f) => {
            allFiles.push({ docType, ...f });
        });
    });

    if (allFiles.length === 0) {
        showToast("اختر ملفاً واحداً على الأقل للرفع (السجل التجاري، البطاقة الضريبية، أو المنيو)", false);
        return;
    }
    const totalBytes = allFiles.reduce((s, f) => s + (f.size || 0), 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
        showToast("إجمالي الملفات يتجاوز الحد المسموح (40 ميجا)", false);
        return;
    }

    const btn = document.getElementById('mdSubmitBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin ml-1"></i>جاري رفع ${allFiles.length} ملف إلى Google Drive...`;
    }

    const draft = window.merchantDocsDraft;

    /* De-duplicate file names per doc type so same-named files (e.g. two
       "scan.pdf") do not overwrite each other in the merchant Drive folder. */
    const usedNames = {};
    const payloadFiles = allFiles.map((f) => {
        let name = f.name;
        const cap = f.docType.charAt(0).toUpperCase() + f.docType.slice(1);
        const key = cap + '|' + name;
        if (usedNames[key] !== undefined) {
            const dot = name.lastIndexOf('.');
            const base = dot > 0 ? name.slice(0, dot) : name;
            const ext = dot > 0 ? name.slice(dot) : '';
            name = `${base} (${++usedNames[key]})${ext}`;
        } else {
            usedNames[key] = 1;
        }
        return {
            docType: f.docType,
            label: docTypeLabel(f.docType),
            name,
            mimeType: f.mime,
            base64: f.base64
        };
    });

    const payload = {
        token: (window.KANJO_DRIVE_SCRIPT_TOKEN || '').trim(),
        merchantId: draft.merchantId,
        merchantName: draft.baseName,
        files: payloadFiles
    };

    try {
        const data = await callDriveScript(payload);
        const folderId = (data && (data.driveFolderId || data.folderId)) || '';
        const folderLink = (data && (data.driveFolderLink || data.folderUrl)) || '';

        if (!folderLink) throw new Error('NO_FOLDER_LINK');

        const uploadedDocs = payloadFiles.map((f) => ({ docType: f.docType, name: f.name }));

        await window.persistDriveFolder(draft.merchantId, folderId, folderLink, draft.baseName, uploadedDocs);

        window.closeMerchantDocsModal();
        showToast("تم رفع المستندات إلى Google Drive وربطها بسجل التاجر بنجاح");
    } catch (err) {
        console.error("[merchantDocs] upload failed:", err);
        let msg = "فشل رفع المستندات، حاول مرة أخرى";
        if (err && err.message === 'NO_SCRIPT_URL') msg = "ميزة رفع المستندات غير مفعّلة بعد (رابط Google Drive غير مضبوط)";
        else if (err && err.message === 'NO_FOLDER_LINK') msg = "تم الرفع لكن تعذر الحصول على رابط المجلد، يرجى إبلاغ الإدارة";
        else if (err && err.name === 'AbortError') msg = "انتهت مهلة الرفع، حاول مرة أخرى";
        showToast(msg, false);
    } finally {
        const b = document.getElementById('mdSubmitBtn');
        if (b) {
            b.disabled = false;
            b.innerHTML = '<i class="fa-solid fa-google-drive ml-1"></i>رفع إلى Google Drive';
        }
    }
};

export { DOC_TYPES };
