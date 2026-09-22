/* Kanjo Ops — Server-side contract generation bridge.
 *
 * The heavy layout/render work runs in the `generateMerchantContract` callable
 * Cloud Function (Chromium on the server). A second, lightweight callable
 * (`getMerchantContract`) only checks whether a PDF already exists and returns
 * a fresh signed URL, so the modal can offer an instant "view existing" action
 * instead of forcing a slow re-render.
 *
 * Issuing contracts is restricted to the designated operations manager
 * (Mahmoud); founders and reps keep a clean, read-only view. */

const contractEl = (id) => document.getElementById(id);

window.canGenerateContracts = () => {
    if (typeof window.isMahmoudOpsUser === 'function') return !!window.isMahmoudOpsUser();
    return String((window.currentUser && window.currentUser.name) || '').includes('محمود');
};

/* Best-effort merchant identifier: prefer the stored id, then derive it from the
 * merchant base name, and only fall back to the task id. Kept in one place so the
 * existence check and the generator always target the same storage path. */
window.resolveContractMerchantId = (task) => {
    if (!task) return '';
    const baseName = window.getBaseName ? window.getBaseName(task.name) : task.name;
    return String(
        task.merchantId
        || task.merchant_id
        || (window.findMerchantIdForBase && baseName ? window.findMerchantIdForBase(baseName) : '')
        || task.id
        || ''
    ).trim();
};

window.buildContractCallablePayload = (task) => {
    if (!task) return null;

    const baseName = window.getBaseName ? window.getBaseName(task.name) : task.name;
    const info = typeof window.getMerchantBusinessInfo === 'function'
        ? window.getMerchantBusinessInfo(task)
        : { baseName, cat: task.cat || 'غير محدد', businessType: 'منشأة', achieved: Number(task.achieved) || 0 };

    const merchantId = window.resolveContractMerchantId(task);

    const toggleEl = contractEl('cpExceptionToggle');
    const exceptionsEnabled = toggleEl ? toggleEl.checked : false;

    let baseCommission = null;
    let exceptions = [];
    if (exceptionsEnabled) {
        const baseEl = contractEl('cpBaseCommission');
        const baseRaw = baseEl ? baseEl.value : '';
        baseCommission = (baseRaw !== '' && !isNaN(parseFloat(baseRaw))) ? parseFloat(baseRaw) : null;
        exceptions = typeof window.collectCommissionExceptions === 'function'
            ? window.collectCommissionExceptions()
            : [];
    }

    let contactName = '';
    let contactRole = '';
    let contactPhone = '';
    if (Array.isArray(task.reports) && task.reports.length > 0) {
        const lastRep = task.reports[task.reports.length - 1] || {};
        contactName = lastRep.contactName || '';
        contactRole = lastRep.contactRole || '';
        contactPhone = lastRep.contactPhone || '';
    }

    return {
        merchantId,
        merchantName: baseName || task.name,
        category: info.cat,
        businessType: info.businessType,
        titleBusinessType: window.contractBusinessTypeOverride || '',
        commissionRate: Number(info.achieved) || 0,
        vipPreContract: info.vipPreContract === true,
        commission: { baseCommission, exceptions },
        contactName,
        contactRole,
        contactPhone,
        address: task.address || '',
        notes: task.notes || '',
        merchantLogo: window.currentMerchantLogoBase64 || ''
    };
};

const CONTRACT_CALLABLE_ERRORS = {
    unauthenticated: 'يجب تسجيل الدخول لإصدار العقد.',
    'invalid-argument': 'بيانات العقد غير مكتملة، تأكد من اسم التاجر ومعرّفه.',
    'permission-denied': 'إصدار العقود متاح لمدير التشغيل (أ/ محمود) فقط.',
    internal: 'تعذر إنشاء ملف العقد على الخادم، حاول مرة أخرى.',
    unavailable: 'خدمة إصدار العقود غير متاحة حالياً، حاول لاحقاً.',
    'deadline-exceeded': 'استغرق إنشاء العقد وقتاً أطول من المتوقع، حاول مرة أخرى.'
};

const contractCallableErrorMessage = (err) => {
    const code = String((err && err.code) || '').replace(/^functions\//, '');
    if (CONTRACT_CALLABLE_ERRORS[code]) return CONTRACT_CALLABLE_ERRORS[code];
    const serverMessage = err && err.message ? String(err.message) : '';
    return serverMessage || 'تعذر إنشاء العقد على الخادم، حاول مرة أخرى.';
};

/* ─── Modal button state ──────────────────────────────────────────────────────
 * The footer offers one of two primary actions depending on whether a PDF is
 * already stored for the merchant, plus a secondary collapsible re-issue action.
 * These helpers toggle visibility and busy states without touching layout. */

const contractButtons = () => ({
    generate: contractEl('cpGenerateContractBtn'),
    view: contractEl('cpViewContractBtn'),
    regenerate: contractEl('cpRegenerateContractBtn'),
    regenerateSection: contractEl('cpRegenerateSection'),
    banner: contractEl('cpContractStateBanner')
});

const setHidden = (el, hidden) => {
    if (el) el.classList.toggle('hidden', hidden);
};

const BUSY_BANNER_CLASS = 'mb-3 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2';
const READY_BANNER_CLASS = 'mb-3 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2';

const showContractBanner = (state) => {
    const { banner } = contractButtons();
    if (!banner) return;
    if (state === 'none') {
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');
    if (state === 'checking') {
        banner.className = BUSY_BANNER_CLASS;
        banner.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-1"></i>جاري التحقق من العقد المحفوظ...';
    } else {
        banner.className = READY_BANNER_CLASS;
        banner.innerHTML = '<i class="fa-solid fa-circle-check ml-1"></i>يوجد عقد محفوظ مسبقاً لهذا التاجر.';
    }
};

/* Reflect an existence result in the footer: no stored PDF → the generate
 * button; stored PDF → the instant "view existing" button plus the collapsible
 * re-issue option. */
window.applyContractAvailability = (result) => {
    const { generate, view, regenerateSection } = contractButtons();
    const exists = !!(result && result.exists);
    setHidden(generate, exists);
    setHidden(view, !exists);
    setHidden(regenerateSection, !exists);
    showContractBanner(exists ? 'exists' : 'none');
};

/* Neutral "we don't know yet" state, used the moment the modal opens. */
window.resetContractAvailabilityUI = () => {
    window.contractAvailability = null;
    const { generate, view, regenerateSection } = contractButtons();
    setHidden(generate, false);
    setHidden(view, true);
    setHidden(regenerateSection, true);
    showContractBanner('checking');
};

window.setContractGenerateLoading = (loading) => {
    const { generate, regenerate, view } = contractButtons();
    if (loading) {
        [generate, regenerate].forEach((btn) => {
            if (!btn) return;
            if (!btn.dataset.idleHtml) btn.dataset.idleHtml = btn.innerHTML;
            btn.disabled = true;
        });
        if (generate) generate.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري إصدار العقد...';
        if (regenerate) regenerate.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري إعادة الإصدار...';
        if (view) view.disabled = true;
    } else {
        [generate, regenerate].forEach((btn) => {
            if (!btn) return;
            btn.disabled = false;
            if (btn.dataset.idleHtml) btn.innerHTML = btn.dataset.idleHtml;
        });
        if (view) view.disabled = false;
    }
};

const setContractViewLoading = (loading) => {
    const { view } = contractButtons();
    if (!view) return;
    if (loading) {
        if (!view.dataset.idleHtml) view.dataset.idleHtml = view.innerHTML;
        view.disabled = true;
        view.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري فتح العقد...';
    } else {
        view.disabled = false;
        if (view.dataset.idleHtml) view.innerHTML = view.dataset.idleHtml;
    }
};

const openServerContractPdf = (url) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
};

const callGetMerchantContract = async (merchantId) => {
    if (typeof window.httpsCallable !== 'function' || !window.functions) {
        throw new Error('خدمة العقود غير محمّلة، أعد تحديث الصفحة.');
    }
    const callable = window.httpsCallable(window.functions, 'getMerchantContract');
    const response = await callable({ merchantId });
    return (response && response.data) || {};
};

const currentContractTask = () => {
    const taskIdEl = contractEl('cpTaskId');
    const taskId = taskIdEl ? taskIdEl.value : '';
    return (window.allTasksCache || []).find(t => t.id === taskId) || null;
};

/* ─── Public actions ─────────────────────────────────────────────────────── */

/* Runs when the modal opens: asks the backend whether a PDF already exists so
 * the footer can show the fast "view existing" path. Failures are non-fatal —
 * we simply fall back to the generate button. */
window.refreshContractAvailability = async () => {
    if (!window.canGenerateContracts()) return;

    const task = currentContractTask();
    const merchantId = window.resolveContractMerchantId(task);
    if (!task || !merchantId) {
        showContractBanner('none');
        return;
    }

    try {
        const result = await callGetMerchantContract(merchantId);
        const taskIdEl = contractEl('cpTaskId');
        if (taskIdEl && taskIdEl.value !== task.id) return;
        window.contractAvailability = result;
        window.applyContractAvailability(result);
    } catch (err) {
        console.warn('[contracts] availability check failed', err);
        showContractBanner('none');
    }
};

/* Instant open of the already-stored contract; falls back to a lookup if the
 * cached availability entry has no URL. */
window.viewExistingContract = async () => {
    if (!window.canGenerateContracts()) {
        if (window.showToast) window.showToast('إصدار العقود متاح لمدير التشغيل (أ/ محمود) فقط', false);
        return false;
    }

    const cached = window.contractAvailability;
    if (cached && cached.exists && cached.url) {
        openServerContractPdf(cached.url);
        return true;
    }

    const task = currentContractTask();
    const merchantId = window.resolveContractMerchantId(task);
    if (!merchantId) {
        if (window.showToast) window.showToast('تعذر تحديد معرّف التاجر', false);
        return false;
    }

    setContractViewLoading(true);
    try {
        const result = await callGetMerchantContract(merchantId);
        if (!result.exists || !result.url) {
            window.applyContractAvailability(result);
            if (window.showToast) window.showToast('لا يوجد عقد محفوظ لهذا التاجر', false);
            return false;
        }
        window.contractAvailability = result;
        window.applyContractAvailability(result);
        openServerContractPdf(result.url);
        return true;
    } catch (err) {
        console.error('[contracts] view existing failed', err);
        if (window.showToast) window.showToast(contractCallableErrorMessage(err), false);
        return false;
    } finally {
        setContractViewLoading(false);
    }
};

/* Generate (or re-issue/overwrite) the server-side PDF. */
window.generateContractViaBackend = async () => {
    if (!window.canGenerateContracts()) {
        if (window.showToast) window.showToast('إصدار العقود متاح لمدير التشغيل (أ/ محمود) فقط', false);
        return false;
    }

    const task = currentContractTask();
    if (!task) {
        if (window.showToast) window.showToast('المهمة غير موجودة', false);
        return false;
    }

    const payload = window.buildContractCallablePayload(task);
    if (!payload || !payload.merchantId) {
        if (window.showToast) window.showToast('تعذر تحديد معرّف التاجر، حدّث البيانات ثم أعد المحاولة', false);
        return false;
    }

    if (typeof window.httpsCallable !== 'function' || !window.functions) {
        if (window.showToast) window.showToast('خدمة إصدار العقود غير محمّلة، أعد تحديث الصفحة', false);
        return false;
    }

    window.setContractGenerateLoading(true);
    try {
        const callable = window.httpsCallable(window.functions, 'generateMerchantContract');
        const response = await callable(payload);
        const result = (response && response.data) || {};
        if (!result.url) throw new Error('لم يتم استلام رابط العقد من الخادم.');

        window.lastGeneratedContract = result;
        window.contractAvailability = { exists: true, url: result.url, path: result.path, expiresAt: result.expiresAt };
        window.applyContractAvailability(window.contractAvailability);
        openServerContractPdf(result.url);
        if (window.showToast) window.showToast('تم إنشاء العقد وحفظه بنجاح');
        return true;
    } catch (err) {
        console.error('[contracts] generateMerchantContract failed', err);
        if (window.showToast) window.showToast(contractCallableErrorMessage(err), false);
        return false;
    } finally {
        window.setContractGenerateLoading(false);
    }
};

export {};
