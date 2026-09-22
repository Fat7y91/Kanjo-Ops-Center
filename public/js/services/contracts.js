/* Kanjo Ops — Server-side contract generation bridge.
 *
 * The heavy layout/render work now runs in the `generateMerchantContract`
 * callable Cloud Function (Chromium on the server). This module:
 *   1. builds the merchant payload from the task + the preview modal options,
 *   2. invokes the callable,
 *   3. opens the returned signed URL so the operator gets the server PDF.
 *
 * Issuing contracts is restricted to the designated operations manager
 * (Mahmoud); founders and reps keep a clean, read-only view. */

window.canGenerateContracts = () => {
    if (typeof window.isMahmoudOpsUser === 'function') return !!window.isMahmoudOpsUser();
    return String((window.currentUser && window.currentUser.name) || '').includes('محمود');
};

window.buildContractCallablePayload = (task) => {
    if (!task) return null;

    const baseName = window.getBaseName ? window.getBaseName(task.name) : task.name;
    const info = typeof window.getMerchantBusinessInfo === 'function'
        ? window.getMerchantBusinessInfo(task)
        : { baseName, cat: task.cat || 'غير محدد', businessType: 'منشأة', achieved: Number(task.achieved) || 0 };

    const merchantId = String(
        task.merchantId
        || task.merchant_id
        || (window.findMerchantIdForBase && baseName ? window.findMerchantIdForBase(baseName) : '')
        || task.id
        || ''
    ).trim();

    const toggleEl = document.getElementById('cpExceptionToggle');
    const exceptionsEnabled = toggleEl ? toggleEl.checked : false;

    let baseCommission = null;
    let exceptions = [];
    if (exceptionsEnabled) {
        const baseEl = document.getElementById('cpBaseCommission');
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

window.setContractGenerateLoading = (loading) => {
    const btn = document.getElementById('cpGenerateContractBtn');
    if (!btn) return;
    if (loading) {
        if (!btn.dataset.idleHtml) btn.dataset.idleHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin ml-2"></i>جاري إصدار العقد...';
    } else {
        btn.disabled = false;
        if (btn.dataset.idleHtml) btn.innerHTML = btn.dataset.idleHtml;
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

window.generateContractViaBackend = async () => {
    if (!window.canGenerateContracts()) {
        if (window.showToast) window.showToast('إصدار العقود متاح لمدير التشغيل (أ/ محمود) فقط', false);
        return false;
    }

    const taskIdEl = document.getElementById('cpTaskId');
    const taskId = taskIdEl ? taskIdEl.value : '';
    const task = (window.allTasksCache || []).find(t => t.id === taskId);
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
