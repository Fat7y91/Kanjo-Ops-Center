/* Kanjo Ops — Excel Export (SheetJS / XLSX) */

window.exportDetailsExcel = async () => {

    let exportData = [];

    const todayStr = new Date().toISOString().slice(0, 10);



    if (currentStatModalType === 'founder_payroll_details') {

        

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

            console.error("Error loading payroll settings for export:", e);

        }



        let uniqueMerchants = window.getFinalSignedMerchantsForPayroll
            ? window.getFinalSignedMerchantsForPayroll()
            : (window.currentUniqueMerchantsGlobal || new Map());

        let teamStats = window.computeTeamPayrollStats
            ? window.computeTeamPayrollStats(uniqueMerchants)
            : { 'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 }, 'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 } };



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



        exportData.push({

            "الموظف / المسؤول": "مدير منطقة دسوق",

            "الفريق / الدور": "الإدارة العليا / دسوق",

            "الراتب الأساسي": desoukBaseVal,

            "العمولات المحققة / الفئات": desoukManagerCommissionAmount,

            "الحافز الإضافي": desoukExtraIncentiveTotal,

            "الإجمالي النهائي": desoukManagerNet

        });



        const reps = window.KANJO_REP_PAYROLL || [

            { name: 'سارة', team: 'Fox Team', base: 5000 },

            { name: 'مصطفى', team: 'Fox Team', base: 5000 },

            { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

            { name: 'يوسف', team: 'Power Team', base: 3000 }

        ];



        reps.forEach(rep => {

            let base = rep.base;

            let tComms = teamStats[rep.team];

            let repCommission = tComms.tier1 + tComms.tier2 + tComms.tier3;

            let teamTotalExtra = singleExtraVal * tComms.extraCount;

            let net = base + repCommission + teamTotalExtra;



            exportData.push({

                "الموظف / المسؤول": rep.name,

                "الفريق / الدور": rep.team,

                "الراتب الأساسي": base,

                "العمولات المحققة / الفئات": repCommission,

                "الحافز الإضافي": teamTotalExtra,

                "الإجمالي النهائي": net

            });

        });



    } else {

        let list = [];

        window.currentUniqueMerchantsGlobal.forEach((data, name) => {

            list.push({ name, ...data });

        });



        if (currentStatModalType === 'targets') {

            list.sort((a, b) => b.target - a.target);

            list.forEach(item => {

                exportData.push({

                    "اسم التاجر": item.name,

                    "الفئة": item.cat || 'غير محدد',

                    "الفريق": item.team || '-',

                    "نسبة التارجت المستهدف (%)": item.target

                });

            });

        } else if (currentStatModalType === 'achieved' || currentStatModalType === 'payroll_tier1' || currentStatModalType === 'payroll_tier2' || currentStatModalType === 'payroll_tier3') {

            const signedOrProvList = list.filter(i => (i.isSigned && i.achieved > 0) || i.isProvisional);

            signedOrProvList.forEach(item => {

                let assignedTeam = item.team || '-';

                let latestDate = '';

                let latestTimestamp = '';

                window.allTasksCache.forEach(t => {

                    if (getBaseName(t.name) === item.name) {

                        if (t.team) assignedTeam = t.team;

                        if (t.reports) {

                            t.reports.forEach(r => {

                                let rDate = r.date || (r.timestamp ? r.timestamp.split(' ')[0] : '');

                                let rTime = r.time || (r.timestamp ? r.timestamp.split(' ').slice(1).join(' ') : '');

                                let rTimestamp = r.timestamp || `${rDate} ${rTime || '00:00:00'}`;

                                if (rDate && rDate <= todayStr && (!latestDate || rDate > latestDate)) latestDate = rDate;

                                if (rTimestamp && (!latestTimestamp || rTimestamp > latestTimestamp)) latestTimestamp = rTimestamp;

                            });

                        }

                        if (!latestDate && t.time && t.time <= todayStr) latestDate = t.time;

                        if (!latestTimestamp && t.time && t.time <= todayStr) latestTimestamp = `${t.time} 00:00:00`;

                    }

                });

                item.assignedTeam = assignedTeam;

                item.contractDate = latestDate || todayStr;

                item.contractTimestamp = latestTimestamp || `${todayStr} 00:00:00`;

            });

            signedOrProvList.sort((a, b) => (b.contractTimestamp || '').localeCompare(a.contractTimestamp || ''));



            signedOrProvList.forEach(item => {

                const isFinalSigned = item.isSigned && item.achieved > 0;

                exportData.push({

                    "اسم التاجر": item.name,

                    "تاريخ التعاقد/الأتفاق": item.contractDate,

                    "الفئة": item.cat || 'غير محدد',

                    "الفريق المسؤول": item.assignedTeam,

                    "الحالة": isFinalSigned ? "تعاقد نهائي" : "اتفاق مبدئي",

                    "العمولة المحققة/المبدئية (%)": item.achieved,

                    "العمولة المستهدفة (%)": item.target

                });

            });

        } else if (currentStatModalType === 'tasks') {

            list.sort((a, b) => (b.hasVisit === true) - (a.hasVisit === true));

            list.forEach(item => {

                exportData.push({

                    "اسم التاجر": item.name,

                    "الفئة": item.cat || 'غير محدد',

                    "الفريق": item.team || '-',

                    "حالة الزيارة": item.hasVisit ? 'تمت الزيارة' : 'لم تُزار بعد'

                });

            });

        } else if (currentStatModalType === 'targetSuccess') {

            list.forEach(item => {

                let ratio = item.target > 0 ? Math.round((item.achieved / item.target) * 100) : 0;

                const isFinalSigned = item.isSigned && item.achieved > 0;

                exportData.push({

                    "اسم التاجر": item.name,

                    "المستهدف (%)": item.target,

                    "المحقق/المبدئي (%)": item.achieved,

                    "نسبة الإنجاز (%)": ratio,

                    "الحالة": isFinalSigned ? 'تعاقد نهائي' : (item.isProvisional ? 'اتفاق مبدئي' : 'لم يتم')

                });

            });

        } else if (currentStatModalType === 'unsignedCats') {

            window.currentUnsignedCategoriesGlobal.forEach(cat => {

                exportData.push({ "الفئة التجارية بلا تعاقد": cat, "الحالة": "لم يتم التعاقد" });

            });

        } else if (currentStatModalType === 'topPerformer') {

            window.topPerformerContractsGlobal.forEach(c => {

                exportData.push({

                    "اسم التاجر": c.name,

                    "المندوب": c.rep,

                    "الفئة": c.cat || '-',

                    "المحقق (%)": c.achieved,

                    "المستهدف (%)": c.target

                });

            });

        } else if (currentStatModalType === 'topTeam') {

            window.topTeamContractsGlobal.forEach(c => {

                exportData.push({

                    "اسم التاجر": c.name,

                    "الفريق": c.team,

                    "المندوب": c.rep,

                    "المحقق (%)": c.achieved,

                    "المستهدف (%)": c.target

                });

            });

        }

    }



    if (exportData.length === 0) {

        return showToast("لا توجد بيانات متاحة للتصدير في هذه القائمة", false);

    }



    const ws = XLSX.utils.json_to_sheet(exportData);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Kanjo Modal List");

    XLSX.writeFile(wb, "Kanjo_Payroll_Details_Export_" + new Date().toISOString().slice(0,10) + ".xlsx");

    showToast("تم تصدير القائمة إلى ملف إكسيل بنجاح");

};

window.openExportModal = () => { document.getElementById('exportModal').classList.remove('hidden'); };



window.toggleExportOptions = (type) => {

    const isAllChecked = document.getElementById('expAll').checked;

    const expVisits = document.getElementById('expVisits');

    const expReports = document.getElementById('expReports');

    const expSigned = document.getElementById('expSigned');

    if (type === 'all') {

        if (isAllChecked) {

            expVisits.disabled = true; expReports.disabled = true; expSigned.disabled = true;

            expVisits.checked = false; expReports.checked = false; expSigned.checked = false;

        } else {

            expVisits.disabled = false; expReports.disabled = false; expSigned.disabled = false;

        }

    }

};



window.performExport = () => {

    const isAll = document.getElementById('expAll').checked;

    const wantVisits = document.getElementById('expVisits').checked;

    const wantReports = document.getElementById('expReports').checked;

    const wantSigned = document.getElementById('expSigned').checked;

    if (!isAll && !wantVisits && !wantReports && !wantSigned) { return showToast("برجاء اختيار نوع البيانات المراد تصديرها", false); }

    let exportData = [];

    window.allTasksCache.forEach(t => {

        let pass = false;

        if(wantVisits && t.attendances && t.attendances.length > 0) pass = true;

        if(wantReports && t.reports && t.reports.length > 0) pass = true;

        if(wantSigned && (t.isSigned || t.isProvisional)) pass = true;

        if(isAll) pass = true;

        

        const taskAch = Number(t.achieved) || 0;

        let contractStatusStr = "لا";

        if (t.isSigned && taskAch > 0) contractStatusStr = "تعاقد نهائي";

        else if (t.isProvisional || (t.isSigned && taskAch === 0)) contractStatusStr = "اتفاق مبدئي";



        if(pass) {

            if (t.reports && t.reports.length > 0) {

                t.reports.forEach(r => {

                    let rDate = r.date || (r.timestamp ? r.timestamp.split(' ')[0] : t.time || '-');

                    let rTime = r.time || (r.timestamp ? r.timestamp.split(' ').slice(1).join(' ') : '-');

                    exportData.push({

                        "اسم التاجر": t.name, "الفئة": t.cat, "الفريق": t.team, "تاريخ الزيارة/المهمة": t.time,

                        "المندوب (كاتب التقرير)": r.name, "تاريخ التقرير": rDate, "وقت التقرير": rTime, "اسم المتحدث معه": r.contactName || '-',

                        "الصفة / الوظيفة": r.contactRole || '-', "رقم التواصل": r.contactPhone || '-',

                        "ملاحظات عامة": r.general, "ملاحظات التاجر": r.merchant, "ملاحظات الزملاء": r.team, 

                        "القادم": r.next, "حالة التعاقد": contractStatusStr, "نسبة العمولة": taskAch + '%'

                    });

                });

            } else {

                exportData.push({

                    "اسم التاجر": t.name, "الفئة": t.cat, "الفريق": t.team, "تاريخ الزيارة/المهمة": t.time,

                    "المندوب (كاتب التقرير)": "-", "تاريخ التقرير": "-", "وقت التقرير": "-", "اسم المتحدث معه": "-", "الصفة / الوظيفة": "-", "رقم التواصل": "-",

                    "ملاحظات عامة": "-", "ملاحظات التاجر": "-", "ملاحظات الزملاء": "-", 

                    "القادم": "-", "حالة التعاقد": contractStatusStr, "نسبة العمولة": taskAch + '%'

                });

            }

        }

    });

    if(exportData.length === 0) return showToast("لا توجد بيانات تطابق الاختيارات", false);

    const ws = XLSX.utils.json_to_sheet(exportData);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Kanjo Data");

    XLSX.writeFile(wb, "Kanjo_Detailed_Export_" + new Date().toISOString().slice(0,10) + ".xlsx");

    document.getElementById('exportModal').classList.add('hidden');

    showToast("تم تصدير الداتا بالتفاصيل بنجاح");

};



window.performAdvancedExport = () => {

    if(!window.filteredTasksForExport || window.filteredTasksForExport.length === 0) {

        return showToast("لا توجد بيانات حالية مطابقة للفلاتر لتصديرها", false);

    }

    let exportData = [];

    window.filteredTasksForExport.forEach(t => {

        const taskAch = Number(t.achieved) || 0;

        let contractStatusStr = "لا";

        if (t.isSigned && taskAch > 0) contractStatusStr = "تعاقد نهائي";

        else if (t.isProvisional || (t.isSigned && taskAch === 0)) contractStatusStr = "اتفاق مبدئي";



        if (t.reports && t.reports.length > 0) {

            t.reports.forEach(r => {

                let rDate = r.date || (r.timestamp ? r.timestamp.split(' ')[0] : t.time || '-');

                let rTime = r.time || (r.timestamp ? r.timestamp.split(' ').slice(1).join(' ') : '-');

                exportData.push({

                    "اسم التاجر": t.name, "الفئة": t.cat, "الفريق": t.team, "تاريخ المهمة": t.time,

                    "المندوب (كاتب التقرير)": r.name, "تاريخ التقرير": rDate, "وقت التقرير": rTime, "اسم المتحدث معه": r.contactName || '-',

                    "الصفة / الوظيفة": r.contactRole || '-', "رقم التواصل": r.contactPhone || '-',

                    "ملاحظات عامة": r.general, "ملاحظات التاجر": r.merchant, "ملاحظات الزملاء": r.team, 

                    "القادم": r.next, "حالة التعاقد": contractStatusStr, 

                    "نسبة العمولة المستهدفة": (Number(t.target) || 0) + '%', "نسبة العمولة المحققة/المبدئية": taskAch + '%',

                    "إجمالي زيارات المهمة": t.attendances ? t.attendances.filter(a => a.type === 'start').length : 0

                });

            });

        } else {

            exportData.push({

                "اسم التاجر": t.name, "الفئة": t.cat, "الفريق": t.team, "تاريخ المهمة": t.time,

                "المندوب (كاتب التقرير)": "-", "تاريخ التقرير": "-", "وقت التقرير": "-", "اسم المتحدث معه": "-", "الصفة / الوظيفة": "-", "رقم التواصل": "-",

                "ملاحظات عامة": "-", "ملاحظات التاجر": "-", "ملاحظات الزملاء": "-", 

                "القادم": "-", "حالة التعاقد": contractStatusStr, 

                "نسبة العمولة المستهدفة": (Number(t.target) || 0) + '%', "نسبة العمولة المحققة/المبدئية": taskAch + '%',

                "إجمالي زيارات المهمة": t.attendances ? t.attendances.filter(a => a.type === 'start').length : 0

            });

        }

    });

    const ws = XLSX.utils.json_to_sheet(exportData);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Kanjo Filtered Data");

    XLSX.writeFile(wb, "Kanjo_Filtered_Dashboard_Export_" + new Date().toISOString().slice(0,10) + ".xlsx");

    showToast("تم تصدير الداتا المتفلترة بنجاح");

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

window.exportPayrollExcel = async () => {

    let exportData = [];

    

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

        console.error("Error loading payroll settings for main export:", e);

    }



    let uniqueMerchants = window.getFinalSignedMerchantsForPayroll
        ? window.getFinalSignedMerchantsForPayroll()
        : (window.currentUniqueMerchantsGlobal || new Map());

    let teamStats = window.computeTeamPayrollStats
        ? window.computeTeamPayrollStats(uniqueMerchants)
        : { 'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 }, 'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 } };



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

    const periodLabel = window.formatPayrollPeriodLabel
        ? window.formatPayrollPeriodLabel(window.getPayrollPeriodKey())
        : new Date().toISOString().slice(0, 7);



    exportData.push({

        "فترة الرواتب": periodLabel,

        "اسم الموظف / المسؤول": "مدير منطقة دسوق",

        "الفريق / الدور": "الإدارة العليا / دسوق",

        "الراتب الأساسي": desoukBaseVal,

        "إجمالي العمولات": desoukManagerCommissionAmount,

        "العمولة الإضافية (الإجمالي)": desoukExtraIncentiveTotal,

        "الإجمالي النهائي": desoukManagerNet

    });



    const reps = window.KANJO_REP_PAYROLL || [

        { name: 'سارة', team: 'Fox Team', base: 5000 },

        { name: 'مصطفى', team: 'Fox Team', base: 5000 },

        { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

        { name: 'يوسف', team: 'Power Team', base: 3000 }

    ];



    reps.forEach(rep => {

        let base = rep.base;

        let tComms = teamStats[rep.team];

        let comm = tComms.tier1 + tComms.tier2 + tComms.tier3;

        let teamExtra = singleExtraVal * tComms.extraCount;

        let net = base + comm + teamExtra;

        exportData.push({

            "فترة الرواتب": periodLabel,

            "اسم الموظف / المسؤول": rep.name,

            "الفريق / الدور": rep.team,

            "الراتب الأساسي": base,

            "إجمالي العمولات": comm,

            "العمولة الإضافية (الإجمالي)": teamExtra,

            "الإجمالي النهائي": net

        });

    });



    const ws = XLSX.utils.json_to_sheet(exportData);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Kanjo Payroll Report");

    const periodKey = window.getPayrollPeriodKey ? window.getPayrollPeriodKey() : new Date().toISOString().slice(0, 7);

    XLSX.writeFile(wb, `Kanjo_Payroll_Report_${periodKey}.xlsx`);

    showToast("تم تصدير تقرير الرواتب بنجاح");

};

/* —— Professional Contract Generator —— */

const getCurrentContractTask = () => {

    const taskIdEl = document.getElementById('cpTaskId');

    if (taskIdEl && taskIdEl.value) {

        return (window.allTasksCache || []).find(t => t.id === taskIdEl.value) || null;

    }

    return null;

};

const sanitizeFileName = (name) => {

    return String(name || '')

        .replace(/[\\/:*?"<>|]/g, '')

        .replace(/\s+/g, '_')

        .trim();

};

const formatContractDate = (dateStr) => {

    if (!dateStr) return { day: '............', date: '............' };

    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');

    if (isNaN(d.getTime())) return { day: '............', date: '............' };

    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    return { day: days[d.getDay()], date: `${d.getDate()} / ${d.getMonth() + 1} / ${d.getFullYear()}` };

};

const CONTRACT_PLACEHOLDER_CATS = ['متابعة', 'متابعه'];

const CONTRACT_BUSINESS_TYPES = {
    'مطاعم': 'مطعم',
    'كافيهات': 'مطعم',
    'سوبر ماركت': 'سوبر ماركت',
    'صيدليات': 'صيدلية',
    'عناية شخصية': 'متجر عناية شخصية',
    'كوزماتكس': 'متجر كوزماتكس',
    'أسماك': 'محل أسماك',
    'جزارة': 'محل جزارة',
    'خضار': 'متجر خضار وفاكهة',
    'دواجن': 'متجر دواجن',
    'عصائر': 'كشك عصائر',
    'مخبوزات': 'مخبز',
    'مسليات': 'متجر مسليات',
    'حلويات': 'متجر حلويات',
    'عطارة': 'متجر عطارة',
    'لبنة': 'متجر منتجات ألبان',
    'أدوات كهربائية': 'متجر أدوات كهربائية',
    'أدوات نظافة': 'متجر أدوات نظافة',
    'إكسسوارات': 'متجر إكسسوارات',
    'بيع جملة': 'مركز بيع جملة',
    'سباكة': 'متجر سباكة',
    'صيانة': 'مقدم خدمات صيانة',
    'فني كهرباء': 'مقدم خدمات كهرباء',
    'كنترول': 'متجر كنترول وألعاب',
    'لعب أطفال': 'متجر لعب أطفال',
    'مستلزمات المطبخ': 'متجر مستلزمات مطبخ',
    'مستلزمات الحيوانات': 'متجر مستلزمات حيوانات',
    'مفروشات': 'متجر مفروشات',
    'مكتبات': 'مكتبة',
    'ملابس وأدوات رياضية': 'متجر ملابس وأدوات رياضية',
    'منظفات': 'متجر منظفات',
    'هدايا': 'متجر هدايا',
    'ورود': 'متجر ورود',
    'أطقم صيني': 'متجر أطقم صيني'
};

const ARABIC_CLAUSE_NUMBERS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'];

const CONTRACT_SERIAL_START = 1001;

const buildUniqueSignedMerchants = () => {

    const source = Array.isArray(window.allTasksCache) ? window.allTasksCache : [];

    const uniqueMap = new Map();

    source.forEach(t => {

        if (!t || t.isSigned !== true || Number(t.achieved) <= 0) return;

        const base = window.getBaseName ? window.getBaseName(t.name) : t.name;

        if (!base) return;

        const existing = uniqueMap.get(base);

        if (!existing) {

            uniqueMap.set(base, t);

            return;

        }

        const existingFollowUp = existing.name !== base;

        const newFollowUp = t.name !== base;

        const existingA = Number(existing.achieved) || 0;

        const newA = Number(t.achieved) || 0;

        if (existingFollowUp && !newFollowUp) uniqueMap.set(base, t);

        else if (!existingFollowUp && newFollowUp) { /* keep existing */ }

        else if (newA > existingA) uniqueMap.set(base, t);

    });

    return Array.from(uniqueMap.values()).sort((a, b) => {

        const na = window.getBaseName ? window.getBaseName(a.name) : a.name;

        const nb = window.getBaseName ? window.getBaseName(b.name) : b.name;

        return String(na).localeCompare(String(nb), 'ar');

    });

};

window.getContractSerialNumber = (task) => {

    const merchants = buildUniqueSignedMerchants();

    const base = task ? (window.getBaseName ? window.getBaseName(task.name) : task.name) : '';

    const idx = merchants.findIndex(t => (window.getBaseName ? window.getBaseName(t.name) : t.name) === base);

    return idx >= 0 ? CONTRACT_SERIAL_START + idx : CONTRACT_SERIAL_START;

};

window.buildUniqueSignedMerchants = buildUniqueSignedMerchants;

const getMerchantBusinessInfo = (task) => {

    const baseName = window.getBaseName ? window.getBaseName(task.name) : task.name;

    const candidates = [];

    if (window.tasksMemory && window.tasksMemory.size > 0) {

        window.tasksMemory.forEach(t => {

            if (t && getBaseName(t.name) === baseName) candidates.push(t);

        });

    }

    if (Array.isArray(window.allTasksCache)) {

        window.allTasksCache.forEach(t => {

            if (t && getBaseName(t.name) === baseName) candidates.push(t);

        });

    }

    if (task && task.cat) candidates.push(task);

    let cat = '';

    let achieved = Number(task.achieved) || 0;

    candidates.forEach(t => {

        const c = String(t.cat || '').trim();

        if (c && !CONTRACT_PLACEHOLDER_CATS.includes(c)) {

            if (!cat || CONTRACT_PLACEHOLDER_CATS.includes(cat)) cat = c;

        }

        const a = Number(t.achieved) || 0;

        if (a > achieved) achieved = a;

    });

    if (!cat) cat = task.cat || 'غير محدد';

    let businessType = 'تاجر';

    for (const key in CONTRACT_BUSINESS_TYPES) {

        if (cat.includes(key)) {

            businessType = CONTRACT_BUSINESS_TYPES[key];

            break;

        }

    }

    return { baseName, cat, businessType, achieved };

};

const isFoodCategory = (cat) => {

    return ['مطاعم', 'كافيهات', 'سوبر ماركت', 'أسماك', 'جزارة', 'خضار', 'دواجن', 'عصائر', 'مخبوزات', 'مسليات', 'حلويات', 'عطارة', 'لبنة', 'أغذية'].some(k => (cat || '').includes(k));

};

const isMedicalCategory = (cat) => {

    return ['صيدليات', 'كوزماتكس', 'عناية شخصية'].some(k => (cat || '').includes(k));

};

window.exportContractPDF = async () => {

    const task = getCurrentContractTask();

    if (!task) {

        window.showToast("يرجى فتح العقد أولاً", false);

        return;

    }

    const source = document.getElementById('contract-template-container');

    if (!source) {

        window.showToast("يرجى إنشاء العقد أولاً", false);

        return;

    }

    if (typeof window.buildContractHTML === 'function') {

        window.buildContractHTML(task);

    }

    if (!source.innerHTML.trim()) {

        window.showToast("يرجى إنشاء العقد أولاً", false);

        return;

    }

    await new Promise((resolve) => {

        const imgs = Array.from(source.querySelectorAll('img'));

        if (imgs.length === 0) {

            resolve();

            return;

        }

        const fallbackTimer = setTimeout(() => resolve(), 1200);

        let pending = imgs.length;

        const markLoaded = () => {

            pending -= 1;

            if (pending <= 0) {

                clearTimeout(fallbackTimer);

                resolve();

            }

        };

        imgs.forEach((img) => {

            if (img.complete && img.naturalWidth > 0) {

                markLoaded();

                return;

            }

            img.addEventListener('load', markLoaded, { once: true });

            img.addEventListener('error', markLoaded, { once: true });

        });

    });

    source.style.display = 'block';

    source.style.position = 'absolute';

    source.style.left = '0';

    source.style.top = '0';

    source.style.width = '100%';

    source.style.background = '#ffffff';

    source.style.zIndex = '999999';

    source.style.visibility = 'visible';

    window.showToast("🖨️ جاري فتح نافذة الطباعة... (اختر حفظ كملف PDF)", true);

    window.print();

    setTimeout(() => {

        source.removeAttribute('style');

        source.style.display = 'none';

    }, 1500);

};

window.exportContractWord = () => {

    const element = document.getElementById('contract-template-container');

    if (!element || !element.innerHTML.trim()) {

        showToast("يرجى إنشاء العقد أولاً", false);

        return;

    }

    const task = getCurrentContractTask();

    const merchantName = sanitizeFileName(task ? (window.getBaseName ? window.getBaseName(task.name) : task.name) : 'متعاقد');

    const contractHtml = element.innerHTML;

    const fullHtml = `<html xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>عقد كانجو</title><style>

@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;700;900&display=swap');

body { direction: rtl; text-align: justify; font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif; line-height: 1.6; color: #1e293b; }

.contract-document { padding: 14px; }

.contract-header { border-bottom: 3px solid #4B0082; padding-bottom: 12px; margin-bottom: 16px; }

.contract-logo { max-height: 60px; }

.contract-title { text-align: center; font-size: 17px; font-weight: bold; color: #4B0082; margin-bottom: 14px; }

.contract-parties { background-color: #F8F9FA; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-bottom: 12px; }

.contract-clause-title { font-size: 13.5px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 6px 10px; border-right: 4px solid #F59E0B; margin-top: 12px; margin-bottom: 7px; }

.contract-text { font-size: 12.5px; margin-bottom: 10px; }

.contract-serial-badge { display: inline-block; font-size: 10px; font-weight: bold; color: #F59E0B; background-color: #F5F3FF; border: 1px solid #F59E0B; border-radius: 20px; padding: 2px 10px; margin-bottom: 8px; }

.contract-signatures { display: table; width: 100%; margin-top: 24px; }

.contract-sign-box { display: table-cell; width: 50%; text-align: center; font-weight: bold; font-size: 12.5px; }

.contract-clause-wrapper { page-break-inside: avoid; break-inside: avoid; margin-bottom: 35px; }

.contract-final-block { page-break-inside: avoid; break-inside: avoid; margin-top: 15px; }

.contract-contact-footer { border-top: 2px dashed #E2E8F0; margin-top: 15px; padding-top: 15px; text-align: center; }

.contract-footer-title { font-size: 12px; font-weight: bold; color: #4B0082; margin-bottom: 8px; }

.contract-footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; }

.contract-footer-item { font-size: 11px; }

.contract-footer-item a { color: #4B0082; text-decoration: none; }

.contract-footer-copyright { font-size: 10px; color: #64748B; margin-top: 10px; line-height: 1.6; }

</style></head><body>${contractHtml}</body></html>`;

    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `عقد_كانجو_${merchantName}.doc`;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 2000);

    showToast("تم تصدير العقد بصيغة Word بنجاح");

};

window.buildContractHTML = (task) => {

    if (!task) {

        showToast("المهمة غير موجودة", false);

        return;

    }

    if (typeof window.loadSavedCommissionForm === 'function') {

        window.loadSavedCommissionForm(task);

    }

    const info = getMerchantBusinessInfo(task);

    const merchantName = info.baseName;

    const businessType = info.businessType;

    const resolvedCat = info.cat;

    const isRestCafe = window.isRestaurantCafeCategoryExact ? window.isRestaurantCafeCategoryExact(resolvedCat) : window.isRestaurantCafeCategory(resolvedCat);

    const titleBusinessType = (isRestCafe && window.contractBusinessTypeOverride) ? window.contractBusinessTypeOverride : businessType;

    const achieved = info.achieved;

    const toggleEl = document.getElementById('cpExceptionToggle');

    const exceptionsEnabled = toggleEl ? toggleEl.checked : false;

    let baseCommission = null;

    let exceptions = [];

    if (exceptionsEnabled) {

        const baseEl = document.getElementById('cpBaseCommission');

        const baseRaw = baseEl ? baseEl.value : '';

        baseCommission = (baseRaw !== '' && !isNaN(parseFloat(baseRaw))) ? parseFloat(baseRaw) : null;

        exceptions = window.collectCommissionExceptions();

    }

    const displayRate = (baseCommission !== null) ? baseCommission : achieved;

    let contactName = '';

    let contactRole = '';

    let contactPhone = '';

    if (task.reports && task.reports.length > 0) {

        const lastRep = task.reports[task.reports.length - 1];

        if (lastRep.contactName) contactName = lastRep.contactName;

        if (lastRep.contactRole) contactRole = lastRep.contactRole;

        if (lastRep.contactPhone) contactPhone = lastRep.contactPhone;

    }

    const formalContactRole = String(contactRole || '').trim()

        .replace(/\s*(اونر|الاونر|صاحب المحل|صاحب المكان|صاحب المتجر|المحل)\s*/gi, 'المالك')

        .replace(/\s*(owner)\s*/gi, 'المالك')

        .replace(/\s*(مانيجر|المدير العام|المشرف)\s*/gi, 'المدير')

        .replace(/\s*(manager)\s*/gi, 'المدير')

        .replace(/\s*(بائع|موظف)\s*/gi, 'المدير');

    const address = task.address || '........................';

    const phone = contactPhone || '........................';

    const cDate = formatContractDate((typeof window.extractTaskContractDate === 'function') ? window.extractTaskContractDate(task) : task.time);

    let headerHtml = '';

    if (window.currentMerchantLogoBase64) {

        headerHtml = `

            <div class="contract-header" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; direction: rtl; border-bottom: 3px solid #4B0082; padding-bottom: 10px; margin-bottom: 16px;">

                <div><img src="logo.png" alt="Kanjo Logo" style="max-height: 55px; max-width: 110px; object-fit: contain;"></div>

                <div><img src="${window.currentMerchantLogoBase64}" alt="Merchant Logo" style="max-height: 55px; max-width: 90px; object-fit: contain;"></div>

            </div>

        `;

    } else {

        headerHtml = `

            <div class="contract-header" style="display: flex; flex-direction: row; justify-content: center; align-items: center; direction: rtl; border-bottom: 3px solid #4B0082; padding-bottom: 10px; margin-bottom: 16px;">

                <div><img src="logo.png" alt="Kanjo Logo" style="max-height: 55px; max-width: 110px; object-fit: contain;"></div>

            </div>

        `;

    }

    const clauses = [

        {

            title: 'موضوع العقد وطبيعة العلاقة',

            body: 'تقبل كانجو انضمام الطرف الثاني إلى منظومتها لعرض أو بيع أو توريد أو تخزين أو تجهيز منتجاته أو خدماته من خلال المنصة، وتتم العمليات الجوهرية عبر أدوات كانجو الرسمية، وعلى الأخص عرض المنتج، استقبال الطلب، قبوله، تجهيزه، تسليمه، تسويته ماليًا، ومعالجة شكاواه. وهذه العلاقة تجارية تشغيلية مستقلة، ولا تنشئ شركة أو وكالة عامة أو علاقة عمل أو امتياز أو تمثيل حصري. وتظل كانجو مالكة للمنصة وأنظمتها وبياناتها وقواعد العملاء والتقارير والتقييمات، بينما يظل الطرف الثاني مسؤولًا عن منتجاته وجودتها ومشروعيتها وتراخيصها وضماناتها وخدمة ما بعد البيع.'

        },

        {

            title: 'شروط الاعتماد وإقرارات الطرف الثاني',

            body: 'لا يحق للطرف الثاني عرض منتجات أو استقبال طلبات إلا بعد اعتماد كانجو وتقديم السجل أو الترخيص، البيانات الضريبية، بيانات الفروع والمخازن، الحساب البنكي، التراخيص الصحية أو النوعية، ومستندات مصدر المنتجات أو حق بيعها متى طلبت كانجو ذلك. ويقر الطرف الثاني بأن بياناته صحيحة وحديثة، وأن منتجاته أصلية ومشروعة وغير مقلدة ولا مجهولة المصدر، وأنه يملك حق بيعها أو توريدها، وأنها مطابقة للوصف والصور والمواصفات، صالحة للاستخدام أو الاستهلاك، غير منتهية الصلاحية، وأن الأسعار والمخزون والخصومات صحيحة وغير مضللة.'

        },

        {

            title: 'التزامات كانجو',

            body: 'تلتزم كانجو، في حدود طبيعة المنصة، بتمكين الطرف الثاني من عرض منتجاته بعد اعتماده، وتوفير وسيلة تشغيل إلكترونية مناسبة، وتمكين العملاء من الطلب، وإدارة دورة الطلب، وإتاحة أدوات الدفع والتوصيل والتقييم والدعم بحسب نموذج التشغيل، وإصدار كشوف تسوية دورية، وخصم رسومها ومستحقاتها، وتسوية صافي مستحقات الطرف الثاني وفق دورة التسوية المعتمدة. ولا تضمن كانجو حدًا أدنى من المبيعات أو الأرباح أو الطلبات أو الظهور أو الترتيب داخل التطبيق.'

        },

        {

            title: 'التزامات الطرف الثاني العامة',

            body: 'يلتزم الطرف الثاني بمتابعة لوحة التحكم خلال ساعات العمل، الرد على الطلبات فورًا، تجهيز الطلبات في المواعيد المحددة، تحديث الأسعار والمخزون والبيانات باستمرار، عدم قبول طلب يتعذر تنفيذه، عدم إلغاء الطلب بعد قبوله إلا لسبب مشروع، تسليم الطلب مغلفًا وآمنًا ومطابقًا، التعاون مع مندوبي التوصيل، الإفصاح الكامل عن المنتج ومحاذيره، حماية بيانات العملاء، عدم التواصل معهم خارج قنوات كانجو، عدم الالتفاف على المنصة، وتحمل مسؤولية أي خطأ أو نقص أو تلف أو تضليل أو مخالفة.'

        },

        {

            title: 'رسوم تقديم الخدمات والتشغيل',

            body: `تحصل كانجو مقابل خدمات المنصة والتشغيل على نسبة <strong>[ ${achieved}% ]</strong> من كل طلب أو عملية بيع أو توريد أو خدمة تتم أو تبدأ من خلال المنصة، ويجوز تحديد نسب مختلفة بحسب النشاط أو فئة المنتج أو المدينة أو حجم المبيعات وفق ملحق العمولات المعتمد. وتُعرض هذه النسبة بوضوح في كشف الحساب الدوري قبل التسوية، ولا تُخصم أي رسوم خفية من مستحقات الطرف الثاني. وأي طلب يبدأ من كانجو ثم ينفذ خارجها يستحق عنه كامل رسوم كانجو، ولا يجوز للطرف الثاني الالتفاف على المنصة بتقسيم الطلبات أو تغيير التصنيف أو الإلغاء بقصد التعامل الخارجي.`

        },

        {

            title: 'الأسعار والخصومات والعروض',

            body: 'يلتزم الطرف الثاني بأن تكون الأسعار صحيحة ونهائية وغير مضللة، ويحظر عليه إعلان خصم وهمي، أو تحصيل مبلغ خارج التطبيق، أو تعديل السعر بعد قبول الطلب، أو إخفاء رسوم أو ضرائب، أو رفع السعر داخل كانجو لتعويض رسوم المنصة دون إخطار. ولا يجوز إطلاق عرض أو خصم أو كوبون أو حملة داخل كانجو إلا بعد اعتماده أو إدخاله بالطريقة المعتمدة، كما يلتزم بإخطار كانجو بالعروض الخارجية الجوهرية على المنتجات ذاتها متى أثرت على عدالة التسعير أو تجربة العميل أو سمعة المنصة.'

        },

        {

            title: 'بيانات المنتجات والإفصاح الكامل',

            body: 'يلتزم الطرف الثاني بإدراج بيانات كل منتج بدقة، وتشمل الاسم، السعر، الوصف، الصور، الكمية أو الحجم أو الوزن، المكونات، بلد المنشأ عند اللزوم، تاريخ الإنتاج والانتهاء، طريقة التخزين، تعليمات الاستخدام، المحاذير، مسببات الحساسية، الضمان، شروط الاستبدال أو الإرجاع، وأي قيد قانوني أو صحي أو عمري. ويتحمل الطرف الثاني وحده مسؤولية أي خطأ أو نقص أو تضليل في بيانات المنتج أو صوره أو مكوناته أو سعره أو محاذيره.'

        }

    ];

    const FOOD_PREP_KEYWORDS = ['مطاعم', 'كافيه', 'عصائر', 'مخبوزات', 'حلويات', 'أسماك', 'جزارة', 'دواجن'];

    const catSource = String(task.cat || resolvedCat || '');

    if (FOOD_PREP_KEYWORDS.some(k => catSource.includes(k))) {

        clauses.push({

            title: 'المطاعم والكافيهات والأغذية',

            body: 'إذا كان الطرف الثاني مطعمًا أو كافيهًا أو مقدم مأكولات أو مشروبات، يلتزم بالإفصاح الواضح عن المكونات الأساسية، وبيان مسببات الحساسية بصورة بارزة مثل المكسرات، الألبان، البيض، الجلوتين، الصويا، السمسم والمأكولات البحرية، ووضع محاذير واضحة للفئات المتأثرة، وبيان السعرات الحرارية لكل منتج متى كان ذلك ممكنًا أو مطلوبًا قانونًا أو بسياسة كانجو، وتحديث ذلك فور تغيير الوصفة، والالتزام بالنظافة وسلامة الغذاء والتغليف المناسب، وتحمل أي ضرر صحي أو شكوى تنشأ عن عدم الإفصاح أو سوء التغليف أو فساد المنتج.'

        });

    }

    if (isMedicalCategory(resolvedCat)) {

        clauses.push({

            title: 'العقاقير الطبية والمنتجات المقيدة',

            body: 'إذا كان الطرف الثاني صيدلية أو شركة أدوية أو موردًا أو مخزنًا يتعامل في منتجات طبية أو صحية أو عقاقير تحتاج وصفة أو قيدًا عمريًا أو إشرافًا عائليًا، يلتزم بعدم عرض أو بيع أي منتج مقيد إلا بترخيص وموافقة كانجو، وعدم تجهيزه أو تسليمه إلا بعد التنسيق مع خدمة عملاء كانجو أو فريق الامتثال للتحقق من الوصفة أو السن أو الإشراف المطلوب، ودون أن تتحول كانجو إلى جهة وصف أو صرف طبي. ويحظر التواصل مع العميل خارج قنوات كانجو للحصول على وصفة أو بيانات صحية، وتعد الوصفات والبيانات الصحية سرية، ويلتزم الطرف الثاني بتغليف المنتج تغليفًا آمنًا ومحايدًا، ويتحمل كامل المسؤولية المهنية والقانونية عن صحة المنتج ومشروعية صرفه وحفظه وبيعه.'

        });

    }

    clauses.push(

        {

            title: 'المنتجات المحظورة والملكية الفكرية',

            body: 'يحظر عرض أو بيع أي منتج مخالف للقانون، مقلد، مغشوش، مجهول المصدر، منتهي الصلاحية، ضار بالصحة، أو ينتهك علامة تجارية أو حقوق ملكية فكرية، أو يتطلب ترخيصًا لم يقدمه الطرف الثاني، أو يخالف النظام العام أو سياسات كانجو. ويحق لكانجو إزالة أو تعليق أي منتج أو فئة فورًا عند وجود خطر قانوني أو صحي أو تشغيلي. ولا يجوز للطرف الثاني استخدام اسم أو شعار كانجو إلا بموافقة كتابية، مع منح كانجو ترخيصًا غير حصري لاستخدام صور وأوصاف منتجاته بالقدر اللازم للتشغيل والتسويق وخدمة العملاء.'

        },

        {

            title: 'المخزون والتجهيز والتغليف',

            body: 'يلتزم الطرف الثاني بتحديث المخزون فورًا، وعدم قبول طلب لمنتج غير متاح، وتجهيز الطلب بذات الأصناف والكميات والمواصفات الظاهرة في التطبيق، وعدم الاستبدال أو الحذف إلا وفق سياسة كانجو، وتغليف الطلب بصورة آمنة مناسبة لطبيعته، وفصل المنتجات التي قد تتأثر ببعضها، ومنع التسريب أو الكسر أو التلف أو التلوث، وتسليم الطلب لمندوب كانجو مغلقًا ومطابقًا وفي الوقت المحدد. ويتحمل مسؤولية أي نقص أو خطأ أو تلف أو تسريب أو تأخير ناشئ عن التجهيز أو التغليف.'

        },

        {

            title: 'خدمة ما بعد البيع والمرتجعات',

            body: 'يلتزم الطرف الثاني بالتعاون مع خدمة عملاء كانجو للرد على الاستفسارات المتعلقة بحالة الطلبات أو معالجة الشكاوى الناتجة عن عيوب التجهيز أو النقص أو التلف أو الاختلاف، دون اتصال مباشر من الطرف الثاني بالعملاء إلا من خلال قنوات كانجو الرسمية. ويتولى الطرف الثاني معالجة ما يصل إليه من ملاحظات عبر خدمة عملاء كانجو، وتنفيذ الضمان المعلن أو القانوني، وقبول المرتجعات أو الاستبدال متى كان العميل محقًا، ورد قيمة المنتج أو تعويض العميل إذا ثبت خطأ الطرف الثاني، وتقديم الفواتير ومستندات الضمان أو مصدر المنتج عند الطلب. ويتحمل تكلفة المرتجع أو الاستبدال أو التعويض إذا كان السبب راجعًا إلى عيب المنتج، سوء التغليف، خطأ التجهيز، نقص البيانات، التضليل، أو مخالفة الوصف.'

        },

        {

            title: 'الخصوصية وعدم الالتفاف والسرية',

            body: 'بيانات العملاء والطلبات والمندوبين ونسب الرسوم والتقارير وآليات التشغيل بيانات سرية، ولا يجوز حفظها أو نسخها أو تصويرها أو مشاركتها أو استخدامها خارج تنفيذ الطلب وخدمة ما بعد البيع عبر قنوات كانجو. ويحظر التواصل مع العملاء خارج المنصة، أو إرسال عروض مباشرة، أو إنشاء قاعدة بيانات من عملاء كانجو، أو وضع أرقام وروابط داخل الطلب، أو تقديم خصم للشراء المباشر، أو إلغاء طلب كانجو وتنفيذه خارجيًا، أو التحصيل خارج التطبيق. ويظل الالتزام بالسرية وعدم الالتفاف قائمًا بعد انتهاء العقد.'

        },

        {

            title: 'التقييمات والجزاءات والمسؤولية',

            body: 'يخضع الطرف الثاني لمؤشرات الأداء مثل سرعة القبول، زمن التجهيز، معدل الإلغاء، نفاد المخزون، جودة التغليف، الشكاوى، المرتجعات، تقييم العملاء ودقة البيانات. ويحق لكانجو عند المخالفة التنبيه، الإنذار، إخفاء منتج، تعليق منتج أو فرع أو حساب، خفض الظهور، وقف الحملات، خصم التعويضات، حجز المستحقات، إنهاء العقد والمطالبة بالتعويض. وتعد مخالفات جسيمة: المنتجات المقلدة أو المحظورة أو المنتهية، تسريب البيانات، التحصيل الخارجي، الالتفاف، التلاعب بالأسعار أو التقييمات، رفض مرتجع مستحق، تزوير المستندات، أو الإضرار بسمعة كانجو.'

        },

        {

            title: 'التسوية المالية وشفافية المستحقات',

            body: 'تلتزم كانجو بالشفافية الكاملة في كل التعاملات المالية؛ حيث تصدر كشف حساب دوري وواضح يوضح جميع الطلبات والمبيعات والمرتجعات ورسوم تقديم الخدمات والتشغيل وصافي المستحقات. وسواء كان الدفع نقدًا عند الاستلام أو عبر وسائل الدفع الإلكترونية، تتم التسوية وفق دورة تسوية ثابتة ومعلنة، وتصل مستحقات الطرف الثاني كاملة وفي مواعيدها دون تأخير. ويمكن للطرف الثاني متابعة مستحقاته وكشوف حسابه في أي وقت من خلال لوحة التحكم أو التطبيق، لضمان رؤية واضحة وآمنة لجميع المعاملات المالية، وتتعهد كانجو بحماية بياناته المالية وعدم مشاركتها إلا بالقدر اللازم للتشغيل.'

        },

        {

            title: 'القانون والإخطارات والأحكام الختامية',

            body: 'تكون الإخطارات صحيحة عبر البريد الإلكتروني، لوحة التحكم، التطبيق، الرسائل، واتساب العمل، الخطاب المسجل أو التسليم باليد، ويلتزم الطرف الثاني بتحديث بياناته. يخضع العقد لقوانين جمهورية مصر العربية، ويُسعى لحل النزاع وديًا خلال 15 يومًا، ثم تختص المحكمة المختصة في نطاق مقر كانجو ما لم يتفق على خلاف ذلك. ويمثل العقد وملاحقه كامل الاتفاق، ولا يعد عدم استعمال كانجو لأي حق تنازلًا عنه، وتعد سجلات المنصة وكشوف الحساب والتذاكر والتقييمات قرائن معتبرة.'

        }

    );

    const clauseHtml = clauses.map((cl, idx) => {

        const numberLabel = ARABIC_CLAUSE_NUMBERS[idx] || (idx + 1);

        return `<div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px;">

    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 10px 15px; border-right: 4px solid #F59E0B; margin-bottom: 12px;">البند ${numberLabel}: ${cl.title}</div>

    <div class="contract-text" style="font-size: 14px; line-height: 1.9; text-align: justify; color: #1e293b; font-weight: bold;">${cl.body}</div>

</div>`;

    }).join('\n\n');

    const printBorderAndWatermark = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 500px; max-width: 70vw; opacity: 0.06; z-index: 9999999; pointer-events: none; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
            <img src="logo.png" style="width: 100%; height: auto; display: block; filter: grayscale(100%);">
        </div>
    `;

    const hasMerchantLogo = !!window.currentMerchantLogoBase64;

    const tableHeader = `
        <thead>
            <tr><th style="padding: 5px 0;">
                ${hasMerchantLogo ? `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4B0082; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px;">
                    <div style="width: 100px; text-align: right;"><img src="logo.png" style="max-height: 65px; object-fit: contain;"></div>
                    <div style="font-size: 24px; font-weight: 900; color: #4B0082; text-align: center;">عقد انضمام ${titleBusinessType} ${merchantName}</div>
                    <div style="width: 100px; text-align: left;"><img src="${window.currentMerchantLogoBase64}" style="max-height: 65px; max-width: 90px; object-fit: contain;"></div>
                </div>` : `
                <div style="border-bottom: 2px solid #4B0082; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: center; align-items: center;"><img src="logo.png" style="max-height: 65px; object-fit: contain;"></div>
                    <div style="font-size: 24px; font-weight: 900; color: #4B0082; text-align: center; margin-top: 10px;">عقد انضمام ${titleBusinessType} ${merchantName}</div>
                </div>`}
            </th></tr>
        </thead>
    `;

    const tableFooter = `
        <tfoot>
            <tr><td style="padding: 0;">
                <div style="border-top: 2px solid #E2E8F0; margin-top: 15px; padding-top: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #4B0082;">
                    <span>توقيع الطرف الأول (كانجو): ..............................</span>
                    <span>توقيع الطرف الثاني (${merchantName}): ..............................</span>
                </div>
            </td></tr>
        </tfoot>
    `;

    // The main body content (Intro, Parties, Clauses, and Final Signatures + Socials)
    let commissionTableHtml = '';

    if (baseCommission !== null || exceptions.length > 0) {

        let rateRows = '';

        if (baseCommission !== null) {

            rateRows += `<tr><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">العمولة الأساسية (جميع المنتجات)</td><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">${baseCommission}%</td></tr>`;

        }

        rateRows += exceptions.map(ex => `<tr><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">${window.safeString(ex.category)}</td><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">${ex.rate}%</td></tr>`).join('');

        commissionTableHtml = `
            <div style="page-break-inside: avoid; break-inside: avoid; margin: 15px 0;">
                <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 10px;">ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; font-weight: bold; color: #1e293b;">
                    <thead>
                        <tr style="background-color: #4B0082; color: #FFFFFF;">
                            <th style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">الفئة / النشاط</th>
                            <th style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">نسبة مقابل خدمات المنصة</th>
                        </tr>
                    </thead>
                    <tbody>${rateRows}</tbody>
                </table>
            </div>`;

    }

    const tableBody = `
        <tbody>
            <tr><td style="padding: 0;">
                <div class="contract-text" style="font-size: 14px; margin-bottom: 20px; line-height: 1.8; font-weight: bold;">إنه في يوم ${cDate.day} الموافق ${cDate.date}م، تم الاتفاق والتراضي بين كل من:</div>
                <div class="contract-parties" style="background-color: #F8F9FA; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                    <strong>الطرف الأول:</strong> شركة كاند جوو لخدمات التوصيل والتجارة الالكترونية، المالكة والمشغلة للعلامة التجارية (كانجو)، ويمثلها م/ محمود الجمل بصفته مدير التشغيل والتعاقدات.<br><br>
                    <strong>الطرف الثاني:</strong> ${titleBusinessType}: ${merchantName}<br>
                    بيانات التواصل والتسوية | العنوان: ${address} | الهاتف: <span dir="ltr">${phone}</span>
                </div>
                <div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px;">
                    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 8px;">التمهيد</div>
                    <div class="contract-text" style="font-size: 14px; line-height: 1.8; text-align: justify; font-weight: bold;">حيث إن كانجو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة بما يحفظ حقوق كانجو، ويضمن جودة المنتجات. ويعد هذا التمهيد وملاحق العقد جزءًا لا يتجزأ منه.</div>
                </div>
                ${clauseHtml}
                ${commissionTableHtml}
                <!-- Legal Copies Clause -->
                <div style="page-break-inside: avoid; break-inside: avoid; margin: 15px 0; text-align: center; font-size: 13px; line-height: 1.9; font-weight: bold; color: #4B0082; background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #F59E0B; border-radius: 6px; padding: 12px 15px;">تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها، ويتكون العقد من البنود والملاحق المذكورة أعلاه.</div>
                <!-- Final Signatures Block -->
                <div style="page-break-inside: avoid; break-inside: avoid; margin-top: 20px;">
                    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 10px;">ملحق مختصر: البيانات والتوقيعات النهائية</div>
                    <div class="contract-text" style="font-size: 14px; margin-bottom: 15px; font-weight: bold;">الفئة التجارية: ${window.safeString(resolvedCat)} | نسبة مقابل خدمات المنصة: <strong>[ ${displayRate}% ]</strong></div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                        <div style="width: 45%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; background: #fff;">
                            <div style="color: #4B0082; margin-bottom: 10px; font-weight: bold;">الطرف الأول: شركة كاند جوو لخدمات التوصيل والتجارة الالكترونية</div>
                            <div>الاسم: م/ محمود الجمل</div><div>الصفة: مدير التشغيل والتعاقدات</div>
                            <div style="margin-top: 30px; font-weight: bold;">التوقيع/الختم: ..............................</div>
                        </div>
                        <div style="width: 45%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; background: #fff;">
                            <div style="color: #4B0082; margin-bottom: 10px; font-weight: bold;">الطرف الثاني: ${merchantName}</div>
                            <div>الاسم: ${window.safeString(contactName) || '....................'}</div><div>الصفة: ${window.safeString(formalContactRole) || '....................'}</div>
                            <div style="margin-top: 30px; font-weight: bold;">التوقيع/الختم: ..............................</div>
                        </div>
                    </div>
                    <!-- Social Footer -->
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #E2E8F0; display: flex; justify-content: center; gap: 20px; align-items: center; flex-wrap: wrap; direction: ltr;">
                        <div style="font-size: 12px; color: #4B0082; font-weight: bold;"><i class="fa-brands fa-facebook" style="color: #1877F2; font-size: 16px; margin-right: 5px;"></i> kanjo.app.eg</div>
                        <div style="font-size: 12px; color: #4B0082; font-weight: bold;"><i class="fa-brands fa-instagram" style="color: #E4405F; font-size: 16px; margin-right: 5px;"></i> kanjo.app.eg</div>
                        <div style="font-size: 12px; color: #4B0082; font-weight: bold;"><i class="fa-brands fa-tiktok" style="color: #000000; font-size: 16px; margin-right: 5px;"></i> @kanjo.app.eg</div>
                    </div>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b; font-weight: bold; direction: rtl;">شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية - جميع الحقوق محفوظة © 2026</div>
                </div>
            </td></tr>
        </tbody>
    `;

    const html = printBorderAndWatermark + '<table style="width: 100%; border-collapse: collapse;">' + tableHeader + tableBody + tableFooter + '</table>';

    document.getElementById('contract-template-container').innerHTML = html;

    showToast("تم إنشاء العقد بنجاح");

};

window.toggleExceptionForm = (checked) => {

    const fields = document.getElementById('cpExceptionFields');

    if (fields) fields.classList.toggle('hidden', !checked);

};

window.collectCommissionExceptions = () => {

    const exceptions = [];

    const rows = document.querySelectorAll('#cpExceptionsRows .cp-exception-row');

    rows.forEach(row => {

        const catEl = row.querySelector('.cp-exc-category');

        const rateEl = row.querySelector('.cp-exc-rate');

        const category = catEl ? String(catEl.value || '').trim() : '';

        const rate = rateEl ? parseFloat(rateEl.value) : NaN;

        if (category && !isNaN(rate) && rate >= 0) {

            exceptions.push({ category: category, rate: rate });

        }

    });

    return exceptions;

};

window.addCommissionExceptionRow = (category, rate) => {

    const container = document.getElementById('cpExceptionsRows');

    if (!container) return;

    const row = document.createElement('div');

    row.className = 'cp-exception-row flex gap-2 items-center mb-2';

    const safeCat = String(category || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const safeRate = (rate !== null && rate !== undefined && !isNaN(rate)) ? rate : '';

    row.innerHTML = `

        <input type="text" class="cp-exc-category flex-1 min-w-0 border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-kanjo-primary" placeholder="الفئة (مثال: موبايلات)" value="${safeCat}">

        <input type="number" class="cp-exc-rate w-20 border border-slate-300 rounded-xl px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-kanjo-primary" placeholder="%" min="0" max="100" step="0.1" value="${safeRate}">

        <button type="button" onclick="removeCommissionExceptionRow(this)" class="text-red-500 hover:text-red-700 font-bold text-lg px-2" title="حذف الاستثناء">&times;</button>

    `;

    container.appendChild(row);

};

window.removeCommissionExceptionRow = (btn) => {

    const row = btn && btn.closest ? btn.closest('.cp-exception-row') : null;

    if (row && row.parentNode) row.parentNode.removeChild(row);

};

window.loadSavedCommissionForm = (task) => {

    const toggleEl = document.getElementById('cpExceptionToggle');

    const baseInput = document.getElementById('cpBaseCommission');

    const rowsContainer = document.getElementById('cpExceptionsRows');

    if (!toggleEl || !baseInput || !rowsContainer) return;

    const taskIdInput = document.getElementById('cpTaskId');

    const currentTaskId = taskIdInput ? taskIdInput.value : '';

    const form = document.getElementById('cpCommissionForm');

    if (form && form.dataset && form.dataset.filledFor === currentTaskId) return;

    const saved = task && task.commission;

    const hasSaved = saved && ((saved.baseCommission !== null && saved.baseCommission !== undefined && saved.baseCommission !== '') || (Array.isArray(saved.exceptions) && saved.exceptions.length > 0));

    if (hasSaved) {

        toggleEl.checked = true;

        window.toggleExceptionForm(true);

        baseInput.value = (saved.baseCommission !== null && saved.baseCommission !== undefined && !isNaN(saved.baseCommission)) ? saved.baseCommission : '';

        rowsContainer.innerHTML = '';

        if (Array.isArray(saved.exceptions)) {

            saved.exceptions.forEach(ex => {

                if (ex && ex.category) window.addCommissionExceptionRow(ex.category, ex.rate);

            });

        }

    } else {

        toggleEl.checked = false;

        window.toggleExceptionForm(false);

        baseInput.value = '';

        rowsContainer.innerHTML = '';

    }

    if (form && form.dataset) form.dataset.filledFor = currentTaskId;

};

window.saveContractCommissions = async () => {

    const taskIdInput = document.getElementById('cpTaskId');

    const taskId = taskIdInput ? taskIdInput.value : '';

    const task = (window.allTasksCache || []).find(t => t.id === taskId);

    if (!task) {

        if (window.showToast) window.showToast('لا يوجد عقد محدد لحفظ بيانات العمولات', false);

        return;

    }

    const toggleEl = document.getElementById('cpExceptionToggle');

    const exceptionsEnabled = toggleEl ? toggleEl.checked : false;

    if (!exceptionsEnabled) {

        if (window.showToast) window.showToast('تم إنشاء العقد بالنظام القياسي (بدون نسب استثنائية)');

        window.generateContract();

        return;

    }

    const baseInput = document.getElementById('cpBaseCommission');

    const baseRaw = baseInput ? baseInput.value : '';

    const baseCommission = (baseRaw !== '' && !isNaN(parseFloat(baseRaw))) ? parseFloat(baseRaw) : null;

    const exceptions = window.collectCommissionExceptions();

    if (baseCommission === null && exceptions.length === 0) {

        if (window.showToast) window.showToast('أدخل نسبة العمولة الأساسية أو أضف استثناءً واحدًا على الأقل', false);

        return;

    }

    const payload = { commission: { baseCommission: baseCommission, exceptions: exceptions } };

    try {

        if (window.db && window.doc && window.updateDoc) {

            await window.updateDoc(window.doc(window.db, 'tasks', taskId), payload);

        }

        task.commission = payload.commission;

        if (window.showToast) window.showToast('تم حفظ بيانات العمولات وتحديث العقد');

        window.generateContract();

    } catch (err) {

        console.error('saveContractCommissions error', err);

        if (window.showToast) window.showToast('فشل حفظ بيانات العمولات', false);

    }

};

window.generateContract = () => {

    const taskIdInput = document.getElementById('cpTaskId');

    const taskId = taskIdInput ? taskIdInput.value : '';

    const task = (window.allTasksCache || []).find(t => t.id === taskId);

    if (!task) {

        if (window.showToast) window.showToast('المهمة غير موجودة', false);

        return;

    }

    if (typeof window.buildContractHTML !== 'function') return;

    window.buildContractHTML(task);

    const previewContainer = document.getElementById('contractPreviewContainer');

    const template = document.getElementById('contract-template-container');

    if (previewContainer && template) {

        previewContainer.innerHTML = template.innerHTML;

    }

};

export {};
