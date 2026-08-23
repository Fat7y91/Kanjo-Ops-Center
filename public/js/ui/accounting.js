/* Kanjo Ops — Payroll, Commissions & Financial Profiles */

/* ==================================================================================
   نظام إعداد ملفات الدفع المالي للمناديب وقسم الحسابات
   Financial Payment Profiles System (financial_profiles collection)
   ================================================================================== */

const EG_WALLET_PROVIDERS = [
    { value: 'vodafone', label: 'فودافون كاش' },
    { value: 'orange', label: 'أورانج كاش' },
    { value: 'etisalat', label: 'اتصالات كاش' },
    { value: 'we', label: 'وي باي' }
];

window.currentFinancialProfileData = null;
window.financialProfilesCache = new Map();

window.isValidEgyptPhone = (v) => /^01[0125][0-9]{8}$/.test((v || '').trim());
window.isValidIBAN = (v) => /^EG[0-9]{27}$/.test((v || '').trim().toUpperCase());
window.isValidNationalId = (v) => /^[0-9]{14}$/.test((v || '').trim());
window.isValidPostAccountNumber = (v) => /^[0-9]{16}$/.test((v || '').trim());
window.isValidFullName = (v) => (v || '').trim().split(/\s+/).filter(Boolean).length >= 4;

window.methodLabelAr = (method) => {
    const labels = { ewallet: 'محفظة إلكترونية', instapay: 'إنستاباي', bank: 'تحويل بنكي', post: 'حساب بريد مصري' };
    return labels[method] || method || '-';
};

window.renderFinancialMethodFields = () => {
    const methodEl = document.getElementById('fpMethod');
    const container = document.getElementById('fpFieldsContainer');
    if (!methodEl || !container) return;
    const method = methodEl.value;
    const savedData = window.currentFinancialProfileData || {};
    const details = (savedData.method === method && savedData.details) ? savedData.details : {};
    let html = '';

    if (method === 'ewallet') {
        html = `
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">اسم المحفظة الإلكترونية:</label>
                <select id="fpWalletProvider" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-kanjo-primary">
                    <option value="">اختر المحفظة...</option>
                    ${EG_WALLET_PROVIDERS.map(p => `<option value="${p.value}" ${details.provider === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف المرتبط بالمحفظة (11 رقم يبدأ بـ 01):</label>
                <input type="tel" id="fpWalletPhone" dir="ltr" maxlength="11" value="${details.phone || ''}" placeholder="01xxxxxxxxx" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm text-right outline-none focus:border-kanjo-primary">
            </div>`;
    } else if (method === 'instapay') {
        const isPhoneType = details.instapayType === 'phone';
        html = `
            <div class="space-y-2">
                <label class="block text-xs font-bold text-slate-700 mb-1">نوع بيانات إنستاباي:</label>
                <div class="grid grid-cols-2 gap-2">
                    <label class="flex items-center gap-2 p-2.5 bg-kanjo-light border border-purple-100 rounded-xl cursor-pointer">
                        <input type="radio" name="fpInstapayType" value="ipa" ${!isPhoneType ? 'checked' : ''} class="accent-kanjo-primary w-4 h-4"> <span class="text-xs font-bold">عنوان الدفع (IPA)</span>
                    </label>
                    <label class="flex items-center gap-2 p-2.5 bg-kanjo-light border border-purple-100 rounded-xl cursor-pointer">
                        <input type="radio" name="fpInstapayType" value="phone" ${isPhoneType ? 'checked' : ''} class="accent-kanjo-primary w-4 h-4"> <span class="text-xs font-bold">رقم الهاتف المربوط</span>
                    </label>
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">القيمة (عنوان الـ IPA أو رقم الهاتف):</label>
                <input type="text" id="fpInstapayValue" dir="ltr" value="${details.value || ''}" placeholder="name@instapay أو 01xxxxxxxxx" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm text-right outline-none focus:border-kanjo-primary">
            </div>`;
    } else if (method === 'bank') {
        html = `
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">اسم البنك:</label>
                <input type="text" id="fpBankName" value="${details.bankName || ''}" placeholder="مثال: البنك الأهلي المصري" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-kanjo-primary">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">اسم صاحب الحساب (رباعي):</label>
                <input type="text" id="fpBankHolder" value="${details.holderName || ''}" placeholder="الاسم الرباعي كاملاً" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm outline-none focus:border-kanjo-primary">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">رقم الحساب البنكي:</label>
                <input type="text" id="fpBankAccountNumber" dir="ltr" value="${details.accountNumber || ''}" placeholder="رقم الحساب" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm text-right outline-none focus:border-kanjo-primary">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">رقم الآيبان (IBAN) - يبدأ بـ EG ويتكون من 29 خانة:</label>
                <input type="text" id="fpBankIBAN" dir="ltr" maxlength="29" value="${details.iban || ''}" placeholder="EGXXXXXXXXXXXXXXXXXXXXXXXXXXX" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm text-right outline-none focus:border-kanjo-primary">
            </div>`;
    } else if (method === 'post') {
        html = `
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">رقم حساب البريد المصري (16 رقم):</label>
                <input type="text" id="fpPostAccountNumber" dir="ltr" maxlength="16" value="${details.accountNumber || ''}" placeholder="رقم الحساب" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm text-right outline-none focus:border-kanjo-primary">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">الرقم القومي (14 رقم):</label>
                <input type="text" id="fpPostNationalId" dir="ltr" maxlength="14" value="${details.nationalId || ''}" placeholder="الرقم القومي" class="w-full p-3 bg-kanjo-light border border-purple-100 rounded-xl font-bold text-sm text-right outline-none focus:border-kanjo-primary">
            </div>`;
    } else {
        html = `<p class="text-xs text-slate-400 font-bold text-center py-4">يرجى اختيار طريقة الاستلام أولاً لعرض الحقول المطلوبة</p>`;
    }

    container.innerHTML = html;
};

window.openFinancialProfileModal = async () => {
    if (!currentUser || currentUser.role !== 'rep') return;

    window.currentFinancialProfileData = null;
    document.getElementById('fpMethod').value = '';
    window.renderFinancialMethodFields();

    const badgeWrapper = document.getElementById('financialProfileStatusBadgeWrapper');
    const badge = document.getElementById('financialProfileStatusBadge');
    if (badgeWrapper) badgeWrapper.classList.add('hidden');

    try {
        const docSnap = await getDoc(doc(db, "financial_profiles", currentUser.name));
        if (docSnap.exists()) {
            const data = docSnap.data();
            window.currentFinancialProfileData = data;
            document.getElementById('fpMethod').value = data.method || '';
            window.renderFinancialMethodFields();

            if (badgeWrapper && badge) {
                badgeWrapper.classList.remove('hidden');
                if (data.status === 'approved') {
                    badge.className = 'text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700';
                    badge.innerText = 'معتمد ✅';
                } else {
                    badge.className = 'text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700';
                    badge.innerText = 'قيد المراجعة ⏳';
                }
            }
        }
    } catch (e) {
        console.error("Error loading financial profile:", e);
    }

    document.getElementById('financialProfileModal').classList.remove('hidden');
};

window.closeFinancialProfileModal = () => {
    document.getElementById('financialProfileModal').classList.add('hidden');
};

window.saveFinancialProfile = async () => {
    if (!currentUser || currentUser.role !== 'rep') return;

    const method = document.getElementById('fpMethod').value;
    if (!method) { showToast("يرجى اختيار طريقة استلام المرتب أولاً", false); return; }

    let details = {};

    if (method === 'ewallet') {
        const provider = document.getElementById('fpWalletProvider').value;
        const phone = document.getElementById('fpWalletPhone').value.trim();
        if (!provider) { showToast("يرجى اختيار اسم المحفظة الإلكترونية", false); return; }
        if (!window.isValidEgyptPhone(phone)) { showToast("رقم هاتف المحفظة غير صحيح، يجب أن يتكون من 11 رقم ويبدأ بـ 01", false); return; }
        details = { provider, phone };
    } else if (method === 'instapay') {
        const typeRadio = document.querySelector('input[name="fpInstapayType"]:checked');
        const instapayType = typeRadio ? typeRadio.value : 'ipa';
        const value = document.getElementById('fpInstapayValue').value.trim();
        if (!value) { showToast("يرجى إدخال عنوان الدفع IPA أو رقم الهاتف المربوط بإنستاباي", false); return; }
        if (instapayType === 'phone' && !window.isValidEgyptPhone(value)) { showToast("رقم الهاتف المربوط بإنستاباي غير صحيح، يجب أن يتكون من 11 رقم ويبدأ بـ 01", false); return; }
        details = { instapayType, value };
    } else if (method === 'bank') {
        const bankName = document.getElementById('fpBankName').value.trim();
        const holderName = document.getElementById('fpBankHolder').value.trim();
        const accountNumber = document.getElementById('fpBankAccountNumber').value.trim();
        const iban = document.getElementById('fpBankIBAN').value.trim().toUpperCase();
        if (!bankName) { showToast("يرجى إدخال اسم البنك", false); return; }
        if (!window.isValidFullName(holderName)) { showToast("يرجى إدخال اسم صاحب الحساب رباعياً بالكامل", false); return; }
        if (!accountNumber) { showToast("يرجى إدخال رقم الحساب البنكي", false); return; }
        if (!window.isValidIBAN(iban)) { showToast("رقم الآيبان (IBAN) غير صحيح، يجب أن يبدأ بـ EG ويتكون من 29 خانة بالكامل", false); return; }
        details = { bankName, holderName, accountNumber, iban };
    } else if (method === 'post') {
        const accountNumber = document.getElementById('fpPostAccountNumber').value.trim();
        const nationalId = document.getElementById('fpPostNationalId').value.trim();
        if (!window.isValidPostAccountNumber(accountNumber)) { showToast("رقم حساب البريد المصري غير صحيح، يجب أن يتكون من 16 رقم", false); return; }
        if (!window.isValidNationalId(nationalId)) { showToast("الرقم القومي غير صحيح، يجب أن يتكون من 14 رقم", false); return; }
        details = { accountNumber, nationalId };
    } else {
        showToast("طريقة استلام غير معروفة، برجاء اختيار طريقة صحيحة", false);
        return;
    }

    try {
        await setDoc(doc(db, "financial_profiles", currentUser.name), {
            employeeName: currentUser.name,
            team: currentUser.team || '',
            method,
            details,
            status: 'pending',
            updatedAt: new Date(),
            updatedBy: currentUser.name
        });

        await window.notifyManager(
            `تحديث بيانات دفع: ${currentUser.name}`,
            `قام الموظف ${currentUser.name} بتسجيل/تعديل بيانات استلام المرتب، بانتظار مراجعة قسم الحسابات.`,
            'financial', null, ''
        );

        showToast("تم حفظ بيانات الدفع بنجاح، بانتظار اعتماد قسم الحسابات");
        window.closeFinancialProfileModal();
        window.refreshFinancialProfileBanner();
    } catch (e) {
        console.error("Error saving financial profile:", e);
        showToast("حدث خطأ أثناء حفظ البيانات، برجاء المحاولة مرة أخرى", false);
    }
};

window.refreshFinancialProfileBanner = async () => {
    if (!currentUser || currentUser.role !== 'rep') return;

    const banner = document.getElementById('financialProfileBanner');
    const bannerText = document.getElementById('financialProfileBannerText');
    const badge = document.getElementById('financialProfileBadge');
    if (!banner) return;

    try {
        const docSnap = await getDoc(doc(db, "financial_profiles", currentUser.name));
        banner.classList.remove('hidden');
        banner.classList.remove('from-emerald-600', 'to-teal-700', 'from-amber-500', 'to-orange-600', 'from-red-600', 'to-rose-700');

        if (!docSnap.exists()) {
            banner.classList.add('from-red-600', 'to-rose-700');
            if (bannerText) bannerText.innerText = 'لم تقم بتسجيل بيانات استلام المرتب بعد، برجاء التسجيل الآن';
            if (badge) badge.classList.remove('hidden');
        } else {
            const data = docSnap.data();
            if (data.status === 'approved') {
                banner.classList.add('from-emerald-600', 'to-teal-700');
                if (bannerText) bannerText.innerText = 'تم اعتماد بيانات استلام مرتبك من قسم الحسابات ✅';
                if (badge) badge.classList.add('hidden');
            } else {
                banner.classList.add('from-amber-500', 'to-orange-600');
                if (bannerText) bannerText.innerText = 'بياناتك المالية قيد المراجعة حالياً من قسم الحسابات ⏳';
                if (badge) badge.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error("Error refreshing financial profile banner:", e);
    }
};

window.formatFinancialDetails = (profile) => {
    const d = profile.details || {};
    if (profile.method === 'ewallet') {
        const providerLabels = { vodafone: 'فودافون كاش', orange: 'أورانج كاش', etisalat: 'اتصالات كاش', we: 'وي باي' };
        return `${providerLabels[d.provider] || d.provider || '-'} - ${d.phone || '-'}`;
    } else if (profile.method === 'instapay') {
        return `${d.instapayType === 'phone' ? 'رقم هاتف' : 'عنوان IPA'}: ${d.value || '-'}`;
    } else if (profile.method === 'bank') {
        return `${d.bankName || '-'} | ${d.holderName || '-'} | حساب: ${d.accountNumber || '-'} | IBAN: ${d.iban || '-'}`;
    } else if (profile.method === 'post') {
        return `حساب بريد: ${d.accountNumber || '-'} | الرقم القومي: ${d.nationalId || '-'}`;
    }
    return '-';
};

window.renderFinancialProfilesTable = (profiles) => {
    const tbody = document.getElementById('financialProfilesTableBody');
    if (!tbody) return;

    if (profiles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 font-bold">لا توجد بيانات دفع مسجلة بعد</td></tr>`;
    } else {
        tbody.innerHTML = profiles.map(p => {
            const isApproved = p.status === 'approved';
            let updatedDate = '-';
            try {
                if (p.updatedAt && typeof p.updatedAt.toDate === 'function') {
                    updatedDate = p.updatedAt.toDate().toLocaleDateString('ar-EG');
                } else if (p.updatedAt) {
                    updatedDate = new Date(p.updatedAt).toLocaleDateString('ar-EG');
                }
            } catch (e) { updatedDate = '-'; }

            return `<tr class="hover:bg-purple-50/40 transition">
                <td class="p-3.5">${window.safeString(p.employeeName || p.id)}</td>
                <td class="p-3.5">${window.safeString(p.team || '-')}</td>
                <td class="p-3.5">${window.methodLabelAr(p.method)}</td>
                <td class="p-3.5 text-[11px]">${window.safeString(window.formatFinancialDetails(p))}</td>
                <td class="p-3.5 text-[11px]">${updatedDate}</td>
                <td class="p-3.5">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-black ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${isApproved ? 'معتمد ✅' : 'قيد المراجعة ⏳'}</span>
                </td>
                <td class="p-3.5">
                    ${isApproved ? '<span class="text-[11px] text-slate-400 font-bold">تم الاعتماد</span>' : `<button onclick="approveFinancialProfile('${p.id}')" class="bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold hover:bg-emerald-700 transition"><i class="fa-solid fa-check"></i> اعتماد</button>`}
                </td>
            </tr>`;
        }).join('');
    }

    const total = profiles.length;
    const pending = profiles.filter(p => p.status !== 'approved').length;
    const approved = total - pending;
    const elTotal = document.getElementById('fpStatTotal');
    const elPending = document.getElementById('fpStatPending');
    const elApproved = document.getElementById('fpStatApproved');
    if (elTotal) elTotal.innerText = total;
    if (elPending) elPending.innerText = pending;
    if (elApproved) elApproved.innerText = approved;
};

window.loadFinancialProfilesForAccounting = () => {
    onSnapshot(collection(db, "financial_profiles"), (snap) => {
        window.financialProfilesCache.clear();
        const profiles = [];
        snap.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            window.financialProfilesCache.set(docSnap.id, data);
            profiles.push(data);
        });
        window.renderFinancialProfilesTable(profiles);
    });
};

window.approveFinancialProfile = async (id) => {
    if (!currentUser || currentUser.role !== 'accounting') return;
    try {
        await updateDoc(doc(db, "financial_profiles", id), {
            status: 'approved',
            approvedBy: currentUser.name,
            approvedAt: new Date()
        });
        await window.notifyManager(
            `تم اعتماد بيانات دفع: ${id}`,
            `تم اعتماد بيانات استلام المرتب الخاصة بـ ${id} من قسم الحسابات.`,
            'financial', null, ''
        );
        showToast("تم اعتماد بيانات الدفع بنجاح");
    } catch (e) {
        console.error("Error approving financial profile:", e);
        showToast("حدث خطأ أثناء اعتماد البيانات", false);
    }
};

window.exportFinancialProfilesExcel = () => {
    const profiles = Array.from(window.financialProfilesCache.values());
    if (profiles.length === 0) { showToast("لا توجد بيانات دفع لتصديرها", false); return; }

    const providerLabels = { vodafone: 'فودافون كاش', orange: 'أورانج كاش', etisalat: 'اتصالات كاش', we: 'وي باي' };

    const exportData = profiles.map(p => {
        const d = p.details || {};
        let row = {
            "اسم الموظف": p.employeeName || p.id,
            "الفريق": p.team || '-',
            "طريقة الاستلام": window.methodLabelAr(p.method),
            "الحالة": p.status === 'approved' ? 'معتمد' : 'قيد المراجعة'
        };
        if (p.method === 'ewallet') {
            row["اسم المحفظة"] = providerLabels[d.provider] || d.provider || '-';
            row["رقم الهاتف"] = d.phone || '-';
        } else if (p.method === 'instapay') {
            row["نوع بيانات إنستاباي"] = d.instapayType === 'phone' ? 'رقم هاتف' : 'عنوان IPA';
            row["القيمة"] = d.value || '-';
        } else if (p.method === 'bank') {
            row["اسم البنك"] = d.bankName || '-';
            row["اسم صاحب الحساب"] = d.holderName || '-';
            row["رقم الحساب"] = d.accountNumber || '-';
            row["رقم الآيبان IBAN"] = d.iban || '-';
        } else if (p.method === 'post') {
            row["رقم حساب البريد"] = d.accountNumber || '-';
            row["الرقم القومي"] = d.nationalId || '-';
        }
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kanjo Payment Profiles");
    XLSX.writeFile(wb, "Kanjo_Payment_Profiles_" + new Date().toISOString().slice(0,10) + ".xlsx");
    showToast("تم تصدير بيانات الدفع بنجاح");
};

/* ==================================================================================
   نهاية نظام إعداد ملفات الدفع المالي للمناديب وقسم الحسابات
   ================================================================================== */

/* ==================================================================================
   نظام فترات الرواتب + مصدر موحّد للمناديب (تعاقدات نهائية فقط)
   ================================================================================== */

window.getPayrollPeriodKey = () => {
    if (window._payrollPeriodAll) return 'all';
    const el = document.getElementById('payrollPeriod');
    if (el && el.value) return el.value;
    return new Date().toISOString().slice(0, 7);
};

window.formatPayrollPeriodLabel = (periodKey) => {
    if (!periodKey || periodKey === 'all') return 'كل الفترات';
    const [y, m] = periodKey.split('-').map(Number);
    const names = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `شهر ${names[m] || m} ${y}`;
};

window.initPayrollPeriodControls = () => {
    const el = document.getElementById('payrollPeriod');
    if (!el) return;
    if (!window._payrollPeriodAll && !el.value) el.value = new Date().toISOString().slice(0, 7);
    const label = document.getElementById('payrollPeriodLabel');
    if (label) label.innerText = window.formatPayrollPeriodLabel(window.getPayrollPeriodKey());
};

window.onPayrollPeriodChange = () => {
    window._payrollPeriodAll = false;
    window.initPayrollPeriodControls();
    window.renderPayrollTable();
    window.loadPayrollSettingsAndCalculateFounderSummary();
};

window.setPayrollPeriodCurrent = () => {
    window._payrollPeriodAll = false;
    const el = document.getElementById('payrollPeriod');
    if (el) el.value = new Date().toISOString().slice(0, 7);
    window.onPayrollPeriodChange();
};

window.setPayrollPeriodAll = () => {
    window._payrollPeriodAll = true;
    window.initPayrollPeriodControls();
    window.renderPayrollTable();
    window.loadPayrollSettingsAndCalculateFounderSummary();
};

/**
 * تاريخ التعاقد الأصلي: يُؤخذ من حقل time المثبّت عند التعاقد فقط،
 * ولا يُشتق أبداً من تواريخ الزيارات/التقارير اللاحقة حتى لا تنتقل
 * العقود بين أشهر الرواتب بسبب زيارة متابعة لاحقة.
 */
window.extractTaskContractDate = (task) => (task && task.time) || '';

/**
 * يجلب التجار المتعاقدين نهائياً فقط (isSigned + achieved > 0)
 * مع فلترة اختيارية حسب شهر التعاقد (YYYY-MM) أو 'all'
 */
window.getFinalSignedMerchantsForPayroll = (periodKey) => {
    const key = periodKey === undefined ? window.getPayrollPeriodKey() : periodKey;
    const source = new Map();

    if (window.currentUniqueMerchantsGlobal && window.currentUniqueMerchantsGlobal.size > 0) {
        window.currentUniqueMerchantsGlobal.forEach((data, name) => source.set(name, { ...data }));
    } else if (window.tasksMemory && window.tasksMemory.size > 0) {
        window.tasksMemory.forEach(t => {
            const baseName = getBaseName(t.name);
            if (!source.has(baseName)) {
                source.set(baseName, {
                    isSigned: false,
                    isProvisional: false,
                    achieved: 0,
                    target: Number(t.target) || 0,
                    team: t.team,
                    contractDate: ''
                });
            }
            const mData = source.get(baseName);
            const taskAch = Number(t.achieved) || 0;
            if (Number(t.target) > mData.target) mData.target = Number(t.target) || 0;
            if (t.isSigned && taskAch > 0) {
                mData.isSigned = true;
                mData.isProvisional = false;
                mData.achieved = Math.max(mData.achieved, taskAch);
                mData.team = t.team || mData.team;
                const cDate = window.extractTaskContractDate(t);
                if (cDate && (!mData.contractDate || cDate < mData.contractDate)) mData.contractDate = cDate;
            }
        });
    }

    const filtered = new Map();
    source.forEach((data, name) => {
        if (!(data.isSigned && Number(data.achieved) > 0)) return;
        if (key && key !== 'all') {
            const d = data.contractDate || '';
            if (!d || !d.startsWith(key)) return;
        }
        filtered.set(name, data);
    });
    return filtered;
};

window.computeTeamPayrollStats = (uniqueMerchants) => {
    const teamStats = {
        'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0, total: 0 },
        'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0, total: 0 }
    };
    uniqueMerchants.forEach((data) => {
        if (!(data.isSigned && data.achieved > 0 && data.team && teamStats[data.team])) return;
        const ratio = data.target > 0 ? (data.achieved / data.target) * 100 : 0;
        if (ratio > 100) {
            teamStats[data.team].extraCount++;
            teamStats[data.team].total += 200;
        } else if (ratio === 100) {
            teamStats[data.team].tier1Count++;
            teamStats[data.team].tier1 += 200;
            teamStats[data.team].total += 200;
        } else if (ratio > 90) {
            teamStats[data.team].tier2Count++;
            teamStats[data.team].tier2 += 150;
            teamStats[data.team].total += 150;
        } else {
            teamStats[data.team].tier3Count++;
            teamStats[data.team].tier3 += 100;
            teamStats[data.team].total += 100;
        }
    });
    return teamStats;
};

window.showFounderPayrollDetails = async () => {

    currentStatModalType = 'founder_payroll_details';

    const modal = document.getElementById('detailsModal');

    const content = document.getElementById('detailsContent');

    const title = document.getElementById('detailsTitle');

    

    content.innerHTML = '<div class="text-center py-6 font-bold text-slate-500">جاري سحب وجلب بيانات الرواتب وإعدادات قسم الحسابات...</div>';

    title.innerText = `تفاصيل الرواتب — ${window.formatPayrollPeriodLabel(window.getPayrollPeriodKey())}`;

    modal.classList.remove('hidden');



    let desoukBaseVal = 5000;

    let desoukCommPercentVal = 60;

    let desoukExtraBonusVal = 150;

    let singleExtraVal = 250;



    try {

        const docRef = doc(db, "settings", "payrollConfig");

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {

            const data = docSnap.data();

            if (data.desoukBase !== undefined) desoukBaseVal = parseFloat(data.desoukBase) || 0;

            if (data.desoukCommPercent !== undefined) desoukCommPercentVal = parseFloat(data.desoukCommPercent) || 0;

            if (data.desoukExtraBonus !== undefined) desoukExtraBonusVal = parseFloat(data.desoukExtraBonus) || 0;

            if (data.repExtraIncentive !== undefined) singleExtraVal = parseFloat(data.repExtraIncentive) || 0;

        }

    } catch (e) {

        console.error("Error loading payroll settings for details:", e);

    }



    content.innerHTML = ''; 



    let uniqueMerchants = window.getFinalSignedMerchantsForPayroll();

    let teamStats = window.computeTeamPayrollStats(uniqueMerchants);



    const combinedTier1Count = teamStats['Fox Team'].tier1Count + teamStats['Power Team'].tier1Count;

    const combinedTier2Count = teamStats['Fox Team'].tier2Count + teamStats['Power Team'].tier2Count;

    const combinedTier3Count = teamStats['Fox Team'].tier3Count + teamStats['Power Team'].tier3Count;

    const combinedExtraCount = teamStats['Fox Team'].extraCount + teamStats['Power Team'].extraCount;



    const desoukTier1Money = combinedTier1Count * 200;

    const desoukTier2Money = combinedTier2Count * 150;

    const desoukTier3Money = combinedTier3Count * 100;



    const totalCombinedTierComms = desoukTier1Money + desoukTier2Money + desoukTier3Money;

    const desoukManagerCommissionAmount = Math.round((totalCombinedTierComms * desoukCommPercentVal) / 100);

    const desoukExtraIncentiveTotal = combinedExtraCount * desoukExtraBonusVal;

    const desoukManagerNet = desoukBaseVal + desoukManagerCommissionAmount + desoukExtraIncentiveTotal;



    content.innerHTML += `

        <div class="bg-kanjo-light/80 px-3 py-2 rounded-xl text-xs font-bold text-kanjo-dark mb-2 border border-purple-100">

            📅 الفترة المعروضة: ${window.formatPayrollPeriodLabel(window.getPayrollPeriodKey())} — تعاقدات نهائية فقط (${uniqueMerchants.size} عقد)

        </div>

        <div class="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-2xl border border-purple-200 shadow-sm space-y-2">

            <div class="flex justify-between items-center font-black text-kanjo-dark text-base border-b border-purple-100 pb-2">

                <span>مدير منطقة دسوق</span>

                <span class="text-kanjo-primary font-mono">${desoukManagerNet.toLocaleString()} ج.م</span>

            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-700 font-bold">

                <div>الراتب الأساسي: <span class="font-mono text-slate-900">${desoukBaseVal.toLocaleString()} ج.م</span></div>

                <div>عمولات الفئات: <span class="font-mono text-emerald-700">${desoukManagerCommissionAmount.toLocaleString()} ج.م</span></div>

                <div>الحافز الإضافي: <span class="font-mono text-purple-700">${desoukExtraIncentiveTotal.toLocaleString()} ج.م</span></div>

            </div>

        </div>

    `;



    const reps = window.KANJO_REP_PAYROLL || [];



    reps.forEach(rep => {

        let base = rep.base;

        let tComms = teamStats[rep.team] || { tier1: 0, tier2: 0, tier3: 0, total: 0, extraCount: 0 };

        let repCommission = tComms.tier1 + tComms.tier2 + tComms.tier3;

        let teamTotalExtra = singleExtraVal * tComms.extraCount; 

        let net = base + repCommission + teamTotalExtra;



        content.innerHTML += `

            <div class="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm space-y-2">

                <div class="flex justify-between items-center font-black text-slate-800 text-base border-b border-purple-50 pb-2">

                    <span>${rep.name} <span class="text-xs font-bold text-kanjo-primary">(${rep.team})</span></span>

                    <span class="text-emerald-800 font-mono">${net.toLocaleString()} ج.م</span>

                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-700 font-bold">

                    <div>الراتب الأساسي: <span class="font-mono text-slate-900">${base.toLocaleString()} ج.م</span></div>

                    <div>العمولات المحققة: <span class="font-mono text-emerald-700">${repCommission.toLocaleString()} ج.م</span></div>

                    <div>الحافز الإضافي: <span class="font-mono text-purple-700">${teamTotalExtra.toLocaleString()} ج.م</span></div>

                </div>

            </div>

        `;

    });

};

window.loadPayrollSettingsFromFirebase = async () => {

    try {

        const docRef = doc(db, "settings", "payrollConfig");

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {

            const data = docSnap.data();

            if (data.desoukBase !== undefined) document.getElementById('desoukManagerBase').value = data.desoukBase;

            if (data.desoukCommPercent !== undefined) document.getElementById('desoukManagerCommissionPercent').value = data.desoukCommPercent;

            if (data.desoukExtraBonus !== undefined) document.getElementById('desoukManagerExtraIncentiveBonus').value = data.desoukExtraBonus;

            if (data.repExtraIncentive !== undefined) document.getElementById('globalExtraIncentive').value = data.repExtraIncentive;

        }

    } catch (e) {

        console.error("Error loading payroll settings:", e);

    }

    window.renderPayrollTable();

};



window.loadPayrollSettingsAndCalculateFounderSummary = async () => {

    try {

        const docRef = doc(db, "settings", "payrollConfig");

        const docSnap = await getDoc(docRef);

        let desoukBaseVal = 5000;

        let desoukCommPercentVal = 50;

        let desoukExtraBonusVal = 50;

        let singleExtraVal = 0;



        if (docSnap.exists()) {

            const data = docSnap.data();

            if (data.desoukBase !== undefined) desoukBaseVal = parseFloat(data.desoukBase) || 0;

            if (data.desoukCommPercent !== undefined) desoukCommPercentVal = parseFloat(data.desoukCommPercent) || 0;

            if (data.desoukExtraBonus !== undefined) desoukExtraBonusVal = parseFloat(data.desoukExtraBonus) || 0;

            if (data.repExtraIncentive !== undefined) singleExtraVal = parseFloat(data.repExtraIncentive) || 0;

        }



        let uniqueMerchants = window.getFinalSignedMerchantsForPayroll();

        let teamStats = window.computeTeamPayrollStats(uniqueMerchants);



        const combinedTier1Count = teamStats['Fox Team'].tier1Count + teamStats['Power Team'].tier1Count;

        const combinedTier2Count = teamStats['Fox Team'].tier2Count + teamStats['Power Team'].tier2Count;

        const combinedTier3Count = teamStats['Fox Team'].tier3Count + teamStats['Power Team'].tier3Count;

        const combinedExtraCount = teamStats['Fox Team'].extraCount + teamStats['Power Team'].extraCount;



        const desoukTier1Money = combinedTier1Count * 200;

        const desoukTier2Money = combinedTier2Count * 150;

        const desoukTier3Money = combinedTier3Count * 100;



        const totalCombinedTierComms = desoukTier1Money + desoukTier2Money + desoukTier3Money;

        const desoukManagerCommissionAmount = Math.round((totalCombinedTierComms * desoukCommPercentVal) / 100);

        const desoukExtraIncentiveTotal = combinedExtraCount * desoukExtraBonusVal;

        const desoukManagerNet = desoukBaseVal + desoukManagerCommissionAmount + desoukExtraIncentiveTotal;



        const reps = window.KANJO_REP_PAYROLL || [];



        let totalNetSum = desoukManagerNet;

        reps.forEach(rep => {

            let base = rep.base;

            let tComms = teamStats[rep.team];

            let repCommission = tComms.tier1 + tComms.tier2 + tComms.tier3; 

            let teamTotalExtra = singleExtraVal * tComms.extraCount;

            let net = base + repCommission + teamTotalExtra;

            totalNetSum += net;

        });



        const founderTotalNetDisplay = document.getElementById('founderTotalNetDisplay');

        if (founderTotalNetDisplay) {

            founderTotalNetDisplay.innerText = totalNetSum.toLocaleString() + ' ج.م';

        }

        const founderPeriodHint = document.getElementById('founderPayrollPeriodHint');

        if (founderPeriodHint) {

            founderPeriodHint.innerText = window.formatPayrollPeriodLabel(window.getPayrollPeriodKey());

        }

    } catch (e) {

        console.error("Error calculating founder summary:", e);

    }

};



window.saveAndRenderPayroll = async () => {

    const desoukBase = parseFloat(document.getElementById('desoukManagerBase').value) || 0;

    const desoukCommPercent = parseFloat(document.getElementById('desoukManagerCommissionPercent').value) || 0;

    const desoukExtraBonus = parseFloat(document.getElementById('desoukManagerExtraIncentiveBonus').value) || 0;

    const repExtraIncentive = parseFloat(document.getElementById('globalExtraIncentive').value) || 0;



    try {

        await setDoc(doc(db, "settings", "payrollConfig"), {

            desoukBase,

            desoukCommPercent,

            desoukExtraBonus,

            repExtraIncentive,

            updatedAt: new Date()

        });

    } catch (e) {

        console.error("Error saving payroll settings:", e);

    }



    window.renderPayrollTable();

    window.loadPayrollSettingsAndCalculateFounderSummary();

};



window.renderPayrollTable = () => {

    const tbody = document.getElementById('payrollTableBody');

    if (!tbody) return;

    tbody.innerHTML = '';

    window.initPayrollPeriodControls();



    const extraIncentiveInput = document.getElementById('globalExtraIncentive');

    const singleExtraVal = extraIncentiveInput ? (parseFloat(extraIncentiveInput.value) || 0) : 0;



    const desoukBaseInput = document.getElementById('desoukManagerBase');

    const desoukBaseVal = desoukBaseInput ? (parseFloat(desoukBaseInput.value) || 0) : 0;



    const desoukCommPercentInput = document.getElementById('desoukManagerCommissionPercent');

    const desoukCommPercentVal = desoukCommPercentInput ? (parseFloat(desoukCommPercentInput.value) || 0) : 0;



    const desoukExtraBonusInput = document.getElementById('desoukManagerExtraIncentiveBonus');

    const desoukExtraBonusVal = desoukExtraBonusInput ? (parseFloat(desoukExtraBonusInput.value) || 0) : 0;



    let uniqueMerchants = window.getFinalSignedMerchantsForPayroll();

    let teamStats = window.computeTeamPayrollStats(uniqueMerchants);



    const periodContractsHint = document.getElementById('payrollPeriodContractsHint');

    if (periodContractsHint) {

        periodContractsHint.innerText = `${uniqueMerchants.size} تعاقد نهائي في ${window.formatPayrollPeriodLabel(window.getPayrollPeriodKey())}`;

    }



    const foxTotSigned = teamStats['Fox Team'].tier1Count + teamStats['Fox Team'].tier2Count + teamStats['Fox Team'].tier3Count + teamStats['Fox Team'].extraCount;

    const powerTotSigned = teamStats['Power Team'].tier1Count + teamStats['Power Team'].tier2Count + teamStats['Power Team'].tier3Count + teamStats['Power Team'].extraCount;



    document.getElementById('foxTotalSignedBadge').innerText = `${foxTotSigned} عقود مؤكدة`;

    document.getElementById('foxBreakdownList').innerHTML = `

        <div>- الفئة الأولى (100% - 200 ج): ${teamStats['Fox Team'].tier1Count} عقود</div>

        <div>- الفئة الثانية (>90% - 150 ج): ${teamStats['Fox Team'].tier2Count} عقود</div>

        <div>- الفئة الثالثة (<90% - 100 ج): ${teamStats['Fox Team'].tier3Count} عقود</div>

        <div>- فئة العمولة الإضافية (>100%): ${teamStats['Fox Team'].extraCount} عقود</div>

    `;



    document.getElementById('powerTotalSignedBadge').innerText = `${powerTotSigned} عقود مؤكدة`;

    document.getElementById('powerBreakdownList').innerHTML = `

        <div>- الفئة الأولى (100% - 200 ج): ${teamStats['Power Team'].tier1Count} عقود</div>

        <div>- الفئة الثانية (>90% - 150 ج): ${teamStats['Power Team'].tier2Count} عقود</div>

        <div>- الفئة الثالثة (<90% - 100 ج): ${teamStats['Power Team'].tier3Count} عقود</div>

        <div>- فئة العمولة الإضافية (>100%): ${teamStats['Power Team'].extraCount} عقود</div>

    `;



    const combinedTier1Count = teamStats['Fox Team'].tier1Count + teamStats['Power Team'].tier1Count;

    const combinedTier2Count = teamStats['Fox Team'].tier2Count + teamStats['Power Team'].tier2Count;

    const combinedTier3Count = teamStats['Fox Team'].tier3Count + teamStats['Power Team'].tier3Count;

    const combinedExtraCount = teamStats['Fox Team'].extraCount + teamStats['Power Team'].extraCount;



    const desoukTier1Money = combinedTier1Count * 200;

    const desoukTier2Money = combinedTier2Count * 150;

    const desoukTier3Money = combinedTier3Count * 100;



    const totalCombinedTierComms = desoukTier1Money + desoukTier2Money + desoukTier3Money;

    const desoukManagerCommissionAmount = Math.round((totalCombinedTierComms * desoukCommPercentVal) / 100);

    const desoukExtraIncentiveTotal = combinedExtraCount * desoukExtraBonusVal;

    const desoukManagerNet = desoukBaseVal + desoukManagerCommissionAmount + desoukExtraIncentiveTotal;



    const desoukTeamTotalCommsDisplay = document.getElementById('desoukTeamTotalCommsDisplay');

    if (desoukTeamTotalCommsDisplay) {

        desoukTeamTotalCommsDisplay.innerText = totalCombinedTierComms.toLocaleString() + ' ج.م';

    }



    const desoukTotalExtraCountDisplay = document.getElementById('desoukTotalExtraCountDisplay');

    if (desoukTotalExtraCountDisplay) {

        desoukTotalExtraCountDisplay.innerText = `${combinedExtraCount} عقد`;

    }



    tbody.innerHTML += `

        <tr class="bg-purple-50/70 hover:bg-purple-100/50 transition-colors border-b-2 border-purple-200">

            <td class="p-3.5 font-black text-kanjo-dark">مدير منطقة دسوق</td>

            <td class="p-3.5"><span class="bg-purple-200 text-kanjo-dark px-2.5 py-1 rounded-lg font-bold">الإدارة العليا / دسوق</span></td>

            <td class="p-3.5 font-mono">${desoukBaseVal.toLocaleString()} ج.م</td>

            <td class="p-3.5 font-mono text-emerald-700">${desoukTier1Money.toLocaleString()} ج.م <span class="text-[10px] text-slate-500">(${combinedTier1Count} عقد)</span></td>

            <td class="p-3.5 font-mono text-blue-700">${desoukTier2Money.toLocaleString()} ج.م <span class="text-[10px] text-slate-500">(${combinedTier2Count} عقد)</span></td>

            <td class="p-3.5 font-mono text-amber-700">${desoukTier3Money.toLocaleString()} ج.م <span class="text-[10px] text-slate-500">(${combinedTier3Count} عقد)</span></td>

            <td class="p-3.5 font-mono font-black text-emerald-700">${desoukManagerCommissionAmount.toLocaleString()} ج.م <span class="text-[10px] text-slate-500">(${desoukCommPercentVal}% من الفئات)</span></td>

            <td class="p-3.5 font-mono text-purple-700 font-bold">${desoukExtraIncentiveTotal.toLocaleString()} ج.م <span class="text-[10px] text-slate-400">(${combinedExtraCount} عقود إضافية)</span></td>

            <td class="p-3.5 font-mono font-black text-purple-900 text-sm">${desoukManagerNet.toLocaleString()} ج.م</td>

        </tr>

    `;



    const reps = window.KANJO_REP_PAYROLL || [];



    let totalBaseSum = desoukBaseVal;

    let totalCommissionsSum = desoukManagerCommissionAmount + desoukExtraIncentiveTotal;

    let totalNetSum = desoukManagerNet;



    reps.forEach(rep => {

        let base = rep.base;

        let tComms = teamStats[rep.team] || { tier1: 0, tier2: 0, tier3: 0, total: 0, extraCount: 0 };

        let repCommission = tComms.tier1 + tComms.tier2 + tComms.tier3; 

        let teamTotalExtra = singleExtraVal * tComms.extraCount;

        let net = base + repCommission + teamTotalExtra;



        totalBaseSum += base;

        totalCommissionsSum += repCommission + teamTotalExtra;

        totalNetSum += net;



        tbody.innerHTML += `

            <tr class="hover:bg-purple-50/50 transition-colors border-b border-purple-50">

                <td class="p-3.5 font-black text-slate-800">${rep.name}</td>

                <td class="p-3.5"><span class="bg-kanjo-light text-kanjo-primary px-2.5 py-1 rounded-lg font-bold">${rep.team}</span></td>

                <td class="p-3.5 font-mono">${base.toLocaleString()} ج.م</td>

                <td class="p-3.5 font-mono text-emerald-700">${tComms.tier1.toLocaleString()} ج.م</td>

                <td class="p-3.5 font-mono text-blue-700">${tComms.tier2.toLocaleString()} ج.م</td>

                <td class="p-3.5 font-mono text-amber-700">${tComms.tier3.toLocaleString()} ج.م</td>

                <td class="p-3.5 font-mono font-black text-kanjo-primary">${repCommission.toLocaleString()} ج.م</td>

                <td class="p-3.5 font-mono text-purple-700">${teamTotalExtra.toLocaleString()} ج.م <span class="text-[10px] text-slate-400">(${tComms.extraCount}عقود)</span></td>

                <td class="p-3.5 font-mono font-black text-emerald-800 text-sm">${net.toLocaleString()} ج.م</td>

            </tr>

        `;

    });



    document.getElementById('pyTotalBase').innerText = totalBaseSum.toLocaleString() + ' ج.م';

    document.getElementById('pyTotalCommissions').innerText = totalCommissionsSum.toLocaleString() + ' ج.م';

    document.getElementById('pyTotalNet').innerText = totalNetSum.toLocaleString() + ' ج.م';

};



export {};
