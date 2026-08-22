/* Kanjo Ops — Firestore Cloud Operations */

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

window.recordAttendance = async function(taskId, type) {
    if (!navigator.geolocation) return showToast("المتصفح لا يدعم الموقع", false);
    if (window._visitBusyMap && window._visitBusyMap[taskId]) {
        showToast("⏳ يتم تسجيل الزيارة الآن... انتظر لحظة", false);
        return;
    }

    if (!window._visitBusyMap) window._visitBusyMap = {};
    window._visitBusyMap[taskId] = true;

    if (typeof window.setVisitButtonLoading === 'function') {
        window.setVisitButtonLoading(taskId, type, true);
    }

    try {
        showToast(type === 'start'
            ? "🟢 جاري تحديد موقع بدء الزيارة..."
            : "🔴 جاري تحديد موقع إنهاء الزيارة...", true);

        const position = await (window.getCurrentPositionFast
            ? window.getCurrentPositionFast({ enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 })
            : new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 })));

        const { latitude, longitude } = position.coords;
        const locStr = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        const timeStr = new Date().toLocaleTimeString();
        const todayStr = new Date().toISOString().slice(0, 10);

        const taskData = window.tasksMemory.get(taskId) || {};
        const baseName = getBaseName(taskData.name);

        const relatedIds = [];
        if (window.tasksMemory && window.tasksMemory.size > 0) {
            window.tasksMemory.forEach((t, id) => {
                if (getBaseName(t.name) === baseName) relatedIds.push(id);
            });
        }
        if (!relatedIds.includes(taskId)) relatedIds.push(taskId);

        let cleanAddress = null;
        try {
            cleanAddress = await Promise.race([
                getCleanAddressFromCoords(latitude, longitude),
                new Promise((resolve) => setTimeout(() => resolve(null), 4500))
            ]);
        } catch (_) {
            cleanAddress = null;
        }

        const batch = writeBatch(db);
        const attendanceEntry = {
            user: currentUser.name,
            type: type,
            time: timeStr,
            loc: locStr,
            date: todayStr
        };

        relatedIds.forEach((id) => {
            const ref = doc(db, "tasks", id);
            const tData = window.tasksMemory.get(id) || {};
            let updatePayload = {
                attendances: id === taskId ? arrayUnion(attendanceEntry) : (tData.attendances || []),
                time: id === taskId ? todayStr : (tData.time || todayStr)
            };
            if (cleanAddress) updatePayload.address = cleanAddress;
            if (id !== taskId) {
                updatePayload = cleanAddress ? { address: cleanAddress } : null;
            }
            if (updatePayload) batch.update(ref, updatePayload);
        });

        await batch.commit();

        const mem = window.tasksMemory.get(taskId);
        if (mem) {
            if (!Array.isArray(mem.attendances)) mem.attendances = [];
            mem.attendances = [...mem.attendances, attendanceEntry];
            mem.time = todayStr;
            if (cleanAddress) mem.address = cleanAddress;
            window.tasksMemory.set(taskId, mem);
        }

        showToast(type === 'start'
            ? "🟢 تم بدء الزيارة وتسجيل GPS بنجاح!"
            : "🔴 تم إنهاء الزيارة وتسجيل الموقع بنجاح!");

        const wrap = document.getElementById(`visit-wrap-${taskId}`);
        if (wrap) {
            if (type === 'start') {
                wrap.innerHTML = `<div class="visit-status-chip visit-status-active mb-1.5"><span class="visit-pulse-dot"></span><span>الزيارة جارية ⏳ — سجّل إنهاء الزيارة عند المغادرة</span></div><button type="button" id="visit-btn-${taskId}" onclick="recordAttendance('${taskId}', 'end')" class="visit-btn visit-btn-end w-full py-3 rounded-2xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2"><i class="fa-solid fa-location-pin-lock"></i><span>إنهاء الزيارة 🔴</span></button>`;
            } else {
                wrap.innerHTML = `<button type="button" id="visit-btn-${taskId}" onclick="recordAttendance('${taskId}', 'start')" class="visit-btn visit-btn-start w-full py-3 rounded-2xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 visit-btn-success-flash"><i class="fa-solid fa-location-crosshairs"></i><span>بدء الزيارة 🟢</span></button>`;
            }
        }

    } catch (err) {
        console.error('recordAttendance error:', err);
        const msg = (err && (err.code === 1 || err.message === 'NO_GEO'))
            ? "يرجى تفعيل صلاحية الموقع من إعدادات المتصفح"
            : (err && err.message === 'TIMEOUT')
                ? "انتهت مهلة تحديد الموقع — حاول مرة أخرى في مكان مفتوح"
                : "تعذر تسجيل الزيارة، حاول مرة أخرى";
        showToast(msg, false);
        if (typeof window.setVisitButtonLoading === 'function') {
            window.setVisitButtonLoading(taskId, type, false);
        }
    } finally {
        if (window._visitBusyMap) delete window._visitBusyMap[taskId];
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

const TASKS_PAGE_SIZE = 50;
const TASKS_FETCH_TIMEOUT = 8000;

window.tasksLastVisible = null;
window.tasksLoading = false;
window.tasksAllLoaded = false;

function fetchWithTimeout(fn, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ timedOut: true }), ms);
        Promise.resolve().then(fn).then((result) => {
            clearTimeout(timer);
            resolve(result);
        }).catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function buildVirtualSnapshot() {
    return {
        docs: Array.from(window.tasksMemory.entries()).map(([id, data]) => ({ id, data: () => data })),
        forEach: (cb) => {
            window.tasksMemory.forEach((data, id) => cb({ id, data: () => data }));
        }
    };
}

function computeUniqueMerchantsFromMemory() {
    const uniqueMerchants = new Map();
    window.tasksMemory.forEach((task) => {
        const baseName = getBaseName(task.name);
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
        const mData = uniqueMerchants.get(baseName);
        const currentTarget = Number(task.target) || 0;
        const rawAchieved = Number(task.achieved) || 0;
        let currentAchieved = (task.isSigned || task.isProvisional) ? rawAchieved : 0;
        if (currentAchieved > 100) currentAchieved = 0;
        if (currentTarget > mData.target) mData.target = currentTarget;
        if (currentAchieved > mData.achieved) mData.achieved = currentAchieved;
        if (task.isSigned && rawAchieved > 0) {
            mData.isSigned = true;
            mData.isProvisional = false;
            let cDate = '';
            if (typeof window.extractTaskContractDate === 'function') {
                cDate = window.extractTaskContractDate(task);
            } else if (task.time) {
                cDate = task.time;
            }
            if (cDate && (!mData.contractDate || cDate > mData.contractDate)) mData.contractDate = cDate;
        } else if (task.isProvisional || (task.isSigned && rawAchieved === 0)) {
            mData.isProvisional = true;
        }
        if (task.attendances && task.attendances.length > 0) mData.hasVisit = true;
        if (task.cat && task.cat !== "متابعة" && task.cat !== "متابعه") mData.cat = task.cat;
    });
    window.currentUniqueMerchantsGlobal = uniqueMerchants;
}

function rerenderDashboard() {
    window.lastSnapshot = buildVirtualSnapshot();
    computeUniqueMerchantsFromMemory();
    if (currentUser && currentUser.role === 'accounting') {
        renderPayrollTable();
    } else {
        renderDashboard(window.lastSnapshot);
    }
    window.loadPayrollSettingsAndCalculateFounderSummary();
    checkAndUpdateMissingAddresses(window.allTasksCache);
    if (currentUser && currentUser.role === 'rep') {
        updateQuickLinksWalletCounter();
    }
}

window.showSlowNetworkToast = () => {
    if (typeof showToast === 'function') {
        showToast("تحذير: الاتصال بالشبكة بطيء — يتم عرض أحدث البيانات المتاحة فقط", false);
    }
};

function handleSlowNetwork() {
    console.warn("PERFORMANCE: Firestore fetch exceeded " + TASKS_FETCH_TIMEOUT + "ms. Falling back to clean state.");
    rerenderDashboard();
    window.showSlowNetworkToast();
}

function loadTasksPage(startAfterDoc) {
    if (window.tasksLoading) return;
    window.tasksLoading = true;

    const tasksCol = collection(db, "tasks");
    
    // تم إزالة orderBy بالكامل عشان الداتا القديمة اللي مفيهاش createdAt تظهر كلها
    const q = startAfterDoc
        ? query(tasksCol, limit(TASKS_PAGE_SIZE), startAfter(startAfterDoc))
        : query(tasksCol, limit(TASKS_PAGE_SIZE));

    fetchWithTimeout(() => getDocs(q), TASKS_FETCH_TIMEOUT)
        .then((result) => {
            if (result && result.timedOut) {
                window.tasksLoading = false;
                handleSlowNetwork();
                return;
            }
            const querySnapshot = result;
            const docs = querySnapshot.docs;
            docs.forEach((docSnap) => {
                window.tasksMemory.set(docSnap.id, docSnap.data());
            });
            window.tasksLastVisible = docs.length > 0 ? docs[docs.length - 1] : window.tasksLastVisible;
            window.tasksAllLoaded = docs.length < TASKS_PAGE_SIZE;
            window.tasksLoading = false;
            rerenderDashboard();
        })
        .catch((err) => {
            window.tasksLoading = false;
            console.error("Firestore tasks fetch error:", err);
            handleSlowNetwork();
        });
}

const loadMoreTasks = () => {
    if (window.tasksLoading || window.tasksAllLoaded || !window.tasksLastVisible) return;
    loadTasksPage(window.tasksLastVisible);
};

window.loadMoreTasks = loadMoreTasks;

window.listenToTasks = () => {
    const tasksCol = collection(db, "tasks");
    
    // تم إزالة orderBy من هنا برضه عشان الفلترة متخفيش الداتا القديمة
    const realtimeQ = query(tasksCol, limit(TASKS_PAGE_SIZE));

    onSnapshot(realtimeQ, (snapshot) => {

        if (!window.hasRunSignedMigration) {
            window.hasRunSignedMigration = true;
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
        }

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                window.tasksMemory.set(change.doc.id, change.doc.data());
            } else if (change.type === "removed") {
                window.tasksMemory.delete(change.doc.id);
            }
        });

        if (snapshot.docs.length > 0) {
            window.tasksLastVisible = snapshot.docs[snapshot.docs.length - 1];
        }
        window.tasksAllLoaded = snapshot.docs.length < TASKS_PAGE_SIZE;

        rerenderDashboard();

    }, (error) => {
        console.error("Firestore snapshot error:", error);
        handleSlowNetwork();
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

window.updateNotificationsUI = updateNotificationsUI;
window.updateQuickLinksWalletCounter = updateQuickLinksWalletCounter;

export { updateNotificationsUI, updateQuickLinksWalletCounter, loadMoreTasks };
