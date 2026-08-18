/* Kanjo Ops — Dashboard, Filters, Task Cards & Rankings */

window.closeStatModal = () => document.getElementById('detailsModal').classList.add('hidden');

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

            if (cardType.startsWith('payroll_tier') && typeof window.getPayrollPeriodKey === 'function') {

                const periodKey = window.getPayrollPeriodKey();

                if (periodKey && periodKey !== 'all') {

                    const d = i.contractDate || '';

                    if (!d || !d.startsWith(periodKey)) return false;

                }

            }

            let ratio = i.target > 0 ? (i.achieved / i.target) * 100 : 0;

            

            if (cardType === 'payroll_tier1' && ratio !== 100) return false;

            if (cardType === 'payroll_tier2' && (ratio <= 90 || ratio >= 100)) return false;

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

window.applySearch = () => renderDashboard(window.lastSnapshot);

window.toggleLiveView = () => { 

    isLiveView = !isLiveView; 

    document.getElementById('toggleText').innerText = isLiveView ? "العودة للقائمة الكاملة" : "عرض المهام الجارية (LIVE)"; 

    renderDashboard(window.lastSnapshot); 

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

                    team: task.team,

                    contractDate: ''

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

                const cDate = (typeof window.extractTaskContractDate === 'function')
                    ? window.extractTaskContractDate(task)
                    : (task.time || '');

                if (cDate && (!mData.contractDate || cDate > mData.contractDate)) {

                    mData.contractDate = cDate;

                }

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

            const lastUserAtt = userAtts.length > 0 ? userAtts[userAtts.length - 1] : null;

            const visitInProgress = !!(lastUserAtt && lastUserAtt.type === 'start');

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

            if (currentUser.role === 'rep') {

                if (visitInProgress) {

                    attButtons = `<div class="visit-control-wrap mb-2" id="visit-wrap-${t.id}"><div class="visit-status-chip visit-status-active mb-1.5"><span class="visit-pulse-dot"></span><span>الزيارة جارية ⏳ — سجّل إنهاء الزيارة عند المغادرة</span></div><button type="button" id="visit-btn-${t.id}" onclick="recordAttendance('${t.id}', 'end')" class="visit-btn visit-btn-end w-full py-3 rounded-2xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2"><i class="fa-solid fa-location-pin-lock"></i><span>إنهاء الزيارة 🔴</span></button></div>`;

                } else {

                    attButtons = `<div class="visit-control-wrap mb-2" id="visit-wrap-${t.id}"><button type="button" id="visit-btn-${t.id}" onclick="recordAttendance('${t.id}', 'start')" class="visit-btn visit-btn-start w-full py-3 rounded-2xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2"><i class="fa-solid fa-location-crosshairs"></i><span>بدء الزيارة 🟢</span></button></div>`;

                }

            }



            const merchantProfileBtn = `<button onclick="openMerchantProfile('${window.safeString(baseN)}')" class="bg-purple-100 text-kanjo-primary hover:bg-purple-200 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"><i class="fa-solid fa-id-card"></i> <span>بطاقة التاجر</span></button>`;

            const merchantLogoHtml = t.merchantLogo
                ? `<img src="${t.merchantLogo}" alt="شعار التاجر" class="w-10 h-10 object-contain rounded-lg border border-purple-100 bg-white p-0.5 shadow-sm">`
                : '';

            const updateLogoBtn = `<button onclick="openMerchantLogoUpdate('${t.id}')" class="bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-amber-200 shadow-sm"><i class="fa-solid fa-image"></i> <span>تحديث اللوجو</span></button>`;



            let cardBadge = '';

            if (effectiveIsSigned) cardBadge = '<span class="text-emerald-600 ml-1">✅</span>';

            else if (effectiveIsProvisional) cardBadge = '<span class="text-amber-600 ml-1">🤝 (اتفاق مبدئي)</span>';



            let cardBgClass = '';

            if (effectiveIsSigned) cardBgClass = 'bg-green-50/40 border-green-200';

            else if (effectiveIsProvisional) cardBgClass = 'bg-amber-50/40 border-amber-200';



            html += `<div id="task-card-${t.id}" class="bg-white p-3.5 rounded-2xl shadow-sm border border-purple-50 mb-2.5 transition-all duration-300 h-auto ${cardBgClass}">

                <div class="flex flex-wrap justify-between items-center mb-2 gap-2">

                    <div class="flex items-center gap-2 flex-wrap">

                        ${merchantLogoHtml}

                        <h3 class="font-bold text-sm sm:text-base text-slate-900">${t.name} ${cardBadge}</h3>

                        ${merchantProfileBtn}

                        ${updateLogoBtn}

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

                ${(() => {

                    const savedComm = t.commission || {};

                    const savedBase = (savedComm.baseCommission !== null && savedComm.baseCommission !== undefined && savedComm.baseCommission !== '') ? savedComm.baseCommission : null;

                    const baseRate = savedBase !== null ? savedBase : (effectiveTarget ? effectiveTarget : (t.achieved || null));

                    const rawStatus = String(t.agreementStatus || '').trim();

                    let statusText = '';

                    if (rawStatus) {

                        statusText = (rawStatus.includes('نهائي') || rawStatus === 'final' || rawStatus === 'signed' || rawStatus === 'confirmed') ? 'اتفاق نهائي' : 'اتفاق مبدئي';

                    } else if (effectiveIsSigned) {

                        statusText = 'اتفاق نهائي';

                    } else if (effectiveIsProvisional) {

                        statusText = 'اتفاق مبدئي';

                    }

                    if (baseRate === null && !statusText) return '';

                    const statusBadge = statusText ? `<span class="${statusText === 'اتفاق نهائي' ? 'text-emerald-600' : 'text-amber-600'}">(${statusText})</span>` : '';

                    let exceptionHtml = '';

                    if (Array.isArray(savedComm.exceptions)) {

                        exceptionHtml = savedComm.exceptions.filter(ex => ex && ex.category).map(ex => `<div class="text-[11px] sm:text-xs font-bold text-purple-900 mt-1">استثناء: ${window.safeString ? window.safeString(ex.category) : ex.category} ${(ex.rate !== null && ex.rate !== undefined && ex.rate !== '') ? ex.rate + '%' : ''}</div>`).join('');

                    }

                    return `<div class="mt-1.5 p-2.5 bg-purple-50 border border-purple-200 rounded-xl">

                        <div class="text-xs sm:text-sm font-black text-kanjo-primary">النسبة الأساسية: ${baseRate !== null ? baseRate + '%' : '-'} ${statusBadge}</div>

                        ${exceptionHtml}

                    </div>`;

                })()}

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

window.setupAdvancedFilterElements = setupAdvancedFilterElements;
window.calculateTopPerformer = calculateTopPerformer;
window.calculateTopTeam = calculateTopTeam;

export { setupAdvancedFilterElements, calculateTopPerformer, calculateTopTeam };
