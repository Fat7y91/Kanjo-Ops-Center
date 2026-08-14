import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, onSnapshot, query, where, updateDoc, doc, arrayUnion, deleteDoc, orderBy, getDocs, writeBatch, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";



const firebaseConfig = { apiKey: "AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0", authDomain: "kanjo-desouk.firebaseapp.com", projectId: "kanjo-desouk", storageBucket: "kanjo-desouk.firebasestorage.app", messagingSenderId: "253872156774", appId: "1:253872156774:web:1d554b3bf0b78b98c77da7", measurementId: "G-FBM6G2RF1B" };

const app = initializeApp(firebaseConfig);



let db;

try {

    db = initializeFirestore(app, {

        localCache: persistentLocalCache({

            tabManager: persistentMultipleTabManager()

        })

    });

} catch (e) {

    db = getFirestore(app);

}



window.db = db; window.collection = collection; window.addDoc = addDoc;

window.onSnapshot = onSnapshot; window.query = query; window.where = where;

window.updateDoc = updateDoc; window.doc = doc; window.arrayUnion = arrayUnion;

window.deleteDoc = deleteDoc; window.orderBy = orderBy; window.getDocs = getDocs;



let editTaskId = null, taskToDelete = null; window.allTasksCache = [];

let isLiveView = false;

window.currentTarget = 0; window.currentNotes = "";



window.tasksMemory = new Map();

window.pendingTransferTaskIds = new Set();

let perfChartInstance = null;

let catChartInstance = null;

window.filteredTasksForExport = [];

window.currentUniqueMerchantsGlobal = new Map();

window.currentUnsignedCategoriesGlobal = []; 

window.topPerformerContractsGlobal = [];

window.topTeamContractsGlobal = [];



let activeTransferTaskId = null;

let activeTransferTaskName = '';

let activeTransferTaskTeam = '';



let activeMerchantBaseName = '';

let currentStatModalType = '';



let activeReportArchiveTaskId = null;

let activeReportArchiveIndex = null;



const userImageMap = {

    'سارة': 'Sara Zabady.png',

    'مصطفى': 'Mostafa ibrahim.png',

    'أحمد جمعه': 'Ahmed Gomaa.png',

    'يوسف': 'YOUSEF AYMAN.png'

};



const teamImageMap = {

    'Fox Team': 'Fox Team.png',

    'Power Team': 'Power Team.png'

};



const getBaseName = (name) => {

    if (!name) return '';

    let clean = name;

    while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {

        clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();

    }

    return clean.trim();

};



window.showToast = (message, isSuccess = true) => {

    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');

    toast.className = `p-4 rounded-2xl shadow-lg text-white font-bold flex items-center gap-3 ${isSuccess ? 'bg-emerald-600' : 'bg-red-600'} toast-animate`;

    toast.innerHTML = `<i class="fa-solid ${isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);

};



window.safeString = (str) => {

    if (!str) return '';

    return String(str)

        .replace(/\\/g, '\\\\')

        .replace(/'/g, "\\'")

        .replace(/"/g, '&quot;')

        .replace(/\n/g, '\\n')

        .replace(/\r/g, '\\r');

};



async function getCleanAddressFromCoords(lat, lon) {

    try {

        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {

            headers: {

                'Accept-Language': 'ar'

            }

        });

        

        if (!response.ok) return null;

        

        const data = await response.json();

        if (data && data.address) {

            const addr = data.address;

            const road = addr.road || addr.pedestrian || addr.footway || addr.street || '';

            const houseNumber = addr.house_number || '';

            const neighbourhood = addr.neighbourhood || addr.suburb || addr.city_district || '';

            const city = addr.city || addr.town || addr.village || addr.state || '';

            

            let parts = [];

            if (road) parts.push(road);

            if (houseNumber) parts.push(`مبنى ${houseNumber}`);

            if (neighbourhood && neighbourhood !== city) parts.push(neighbourhood);

            if (city) parts.push(city);

            

            if (parts.length > 0) {

                return parts.join('، ');

            }

        }

        return data.display_name || `${lat}, ${lon}`;

    } catch (e) {

        return null;

    }

}



let hasRunGeoUpdate = false;

async function checkAndUpdateMissingAddresses(tasksCache) {

    if (!currentUser || (currentUser.name !== 'أ/ محمود' && currentUser.role !== 'founder')) return;

    if (hasRunGeoUpdate) return;

    hasRunGeoUpdate = true;

    

    let updateCount = 0;

    

    for (let t of tasksCache) {

        if (updateCount >= 5) break;

        

        if ((!t.address || t.address.trim() === '') && t.attendances && t.attendances.length > 0) {

            let lastAttWithLoc = t.attendances.slice().reverse().find(a => a.loc && a.loc.includes(','));

            if (lastAttWithLoc) {

                const [lat, lon] = lastAttWithLoc.loc.split(',').map(Number);

                if (!isNaN(lat) && !isNaN(lon)) {

                    await new Promise(res => setTimeout(res, 2000));

                    let cleanAddr = await getCleanAddressFromCoords(lat, lon);

                    if (cleanAddr) {

                        const baseN = getBaseName(t.name);

                        const q = query(collection(db, "tasks"));

                        const snap = await getDocs(q);

                        const batch = writeBatch(db);

                        snap.forEach(docSnap => {

                            if (getBaseName(docSnap.data().name) === baseN) {

                                batch.update(docSnap.ref, { address: cleanAddr });

                            }

                        });

                        await batch.commit();

                        updateCount++;

                    }

                }

            }

        }

    }

}



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



        let teamStats = { 

            'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 }, 

            'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 } 

        };



        let uniqueMerchants = window.currentUniqueMerchantsGlobal || new Map();

        uniqueMerchants.forEach((data) => {

            if (data.isSigned && data.achieved > 0 && data.team && teamStats[data.team]) {

                let ratio = data.target > 0 ? (data.achieved / data.target) * 100 : 0;

                if (ratio > 100) {

                    teamStats[data.team].extraCount++;

                } else if (ratio === 100) {

                    teamStats[data.team].tier1Count++;

                    teamStats[data.team].tier1 += 200;

                } else if (ratio > 90) {

                    teamStats[data.team].tier2Count++;

                    teamStats[data.team].tier2 += 150;

                } else {

                    teamStats[data.team].tier3Count++;

                    teamStats[data.team].tier3 += 100;

                }

            }

        });



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



        const reps = [

            { name: 'سارة', team: 'Fox Team', base: 5000 },

            { name: 'مصطفى', team: 'Fox Team', base: 5000 },

            { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

            { name: 'يوسف', team: 'Power Team', base: 2000 }

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



window.formatNotificationTime = (timestamp) => {

    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    const now = new Date();

    const diffMs = now - date;

    const diffMins = Math.floor(diffMs / 60000);

    const diffHours = Math.floor(diffMins / 60);



    if (diffMins < 30) {

        if (diffMins <= 1) return 'منذ لحظات';

        return `منذ ${diffMins} دقائق`;

    } else if (diffHours < 24) {

        return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    } else {

        return `${date.toLocaleDateString('ar-EG')} - ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

    }

};



window.toggleNotifications = () => {

    const dropdown = document.getElementById('notificationsDropdown');

    dropdown.classList.toggle('hidden');

};



document.addEventListener('click', (e) => {

    const wrapper = document.getElementById('notificationsWrapper');

    const dropdown = document.getElementById('notificationsDropdown');

    if (wrapper && !wrapper.contains(e.target) && !dropdown.classList.contains('hidden')) {

        dropdown.classList.add('hidden');

    }

});



window.clearNotifications = async () => {

    const q = query(collection(db, "notifications"), where("isRead", "==", false));

    const querySnapshot = await getDocs(q);

    const batch = writeBatch(db);

    querySnapshot.forEach((doc) => {

        batch.update(doc.ref, { isRead: true });

    });

    await batch.commit();

    document.getElementById('notificationsDropdown').classList.add('hidden');

    showToast("تم تحديد الكل كمقروء");

};



const updateNotificationsUI = (notifs) => {

    const list = document.getElementById('notificationsList');

    const badge = document.getElementById('notifBadge');

    if(!list || !badge) return;

    list.innerHTML = '';

    

    const uniqueNotifsMap = new Map();

    notifs.forEach(n => {

        const key = `${n.taskId || ''}-${n.title || ''}-${n.body || ''}`;

        if (!uniqueNotifsMap.has(key) || (n.timestamp > uniqueNotifsMap.get(key).timestamp)) {

            uniqueNotifsMap.set(key, n);

        }

    });

    const cleanNotifs = Array.from(uniqueNotifsMap.values());



    const unreadCount = cleanNotifs.filter(n => !n.isRead).length;

    

    if (cleanNotifs.length === 0) {

        badge.classList.add('hidden');

        list.innerHTML = '<div class="p-6 text-center text-slate-400 font-bold text-sm">لا توجد إشعارات</div>';

        return;

    }



    if (unreadCount === 0) {

        badge.classList.add('hidden');

    } else {

        badge.classList.remove('hidden');

    }



    cleanNotifs.sort((a, b) => {

        const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);

        const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);

        return timeB - timeA;

    }).forEach((notif) => {

        const item = document.createElement('div');

        const isUnread = !notif.isRead;

        item.className = `p-3 border-b border-purple-50 cursor-pointer transition-colors ${isUnread ? 'bg-purple-50/70 font-semibold' : 'bg-white hover:bg-slate-50 opacity-80'}`;

        

        const timeStr = window.formatNotificationTime(notif.timestamp);



        item.innerHTML = `

            <div class="flex gap-3 items-start">

                <div class="text-${notif.color} mt-1"><i class="fa-solid ${notif.icon} text-lg"></i></div>

                <div class="flex-1">

                    <div class="flex justify-between items-center">

                        <div class="font-bold text-sm text-slate-800">${notif.title} ${isUnread ? '<span class="inline-block w-2 h-2 bg-kanjo-primary rounded-full mr-1"></span>' : ''}</div>

                        <span class="text-[10px] text-slate-400 font-medium">${timeStr}</span>

                    </div>

                    <div class="text-xs text-slate-500 mt-0.5">${notif.body}</div>

                </div>

            </div>

        `;

        item.onclick = () => {

            document.getElementById('notificationsDropdown').classList.add('hidden');

            if (notif.taskId) window.goToTask(notif.taskId, notif.date);

        };

        list.appendChild(item);

    });

};



window.goToTask = (taskId, taskDate) => {

    const detailsElements = document.querySelectorAll('details');

    detailsElements.forEach(d => { if (d.innerHTML.includes(taskDate)) d.open = true; });

    setTimeout(() => {

        const taskDiv = document.getElementById(`task-card-${taskId}`);

        if (taskDiv) {

            taskDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

            taskDiv.classList.add('highlight-task');

            setTimeout(() => { taskDiv.classList.remove('highlight-task'); }, 2000);

        } else { showToast("قد تكون هذه المهمة مخفية حالياً", false); }

    }, 300);

};



window.notifyManager = async (title, body, type, taskId, taskDate) => {

    let icon = 'fa-bell'; let color = 'kanjo-primary';

    if(type === 'report') { icon = 'fa-file-lines'; color = 'blue-500'; }

    if(type === 'visit') { icon = 'fa-location-dot'; color = 'red-500'; }

    if(type === 'contract') { icon = 'fa-handshake'; color = 'green-500'; }

    if(type === 'financial') { icon = 'fa-money-check-dollar'; color = 'emerald-600'; }



    await addDoc(collection(db, "notifications"), {

        title, body, icon, color, taskId, date: taskDate || '', isRead: false, timestamp: new Date()

    });

};



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



const SESSION_KEY = 'kanjo_session_user';

const IDLE_TIMEOUT = 30 * 60 * 1000; 

let idleTimer;

const resetIdleTimer = () => {

    clearTimeout(idleTimer);

    idleTimer = setTimeout(() => { if (window.currentUser) window.logout(); }, IDLE_TIMEOUT);

};

['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => document.addEventListener(evt, resetIdleTimer, true));

window.saveSession = (user) => localStorage.setItem(SESSION_KEY, JSON.stringify(user));

window.clearSession = () => localStorage.removeItem(SESSION_KEY);



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



window.closeStatModal = () => document.getElementById('detailsModal').classList.add('hidden');



window.showFounderPayrollDetails = async () => {

    currentStatModalType = 'founder_payroll_details';

    const modal = document.getElementById('detailsModal');

    const content = document.getElementById('detailsContent');

    const title = document.getElementById('detailsTitle');

    

    content.innerHTML = '<div class="text-center py-6 font-bold text-slate-500">جاري سحب وجلب بيانات الرواتب وإعدادات قسم الحسابات...</div>';

    title.innerText = "تفاصيل الرواتب الشهرية والمنصرف الحالي للشركة عن الشهر الحالي";

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



    let teamStats = { 

        'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0, total: 0 }, 

        'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0, total: 0 } 

    };



    let uniqueMerchants = window.currentUniqueMerchantsGlobal || new Map();

    uniqueMerchants.forEach((data) => {

        if (data.isSigned && data.achieved > 0 && data.team && teamStats[data.team]) {

            let ratio = data.target > 0 ? (data.achieved / data.target) * 100 : 0;

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

        }

    });



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



    const reps = [

        { name: 'سارة', team: 'Fox Team', base: 5000 },

        { name: 'مصطفى', team: 'Fox Team', base: 5000 },

        { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

        { name: 'يوسف', team: 'Power Team', base: 2000 }

    ];



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



window.showCardDetails = (cardType) => {

    currentStatModalType = cardType;

    const modal = document.getElementById('detailsModal');

    const content = document.getElementById('detailsContent');

    const title = document.getElementById('detailsTitle');

    content.innerHTML = '';



    let list = [];

    window.currentUniqueMerchantsGlobal.forEach((data, name) => {

        list.push({ name, ...data });

    });



    const getMerchantProfileBtnHtml = (merchantName) => `

        <button onclick="openMerchantProfile('${window.safeString(merchantName)}')" class="bg-purple-100 text-kanjo-primary hover:bg-purple-200 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm">

            <i class="fa-solid fa-id-card"></i> <span>بطاقة التاجر</span>

        </button>

    `;



    const todayStr = new Date().toISOString().slice(0, 10);



    if (cardType === 'targets') {

        title.innerText = "تفاصيل نسب العمولة المستهدفة للمحلات";

        list.sort((a, b) => b.target - a.target);

        list.forEach(item => {

            content.innerHTML += `

                <div class="bg-kanjo-light p-4 rounded-2xl border border-purple-100 flex justify-between items-center text-sm">

                    <div>

                        <div class="font-black text-kanjo-dark">${item.name}</div>

                        <div class="text-slate-500 text-[11px]">الفئة: ${item.cat || 'غير محدد'} | الفريق: ${item.team || '-'}</div>

                    </div>

                    <div class="flex items-center gap-3">

                        <div class="bg-purple-100 px-3 py-1 rounded-full text-xs font-bold text-kanjo-primary">المستهدف: ${item.target}%</div>

                        ${getMerchantProfileBtnHtml(item.name)}

                    </div>

                </div>

            `;

        });

    } else if (cardType === 'achieved' || cardType === 'payroll_tier1' || cardType === 'payroll_tier2' || cardType === 'payroll_tier3') {

        if (cardType === 'payroll_tier1') title.innerText = "تفاصيل العقود المؤكدة (الفئة الأولى - 100% | 200 جنيه)";

        else if (cardType === 'payroll_tier2') title.innerText = "تفاصيل العقود المؤكدة (الفئة الثانية - أكبر من 90% | 150 جنيه)";

        else if (cardType === 'payroll_tier3') title.innerText = "تفاصيل العقود المؤكدة (الفئة الثالثة - أقل من 90% | 100 جنيه)";

        else title.innerText = "تفاصيل العقود المحققة والاتفاقات المبدئية";



        const signedOrProvList = list.filter(i => {

            if (!i.isSigned || i.achieved <= 0) return false;

            let ratio = i.target > 0 ? (i.achieved / i.target) * 100 : 0;

            

            if (cardType === 'payroll_tier1' && ratio !== 100) return false;

            if (cardType === 'payroll_tier2' && ratio <= 90) return false;

            if (cardType === 'payroll_tier3' && ratio >= 90) return false;

            return true;

        });

        

        signedOrProvList.forEach(item => {

            let assignedTeam = item.team || '-';

            let latestDate = '';

            let latestTimestamp = '';

            let lastContactName = '';

            let lastContactPhone = '';

            let lastContactRole = '';

            let allNotes = [];

            

            window.allTasksCache.forEach(t => {

                if (getBaseName(t.name) === item.name) {

                    if (t.team) assignedTeam = t.team;

                    if (t.reports && t.reports.length > 0) {

                        t.reports.forEach(r => {

                            let rDate = r.date || (r.timestamp ? r.timestamp.split(' ')[0] : '');

                            let rTime = r.time || (r.timestamp ? r.timestamp.split(' ').slice(1).join(' ') : '');

                            let rTimestamp = r.timestamp || `${rDate} ${rTime || '00:00:00'}`;

                            

                            if (rDate && rDate <= todayStr) {

                                if (!latestDate || rDate > latestDate) {

                                    latestDate = rDate;

                                }

                            }

                            if (rTimestamp) {

                                let datePart = rTimestamp.split(' ')[0];

                                if (!datePart || datePart <= todayStr) {

                                    if (!latestTimestamp || rTimestamp > latestTimestamp) {

                                        latestTimestamp = rTimestamp;

                                    }

                                }

                            }

                            if (r.contactName) lastContactName = r.contactName;

                            if (r.contactPhone) lastContactPhone = r.contactPhone;

                            if (r.contactRole) lastContactRole = r.contactRole;

                        });

                    }

                    if (!latestDate && t.time && t.time <= todayStr) {

                        latestDate = t.time;

                    }

                    if (!latestTimestamp && t.time && t.time <= todayStr) {

                        latestTimestamp = `${t.time} 00:00:00`;

                    }

                    if (t.notes) allNotes.push(t.notes);

                }

            });

            item.assignedTeam = assignedTeam;

            item.contractDate = latestDate || todayStr;

            item.contractTimestamp = latestTimestamp || `${todayStr} 00:00:00`;

            item.contactName = lastContactName;

            item.contactPhone = lastContactPhone;

            item.contactRole = lastContactRole;

            item.notes = allNotes.join(' | ');

        });



        signedOrProvList.sort((a, b) => {

            return (b.contractTimestamp || '').localeCompare(a.contractTimestamp || '');

        });



        if (signedOrProvList.length === 0) {

            content.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">لا توجد عقود مسجلة في هذه الفئة حالياً</div>';

        } else {

            signedOrProvList.forEach(item => {

                let cardBgClass = 'bg-emerald-50/70 border-emerald-200';

                let titleColorClass = 'text-emerald-950';



                let targetBadge = `<span class="inline-flex items-center gap-1 bg-purple-100 text-purple-900 px-2.5 py-1 rounded-lg text-xs font-bold">🎯 المستهدف: ${item.target || 0}%</span>`;

                let statusBadge = `<span class="inline-flex items-center gap-1 bg-emerald-200 text-emerald-900 px-2.5 py-1 rounded-lg text-xs font-bold">✅ تعاقد نهائي: ${item.achieved}%</span>`;



                let ratioBadge = '';

                if (item.target > 0) {

                    let ratio = Math.round((item.achieved / item.target) * 100);

                    let ratioColor = 'bg-emerald-100 text-emerald-800';

                    ratioBadge = `<span class="inline-flex items-center gap-1 ${ratioColor} px-2.5 py-1 rounded-lg text-xs font-bold">📈 نسبة الإنجاز: ${ratio}%</span>`;

                }



                content.innerHTML += `

                    <div class="${cardBgClass} p-4 rounded-2xl border shadow-sm space-y-3">

                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/60 pb-2.5">

                            <div>

                                <div class="flex items-center gap-2 flex-wrap">

                                    <h4 class="font-black ${titleColorClass} text-base">${item.name}</h4>

                                    <span class="text-xs bg-white/80 px-2.5 py-0.5 rounded-full font-bold text-slate-600 border border-slate-200">📅 التاريخ: ${item.contractDate}</span>

                                </div>

                                <div class="text-xs text-slate-600 font-bold mt-1 flex items-center gap-3 flex-wrap">

                                    <span>👥 الفريق: <span class="text-kanjo-primary font-black">${item.assignedTeam}</span></span>

                                    <span>📂 الفئة: ${item.cat || 'غير محدد'}</span>

                                </div>

                            </div>

                            <div>${getMerchantProfileBtnHtml(item.name)}</div>

                        </div>



                        <div class="flex flex-wrap gap-2 items-center">

                            ${targetBadge}

                            ${statusBadge}

                            ${ratioBadge}

                        </div>



                         ${(item.contactName || item.contactPhone || item.notes) ? `

                            <div class="bg-white/90 p-3 rounded-xl border border-slate-200/80 text-xs space-y-1 text-slate-700">

                                ${(item.contactName || item.contactPhone) ? `

                                    <div class="font-bold text-slate-900 flex items-center justify-between flex-wrap gap-2">

                                        <span>👤 المسؤول: ${item.contactName || '-'} (${item.contactRole || 'بدون صفة'})</span>

                                        <div class="flex items-center gap-1 text-emerald-800"><i class="fa-solid fa-phone-flip text-emerald-600"></i> <span dir="ltr" class="font-mono whitespace-nowrap text-right">${item.contactPhone || 'بدون رقم'}</span></div>

                                    </div>

                                ` : ''}

                                ${item.notes ? `<div class="text-slate-600"><b>📝 الملاحظات:</b> ${item.notes}</div>` : ''}

                            </div>

                        ` : ''}

                    </div>

                `;

            });

        }

    } else if (cardType === 'tasks') {

        title.innerText = "تفاصيل تغطية الميدان (حالة زيارة المحلات)";

        list.sort((a, b) => (b.hasVisit === true) - (a.hasVisit === true));

        list.forEach(item => {

            content.innerHTML += `

                <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex justify-between items-center text-sm">

                    <div>

                        <div class="font-black text-blue-900">${item.name}</div>

                        <div class="text-slate-500 text-[11px]">الفئة: ${item.cat || 'غير محدد'}</div>

                    </div>

                    <div class="flex items-center gap-3">

                        <div class="px-3 py-1 rounded-full text-xs font-bold ${item.hasVisit ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">

                            ${item.hasVisit ? 'تمت الزيارة ✓' : 'لم تُزار بعد ⏳'}

                        </div>

                        ${getMerchantProfileBtnHtml(item.name)}

                    </div>

                </div>

            `;

        });

    } else if (cardType === 'visits') {

        title.innerText = "سجل الزيارات الميدانية مجمعة حسب المكان";

        let merchantVisitsMap = new Map();

        window.allTasksCache.forEach(t => {

            if (t.attendances && t.attendances.length > 0) {

                if (!merchantVisitsMap.has(t.name)) merchantVisitsMap.set(t.name, []);

                

                let starts = t.attendances.filter(a => a.type === 'start');

                let ends = t.attendances.filter(a => a.type === 'end');



                starts.forEach((st, idx) => {

                    let en = ends[idx];

                    let durationStr = '-';

                    if (en && st.time && en.time) {

                        try {

                            let d1 = new Date(`1970/01/01 ${st.time}`);

                            let d2 = new Date(`1970/01/01 ${en.time}`);

                            let diffMs = d2 - d1;

                            if (diffMs > 0) {

                                let diffMins = Math.floor(diffMs / 60000);

                                let diffSecs = Math.floor((diffMs % 60000) / 1000);

                                durationStr = diffMins > 0 ? `${diffMins} دقيقة و ${diffSecs} ثانية` : `${diffSecs} ثانية`;

                            }

                        } catch(e) {}

                    }



                    merchantVisitsMap.get(t.name).push({

                        date: st.date || t.time || '-',

                        user: st.user,

                        startTime: st.time,

                        endTime: en ? en.time : 'جارية / لم تُغلق ⏳',

                        duration: durationStr,

                        loc: st.loc || (en ? en.loc : null)

                    });

                });

            }

        });



        if (merchantVisitsMap.size === 0) {

            content.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">لا توجد زيارات مسجلة</div>';

        } else {

            merchantVisitsMap.forEach((visits, merchantName) => {

                let visitsHtml = visits.map((v, i) => `

                    <div class="bg-white p-3 rounded-xl border border-orange-100 text-xs mt-2 shadow-sm space-y-1">

                        <div class="flex justify-between items-center font-bold text-slate-800">

                            <span>الزيارة #${i + 1} بواسطة: ${v.user}</span>

                            <span class="bg-purple-100 text-kanjo-primary px-2 py-0.5 rounded-lg text-[10px]">المدة: ${v.duration}</span>

                        </div>

                        <div class="text-[11px] text-slate-500 flex flex-wrap gap-3">

                            <span>📅 التاريخ: ${v.date}</span>

                            <span>🟢 البدء: ${v.startTime}</span>

                            <span>🔴 الإنهاء: ${v.endTime}</span>

                        </div>

                        ${v.loc ? `<div class="pt-1"><a href="https://www.google.com/maps/search/?api=1&query=${v.loc}" target="_blank" class="text-blue-600 font-bold text-[11px] underline">🗺️ عرض موقع الخريطة</a></div>` : ''}

                    </div>

                `).join('');



                content.innerHTML += `

                    <div class="bg-orange-50/70 p-4 rounded-2xl border border-orange-100 mb-3">

                        <div class="flex justify-between items-center">

                            <div class="font-black text-orange-950 text-base"><i class="fa-solid fa-store ml-2 text-orange-600"></i>${merchantName}</div>

                            <div class="flex items-center gap-3">

                                <div class="bg-orange-200 text-orange-900 px-3 py-1 rounded-full text-xs font-black shadow-sm">عدد الزيارات: ${visits.length}</div>

                                ${getMerchantProfileBtnHtml(merchantName)}

                            </div>

                        </div>

                        <div class="mt-2 space-y-2">${visitsHtml}</div>

                    </div>

                `;

            });

        }

    } else if (cardType === 'conversion') {

        title.innerText = "تفاصيل معدل التعاقد من الزيارات الفردية";

        const visitedList = list.filter(i => i.hasVisit);

        if (visitedList.length === 0) {

            content.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">لم تمت زيارة أي محل بعد</div>';

        } else {

            visitedList.forEach(item => {

                let statusText = '❌ (لم يتم)';

                if (item.isSigned && item.achieved > 0) statusText = '✅ (تعاقد نهائي)';

                else if (item.isProvisional || (item.isSigned && item.achieved === 0)) statusText = '🤝 (اتفاق مبدئي)';



                content.innerHTML += `

                    <div class="p-4 rounded-2xl border ${item.isSigned && item.achieved > 0 ? 'bg-emerald-50 border-emerald-100' : (item.isProvisional ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-200')} flex justify-between items-center text-sm">

                        <div>

                            <div class="font-black text-slate-800">${item.name} ${statusText}</div>

                            <div class="text-slate-500 text-[11px]">الفئة: ${item.cat || '-'}</div>

                        </div>

                        <div>${getMerchantProfileBtnHtml(item.name)}</div>

                    </div>

                `;

            });

        }

    } else if (cardType === 'targetSuccess') {

        title.innerText = "نسبة إنجاز الأهداف المطلوبة لكل محل";

        list.forEach(item => {

            let ratio = item.target > 0 ? Math.round((item.achieved / item.target) * 100) : 0;

            const isFinalSigned = item.isSigned && item.achieved > 0;

            content.innerHTML += `

                <div class="bg-white p-4 rounded-2xl border border-purple-100 flex justify-between items-center text-sm shadow-sm">

                    <div>

                        <div class="font-black text-kanjo-dark">${item.name} ${isFinalSigned ? '✅' : (item.isProvisional ? '🤝' : '')}</div>

                        <div class="text-slate-500 text-[11px]">مستهدف العمولة: ${item.target}% | المحقق/المبدئي: ${item.achieved}%</div>

                    </div>

                    <div class="flex items-center gap-3">

                        <div class="bg-kanjo-light px-3 py-1 rounded-full text-xs font-bold text-kanjo-primary">نسبة الإنجاز: ${ratio}%</div>

                        ${getMerchantProfileBtnHtml(item.name)}

                    </div>

                </div>

            `;

        });

    } else if (cardType === 'unsignedCats') {

        title.innerText = "فئات النشاط التجاري التي لم يُحقق معها تعاقد نهائي بعد";

        if (window.currentUnsignedCategoriesGlobal.length === 0) {

            content.innerHTML = '<div class="text-center text-emerald-600 py-6 font-bold text-base">🎉 رائع جداً! تم التعاقد مع جميع الفئات المتاحة بنجاح.</div>';

        } else {

            window.currentUnsignedCategoriesGlobal.forEach(cat => {

                content.innerHTML += `

                    <div class="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex justify-between items-center text-sm">

                        <div class="font-black text-amber-900"><i class="fa-solid fa-tag text-amber-600 ml-2"></i>${cat}</div>

                        <div class="bg-white px-3 py-1 rounded-full text-xs font-bold text-amber-700 border border-amber-100">لم يتم التعاقد ⏳</div>

                    </div>

                `;

            });

        }

    } else if (cardType === 'topPerformer') {

        title.innerText = "قائمة عقود المندوب الأعلى كفاءة وتعاقداً";

        if (window.topPerformerContractsGlobal.length === 0) {

            content.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">لا توجد عقود مسجلة حالياً</div>';

        } else {

            window.topPerformerContractsGlobal.forEach(c => {

                content.innerHTML += `

                    <div class="bg-orange-50 p-4 rounded-2xl border border-orange-200 flex justify-between items-center text-sm">

                        <div>

                            <div class="font-black text-orange-950">${c.name} ✅</div>

                            <div class="text-slate-500 text-[11px]">المندوب: ${c.rep} | الفئة: ${c.cat || '-'}</div>

                        </div>

                        <div class="flex items-center gap-3">

                            <div class="bg-orange-200 text-orange-900 px-3 py-1 rounded-full text-xs font-bold">المحقق: ${c.achieved}% (مستهدف: ${c.target}%)</div>

                            ${getMerchantProfileBtnHtml(c.name)}

                        </div>

                    </div>

                `;

            });

        }

    } else if (cardType === 'topTeam') {

        title.innerText = "قائمة عقود الفريق الأعلى كفاءة وتعاقداً";

        if (window.topTeamContractsGlobal.length === 0) {

            content.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">لا توجد عقود مسجلة حالياً</div>';

        } else {

            window.topTeamContractsGlobal.forEach(c => {

                content.innerHTML += `

                    <div class="bg-blue-50 p-4 rounded-2xl border border-blue-200 flex justify-between items-center text-sm">

                        <div>

                            <div class="font-black text-blue-950">${c.name} ✅</div>

                            <div class="text-slate-500 text-[11px]">الفريق: ${c.team} | المندوب: ${c.rep}</div>

                        </div>

                        <div class="flex items-center gap-3">

                            <div class="bg-blue-200 text-blue-900 px-3 py-1 rounded-full text-xs font-bold">المحقق: ${c.achieved}% (مستهدف: ${c.target}%)</div>

                            ${getMerchantProfileBtnHtml(c.name)}

                        </div>

                    </div>

                `;

            });

        }

    }



    modal.classList.remove('hidden');

};



window.normalizeArabic = (str) => str.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase();

window.applySearch = () => renderDashboard(window.lastSnapshot);

window.toggleLiveView = () => { 

    isLiveView = !isLiveView; 

    document.getElementById('toggleText').innerText = isLiveView ? "العودة للقائمة الكاملة" : "عرض المهام الجارية (LIVE)"; 

    renderDashboard(window.lastSnapshot); 

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



window.calculateComm = (target, achieved) => { 

    if (!target || !achieved) return ''; 

    const ratio = (achieved / target) * 100; 

    if (ratio > 100) return `<div class="mt-1.5 p-2 bg-gradient-to-r from-purple-600 to-violet-700 text-white font-bold rounded-xl text-center text-[11px] shadow-sm animate-pulse">🎉 Extra Incentive!</div>`; 

    if (ratio === 100) return `<div class="mt-1.5 p-2 bg-green-600 text-white font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 200 جنيه (100% بالظبط)</div>`; 

    if (ratio > 90) return `<div class="mt-1.5 p-2 bg-blue-600 text-white font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 150 جنيه (> 90%)</div>`; 

    return `<div class="mt-1.5 p-2 bg-yellow-400 text-slate-900 font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 100 جنيه (< 90%)</div>`; 

};



window.recordAttendance = async function(taskId, type) {

    if (!navigator.geolocation) return showToast("المتصفح لا يدعم الموقع", false);

    showToast("⏳ جاري تحديد الموقع وتحويله لعنوان تفصيلي...");

    navigator.geolocation.getCurrentPosition(async (position) => {

        const { latitude, longitude } = position.coords;

        const locStr = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

        const timeStr = new Date().toLocaleTimeString();

        const todayStr = new Date().toISOString().slice(0, 10);

        

        let cleanAddress = await getCleanAddressFromCoords(latitude, longitude);



        const taskData = window.tasksMemory.get(taskId) || {};

        const baseName = getBaseName(taskData.name);



        const q = query(collection(db, "tasks"));

        const snap = await getDocs(q);

        const batch = writeBatch(db);



        snap.forEach((docSnap) => {

            const tData = docSnap.data();

            if (getBaseName(tData.name) === baseName) {

                let updatePayload = {

                    attendances: docSnap.id === taskId ? arrayUnion({ user: currentUser.name, type: type, time: timeStr, loc: locStr, date: todayStr }) : tData.attendances,

                    time: docSnap.id === taskId ? todayStr : tData.time

                };

                if (cleanAddress) {

                    updatePayload.address = cleanAddress;

                }

                batch.update(docSnap.ref, updatePayload);

            }

        });



        await batch.commit();

        showToast(`تم تسجيل ${type === 'start' ? 'بدء' : 'إنهاء'} الزيارة وتحديث العنوان التفصيلي بنجاح!`);

    }, (err) => showToast("يرجى تفعيل صلاحية الموقع", false));

}



window.applyTeamTheme = (team) => {

    document.getElementById('headerLogo').src = team + '.png';

    let hTitle = document.getElementById('headerTitle');

    const style = document.createElement('style');

    if (team === 'Fox Team') {

        hTitle.innerHTML = `FOX <span class="text-kanjo-primary">TEAM</span>`;

        style.innerHTML = `.bg-kanjo-primary { background-color: #ea580c !important; } .text-kanjo-primary { color: #ea580c !important; } .border-kanjo-primary { border-color: #ea580c !important; } .accent-kanjo-primary { accent-color: #ea580c !important; } .text-kanjo-dark { color: #9a3412 !important; } .bg-kanjo-dark { background-color: #c2410c !important; } .hover\\:bg-violet-800:hover { background-color: #c2410c !important; } .hover\\:bg-violet-900:hover { background-color: #9a3412 !important; }`;

    } else if (team === 'Power Team') {

        hTitle.innerHTML = `POWER <span class="text-kanjo-primary">TEAM</span>`;

        style.innerHTML = `.bg-kanjo-primary { background-color: #2563eb !important; } .text-kanjo-primary { color: #2563eb !important; } .border-kanjo-primary { border-color: #2563eb !important; } .accent-kanjo-primary { accent-color: #2563eb !important; } .text-kanjo-dark { color: #1e3a8a !important; } .bg-kanjo-dark { background-color: #1d4ed8 !important; } .hover\\:bg-violet-800:hover { background-color: #1d4ed8 !important; } .hover\\:bg-violet-900:hover { background-color: #1e3a8a !important; }`;

    }

    document.head.appendChild(style);

}



const categories = ["🍔 مطاعم وكافيهات", "🛒 سوبر ماركت", "💊 صيدليات وعناية شخصية", "🐟 أسماك", "🍽️ أطقم صيني", "🔌 أدوات كهربائية", "🧹 أدوات نظافة", "📱 إكسسوارات موبايل", "📦 بيع جملة وقطاعي", "🥩 جزارة", "🍎 خضار وفاكهة", "🍗 دواجن", "🔧 سباكة", "🛠️ صيانة وخدمات منزلية", "🍹 عصائر فريش", "🌿 عطارة وتوابل", "⚡ فني كهرباء", "💄 كوزماتكس", "🎮 كنترول", "🧸 لعب أطفال", "🧀 لبنة برازيلي", "🥐 مخبوزات", "🐾 مستلزمات الحيوانات الأليفة", "🍳 مستلزمات المطبخ", "🥜 مسليات", "🛏️ مفروشات", "📚 مكتبات", "⚽ ملابس وأدوات رياضية", "🧼 منظفات", "🎁 هدايا", "💐 ورود", "🍰 حلويات"];

const users = { 

    '8492': { name: 'أ/ محمود', role: 'admin' }, 

    '3715': { name: 'المؤسسين', role: 'founder' }, 

    '5082': { name: 'قسم الحسابات', role: 'accounting' },

    '6204': { name: 'سارة', role: 'rep', team: 'Fox Team' }, 

    '9153': { name: 'مصطفى', role: 'rep', team: 'Fox Team' }, 

    '4827': { name: 'أحمد جمعه', role: 'rep', team: 'Power Team' }, 

    '7591': { name: 'يوسف', role: 'rep', team: 'Power Team' } 

};

const teamMembers = { 'Fox Team': 'سارة، مصطفى', 'Power Team': 'أحمد جمعه، يوسف' };

categories.sort().forEach(c => { document.getElementById('mCat').innerHTML += `<option value="${c}">${c}</option>`; document.getElementById('editCat').innerHTML += `<option value="${c}">${c}</option>`; });



window.currentUser = null; window.activeTaskId = null; window.activeTaskName = ''; window.activeTaskTeam = '';



window.login = (pinOverride = null) => { 

    const pin = pinOverride || document.getElementById('pinInput').value; 

    if(users[pin]) { 

        currentUser = users[pin]; 

        window.saveSession(currentUser);

        applyThemeAndShowDashboard();

        resetIdleTimer();

    } else { if(!pinOverride) showToast("رمز الدخول غير صحيح", false); } 

};



function applyThemeAndShowDashboard() {

    if(currentUser.team === 'Fox Team' || currentUser.team === 'Power Team') applyTeamTheme(currentUser.team);

    document.getElementById('loginSection').classList.add('hidden'); 



    const isAccounting = (currentUser.role === 'accounting');

    const isFounder = (currentUser.role === 'founder');

    

    if (isAccounting) {

        document.getElementById('accountingSection').classList.remove('hidden');

        document.getElementById('dashboardSection').classList.add('hidden');

        loadPayrollSettingsFromFirebase();

        const financialAccountingSection = document.getElementById('financialAccountingSection');

        if (financialAccountingSection) {

            financialAccountingSection.classList.remove('hidden');

            window.loadFinancialProfilesForAccounting();

        }

    } else {

        document.getElementById('accountingSection').classList.add('hidden');

        document.getElementById('dashboardSection').classList.remove('hidden');

        const financialAccountingSection = document.getElementById('financialAccountingSection');

        if (financialAccountingSection) {

            financialAccountingSection.classList.add('hidden');

        }

    }



    document.getElementById('userInfo').classList.remove('hidden'); 

    document.getElementById('userNameDisplay').innerText = currentUser.name; 



    const avatarContainer = document.getElementById('userAvatarContainer');

    if (avatarContainer) {

        if (userImageMap[currentUser.name]) {

            avatarContainer.innerHTML = `<img src="${userImageMap[currentUser.name]}" alt="${currentUser.name}" class="w-7 h-7 rounded-full object-cover border border-purple-300 shadow-sm">`;

        } else {

            avatarContainer.innerHTML = `<img src="logo.png" alt="Kanjo" class="w-7 h-7 rounded-full object-contain p-0.5 bg-white border border-purple-200">`;

        }

    }

    

    const isMahmoud = (currentUser.name === 'أ/ محمود');

    const isAdmin = (currentUser.role === 'admin');

    const isRep = (currentUser.role === 'rep');

    const canViewLive = (isMahmoud || isFounder);

    

    if (!isAccounting) {

        document.getElementById('advancedDashboard').classList.toggle('hidden', !canViewLive);

        document.getElementById('liveFeedToggle').classList.toggle('hidden', !canViewLive);

        document.getElementById('taskFormWrapper').classList.toggle('hidden', !isMahmoud);

        document.getElementById('adminPanel').classList.toggle('hidden', !isAdmin);

        document.getElementById('exportBtn').classList.toggle('hidden', !canViewLive);

        document.getElementById('notificationsWrapper').classList.toggle('hidden', !canViewLive);

        

        const founderPayrollSummaryBox = document.getElementById('founderPayrollSummaryBox');

        if (founderPayrollSummaryBox) {

            founderPayrollSummaryBox.classList.toggle('hidden', !isFounder);

        }



        const quickLinksWalletBanner = document.getElementById('quickLinksWalletBanner');

        if (quickLinksWalletBanner) {

            quickLinksWalletBanner.classList.toggle('hidden', !isRep);

        }



        const financialProfileBtnWrapper = document.getElementById('financialProfileBtnWrapper');

        if (financialProfileBtnWrapper) {

            financialProfileBtnWrapper.classList.toggle('hidden', !isRep);

        }



        const financialProfileBanner = document.getElementById('financialProfileBanner');

        if (financialProfileBanner) {

            financialProfileBanner.classList.toggle('hidden', !isRep);

        }



        if (isRep) {

            window.refreshFinancialProfileBanner();

        }

        

        const adminTransferNavBtnWrapper = document.getElementById('adminTransferNavBtnWrapper');

        if (adminTransferNavBtnWrapper) {

            adminTransferNavBtnWrapper.classList.toggle('hidden', !isMahmoud);

        }



        const archivedReportsBtnWrapper = document.getElementById('archivedReportsBtnWrapper');

        if (archivedReportsBtnWrapper) {

            archivedReportsBtnWrapper.classList.toggle('hidden', !isMahmoud);

        }

        

        if(canViewLive) {

            setupAdvancedFilterElements();

        }

    }

    

    if(canViewLive || isAdmin || isAccounting) {

        onSnapshot(query(collection(db, "notifications"), orderBy("timestamp", "desc")), (snap) => {

            const notifs = [];

            snap.forEach(d => notifs.push({id: d.id, ...d.data()}));

            updateNotificationsUI(notifs);

        });

        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {

            Notification.requestPermission();

        }

    }



    onSnapshot(query(collection(db, "transferRequests"), where("status", "==", "pending")), (snap) => {

        window.pendingTransferTaskIds.clear();

        snap.forEach(docSnap => {

            const req = docSnap.data();

            if (req.taskId) window.pendingTransferTaskIds.add(req.taskId);

        });



        const transferBadge = document.getElementById('transferBadge');

        if (transferBadge && isMahmoud) {

            if (snap.size > 0) {

                transferBadge.classList.remove('hidden');

            } else {

                transferBadge.classList.add('hidden');

            }

        }

        if (window.lastSnapshot && !isAccounting) {

            renderDashboard(window.lastSnapshot);

        }

    });



    loadPayrollSettingsAndCalculateFounderSummary();

    listenToTasks(); 

}



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



        let teamStats = { 

            'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 }, 

            'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 } 

        };



        let uniqueMerchants = window.currentUniqueMerchantsGlobal || new Map();

        uniqueMerchants.forEach((data) => {

            if (data.isSigned && data.achieved > 0 && data.team && teamStats[data.team]) {

                let ratio = data.target > 0 ? (data.achieved / data.target) * 100 : 0;

                if (ratio > 100) {

                    teamStats[data.team].extraCount++;

                } else if (ratio === 100) {

                    teamStats[data.team].tier1Count++;

                    teamStats[data.team].tier1 += 200;

                } else if (ratio > 90) {

                    teamStats[data.team].tier2Count++;

                    teamStats[data.team].tier2 += 150;

                } else {

                    teamStats[data.team].tier3Count++;

                    teamStats[data.team].tier3 += 100;

                }

            }

        });



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



        const reps = [

            { name: 'سارة', team: 'Fox Team', base: 5000 },

            { name: 'مصطفى', team: 'Fox Team', base: 5000 },

            { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

            { name: 'يوسف', team: 'Power Team', base: 2000 }

        ];



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



    const extraIncentiveInput = document.getElementById('globalExtraIncentive');

    const singleExtraVal = extraIncentiveInput ? (parseFloat(extraIncentiveInput.value) || 0) : 0;



    const desoukBaseInput = document.getElementById('desoukManagerBase');

    const desoukBaseVal = desoukBaseInput ? (parseFloat(desoukBaseInput.value) || 0) : 0;



    const desoukCommPercentInput = document.getElementById('desoukManagerCommissionPercent');

    const desoukCommPercentVal = desoukCommPercentInput ? (parseFloat(desoukCommPercentInput.value) || 0) : 0;



    const desoukExtraBonusInput = document.getElementById('desoukManagerExtraIncentiveBonus');

    const desoukExtraBonusVal = desoukExtraBonusInput ? (parseFloat(desoukExtraBonusInput.value) || 0) : 0;



    let teamStats = { 

        'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0, total: 0 }, 

        'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0, total: 0 } 

    };



    let uniqueMerchants = new Map();



    if (window.currentUniqueMerchantsGlobal && window.currentUniqueMerchantsGlobal.size > 0) {

        uniqueMerchants = window.currentUniqueMerchantsGlobal;

    } else {

        if (window.tasksMemory && window.tasksMemory.size > 0) {

            window.tasksMemory.forEach(t => {

                let baseName = getBaseName(t.name);

                if (!uniqueMerchants.has(baseName)) {

                    uniqueMerchants.set(baseName, { isSigned: false, achieved: 0, target: t.target || 0, team: t.team });

                }

                let mData = uniqueMerchants.get(baseName);

                const taskAch = Number(t.achieved) || 0;

                if ((t.isSigned || t.isProvisional) && taskAch > 0) {

                    mData.isSigned = true;

                    mData.achieved = taskAch;

                    mData.target = Number(t.target) || mData.target;

                    mData.team = t.team || mData.team;

                }

            });

        }

    }



    uniqueMerchants.forEach((data) => {

        if (data.isSigned && data.achieved > 0 && data.team && teamStats[data.team]) {

            let ratio = data.target > 0 ? (data.achieved / data.target) * 100 : 0;

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

        }

    });



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



    const reps = [

        { name: 'سارة', team: 'Fox Team', base: 5000 },

        { name: 'مصطفى', team: 'Fox Team', base: 5000 },

        { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

        { name: 'يوسف', team: 'Power Team', base: 2000 }

    ];



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



    let teamStats = { 

        'Fox Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 }, 

        'Power Team': { tier1Count: 0, tier2Count: 0, tier3Count: 0, extraCount: 0, tier1: 0, tier2: 0, tier3: 0 } 

    };

    let uniqueMerchants = window.currentUniqueMerchantsGlobal || new Map();



    uniqueMerchants.forEach((data) => {

        if (data.isSigned && data.achieved > 0 && data.team && teamStats[data.team]) {

            let ratio = data.target > 0 ? (data.achieved / data.target) * 100 : 0;

            if (ratio > 100) {

                teamStats[data.team].extraCount++;

            } else if (ratio === 100) {

                teamStats[data.team].tier1Count++;

                teamStats[data.team].tier1 += 200;

            } else if (ratio > 90) {

                teamStats[data.team].tier2Count++;

                teamStats[data.team].tier2 += 150;

            } else {

                teamStats[data.team].tier3Count++;

                teamStats[data.team].tier3 += 100;

            }

        }

    });



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

        "اسم الموظف / المسؤول": "مدير منطقة دسوق",

        "الفريق / الدور": "الإدارة العليا / دسوق",

        "الراتب الأساسي": desoukBaseVal,

        "إجمالي العمولات": desoukManagerCommissionAmount,

        "العمولة الإضافية (الإجمالي)": desoukExtraIncentiveTotal,

        "الإجمالي النهائي": desoukManagerNet

    });



    const reps = [

        { name: 'سارة', team: 'Fox Team', base: 5000 },

        { name: 'مصطفى', team: 'Fox Team', base: 5000 },

        { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },

        { name: 'يوسف', team: 'Power Team', base: 2000 }

    ];



    reps.forEach(rep => {

        let base = rep.base;

        let tComms = teamStats[rep.team];

        let comm = tComms.tier1 + tComms.tier2 + tComms.tier3;

        let teamExtra = singleExtraVal * tComms.extraCount;

        let net = base + comm + teamExtra;

        exportData.push({

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

    XLSX.writeFile(wb, "Kanjo_Payroll_Report_" + new Date().toISOString().slice(0,10) + ".xlsx");

    showToast("تم تصدير تقرير الرواتب بنجاح");

};



function setupAdvancedFilterElements() {

    const filterUser = document.getElementById('filterUser');

    const filterCategory = document.getElementById('filterCategory');

    const advExportBtn = document.getElementById('advancedExportBtn');

    

    if (filterUser && filterUser.options.length <= 1) {

        Object.keys(users).forEach(pin => {

            if(users[pin].role === 'rep') {

                const opt = document.createElement('option');

                opt.value = users[pin].name;

                opt.innerText = `${users[pin].name} (${users[pin].team})`;

                filterUser.appendChild(opt);

            }

        });

    }

    if (filterCategory && filterCategory.options.length <= 1) {

        categories.forEach(c => {

            const opt = document.createElement('option');

            opt.value = c;

            opt.innerText = c;

            filterCategory.appendChild(opt);

        });

    }



    const filterIds = ['filterStartDate', 'filterEndDate', 'filterTeam', 'filterUser', 'filterCategory'];

    filterIds.forEach(id => {

        const el = document.getElementById(id);

        if(el && !el.dataset.listenerAttached) {

            el.addEventListener('change', () => {

                if(window.lastSnapshot) window.renderDashboard(window.lastSnapshot);

            });

            el.dataset.listenerAttached = true;

        }

    });



    if(advExportBtn && !advExportBtn.dataset.listenerAttached) {

        advExportBtn.addEventListener('click', window.performAdvancedExport);

        advExportBtn.dataset.listenerAttached = true;

    }

}



window.submitTask = async (e) => { 

    e.preventDefault(); 

    await addDoc(collection(db, "tasks"), { 

        name: document.getElementById('mName').value, 

        cat: document.getElementById('mCat').value, 

        team: document.getElementById('mTeam').value, 

        time: document.getElementById('mTime').value, 

        target: parseFloat(document.getElementById('mTarget').value), 

        notes: document.getElementById('mNotes').value, 

        reports: [], 

        attendances: [], 

        isSigned: false,

        isProvisional: false, 

        achieved: 0, 

        createdAt: new Date() 

    }); 

    document.getElementById('taskForm').reset(); 

    showToast("تم إضافة المهمة بنجاح"); 

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



window.saveEditTask = async () => {

    const newNameInput = document.getElementById('editName').value;

    const newCat = document.getElementById('editCat').value;

    const newTeam = document.getElementById('editTeam').value;

    const newDate = document.getElementById('editDate').value;

    const newTarget = parseFloat(document.getElementById('editTarget').value);

    const newNotes = document.getElementById('editNotes').value;



    const originalTask = window.tasksMemory.get(editTaskId) || {};

    const oldBaseName = getBaseName(originalTask.name);

    const newBaseName = getBaseName(newNameInput);



    const q = query(collection(db, "tasks"));

    const snap = await getDocs(q);

    const batch = writeBatch(db);



    snap.forEach((docSnap) => {

        const tData = docSnap.data();

        const tBase = getBaseName(tData.name);

        if (tBase === oldBaseName || tBase === newBaseName) {

            if (docSnap.id === editTaskId) {

                batch.update(docSnap.ref, {

                    name: newNameInput,

                    cat: newCat,

                    team: newTeam,

                    time: newDate,

                    target: newTarget,

                    notes: newNotes

                });

            } else {

                let suffix = tData.name.replace(oldBaseName, '');

                let updatedName = newBaseName + suffix;

                batch.update(docSnap.ref, {

                    name: updatedName,

                    cat: newCat,

                    team: newTeam,

                    target: newTarget

                });

            }

        }

    });



    await batch.commit();

    window.closeEditModal(); 

    showToast("تم تعديل البيانات ومزامنة جميع المتابعات المرتبطة بنجاح"); 

};



window.submitReport = async () => { 

    const createNew = document.getElementById('repCreateTask').checked; 

    const nextDate = document.getElementById('repNextDate').value; 

    const achieved = parseFloat(document.getElementById('repPercentage').value);

    

    let isSigned = document.getElementById('repIsSigned').checked;

    let isProvisional = document.getElementById('repProvContract').checked;

    

    if (isSigned && (isNaN(achieved) || achieved <= 0)) {

        showToast("لا يمكن اختيار (تم التعاقد النهائي) بنسبة عمولة 0%! للنسبة 0% يرجى اختيار (اتفاق مبدئي).", false);

        return;

    }



    if (isProvisional && isNaN(achieved)) { 

        showToast("يرجى إدخال نسبة العمولة المبدئية", false); 

        return; 

    }



    if ((isSigned || isProvisional) && achieved > 100) { 

        showToast("نسبة العمولة لا يمكن أن تتجاوز 100%!", false); 

        return; 

    }



    const todayStr = new Date().toISOString().slice(0, 10);

    const nowTimeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const nowTimestampStr = `${todayStr} ${nowTimeStr}`;



    const activeTaskData = window.tasksMemory.get(activeTaskId) || {};

    const baseName = getBaseName(activeTaskData.name || activeTaskName);



    let seriesTarget = activeTaskData.target || currentTarget;

    window.tasksMemory.forEach((t) => {

        if (getBaseName(t.name) === baseName && t.target > 0) {

            seriesTarget = t.target;

        }

    });



    const q = query(collection(db, "tasks"));

    const snap = await getDocs(q);

    const batch = writeBatch(db);



    snap.forEach((docSnap) => {

        const tData = docSnap.data();

        const tBase = getBaseName(tData.name);

        if (tBase === baseName) {

            if (docSnap.id === activeTaskId) {

                batch.update(docSnap.ref, {

                    reports: arrayUnion({ 

                        name: currentUser.name, 

                        time: new Date().toLocaleTimeString(), 

                        date: todayStr, 

                        timestamp: nowTimestampStr,

                        contactName: document.getElementById('repContactName').value,

                        contactRole: document.getElementById('repContactRole').value,

                        contactPhone: document.getElementById('repContactPhone').value,

                        general: document.getElementById('repGeneral').value, 

                        merchant: document.getElementById('repMerchant').value, 

                        team: document.getElementById('repTeam').value, 

                        next: document.getElementById('repNext').value 

                    }),

                    isSigned: isSigned,

                    isProvisional: isProvisional,

                    achieved: (isSigned || isProvisional) ? achieved : 0,

                    target: seriesTarget,

                    time: todayStr

                });

            } else {

                batch.update(docSnap.ref, {

                    isSigned: isSigned,

                    isProvisional: isProvisional,

                    achieved: (isSigned || isProvisional) ? achieved : 0,

                    target: seriesTarget

                });

            }

        }

    });



    await batch.commit();



    await window.notifyManager(`تقرير جديد من ${currentUser.name}`, `تم إضافة تقرير للمحل: ${baseName}`, 'report', activeTaskId, todayStr);



    if(isSigned) showToast("🎉 تم تسجيل التعاقد النهائي وربطه بكل السلسلة والمتابعات بنجاح!"); 

    else if(isProvisional) showToast("🤝 تم تسجيل اتفاق مبدئي بنجاح!"); 



    if(createNew && nextDate) { 

        const followUpName = baseName + " (متابعة)";

        let exists = false;

        snap.forEach((docSnap) => {

            const tData = docSnap.data();

            if (getBaseName(tData.name) === baseName && tData.time === nextDate) {

                exists = true;

            }

        });



        if(!exists) {

            await addDoc(collection(db, "tasks"), { 

                name: followUpName, 

                cat: activeTaskData.cat || "متابعة", 

                team: activeTaskData.team || activeTaskTeam, 

                time: nextDate, 

                target: seriesTarget, 

                notes: activeTaskData.notes || currentNotes, 

                reports: [], 

                attendances: [], 

                isSigned: isSigned,

                isProvisional: isProvisional, 

                achieved: (isSigned || isProvisional) ? achieved : 0,

                createdAt: new Date() 

            }); 

        }

    } 

    document.getElementById('reportModal').classList.add('hidden'); 

    showToast("تم حفظ التقرير ومزامنة المتابعات بنجاح"); 

};



window.listenToTasks = () => { 

    onSnapshot(query(collection(db, "tasks"), orderBy("time", "asc")), (snapshot) => { 

        

        const migrationBatch = writeBatch(db);

        let migrationCount = 0;

        snapshot.forEach((docSnap) => {

            const tData = docSnap.data();

            const currentAch = Number(tData.achieved) || 0;

            if (tData.isSigned && currentAch === 0) {

                migrationBatch.update(docSnap.ref, {

                    isSigned: false,

                    isProvisional: true

                });

                migrationCount++;

            }

        });



        if (migrationCount > 0) {

            migrationBatch.commit().then(() => {

                showToast(`تم تصحيح وتحديث ${migrationCount} حسابات تعاقد بنسبة 0% وتحويلها تلقائياً إلى (اتفاق مبدئي) في قاعدة البيانات!`);

            }).catch(err => console.error("Data Migration Error:", err));

        }



        snapshot.docChanges().forEach((change) => {

            if (change.type === "added" || change.type === "modified") { window.tasksMemory.set(change.doc.id, change.doc.data()); }

            else if (change.type === "removed") { window.tasksMemory.delete(change.doc.id); }

        });

        window.lastSnapshot = snapshot; 

        

        let uniqueMerchants = new Map();

        snapshot.forEach(doc => {

            let task = doc.data();

            let baseName = getBaseName(task.name);

            if (!uniqueMerchants.has(baseName)) {

                uniqueMerchants.set(baseName, {

                    target: 0,

                    achieved: 0,

                    isSigned: false,

                    isProvisional: false,

                    hasVisit: false,

                    cat: null,

                    team: task.team

                });

            }

            let mData = uniqueMerchants.get(baseName);

            let currentTarget = Number(task.target) || 0;

            let rawAchieved = Number(task.achieved) || 0;

            let currentAchieved = (task.isSigned || task.isProvisional) ? rawAchieved : 0;

            if (currentAchieved > 100) currentAchieved = 0;

            if (currentTarget > mData.target) mData.target = currentTarget;

            if (currentAchieved > mData.achieved) mData.achieved = currentAchieved;

            if (task.isSigned && rawAchieved > 0) {

                mData.isSigned = true;

                mData.isProvisional = false;

            } else if (task.isProvisional || (task.isSigned && rawAchieved === 0)) {

                mData.isProvisional = true;

            }

            if (task.attendances && task.attendances.length > 0) mData.hasVisit = true;

            if (task.cat && task.cat !== "متابعة" && task.cat !== "متابعه") mData.cat = task.cat;

        });

        window.currentUniqueMerchantsGlobal = uniqueMerchants;



        if (currentUser && currentUser.role === 'rep') {

            updateQuickLinksWalletCounter();

        }



        if (currentUser && currentUser.role === 'accounting') {

            renderPayrollTable();

        } else {

            renderDashboard(snapshot); 

        }



        window.loadPayrollSettingsAndCalculateFounderSummary();

        checkAndUpdateMissingAddresses(window.allTasksCache);

    }, (error) => {

        console.error("Firestore snapshot error:", error);

    }); 

};



function updateQuickLinksWalletCounter() {

    let missingCount = 0;

    window.allTasksCache.forEach(t => {

        if (t.team !== currentUser.team) return;

        let hasV = (t.attendances && t.attendances.length > 0) || t.isSigned || t.isProvisional;

        if (hasV) {

            let hasMissing = !t.fbPage || !t.fbGroup || !t.insta || !t.website || 

                           t.fbPage.trim() === '' || t.fbGroup.trim() === '' || t.insta.trim() === '' || t.website.trim() === '';

            if (hasMissing) {

                missingCount++;

            }

        }

    });



    const countTextEl = document.getElementById('quickLinksWalletCountText');

    if (countTextEl) {

        if (missingCount > 0) {

            countTextEl.innerText = `لديك ${missingCount} محل تحتاج لاستكمال روابط السوشيال ميديا والموقع`;

        } else {

            countTextEl.innerText = `🎉 ممتاز! جميع المحلات مكتملة الروابط الرقمية تماماً`;

        }

    }

}



window.renderDashboard = (snapshot) => {

    const container = document.getElementById('tasksContainer'); 

    const rawSearchVal = document.getElementById('searchInput').value;

    const searchQuery = normalizeArabic(rawSearchVal);

    const groupedByTeam = { 'Fox Team': {}, 'Power Team': {} }; 

    window.allTasksCache = []; 

    

    let uniqueMerchants = new Map();

    let advVisitsCount = 0; 



    const fStart = document.getElementById('filterStartDate') ? document.getElementById('filterStartDate').value : '';

    const fEnd = document.getElementById('filterEndDate') ? document.getElementById('filterEndDate').value : '';

    const fTeam = document.getElementById('filterTeam') ? document.getElementById('filterTeam').value : 'all';

    const fUser = document.getElementById('filterUser') ? document.getElementById('filterUser').value : 'all';

    const fCat = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'all';



    window.filteredTasksForExport = []; 



    const seenTaskCardKeys = new Set();



    snapshot.forEach(doc => { 

        let task = doc.data(); 

        if (task.team === 'A') task.team = 'Fox Team';

        if (task.team === 'B') task.team = 'Power Team';



        window.allTasksCache.push({id: doc.id, ...task}); 



        let matchFilter = true;

        const taskDateStr = task.time || '';

        

        if (fStart && taskDateStr && taskDateStr < fStart) matchFilter = false;

        if (fEnd && taskDateStr && taskDateStr > fEnd) matchFilter = false;

        if (fTeam !== 'all' && task.team !== fTeam) matchFilter = false;

        if (fCat !== 'all' && task.cat !== fCat) matchFilter = false;

        

        if (fUser !== 'all') {

            let userFound = false;

            if (task.attendances && task.attendances.some(a => a.user === fUser)) userFound = true;

            if (task.reports && task.reports.some(r => r.name === fUser)) userFound = true;

            if (!userFound) matchFilter = false;

        }



        if (matchFilter) {

            let baseName = getBaseName(task.name);



            if (!uniqueMerchants.has(baseName)) {

                uniqueMerchants.set(baseName, {

                    target: 0,

                    achieved: 0,

                    isSigned: false,

                    isProvisional: false,

                    hasVisit: false,

                    cat: null,

                    team: task.team

                });

            }



            let mData = uniqueMerchants.get(baseName);



            let currentTarget = Number(task.target) || 0;

            let rawAchieved = Number(task.achieved) || 0;

            let currentAchieved = (task.isSigned || task.isProvisional) ? rawAchieved : 0;



            if (currentAchieved > 100) currentAchieved = 0; 



            if (currentTarget > mData.target) mData.target = currentTarget;

            if (currentAchieved > mData.achieved) mData.achieved = currentAchieved;

            

            if (task.isSigned && rawAchieved > 0) {

                mData.isSigned = true;

                mData.isProvisional = false;

            } else if (task.isProvisional || (task.isSigned && rawAchieved === 0)) {

                mData.isProvisional = true;

            }



            if (task.attendances && task.attendances.length > 0) {

                mData.hasVisit = true;

                const startsCount = task.attendances.filter(a => a.type === 'start').length;

                advVisitsCount += (startsCount > 0 ? startsCount : 1); 

            }



            if (task.cat && task.cat !== "متابعة" && task.cat !== "متابعه") {

                mData.cat = task.cat;

            }



            window.filteredTasksForExport.push({ id: doc.id, ...task });

        }



        if (isLiveView && (!task.attendances || task.attendances.length === 0)) return; 

        

        if (currentUser.role === 'rep' && task.team !== currentUser.team) return;



        if (searchQuery && !normalizeArabic(task.name).includes(searchQuery)) return;

        

        const team = task.team; 

        const date = task.time || 'غير محدد'; 



        const baseNameKey = getBaseName(task.name);

        const cardKey = `${baseNameKey}-${team}-${date}`;

        if (seenTaskCardKeys.has(cardKey)) return;

        seenTaskCardKeys.add(cardKey);

        

        if(!groupedByTeam[team]) groupedByTeam[team] = {};

        if(!groupedByTeam[team][date]) groupedByTeam[team][date] = []; 

        groupedByTeam[team][date].push({id: doc.id, ...task}); 

    }); 



    window.currentUniqueMerchantsGlobal = uniqueMerchants;



    if (currentUser && currentUser.role === 'rep') {

        updateQuickLinksWalletCounter();

    }



    if (currentUser && currentUser.role === 'accounting') {

        renderPayrollTable();

    }



    let crossTeamSearchAlertHtml = '';

    if (currentUser.role === 'rep' && rawSearchVal.trim() !== '') {

        let foundTaskObj = null;



        window.allTasksCache.forEach(t => {

            if (t.team !== currentUser.team && normalizeArabic(t.name).includes(searchQuery)) {

                foundTaskObj = t;

            }

        });



        if (foundTaskObj) {

            const otherTeamName = foundTaskObj.team;

            const foundTaskId = foundTaskObj.id;

            const foundTaskName = foundTaskObj.name;

            const foundCat = foundTaskObj.cat || 'غير محدد';

            const foundTarget = foundTaskObj.target ? `${foundTaskObj.target}%` : '-';

            const taskAch = Number(foundTaskObj.achieved) || 0;

            const isSigned = foundTaskObj.isSigned && taskAch > 0;

            const isProvisional = foundTaskObj.isProvisional || (foundTaskObj.isSigned && taskAch === 0);

            const isPending = window.pendingTransferTaskIds && window.pendingTransferTaskIds.has(foundTaskId);



            let actionButtonHtml = '';

            if (isPending) {

                actionButtonHtml = `

                    <div class="bg-amber-100 text-amber-900 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm w-full sm:w-auto justify-center">

                        <i class="fa-solid fa-clock-rotate-left"></i> تم تقديم الطلب (في انتظار المراجعة والموافقة أو الرفض من الإدارة)

                    </div>

                `;

            } else {

                actionButtonHtml = `

                    <button onclick="openTransferModal('${foundTaskId}', '${window.safeString(foundTaskName)}', '${otherTeamName}')" class="bg-kanjo-primary text-white px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-violet-800 transition shadow-sm whitespace-nowrap w-full sm:w-auto text-center">

                        <i class="fa-solid fa-right-left ml-1"></i> طلب نقل المحل لفريقك

                    </button>

                `;

            }



            let badgeHtml = '';

            if (isSigned) badgeHtml = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">متعاقد نهائي ✅</span>';

            else if (isProvisional) badgeHtml = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-bold">اتفاق مبدئي 🤝</span>';



            crossTeamSearchAlertHtml = `

                <div class="bg-amber-50 border border-amber-200 p-4 sm:p-5 rounded-3xl shadow-sm mb-4 space-y-3">

                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-amber-200/60 pb-3">

                        <div class="flex items-center gap-3">

                            <div class="bg-amber-100 text-amber-600 p-3 rounded-xl text-xl flex-shrink-0"><i class="fa-solid fa-store"></i></div>

                            <div>

                                <div class="flex items-center gap-2 flex-wrap">

                                    <h4 class="font-black text-amber-950 text-base sm:text-lg">${foundTaskName}</h4>

                                    ${badgeHtml}

                                    ${getMerchantProfileBtnHtml(foundTaskName)}

                                </div>

                                <p class="text-xs text-amber-800 font-bold mt-0.5">⚠️ هذا المحل يتبع الفريق الآخر (${otherTeamName}) - لا يمكنك العمل عليه مباشرة</p>

                            </div>

                        </div>

                        ${actionButtonHtml}

                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 pt-1">

                        <div class="bg-white/80 p-2.5 rounded-xl border border-amber-100 flex items-center gap-2">

                            <span class="font-bold text-slate-500">الفئة:</span>

                            <span class="font-black text-slate-800">${foundCat}</span>

                        </div>

                        <div class="bg-white/80 p-2.5 rounded-xl border border-amber-100 flex items-center gap-2">

                            <span class="font-bold text-slate-500">التارجت المستهدف:</span>

                            <span class="font-black text-kanjo-primary">${foundTarget}</span>

                        </div>

                    </div>

                    ${foundTaskObj.notes ? `

                        <div class="bg-white/80 p-2.5 rounded-xl border border-amber-100 text-xs text-slate-700">

                            <span class="font-bold text-slate-500 block mb-0.5">ملاحظات توجيهية:</span>

                            <span class="font-semibold text-slate-800">${foundTaskObj.notes}</span>

                        </div>

                    ` : ''}

                </div>

            `;

        }

    }



    let targetSum = 0;

    let targetCount = 0;

    let achievedSum = 0;

    let achievedCount = 0;

    

    let advTasksCount = uniqueMerchants.size; 

    let advVisitedTasksCount = 0; 

    let advSignedContracts = 0;

    

    let signedCatCounts = {};

    let signedCatsSet = new Set();



    uniqueMerchants.forEach((data) => {

        let t = Number(data.target) || 0;

        if (t > 0 && t <= 100) {

            targetSum += t;

            targetCount++;

        }



        if (data.isSigned && data.achieved > 0) {

            let a = Number(data.achieved) || 0;

            if (a > 0 && a <= 100) {

                achievedSum += a;

                achievedCount++;

            }

            advSignedContracts++;

            if (data.cat && data.cat !== "متابعة" && data.cat !== "متابعه") {

                signedCatsSet.add(data.cat);

                signedCatCounts[data.cat] = (signedCatCounts[data.cat] || 0) + 1;

            }

        }



        if (data.hasVisit) advVisitedTasksCount++;

    });



    let unsignedCats = [];

    categories.forEach(c => {

        if (!signedCatsSet.has(c)) {

            unsignedCats.push(c);

        }

    });

    window.currentUnsignedCategoriesGlobal = unsignedCats;



    const metricUnsignedCatsEl = document.getElementById('metricUnsignedCats');

    if (metricUnsignedCatsEl) {

        metricUnsignedCatsEl.innerText = `${unsignedCats.length} فئات`;

    }



    let avgTarget = targetCount > 0 ? (targetSum / targetCount).toFixed(1) : 0;

    let avgAchieved = achievedCount > 0 ? (achievedSum / achievedCount).toFixed(1) : 0;



    let perfData = { targets: Number(avgTarget), achieved: Number(avgAchieved) };



    const advTargetsEl = document.getElementById('advStatTargets');

    const advAchievedEl = document.getElementById('advStatAchieved');

    const advTasksEl = document.getElementById('advStatTasks');

    const advVisitsEl = document.getElementById('advStatVisits');

    

    if (advTargetsEl) advTargetsEl.innerText = avgTarget + '%';

    if (advAchievedEl) advAchievedEl.innerText = avgAchieved + '%';

    if (advTasksEl) advTasksEl.innerText = `${advVisitedTasksCount} من أصل ${advTasksCount}`;

    if (advVisitsEl) advVisitsEl.innerText = advVisitsCount.toLocaleString();



    const metricConversionEl = document.getElementById('metricConversionRate');

    const metricTargetEl = document.getElementById('metricTargetSuccessRate');

    

    if (metricConversionEl) {

        const conversionRate = advVisitedTasksCount > 0 ? Math.round((advSignedContracts / advVisitedTasksCount) * 100) : 0;

        metricConversionEl.innerText = `${conversionRate}% (${advSignedContracts} عقد من ${advVisitedTasksCount} زيارة)`;

    }

    if (metricTargetEl) {

        const targetSuccessRate = Number(avgTarget) > 0 ? Number((avgAchieved / avgTarget) * 100).toFixed(1) : 0;

        metricTargetEl.innerText = `${targetSuccessRate}% (محقق ${avgAchieved}% من مستهدف ${avgTarget}%)`;

    }



    calculateTopPerformer(window.filteredTasksForExport);

    calculateTopTeam(window.filteredTasksForExport);



    if(currentUser.role === 'admin' || currentUser.role === 'founder') {

        renderAdvancedCharts(perfData, signedCatCounts);

    }



    const fragment = document.createDocumentFragment();

    

    if (crossTeamSearchAlertHtml) {

        const alertWrapper = document.createElement('div');

        alertWrapper.innerHTML = crossTeamSearchAlertHtml;

        fragment.appendChild(alertWrapper);

    }



    if(currentUser.role === 'admin' || currentUser.role === 'founder') { 

        ['Fox Team', 'Power Team'].forEach(team => { 

            if(groupedByTeam[team] && Object.keys(groupedByTeam[team]).length > 0) {

                const details = document.createElement('details');

                details.className = "bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-purple-100 mb-5 h-auto";

                details.open = true;

                details.innerHTML = `<summary class="font-black text-sm sm:text-base text-kanjo-dark cursor-pointer select-none">${isLiveView ? '🔴 المهام الجارية الآن' : 'فريق ' + team} (${teamMembers[team] || ''})</summary><div class="mt-4 space-y-3 h-auto">${window.renderTasks(groupedByTeam[team])}</div>`;

                fragment.appendChild(details);

            }

        }); 

    } else { 

        const wrapper = document.createElement('div');

        wrapper.className = "space-y-3 h-auto";

        wrapper.innerHTML = window.renderTasks(groupedByTeam[currentUser.team] || {});

        fragment.appendChild(wrapper);

    }

    container.innerHTML = ''; 

    container.appendChild(fragment); 

};



function calculateTopPerformer(tasks) {

    const performerEl = document.getElementById('metricTopPerformer');

    const performerIconContainer = document.getElementById('performerIconContainer');

    if (!performerEl || !performerIconContainer) return;

    

    let usersData = new Map();

    tasks.forEach(t => {

        let ach = Number(t.achieved) || 0;

        if (t.isSigned && ach > 0 && t.reports) {

            let baseName = getBaseName(t.name);

            if (ach > 100) ach = 0; 

            t.reports.forEach(r => {

                if (!usersData.has(r.name)) {

                    usersData.set(r.name, { contracts: [], totalAchieved: 0, countAchieved: 0 });

                }

                let uData = usersData.get(r.name);

                uData.contracts.push({ name: baseName, achieved: ach, target: t.target, cat: t.cat, rep: r.name });

                if (ach > 0) {

                    uData.totalAchieved += ach;

                    uData.countAchieved++;

                }

            });

        }

    });

    

    let maxScore = -1;

    let selectedRepName = '';

    let contractsCount = 0;

    let avgAchieved = 0;

    window.topPerformerContractsGlobal = [];



    usersData.forEach((data, user) => {

        let uniqueContractsMap = new Map();

        data.contracts.forEach(c => uniqueContractsMap.set(c.name, c));

        let uniqueContracts = Array.from(uniqueContractsMap.values());



        let cCount = uniqueContracts.length;

        let avg = data.countAchieved > 0 ? (data.totalAchieved / data.countAchieved) : 0;

        let score = (cCount * 15) + avg;



        if (score > maxScore) {

            maxScore = score;

            selectedRepName = user;

            contractsCount = cCount;

            avgAchieved = avg;

            window.topPerformerContractsGlobal = uniqueContracts;

        }

    });

    

    if (maxScore > -1 && userImageMap[selectedRepName]) {

        const imgFileName = userImageMap[selectedRepName];

        performerEl.innerHTML = `${selectedRepName} (${contractsCount} عقود | متوسط ${avgAchieved.toFixed(1)}%)`;

        performerIconContainer.innerHTML = `<img src="${imgFileName}" alt="${selectedRepName}" class="w-full h-full object-cover rounded-xl shadow-sm">`;

        performerIconContainer.className = "bg-white border border-orange-200 p-0.5 rounded-xl text-xl flex items-center justify-center w-12 h-12 flex-shrink-0 overflow-hidden";

    } else {

        performerEl.innerText = maxScore > -1 ? `${selectedRepName} (${contractsCount} عقود)` : 'لا توجد تعاقدات';

        performerIconContainer.innerHTML = `<i class="fa-solid fa-user-tie text-xl"></i>`;

        performerIconContainer.className = "bg-orange-100 text-orange-600 p-3 rounded-xl text-xl flex items-center justify-center w-12 h-12 flex-shrink-0";

    }

}



function calculateTopTeam(tasks) {

    const teamEl = document.getElementById('metricTopTeam');

    const teamIconContainer = document.getElementById('teamIconContainer');

    if (!teamEl || !teamIconContainer) return;

    

    let teamsData = {

        'Fox Team': { contractsMap: new Map(), totalAchieved: 0, countAchieved: 0 },

        'Power Team': { contractsMap: new Map(), totalAchieved: 0, countAchieved: 0 }

    };



    tasks.forEach(t => {

        let teamName = t.team;

        if (teamName === 'A') teamName = 'Fox Team';

        if (teamName === 'B') teamName = 'Power Team';

        if (!teamsData[teamName]) return;



        let ach = Number(t.achieved) || 0;

        if (t.isSigned && ach > 0) {

            let baseName = getBaseName(t.name);

            if (ach > 100) ach = 0; 

            let repName = t.reports && t.reports.length > 0 ? t.reports[t.reports.length - 1].name : '-';



            teamsData[teamName].contractsMap.set(baseName, { name: baseName, achieved: ach, target: t.target, team: teamName, rep: repName });

            if (ach > 0) {

                teamsData[teamName].totalAchieved += ach;

                teamsData[teamName].countAchieved++;

            }

        }

    });



    let maxScore = -1;

    let selectedTeamName = '';

    let contractsCount = 0;

    let avgAchieved = 0;

    window.topTeamContractsGlobal = [];



    Object.keys(teamsData).forEach(teamName => {

        let data = teamsData[teamName];

        let contractsList = Array.from(data.contractsMap.values());

        let cCount = contractsList.length;

        let avg = data.countAchieved > 0 ? (data.totalAchieved / data.countAchieved) : 0;

        let score = (cCount * 15) + avg;



        if (score > maxScore) {

            maxScore = score;

            selectedTeamName = teamName;

            contractsCount = cCount;

            avgAchieved = avg;

            window.topTeamContractsGlobal = contractsList;

        }

    });



    if (maxScore > -1 && teamImageMap[selectedTeamName]) {

        const logoFileName = teamImageMap[selectedTeamName];

        teamEl.innerHTML = `${selectedTeamName} (${contractsCount} عقود | متوسط ${avgAchieved.toFixed(1)}%)`;

        teamIconContainer.innerHTML = `<img src="${logoFileName}" alt="${selectedTeamName}" class="w-full h-full object-contain p-1">`;

        teamIconContainer.className = "bg-white border border-blue-200 p-0.5 rounded-xl text-xl flex items-center justify-center w-12 h-12 flex-shrink-0 overflow-hidden";

    } else {

        teamEl.innerText = maxScore > -1 ? `${selectedTeamName} (${contractsCount} عقود)` : 'لا توجد بيانات';

        teamIconContainer.innerHTML = `<i class="fa-solid fa-crown text-xl"></i>`;

        teamIconContainer.className = "bg-blue-100 text-blue-600 p-3 rounded-xl text-xl flex items-center justify-center w-12 h-12 flex-shrink-0";

    }

}



const valueLabelsPlugin = {

    id: 'valueLabelsPlugin',

    afterDatasetsDraw(chart) {

        const ctx = chart.ctx;

        chart.data.datasets.forEach((dataset, i) => {

            const meta = chart.getDatasetMeta(i);

            meta.data.forEach((bar, index) => {

                const dataValue = dataset.data[index];

                if (dataValue !== undefined && dataValue !== null) {

                    ctx.fillStyle = '#1e293b';

                    ctx.font = 'bold 12px Tahoma';

                    ctx.textAlign = 'center';

                    ctx.textBaseline = 'bottom';

                    ctx.fillText(dataValue + '%', bar.x, bar.y - 6);

                }

            });

        });

    }

};



const centerLogoPlugin = {

    id: 'centerLogoPlugin',

    afterDraw(chart) {

        if (chart.config.type !== 'doughnut') return;

        const ctx = chart.ctx;

        const chartArea = chart.chartArea;

        if (!chartArea) return;

        

        const centerX = chartArea.left + (chartArea.right - chartArea.left) / 2;

        const centerY = chartArea.top + (chartArea.bottom - chartArea.top) / 2;

        

        if (!window._kanjoLogoImg) {

            const img = new Image();

            img.src = 'logo.png';

            img.onload = () => {

                window._kanjoLogoImg = img;

                chart.draw();

            };

        } else if (window._kanjoLogoImg.complete) {

            const sideLength = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);

            const size = Math.max(50, Math.min(sideLength * 0.32, 75));

            ctx.save();

            ctx.drawImage(window._kanjoLogoImg, centerX - size / 2, centerY - size / 2, size, size);

            ctx.restore();

        }

    }

};



function renderAdvancedCharts(perfData, catCounts) {

    const ctxPerf = document.getElementById('chartPerformance');

    const ctxCat = document.getElementById('chartCategories');

    

    if(!ctxPerf || !ctxCat) return;



    if (perfChartInstance) perfChartInstance.destroy();

    perfChartInstance = new Chart(ctxPerf, {

        type: 'bar',

        data: {

            labels: ['متوسط العمولة المستهدفة', 'متوسط العمولة المحققة'],

            datasets: [{

                label: 'نسبة العمولة %',

                data: [perfData.targets, perfData.achieved],

                backgroundColor: ['#8B5CF6', '#10B981'],

                borderRadius: 8

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: { legend: { display: false } },

            scales: { 

                y: { 

                    beginAtZero: true, 

                    max: 25 

                } 

            }

        },

        plugins: [valueLabelsPlugin]

    });



    const rawCatLabels = Object.keys(catCounts);

    const catData = Object.values(catCounts);

    const formattedLabels = rawCatLabels.map((lbl, idx) => `${lbl} (${catData[idx]} محل)`);



    if (catChartInstance) catChartInstance.destroy();

    catChartInstance = new Chart(ctxCat, {

        type: 'doughnut',

        data: {

            labels: formattedLabels.length > 0 ? formattedLabels : ['لا توجد تعاقدات بعد'],

            datasets: [{

                data: catData.length > 0 ? catData : [1],

                backgroundColor: ['#6D28D9', '#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#8B5CF6']

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: { 

                legend: { 

                    position: 'right', 

                    labels: { 

                        boxWidth: 14, 

                        font: { size: 11, weight: 'bold' },

                        color: '#1E293B'

                    } 

                } 

            }

        },

        plugins: [centerLogoPlugin]

    });

}



window.renderTasks = (grouped) => { 

    let html = ''; const todayStr = new Date().toISOString().slice(0, 10);

    Object.keys(grouped).sort().forEach(date => { 

        const isToday = (date === todayStr); const isOpen = isToday ? 'open' : '';

        html += `<details class="mb-3 bg-white rounded-3xl shadow-sm border border-purple-100 group h-auto" ${isOpen}>

            <summary class="font-black text-sm sm:text-base text-kanjo-dark p-3.5 bg-kanjo-light rounded-3xl cursor-pointer select-none flex justify-between items-center group-open:rounded-b-none transition-all">

                <div class="flex items-center gap-2"><i class="fa-regular fa-calendar-days text-kanjo-primary text-base"></i><span>${isLiveView ? '🔴 المهام الجارية الآن' : 'يوم: ' + date} ${isToday ? '<span class="text-[10px] sm:text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full mr-1">اليوم</span>' : ''}</span></div>

                <span class="bg-kanjo-primary text-white text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold shadow-sm">${grouped[date].length} مهام</span>

            </summary>

            <div class="p-3 pt-3.5 bg-slate-50/50 rounded-b-3xl space-y-2 h-auto">`; 

        grouped[date].forEach(t => { 

            const baseN = getBaseName(t.name);

            let effectiveTarget = t.target;

            let effectiveIsSigned = false;

            let effectiveIsProvisional = false;

            let effectiveAchieved = t.achieved;



            window.tasksMemory.forEach((memTask) => {

                if (getBaseName(memTask.name) === baseN) {

                    if (!effectiveTarget && memTask.target > 0) effectiveTarget = memTask.target;

                    const memAchieved = Number(memTask.achieved) || 0;

                    if (memTask.isSigned && memAchieved > 0) {

                        effectiveIsSigned = true;

                        effectiveIsProvisional = false;

                        if (memAchieved > effectiveAchieved) effectiveAchieved = memAchieved;

                    } else if ((memTask.isProvisional || (memTask.isSigned && memAchieved === 0)) && !effectiveIsSigned) {

                        effectiveIsProvisional = true;

                        if (memAchieved > effectiveAchieved) effectiveAchieved = memAchieved;

                    }

                }

            });



            const uniqueReportsMap = new Map();

            (t.reports || []).forEach(r => {

                const dedupKey = `${r.name || ''}_${r.general || ''}_${r.merchant || ''}_${r.contactPhone || ''}`;

                if (!uniqueReportsMap.has(dedupKey)) {

                    uniqueReportsMap.set(dedupKey, r);

                }

            });

            const sortedReports = Array.from(uniqueReportsMap.values()).sort((a, b) => {

                const timeA = a.timestamp || `${a.date || ''} ${a.time || ''}`;

                const timeB = b.timestamp || `${b.date || ''} ${b.time || ''}`;

                return timeB.localeCompare(timeA);

            });



            const visibleReports = sortedReports.filter(r => {

                if (currentUser.role === 'admin' || currentUser.role === 'founder') return true;

                if (currentUser.role === 'rep') {

                    return true;

                }

                return r.name === currentUser.name;

            });



            const reportsHtml = visibleReports.map((r, rIdx) => {

                let reportDateStr = r.date || (r.timestamp ? r.timestamp.split(' ')[0] : t.time || '');

                let reportTimeStr = r.time || (r.timestamp ? r.timestamp.split(' ').slice(1).join(' ') : '');

                

                let dateTimeDisplay = '';

                if (reportDateStr && reportTimeStr) {

                    dateTimeDisplay = `📅 ${reportDateStr} | 🕒 ${reportTimeStr}`;

                } else if (reportDateStr) {

                    dateTimeDisplay = `📅 ${reportDateStr}`;

                } else if (reportTimeStr) {

                    dateTimeDisplay = `🕒 ${reportTimeStr}`;

                } else {

                    dateTimeDisplay = r.timestamp || 'وقت وتاريخ غير مسجلين';

                }



                let archiveReportBtn = '';

                if (currentUser && currentUser.name === 'أ/ محمود') {

                    const originalIdx = (t.reports || []).findIndex(origRep => origRep === r || (origRep.timestamp === r.timestamp && origRep.name === r.name));

                    if (originalIdx !== -1) {

                        archiveReportBtn = `

                            <button onclick="openArchiveReportModal('${t.id}', ${originalIdx})" class="bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-amber-200 shadow-sm" title="نقل التقرير إلى سلة الحفظ واستبعاده">

                                <i class="fa-solid fa-box-archive"></i> <span>نقل للسلة</span>

                            </button>

                        `;

                    }

                }



                return `

                    <div class="bg-white p-3.5 rounded-2xl mb-2 text-sm text-slate-800 border border-purple-200 shadow-sm space-y-2 w-full h-auto">

                        <div class="flex justify-between items-center border-b border-purple-100 pb-2">

                            <div class="flex items-center gap-2">

                                <span class="w-6 h-6 rounded-full bg-kanjo-light text-kanjo-primary font-black flex items-center justify-center text-xs shadow-sm">${r.name ? r.name.charAt(0) : 'م'}</span>

                                <b class="text-kanjo-dark font-black text-sm sm:text-base">${r.name}</b>

                            </div>

                            <div class="flex items-center gap-2">

                                <span class="text-xs bg-kanjo-light px-2.5 py-1 rounded-xl border border-purple-100 text-slate-600 font-bold">${dateTimeDisplay}</span>

                                ${archiveReportBtn}

                            </div>

                        </div>

                        ${r.contactName ? `

                            <div class="bg-purple-50/80 p-2.5 rounded-xl border border-purple-200 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold text-kanjo-dark">

                                <div class="flex items-center gap-2">

                                    <i class="fa-solid fa-user-tie text-kanjo-primary"></i>

                                    <span>${r.contactName} (${r.contactRole || 'بدون صفة'})</span>

                                </div>

                                <div class="flex items-center gap-1 text-emerald-800"><i class="fa-solid fa-phone-flip text-emerald-600"></i> <span dir="ltr" class="font-mono text-sm whitespace-nowrap text-right">${r.contactPhone || 'بدون رقم'}</span></div>

                            </div>

                        ` : ''}

                        ${r.general ? `<div class="text-slate-900 font-semibold px-1 text-sm sm:text-base leading-relaxed"><b>ملاحظات عامة:</b> ${r.general}</div>` : ''}

                        ${r.merchant ? `<div class="text-slate-800 font-medium px-1 text-sm sm:text-base leading-relaxed"><b>ملاحظات التاجر:</b> ${r.merchant}</div>` : ''}

                        ${r.team ? `<div class="text-slate-800 font-medium px-1 text-sm sm:text-base leading-relaxed"><b>ملاحظات الزملاء:</b> ${r.team}</div>` : ''}

                        ${r.next ? `<div class="text-purple-900 px-1 font-black text-sm sm:text-base"><b>القادم:</b> ${r.next}</div>` : ''}

                    </div>

                `;

            }).join(''); 



            const userAtts = (t.attendances || []).filter(a => a.user === currentUser.name);

            const hasStarted = userAtts.some(a => a.type === 'start');

            const hasEnded = userAtts.some(a => a.type === 'end');

            let attendanceHtml = (t.attendances || []).map(a => `<div class="text-[10px] ${a.type === 'start' ? 'text-green-600' : 'text-red-600'} font-bold">${a.user}: ${a.type === 'start' ? 'بدء' : 'إنهاء'} ${a.time} <a href="https://www.google.com/maps/search/?api=1&query=${a.loc}" target="_blank" class="underline text-blue-600">[الخريطة]</a></div>`).join('');

            

            let progressHtml = '';

            if ((effectiveIsSigned || effectiveIsProvisional) && effectiveTarget > 0) {

                const percentage = Math.round((effectiveAchieved / effectiveTarget) * 100);

                const colorClass = percentage >= 100 ? "text-green-600" : (percentage >= 50 ? "text-orange-500" : "text-red-500");

                const labelText = effectiveIsSigned ? "نسبة إنجاز التعاقد" : "نسبة الاتفاق المبدئي";

                progressHtml = `<div class="text-xs sm:text-sm font-black ${colorClass} mt-1.5">${labelText}: ${percentage}% (محقق ${effectiveAchieved}% من مستهدف ${effectiveTarget}%)</div>`;

            }



            const adminActions = (currentUser.name === 'أ/ محمود') ? `<div class="flex gap-2"><button onclick="openEditModal('${t.id}', {name: '${window.safeString(t.name)}', cat: '${t.cat}', team: '${t.team}', time: '${t.time}', target: ${effectiveTarget || 0}, notes: '${window.safeString(t.notes)}'})" class="text-kanjo-primary hover:text-violet-800 p-1"><i class="fa fa-edit text-xs"></i></button><button onclick="promptDelete('${t.id}')" class="text-slate-300 hover:bg-red-100 hover:text-red-600 p-1 rounded-full"><i class="fa fa-trash text-xs"></i></button></div>` : ''; 

            const canReport = (currentUser.role !== 'founder'); 

            let attButtons = '';

            if (currentUser.role === 'rep' && !effectiveIsSigned) {

                if (!hasStarted) attButtons = `<button onclick="recordAttendance('${t.id}', 'start')" class="w-full bg-green-600 text-white py-2.5 rounded-xl text-xs sm:text-sm font-bold mb-2 shadow-sm">بدء الزيارة</button>`;

                else if (!hasEnded) attButtons = `<button onclick="recordAttendance('${t.id}', 'end')" class="w-full bg-red-600 text-white py-2.5 rounded-xl text-xs sm:text-sm font-bold mb-2 shadow-sm">إنهاء الزيارة</button>`;

            }



            const merchantProfileBtn = `<button onclick="openMerchantProfile('${window.safeString(baseN)}')" class="bg-purple-100 text-kanjo-primary hover:bg-purple-200 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"><i class="fa-solid fa-id-card"></i> <span>بطاقة التاجر</span></button>`;



            let cardBadge = '';

            if (effectiveIsSigned) cardBadge = '<span class="text-emerald-600 ml-1">✅</span>';

            else if (effectiveIsProvisional) cardBadge = '<span class="text-amber-600 ml-1">🤝 (اتفاق مبدئي)</span>';



            let cardBgClass = '';

            if (effectiveIsSigned) cardBgClass = 'bg-green-50/40 border-green-200';

            else if (effectiveIsProvisional) cardBgClass = 'bg-amber-50/40 border-amber-200';



            html += `<div id="task-card-${t.id}" class="bg-white p-3.5 rounded-2xl shadow-sm border border-purple-50 mb-2.5 transition-all duration-300 h-auto ${cardBgClass}">

                <div class="flex flex-wrap justify-between items-center mb-2 gap-2">

                    <div class="flex items-center gap-2 flex-wrap">

                        <h3 class="font-bold text-sm sm:text-base text-slate-900">${t.name} ${cardBadge}</h3>

                        ${merchantProfileBtn}

                    </div>

                    <div class="flex flex-wrap gap-2 items-center w-full sm:w-auto justify-between sm:justify-end">

                        <span class="text-xs bg-kanjo-light text-kanjo-primary px-3 py-1 rounded-full font-bold border border-purple-100">${t.cat}</span>

                        ${adminActions}

                    </div>

                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm mb-2 text-slate-700 items-start">

                    <div class="bg-kanjo-light p-2.5 rounded-xl font-bold flex items-center border border-transparent">🎯 نسبة التارجت: ${effectiveTarget ? effectiveTarget + '%' : '-'}</div>

                    <div class="bg-orange-50 p-2.5 rounded-xl font-bold whitespace-normal break-words-custom border border-transparent">📝 ${t.notes || '-'}</div>

                </div>

                ${effectiveIsSigned ? window.calculateComm(effectiveTarget, effectiveAchieved) : ''}

                ${progressHtml}

                <div class="mb-1.5 mt-1.5">${attendanceHtml}</div>

                ${visibleReports.length > 0 ? `<div class="space-y-2 mb-2 break-words-custom h-auto">${reportsHtml}</div>` : ''}

                ${attButtons}

                ${canReport ? `<button onclick="openReportModal('${t.id}', '${window.safeString(t.name)}', '${t.team}', ${effectiveTarget || 0}, '${window.safeString(t.notes)}')" class="w-full bg-kanjo-dark text-white py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-violet-900 transition shadow-sm mt-1">إضافة تقرير</button>` : ''}

            </div>`; 

        }); 

        html += `</div></details>`; 

    }); 

    return html; 

};



window.promptDelete = (id) => { taskToDelete = id; document.getElementById('deleteModal').classList.remove('hidden'); };

window.closeDeleteModal = () => document.getElementById('deleteModal').classList.add('hidden');

window.confirmDelete = async () => { await deleteDoc(doc(db, "tasks", taskToDelete)); closeDeleteModal(); showToast("تم حذف المهمة نهائياً"); };

window.logout = () => { window.clearSession(); window.location.reload(); };



const savedUser = localStorage.getItem(SESSION_KEY);

if (savedUser) {

    currentUser = JSON.parse(savedUser);

    applyThemeAndShowDashboard();

}