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

export {};
