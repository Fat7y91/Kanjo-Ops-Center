/* Kanjo Ops — Advanced Modal Interactions */

window.openMerchantProfile = (merchantBaseName) => {

    activeMerchantBaseName = merchantBaseName;

    document.getElementById('mpMerchantName').innerText = merchantBaseName;



    let matchingTasks = [];

    window.allTasksCache.forEach(t => {

        if (getBaseName(t.name) === merchantBaseName) {

            matchingTasks.push(t);

        }

    });



    let cat = 'غير محدد';

    let contactName = '';

    let contactRole = '';

    let contactPhone = '';

    let address = '';

    let fbPage = '';

    let fbGroup = '';

    let insta = '';

    let website = '';

    let team = '-';

    let isSigned = false;

    let isProvisional = false;

    let totalVisits = 0;

    let hasVisit = false;

    let allVisitsList = [];



    matchingTasks.forEach(t => {

        if (t.cat && t.cat !== 'متابعة' && t.cat !== 'متابعه') cat = t.cat;

        if (t.team) team = t.team;

        

        const taskAchieved = Number(t.achieved) || 0;

        if (t.isSigned && taskAchieved > 0) isSigned = true;

        if (t.isProvisional || (t.isSigned && taskAchieved === 0)) isProvisional = true;



        if (t.address) address = t.address;

        if (t.fbPage) fbPage = t.fbPage;

        if (t.fbGroup) fbGroup = t.fbGroup;

        if (t.insta) insta = t.insta;

        if (t.website) website = t.website;



        if (t.reports && t.reports.length > 0) {

            let lastRep = t.reports[t.reports.length - 1];

            if (lastRep.contactName) contactName = lastRep.contactName;

            if (lastRep.contactRole) contactRole = lastRep.contactRole;

            if (lastRep.contactPhone) contactPhone = lastRep.contactPhone;

        }



        if (t.attendances && t.attendances.length > 0) {

            hasVisit = true;

            let starts = t.attendances.filter(a => a.type === 'start');

            let ends = t.attendances.filter(a => a.type === 'end');

            starts.forEach((st, idx) => {

                let en = ends[idx];

                totalVisits++;

                allVisitsList.push({

                    date: st.date || t.time || '-',

                    user: st.user,

                    startTime: st.time,

                    endTime: en ? en.time : 'جارية ⏳',

                    loc: st.loc || (en ? en.loc : null)

                });

            });

        }

    });



    document.getElementById('mpMerchantCat').innerText = `الفئة: ${cat}`;

    document.getElementById('mpContactName').value = contactName;

    document.getElementById('mpContactRole').value = contactRole;

    document.getElementById('mpContactPhone').value = contactPhone;

    document.getElementById('mpAddress').value = address;

    document.getElementById('mpFbPage').value = fbPage;

    document.getElementById('mpFbGroup').value = fbGroup;

    document.getElementById('mpInsta').value = insta;

    document.getElementById('mpWebsite').value = website;



    document.getElementById('mpTeamDisplay').innerText = team;

    

    if (hasVisit) {

        document.getElementById('mpVisitStatus').innerHTML = '<span class="text-emerald-600 font-bold">تمت الزيارة ✓</span>';

    } else if (isSigned || isProvisional) {

        document.getElementById('mpVisitStatus').innerHTML = '<span class="text-purple-600 font-bold">تم تسجيل بيانات مباشرة دون زيارات ⚡</span>';

    } else {

        document.getElementById('mpVisitStatus').innerHTML = '<span class="text-amber-600 font-bold">لم تُزار ⏳</span>';

    }



    document.getElementById('mpTotalVisits').innerText = totalVisits;

    

    let contractStatusText = '<span class="text-slate-500 font-bold">لم يتم ❌</span>';

    if (isSigned) contractStatusText = '<span class="text-emerald-600 font-bold">تم التعاقد النهائي ✅</span>';

    else if (isProvisional) contractStatusText = '<span class="text-amber-600 font-bold">اتفاق مبدئي 🤝</span>';

    document.getElementById('mpContractStatus').innerHTML = contractStatusText;



    const visitsListContainer = document.getElementById('mpVisitDatesList');

    if (allVisitsList.length === 0) {

        if (isSigned || isProvisional) {

            visitsListContainer.innerHTML = '<div class="text-purple-700 font-bold">⚡ تم إتمام التعامل مع هذا التاجر وسجله بالنظام مباشرة دون زيارات ميدانية مسجلة.</div>';

        } else {

            visitsListContainer.innerHTML = '<div class="text-slate-400">لا توجد زيارات مسجلة لهذا التاجر</div>';

        }

    } else {

        visitsListContainer.innerHTML = allVisitsList.map((v, i) => `

            <div class="bg-slate-50 p-2 rounded-lg border border-purple-50 flex justify-between items-center text-[11px]">

                <div><b>الزيارة #${i+1}:</b> ${v.date} (${v.user}) - بدء: ${v.startTime}</div>

                ${v.loc ? `<a href="https://www.google.com/maps/search/?api=1&query=${v.loc}" target="_blank" class="text-blue-600 underline font-bold">🗺️ الخريطة</a>` : ''}

            </div>

        `).join('');

    }



    const isMahmoud = currentUser && currentUser.name === 'أ/ محمود';

    const isRep = currentUser && currentUser.role === 'rep';

    

    const inputIds = ['mpContactName', 'mpContactRole', 'mpContactPhone'];

    inputIds.forEach(id => {

        const el = document.getElementById(id);

        if (isMahmoud) {

            el.disabled = false;

        } else if (isRep) {

            el.disabled = (el.value.trim() !== '');

        } else {

            el.disabled = true;

        }

    });



    const addressEl = document.getElementById('mpAddress');

    if (isMahmoud) {

        addressEl.disabled = false;

    } else if (isRep) {

        addressEl.disabled = (addressEl.value.trim() !== '');

    } else {

        addressEl.disabled = true;

    }



    const linkInputIds = ['mpFbPage', 'mpFbGroup', 'mpInsta', 'mpWebsite'];

    linkInputIds.forEach(id => {

        document.getElementById(id).disabled = !(isMahmoud || isRep);

    });

    

    const mpSaveBtn = document.getElementById('mpSaveBtn');

    if (mpSaveBtn) {

        mpSaveBtn.style.display = (isMahmoud || isRep) ? 'block' : 'none';

    }



    document.getElementById('merchantProfileModal').classList.remove('hidden');

};



window.closeMerchantProfileModal = () => {

    document.getElementById('merchantProfileModal').classList.add('hidden');

    if (currentUser && currentUser.role === 'rep') {

        renderDashboard(window.lastSnapshot);

    }

};



window.saveMerchantProfile = async () => {

    const contactName = document.getElementById('mpContactName').value.trim();

    const contactRole = document.getElementById('mpContactRole').value.trim();

    const contactPhone = document.getElementById('mpContactPhone').value.trim();

    const address = document.getElementById('mpAddress').value.trim();

    const fbPage = document.getElementById('mpFbPage').value.trim();

    const fbGroup = document.getElementById('mpFbGroup').value.trim();

    const insta = document.getElementById('mpInsta').value.trim();

    const website = document.getElementById('mpWebsite').value.trim();



    const isMahmoud = currentUser && currentUser.name === 'أ/ محمود';

    const isRep = currentUser && currentUser.role === 'rep';



    const q = query(collection(db, "tasks"));

    const snap = await getDocs(q);

    const batch = writeBatch(db);



    snap.forEach((docSnap) => {

        const tData = docSnap.data();

        if (getBaseName(tData.name) === activeMerchantBaseName) {

            let updatePayload = {

                fbPage: fbPage,

                fbGroup: fbGroup,

                insta: insta,

                website: website

            };

            if (isMahmoud || address) {

                updatePayload.address = address;

            }

            batch.update(docSnap.ref, updatePayload);

        }

    });



    await batch.commit();



    if (contactName || contactPhone) {

        const reportsBatch = writeBatch(db);

        snap.forEach((docSnap) => {

            const tData = docSnap.data();

            if (getBaseName(tData.name) === activeMerchantBaseName) {

                let reports = tData.reports || [];

                if (reports.length > 0) {

                    reports[reports.length - 1].contactName = contactName || reports[reports.length - 1].contactName;

                    reports[reports.length - 1].contactRole = contactRole || reports[reports.length - 1].contactRole;

                    reports[reports.length - 1].contactPhone = contactPhone || reports[reports.length - 1].contactPhone;

                } else {

                    const todayStr = new Date().toISOString().slice(0, 10);

                    reports.push({

                        name: currentUser.name,

                        time: new Date().toLocaleTimeString(),

                        date: todayStr,

                        timestamp: `${todayStr} ${new Date().toLocaleTimeString()}`,

                        contactName: contactName,

                        contactRole: contactRole,

                        contactPhone: contactPhone,

                        general: 'استكمال بيانات المسؤول وتواصله عبر بطاقة التاجر',

                        merchant: '',

                        team: '',

                        next: ''

                    });

                }

                reportsBatch.update(docSnap.ref, { reports: reports });

            }

        });

        await reportsBatch.commit();

    }



    closeMerchantProfileModal();

    showToast("🎉 تم حفظ وتحديث بيانات بطاقة التاجر وتواصله ومزامنتها عبر كل أقسام النظام بنجاح!");

};



window.openQuickLinksModal = () => {

    const container = document.getElementById('quickLinksListContainer');

    container.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">جاري تحميل المحلات المنتظرة...</div>';

    document.getElementById('quickLinksModal').classList.remove('hidden');



    let missingLinksMerchants = new Map();



    window.allTasksCache.forEach(t => {

        if (currentUser.role === 'rep' && t.team !== currentUser.team) return;



        let hasV = (t.attendances && t.attendances.length > 0) || t.isSigned || t.isProvisional;

        if (hasV) {

            let baseN = getBaseName(t.name);

            let hasMissing = !t.fbPage || !t.fbGroup || !t.insta || !t.website || 

                           t.fbPage.trim() === '' || t.fbGroup.trim() === '' || t.insta.trim() === '' || t.website.trim() === '';

            

            if (hasMissing) {

                if (!missingLinksMerchants.has(baseN)) {

                    missingLinksMerchants.set(baseN, {

                        name: baseN,

                        cat: t.cat || 'غير محدد',

                        fbPage: t.fbPage || '',

                        fbGroup: t.fbGroup || '',

                        insta: t.insta || '',

                        website: t.website || ''

                    });

                }

            }

        }

    });



    if (missingLinksMerchants.size === 0) {

        container.innerHTML = '<div class="text-center text-emerald-600 py-8 font-bold text-sm">🎉 رائع جداً! جميع المحلات التي تمت زيارتها مكتملة البيانات والروابط الرقمية تماماً.</div>';

        return;

    }



    container.innerHTML = '';

    missingLinksMerchants.forEach((item) => {

        container.innerHTML += `

            <div class="bg-purple-50/70 p-4 rounded-2xl border border-purple-100 space-y-3">

                <div class="flex justify-between items-center">

                    <div>

                        <h4 class="font-black text-kanjo-dark text-sm">${item.name}</h4>

                        <span class="text-[11px] text-slate-500 font-bold">الفئة: ${item.cat}</span>

                    </div>

                    <button onclick="openMerchantProfile('${window.safeString(item.name)}'); closeQuickLinksModal();" class="bg-kanjo-primary text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-violet-800 transition shadow-sm">

                        <i class="fa-solid fa-pen-to-square ml-1"></i> استكمال الروابط

                    </button>

                </div>

            </div>

        `;

    });

};



window.closeQuickLinksModal = () => {

    document.getElementById('quickLinksModal').classList.add('hidden');

};



window.openArchiveReportModal = (taskId, reportIndex) => {

    if (!currentUser || currentUser.name !== 'أ/ محمود') {

        return showToast("عذراً، هذه الصلاحية مقتصرة على أ/ محمود فقط", false);

    }

    activeReportArchiveTaskId = taskId;

    activeReportArchiveIndex = reportIndex;

    document.getElementById('archiveReportReasonInput').value = '';

    document.getElementById('archiveReportModal').classList.remove('hidden');

};



window.closeArchiveReportModal = () => {

    document.getElementById('archiveReportModal').classList.add('hidden');

};



window.confirmArchiveReport = async () => {

    const reason = document.getElementById('archiveReportReasonInput').value.trim();

    if (!reason) {

        return showToast("يرجى كتابة سبب نقل التقرير إلى سلة الحفظ", false);

    }



    const taskDocRef = doc(db, "tasks", activeReportArchiveTaskId);

    const taskData = window.tasksMemory.get(activeReportArchiveTaskId);

    if (!taskData || !taskData.reports || !taskData.reports[activeReportArchiveIndex]) {

        return showToast("عذراً، التقرير غير موجود", false);

    }



    const reportToArchive = taskData.reports[activeReportArchiveIndex];

    const updatedReports = taskData.reports.filter((_, idx) => idx !== activeReportArchiveIndex);



    await updateDoc(taskDocRef, { reports: updatedReports });



    await addDoc(collection(db, "archivedReports"), {

        taskId: activeReportArchiveTaskId,

        taskName: taskData.name || '',

        report: reportToArchive,

        archivedBy: currentUser.name,

        reason: reason,

        timestamp: new Date()

    });



    closeArchiveReportModal();

    showToast("✅ تم نقل التقرير إلى سلة حفظ التقارير الخاطئة بنجاح وإزالته من التاسك والمندوب");

};



window.openViewArchivedReportsModal = async () => {

    const container = document.getElementById('archivedReportsListContainer');

    container.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">جاري تحميل التقارير المستبعدة...</div>';

    document.getElementById('viewArchivedReportsModal').classList.remove('hidden');



    const q = query(collection(db, "archivedReports"), orderBy("timestamp", "desc"));

    const snap = await getDocs(q);



    if (snap.empty) {

        container.innerHTML = '<div class="text-center text-slate-400 py-8 font-bold">سلة التقارير الخاطئة فارغة تماماً</div>';

        return;

    }



    container.innerHTML = '';

    snap.forEach(docSnap => {

        const item = docSnap.data();

        const rep = item.report || {};

        container.innerHTML += `

            <div class="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2 text-xs">

                <div class="flex justify-between items-center font-black text-amber-950">

                    <span>المحل: ${item.taskName} (كاتب التقرير: ${rep.name || '-'})</span>

                    <span class="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">نقل بواسطة: ${item.archivedBy}</span>

                </div>

                <div class="bg-white p-3 rounded-xl border border-amber-100 space-y-1 text-slate-700">

                    <div><b>محتوى التقرير المستبعد:</b> ${rep.general || rep.merchant || rep.team || 'بدون ملاحظات'}</div>

                    <div class="text-amber-900 font-bold pt-1"><b>سبب النقل لسلة الحفظ:</b> ${item.reason}</div>

                </div>

            </div>

        `;

    });

};



window.printDetailsContent = () => {

    const content = document.getElementById('detailsContent').innerHTML;

    const title = document.getElementById('detailsTitle').innerText;

    const printWindow = window.open('', '', 'height=700,width=900');

    printWindow.document.write(`

        <html lang="ar" dir="rtl">

        <head>

            <title>Kanjo - ${title}</title>

            <style>

                body { font-family: Tahoma, Arial, sans-serif; padding: 25px; color: #1e293b; background: #fff; }

                h2 { text-align: center; color: #4C1D95; margin-bottom: 25px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }

                div { margin-bottom: 10px; }

                .p-4, .p-3, .bg-kanjo-light, .bg-emerald-50, .bg-blue-50, .bg-orange-50, .bg-amber-50 {

                    border: 1px solid #cbd5e1 !important;

                    padding: 12px !important;

                    margin-bottom: 10px !important;

                    border-radius: 8px !important;

                    background: #f8fafc !important;

                }

                .font-black, .font-bold { font-weight: bold; }

                a { text-decoration: none; color: #2563eb; }

            </style>

        </head>

        <body>

            <h2>${title}</h2>

            <div>${content}</div>

            <script>

                window.onload = function() { window.print(); window.close(); }

            </script>

        </body>

        </html>

    `);

    printWindow.document.close();

};



window.resetReportFields = () => {

    document.getElementById('repContactName').value = '';

    document.getElementById('repContactRole').value = '';

    document.getElementById('repContactPhone').value = '';

    document.getElementById('repGeneral').value = '';

    document.getElementById('repMerchant').value = '';

    document.getElementById('repTeam').value = '';

    document.getElementById('repNext').value = '';

    document.getElementById('repPercentage').value = '';

    

    document.getElementById('repNoContract').checked = true;

    document.getElementById('repProvContract').checked = false;

    document.getElementById('repIsSigned').checked = false;



    document.getElementById('repCreateTask').checked = false;

    document.getElementById('repNextDate').value = '';

    document.getElementById('repNextType').value = 'زيارة';

    window.toggleAchievedField();

    window.toggleTaskOptions();

};



window.toggleTaskOptions = () => { 

    const isChecked = document.getElementById('repCreateTask').checked; 

    document.getElementById('repNextDate').disabled = !isChecked; 

    document.getElementById('repNextType').disabled = !isChecked; 

};



window.toggleAchievedField = () => { 

    const isNoContract = document.getElementById('repNoContract').checked;

    document.getElementById('repPercentage').disabled = isNoContract; 

};



window.openReportModal = (taskId, name, team, target, notes) => { 

    activeTaskId = taskId; 

    activeTaskName = name; 

    activeTaskTeam = team; 

    currentTarget = target || 0; 

    currentNotes = notes || ""; 

    window.resetReportFields(); 

    document.getElementById('modalTaskName').innerText = name; 

    document.getElementById('reportModal').classList.remove('hidden'); 

};



window.closeReportModal = () => document.getElementById('reportModal').classList.add('hidden');



window.openEditModal = (id, data) => { 

    editTaskId = id; 

    document.getElementById('editName').value = data.name; 

    document.getElementById('editCat').value = data.cat; 

    document.getElementById('editTeam').value = data.team; 

    document.getElementById('editDate').value = data.time; 

    document.getElementById('editTarget').value = data.target; 

    document.getElementById('editNotes').value = data.notes; 

    document.getElementById('editModal').classList.remove('hidden'); 

};



window.closeEditModal = () => document.getElementById('editModal').classList.add('hidden');



window.openTransferModal = (taskId, taskName, taskTeam) => {

    activeTransferTaskId = taskId;

    activeTransferTaskName = taskName;

    activeTransferTaskTeam = taskTeam;

    document.getElementById('transferModalSubtitle').innerHTML = `المحل المطلوب نقله:<br><span class="text-kanjo-primary font-black text-sm block mt-1">${taskName}</span><span class="text-slate-500 font-bold block mt-1">يتبع حالياً: (${taskTeam})</span>`;

    document.getElementById('transferReasonInput').value = '';

    document.getElementById('transferModal').classList.remove('hidden');

};



window.closeTransferModal = () => {

    document.getElementById('transferModal').classList.add('hidden');

};



window.submitTransferRequest = async () => {

    const reason = document.getElementById('transferReasonInput').value.trim();

    if (!reason) {

        return showToast("برجاء كتابة أسباب طلب النقل", false);

    }

    const currentTeam = currentUser.team;

    

    await addDoc(collection(db, "transferRequests"), {

        taskId: activeTransferTaskId,

        taskName: activeTransferTaskName,

        fromTeam: activeTransferTaskTeam,

        toTeam: currentTeam,

        requestedBy: currentUser.name,

        reason: reason,

        status: 'pending',

        timestamp: new Date()

    });



    window.closeTransferModal();

    showToast("تم إرسال طلب النقل إلى إدارة التشغيل بنجاح");

};



window.openAdminTransferModal = async () => {

    const listContainer = document.getElementById('adminTransferList');

    listContainer.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">جاري تحميل الطلبات...</div>';

    document.getElementById('adminTransferModal').classList.remove('hidden');



    const q = query(collection(db, "transferRequests"), where("status", "==", "pending"));

    const snap = await getDocs(q);



    if (snap.empty) {

        listContainer.innerHTML = '<div class="text-center text-slate-400 py-8 font-bold">لا توجد طلبات نقل معلقة حالياً</div>';

        return;

    }



    listContainer.innerHTML = '';

    snap.forEach(docSnap => {

        const req = docSnap.data();

        const reqId = docSnap.id;



        listContainer.innerHTML += `

            <div class="bg-purple-50/70 p-4 rounded-2xl border border-purple-100 space-y-2">

                <div class="flex justify-between items-center font-black text-kanjo-dark text-sm">

                    <span>${req.taskName}</span>

                    <span class="text-xs bg-purple-200 text-purple-900 px-2.5 py-1 rounded-full">نقل من (${req.fromTeam}) إلى (${req.toTeam})</span>

                </div>

                <div class="text-xs text-slate-600">

                    <b>المقدم:</b> ${req.requestedBy}

                </div>

                <div class="bg-white p-3 rounded-xl border border-purple-100 text-xs text-slate-700">

                    <b>السبب:</b> ${req.reason}

                </div>

                <div class="flex gap-2 pt-2">

                    <button onclick="approveTransfer('${reqId}', '${req.taskId}', '${req.toTeam}')" class="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition">قبول ونقل المهمة</button>

                    <button onclick="rejectTransfer('${reqId}')" class="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-red-700 transition">إلغاء / رفض</button>

                </div>

            </div>

        `;

    });

};



window.approveTransfer = async (reqId, taskId, targetTeam) => {

    const todayStr = new Date().toISOString().slice(0, 10);

    

    await updateDoc(doc(db, "tasks", taskId), {

        team: targetTeam,

        time: todayStr

    });



    await updateDoc(doc(db, "transferRequests", reqId), {

        status: 'approved'

    });



    document.getElementById('adminTransferModal').classList.add('hidden');

    showToast("🎉 تمت الموافقة على طلب النقل ونقل المهمة لتاريخ اليوم بنجاح!");

};



window.rejectTransfer = async (reqId) => {

    await updateDoc(doc(db, "transferRequests", reqId), {

        status: 'rejected'

    });

    document.getElementById('adminTransferModal').classList.add('hidden');

    showToast("تم إغلاق طلب النقل");

};



window.promptDelete = (id) => { taskToDelete = id; document.getElementById('deleteModal').classList.remove('hidden'); };

window.closeDeleteModal = () => document.getElementById('deleteModal').classList.add('hidden');

window.confirmDelete = async () => { await deleteDoc(doc(db, "tasks", taskToDelete)); closeDeleteModal(); showToast("تم حذف المهمة نهائياً"); };

export {};
