/* Kanjo Ops — Firestore Cloud Operations (Stable Final Version) */

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

const taskQuickViewEscape = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.closeTaskQuickView = () => {
    const modal = document.getElementById('taskQuickViewModal');
    if (modal) modal.classList.add('hidden');
    window._taskQuickViewTaskId = '';
};

window.openTaskQuickView = (task) => {
    if (!task) return;
    const modal = document.getElementById('taskQuickViewModal');
    const body = document.getElementById('taskQuickViewBody');
    const titleEl = document.getElementById('taskQuickViewTitle');
    const subtitleEl = document.getElementById('taskQuickViewSubtitle');
    if (!modal || !body) return;
    window._taskQuickViewTaskId = task.id || '';

    const name = task.name || 'مهمة غير معروفة';
    const team = task.team || '-';
    const date = task.time || 'غير محدد';
    const cat = task.cat || 'غير محدد';
    const target = Number(task.target) || 0;
    const achieved = Number(task.achieved) || 0;
    const isSigned = task.isSigned && achieved > 0;
    const isProvisional = task.isProvisional || (task.isSigned && achieved === 0);

    let statusBadge = '<span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-[11px] font-black">بدون تعاقد</span>';
    if (isSigned) statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-black">متعاقد نهائي</span>';
    else if (isProvisional) statusBadge = '<span class="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-[11px] font-black">اتفاق مبدئي</span>';

    let progressHtml = '';
    if ((isSigned || isProvisional) && target > 0) {
        const percentage = Math.round((achieved / target) * 100);
        const colorClass = percentage >= 100 ? 'text-green-600' : (percentage >= 50 ? 'text-orange-500' : 'text-red-500');
        progressHtml = `<div class="text-xs sm:text-sm font-black ${colorClass}">نسبة الإنجاز: ${percentage}% (محقق ${achieved}% من مستهدف ${target}%)</div>`;
    }

    const attendances = Array.isArray(task.attendances) ? task.attendances : [];
    const visitsHtml = attendances.length
        ? attendances.map((a) => `<div class="flex items-center justify-between gap-2 text-[11px] font-bold ${a.type === 'start' ? 'text-green-700' : 'text-red-600'} bg-white border border-purple-100 rounded-xl px-2.5 py-1.5"><span>${taskQuickViewEscape(a.user)} — ${a.type === 'start' ? 'بدء زيارة' : 'إنهاء زيارة'} ${taskQuickViewEscape(a.time || '')}</span>${a.loc ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.loc)}" target="_blank" class="underline text-blue-600 whitespace-nowrap">الخريطة</a>` : ''}</div>`).join('')
        : '<div class="text-[11px] font-bold text-slate-400">لا توجد زيارات مسجلة</div>';

    const reports = Array.isArray(task.reports) ? task.reports : [];
    const reportsHtml = reports.length
        ? reports.map((r) => `<div class="bg-white border border-purple-100 rounded-xl p-2.5 space-y-1">
            <div class="flex items-center justify-between gap-2">
                <span class="font-black text-xs text-kanjo-dark">${taskQuickViewEscape(r.name)}</span>
                <span class="text-[10px] font-bold text-slate-400">${taskQuickViewEscape(r.date || '')} ${taskQuickViewEscape(r.time || '')}</span>
            </div>
            ${r.general ? `<div class="text-[11px] text-slate-700 font-semibold">ملاحظات عامة: ${taskQuickViewEscape(r.general)}</div>` : ''}
            ${r.merchant ? `<div class="text-[11px] text-slate-700 font-semibold">ملاحظات التاجر: ${taskQuickViewEscape(r.merchant)}</div>` : ''}
            ${r.next ? `<div class="text-[11px] text-purple-800 font-black">القادم: ${taskQuickViewEscape(r.next)}</div>` : ''}
        </div>`).join('')
        : '<div class="text-[11px] font-bold text-slate-400">لا توجد تقارير</div>';

    if (titleEl) titleEl.textContent = name;
    if (subtitleEl) subtitleEl.textContent = `${team} • ${cat} • يوم ${date}`;

    body.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">${statusBadge}</div>
        ${progressHtml}
        ${task.notes ? `<div class="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-xs text-slate-700"><span class="font-black text-amber-800 block mb-0.5">ملاحظات توجيهية:</span>${taskQuickViewEscape(task.notes)}</div>` : ''}
        <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-kanjo-light rounded-xl p-2.5"><div class="text-[10px] font-black text-slate-500">الفئة</div><div class="font-black text-kanjo-dark">${taskQuickViewEscape(cat)}</div></div>
            <div class="bg-kanjo-light rounded-xl p-2.5"><div class="text-[10px] font-black text-slate-500">التارجت</div><div class="font-black text-kanjo-primary">${target ? target + '%' : '-'}</div></div>
        </div>
        <div class="bg-slate-50 border border-purple-100 rounded-2xl p-3 space-y-2">
            <div class="font-black text-xs text-kanjo-dark"><i class="fa-solid fa-location-dot text-kanjo-primary"></i> الزيارات (${attendances.length})</div>
            <div class="space-y-1.5">${visitsHtml}</div>
        </div>
        <div class="bg-slate-50 border border-purple-100 rounded-2xl p-3 space-y-2">
            <div class="font-black text-xs text-kanjo-dark"><i class="fa-solid fa-file-lines text-kanjo-primary"></i> التقارير (${reports.length})</div>
            <div class="space-y-1.5">${reportsHtml}</div>
        </div>`;

    modal.classList.remove('hidden');
};

window.goToTaskInList = () => {
    const taskId = window._taskQuickViewTaskId;
    let task = (window.allTasksCache || []).find((t) => t.id === taskId) || null;
    if (!task && window.tasksMemory && typeof window.tasksMemory.get === 'function' && window.tasksMemory.get(taskId)) {
        task = { id: taskId, ...window.tasksMemory.get(taskId) };
    }
    if (!task) {
        if (window.showToast) window.showToast('تعذر تحديد موقع المهمة في القائمة', false);
        return;
    }
    window._tasksSelectedDate = task.time || window.getTasksSelectedDate();
    window.closeTaskQuickView();
    if (window.lastSnapshot) window.renderDashboard(window.lastSnapshot);
    setTimeout(() => {
        const taskDiv = document.getElementById(`task-card-${task.id}`);
        if (taskDiv) {
            taskDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            taskDiv.classList.add('highlight-task');
            setTimeout(() => taskDiv.classList.remove('highlight-task'), 2000);
        }
    }, 350);
};

window.goToTask = async (taskId, taskDate) => {
    if (!taskId) return;
    const dropdown = document.getElementById('notificationsDropdown');
    if (dropdown) dropdown.classList.add('hidden');

    let task = null;
    if (window.tasksMemory && typeof window.tasksMemory.get === 'function') {
        const mem = window.tasksMemory.get(taskId);
        if (mem) task = { id: taskId, ...mem };
    }
    if (!task && Array.isArray(window.allTasksCache)) {
        task = window.allTasksCache.find((t) => t.id === taskId) || null;
    }
    if (!task) {
        try {
            const snap = await window.getDoc(window.doc(window.db, 'tasks', taskId));
            if (snap && snap.exists && snap.exists()) task = { id: snap.id, ...snap.data() };
        } catch (err) {
            console.error('[tasks] quick view fetch failed:', err);
        }
    }
    if (!task) {
        if (window.showToast) window.showToast('تعذر العثور على بيانات المهمة', false);
        return;
    }
    window.openTaskQuickView(task);
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
            const isFinalizedContract = tData && tData.isSigned === true && (Number(tData.achieved) || 0) > 0;
            let updatePayload = {
                attendances: id === taskId ? arrayUnion(attendanceEntry) : (tData.attendances || []),
                time: (id === taskId && !isFinalizedContract) ? todayStr : (tData.time || todayStr)
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
            const memFinalized = mem.isSigned === true && (Number(mem.achieved) || 0) > 0;
            if (!memFinalized) mem.time = todayStr;
            if (cleanAddress) mem.address = cleanAddress;
            window.tasksMemory.set(taskId, mem);
            /* Local optimistic update: bump the version so the derived
               aggregates recompute on the next render instead of waiting for
               the listener round-trip. */
            window.tasksMemoryVersion = tasksMemoryVersion() + 1;
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
    const taskName = document.getElementById('mName').value; 
    const merchantId = window.getOrCreateMerchantId ? await window.getOrCreateMerchantId(getBaseName(taskName)) : null;
    await addDoc(collection(db, "tasks"), { 
        name: taskName, 
        merchantId: merchantId, 
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
    if (typeof window.closeAssignTaskModal === 'function') window.closeAssignTaskModal();
    if (typeof window.ensureMerchantIds === 'function') window.ensureMerchantIds();
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

/* ── Manager transfer queue: lightweight live snapshot ─────────────────────
   The manager panel used a one-time getDocs(), so a rep's request (e.g.
   Sarah) only appeared after a hard refresh. We attach a scoped onSnapshot
   while the panel is open and rebuild only the list, coalesced through
   scheduleFrameRender, so the extra listener never blocks the main thread
   nor triggers a full dashboard rebuild. */
window._adminTransferRequestsCache = null;
window._adminTransferQueueUnsub = null;

const renderAdminTransferQueue = (listContainer) => {
    if (!listContainer) return;
    const requests = Array.isArray(window._adminTransferRequestsCache) ? window._adminTransferRequestsCache : [];
    if (!requests.length) {
        listContainer.innerHTML = '<div class="text-center text-slate-400 py-8 font-bold">لا توجد طلبات نقل معلقة حالياً</div>';
        return;
    }
    listContainer.innerHTML = requests.map((req) => `
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
                    <button onclick="approveTransfer('${req.id}', '${req.taskId}', '${req.toTeam}')" class="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition">قبول ونقل المهمة</button>
                    <button onclick="rejectTransfer('${req.id}')" class="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-red-700 transition">إلغاء / رفض</button>
                </div>
            </div>
        `).join('');
};

window.detachAdminTransferQueue = () => {
    const unsub = window._adminTransferQueueUnsub;
    window._adminTransferQueueUnsub = null;
    if (typeof unsub === 'function') {
        try { unsub(); } catch (err) { console.error('[admin-queue] detach failed:', err); }
    }
};

window.openAdminTransferQueueLive = () => {
    if (!(typeof window.isMahmoudOpsUser === 'function' ? window.isMahmoudOpsUser() : String((window.currentUser && window.currentUser.name) || '').includes('محمود'))) {
        if (window.showToast) window.showToast('هذه الشاشة متاحة لإدارة التشغيل فقط', false);
        return;
    }
    const listContainer = document.getElementById('adminTransferList');
    const modal = document.getElementById('adminTransferModal');
    if (modal) modal.classList.remove('hidden');
    if (listContainer && !Array.isArray(window._adminTransferRequestsCache)) {
        listContainer.innerHTML = '<div class="text-center text-slate-400 py-6 font-bold">جاري تحميل الطلبات...</div>';
    } else {
        renderAdminTransferQueue(listContainer);
    }

    const canListen = typeof onSnapshot === 'function' && typeof query === 'function' && typeof collection === 'function' && typeof where === 'function' && typeof db !== 'undefined';
    if (!canListen) {
        if (typeof showToast === 'function') showToast('تعذر تفعيل التحديث المباشر لطلبات النقل', false);
        return;
    }

    window.detachAdminTransferQueue();
    const schedule = typeof window.scheduleFrameRender === 'function' ? window.scheduleFrameRender : ((fn) => fn);
    const paint = schedule(() => {
        renderAdminTransferQueue(listContainer);
        if (typeof window.updateTransferRequestBadge === 'function') {
            window.updateTransferRequestBadge((window._adminTransferRequestsCache || []).length);
        }
    });
    window._adminTransferQueueUnsub = onSnapshot(
        query(collection(db, "transferRequests"), where("status", "==", "pending")),
        (snap) => {
            const requests = [];
            snap.forEach((docSnap) => requests.push({ id: docSnap.id, ...docSnap.data() }));
            window._adminTransferRequestsCache = requests;
            paint();
        },
        (err) => {
            console.error('[admin-queue] transfer listener failed:', err);
            if (typeof showToast === 'function') showToast('تعذر تحديث طلبات النقل مباشرة، برجاء إعادة المحاولة', false);
        }
    );
    /* Tie this listener to the app-wide detach registry so logout / re-auth
       does not leave a live transfer-requests subscription behind. */
    if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];
    window._appListenerUnsubscribers.push(() => window.detachAdminTransferQueue());
};

window.openAdminTransferModal = () => window.openAdminTransferQueueLive();

window.closeAdminTransferModal = () => {
    window.detachAdminTransferQueue();
    const modal = document.getElementById('adminTransferModal');
    if (modal) modal.classList.add('hidden');
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

    window.closeAdminTransferModal();
    showToast("🎉 تمت الموافقة على طلب النقل ونقل المهمة لتاريخ اليوم بنجاح!");
};

window.rejectTransfer = async (reqId) => {
    await updateDoc(doc(db, "transferRequests", reqId), {
        status: 'rejected'
    });
    window.closeAdminTransferModal();
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

    const batch = writeBatch(db);

    window.tasksMemory.forEach((tData, id) => {
        const tBase = getBaseName(tData.name);
        if (tBase === oldBaseName || tBase === newBaseName) {
            if (id === editTaskId) {
                batch.update(doc(db, "tasks", id), {
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
                batch.update(doc(db, "tasks", id), {
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
    let achieved = parseFloat(document.getElementById('repPercentage').value);
    
    let isSigned = document.getElementById('repIsSigned').checked;
    let isProvisional = document.getElementById('repProvContract').checked;

    // تعديل حالة التعاقد (نهائي/مبدئي/بدون) ونسبة العمولة مسموح به للمدير
    // (أ/ محمود) فقط. أي مندوب آخر يتم تسجيل تقريره كزيارة روتينية دون أي
    // تغيير على حقول التعاقد، حمايةً للعقود من التعديل غير المصرح به.
    const canEditContract = window.canManageContracts ? window.canManageContracts() : false;
    if (!canEditContract && (isSigned || isProvisional || (!isNaN(achieved) && achieved > 0))) {
        showToast("تعديل حالة التعاقد ونسبة العمولة مسموح به للمدير (أ/ محمود) فقط، تم تسجيل الزيارة كزيارة روتينية", false);
        isSigned = false;
        isProvisional = false;
        achieved = 0;
    }
    
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

    // Routine visit = تدريب/متابعة (no contract data selected). Such visits MUST NOT
    // overwrite the contract fields of a task that already has a contract:
    // - finalized contracts are protected for everyone;
    // - provisional contracts are also protected for non-Mahmoud users (only the
    //   manager may modify a provisional agreement).
    const isRoutineVisit = !isSigned && !isProvisional && (isNaN(achieved) || achieved <= 0);

    const hasProtectedContract = (tData) => tData && ((tData.isSigned === true && (Number(tData.achieved) || 0) > 0) || (!canEditContract && tData.isProvisional === true));

    const batch = writeBatch(db);

    window.tasksMemory.forEach((tData, id) => {
        const tBase = getBaseName(tData.name);
        if (tBase === baseName) {
            if (id === activeTaskId) {
                const payload = {
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
                    })

                };

                // For a routine visit on an existing contract, keep the original
                // contract fields (isSigned/isProvisional/achieved/target/time) untouched.
                if (!isRoutineVisit || !hasProtectedContract(tData)) {
                    payload.isSigned = isSigned;
                    payload.isProvisional = isProvisional;
                    payload.achieved = (isSigned || isProvisional) ? achieved : 0;
                    payload.target = seriesTarget;
                    // Keep the original signing date on an already-finalized contract so
                    // the contract never moves to a later payroll month.
                    if (!(tData.isSigned === true && (Number(tData.achieved) || 0) > 0)) {
                        payload.time = todayStr;
                    }
                }

                batch.update(doc(db, "tasks", id), payload);
            } else {
                // Sibling docs of the same merchant: a routine visit must not clobber
                // an existing contract either.
                if (!isRoutineVisit || !hasProtectedContract(tData)) {
                    batch.update(doc(db, "tasks", id), {
                        isSigned: isSigned,
                        isProvisional: isProvisional,
                        achieved: (isSigned || isProvisional) ? achieved : 0,
                        target: seriesTarget
                    });
                }
            }
        }
    });

    // أُنشئ المتابعة داخل نفس الدفعة لدمج أحداث الاستماع (snapshot) في حدث واحد
    if (createNew && nextDate) { 
        let exists = false;
        window.tasksMemory.forEach((tData) => {
            if (getBaseName(tData.name) === baseName && tData.time === nextDate) {
                exists = true;
            }
        });

        if(!exists) {
            batch.set(doc(collection(db, "tasks")), { 
                name: baseName + " (متابعة)", 
                merchantId: window.getOrCreateMerchantId ? await window.getOrCreateMerchantId(baseName, activeTaskData) : null, 
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

    try {
        await batch.commit();
    } catch (err) {
        console.error('[report] batch commit failed:', err);
        showToast('تعذر حفظ التقرير، برجاء المحاولة مرة أخرى', false);
        return;
    }

    try {
        await window.notifyManager(`تقرير جديد من ${currentUser.name}`, `تم إضافة تقرير للمحل: ${baseName}`, 'report', activeTaskId, todayStr);
    } catch (err) {
        /* The report itself is already saved; a failed notification must not
           make the user think the save failed. */
        console.error('[report] notify manager failed:', err);
    }

    if (typeof window.ensureMerchantIds === 'function') window.ensureMerchantIds();

    if(isSigned) showToast("🎉 تم تسجيل التعاقد النهائي وربطه بكل السلسلة والمتابعات بنجاح!"); 
    else if(isProvisional) showToast("🤝 تم تسجيل اتفاق مبدئي بنجاح!"); 

    document.getElementById('reportModal').classList.add('hidden'); 
    showToast("تم حفظ التقرير ومزامنة المتابعات بنجاح"); 
};

/* ── Memoized full-memory scans (P1.4) ─────────────────────────────────────
   Every dashboard render used to re-walk the whole tasks Map twice (virtual
   snapshot + unique-merchant aggregation). A render is often triggered by
   something other than task data (a filter, payroll settings, a merchant
   upload), so `tasksMemoryVersion` is bumped only when a task document really
   changes. As long as the version is unchanged these two helpers return their
   previous result instead of iterating thousands of documents again. */
const tasksMemoryVersion = () => (
    typeof window.tasksMemoryVersion === 'number' ? window.tasksMemoryVersion : 0
);

function buildVirtualSnapshot() {
    const version = tasksMemoryVersion();
    if (window._virtualSnapshotCache && window._virtualSnapshotVersion === version) {
        return window._virtualSnapshotCache;
    }
    const snapshot = {
        docs: Array.from(window.tasksMemory.entries()).map(([id, data]) => ({ id, data: () => data })),
        forEach: (cb) => {
            window.tasksMemory.forEach((data, id) => cb({ id, data: () => data }));
        }
    };
    window._virtualSnapshotCache = snapshot;
    window._virtualSnapshotVersion = version;
    return snapshot;
}

function computeUniqueMerchantsFromMemory() {
    const version = tasksMemoryVersion();
    if (window._uniqueMerchantsVersion === version && window.currentUniqueMerchantsGlobal instanceof Map) {
        return;
    }
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
        const cDate = (typeof window.extractTaskContractDate === 'function')
            ? window.extractTaskContractDate(task)
            : (task.time || '');
        if (task.isSigned && rawAchieved > 0) {
            mData.isSigned = true;
            mData.isProvisional = false;
            if (cDate && (!mData.contractDate || cDate < mData.contractDate)) mData.contractDate = cDate;
        } else if (task.isProvisional || (task.isSigned && rawAchieved === 0)) {
            mData.isProvisional = true;
            if (cDate && (!mData.contractDate || cDate < mData.contractDate)) mData.contractDate = cDate;
        }
        if (task.attendances && task.attendances.length > 0) mData.hasVisit = true;
        if (task.cat && task.cat !== "متابعة" && task.cat !== "متابعه") mData.cat = task.cat;
    });
    window.currentUniqueMerchantsGlobal = uniqueMerchants;
    window._uniqueMerchantsVersion = version;
}

function rerenderDashboard() {
    window.lastSnapshot = buildVirtualSnapshot();
    computeUniqueMerchantsFromMemory();
    
    if (currentUser && currentUser.role === 'accounting') {
        if (typeof renderPayrollTable === 'function') renderPayrollTable();
    } else {
        if (typeof renderDashboard === 'function') renderDashboard(window.lastSnapshot);
    }
    
    if (typeof window.loadPayrollSettingsAndCalculateFounderSummary === 'function') {
        window.loadPayrollSettingsAndCalculateFounderSummary();
    }
    
    if (typeof checkAndUpdateMissingAddresses === 'function') {
        checkAndUpdateMissingAddresses(window.allTasksCache);
    }
    
    if (currentUser && currentUser.role === 'rep') {
        updateQuickLinksWalletCounter();
    }
}

/* ── Tasks: full ordered dataset, no window/limit ─────────────────────────
   The dashboard is local-first: the entire team's tasks are streamed once and
   kept in the persistent IndexedDB cache so every count/payroll/export is
   computed from the complete set. The previous hard limit (3000/6000) made
   "which documents made the cut" — and therefore every count — depend on the
   page size. `time` is an ISO date string present on (almost) every task, so it
   gives a stable newest-first ordering; the composite index
   tasks(team ASC, time DESC) backs the rep-scoped variant. */
const TASKS_ORDER_FIELD = 'time';

window._tasksPage = null;

/* Coalesce a burst of task changes into one merchantId sync + render per frame. */
const scheduleTaskSync = (() => {
    const run = () => {
        if (!window._tasksPage) return;
        if (typeof window.ensureMerchantIds === 'function') window.ensureMerchantIds();
        rerenderDashboard();
    };
    return (typeof window.scheduleFrameRender === 'function')
        ? window.scheduleFrameRender(run)
        : run;
})();

/* Retained for API compatibility (the dashboard "load more" affordance no
   longer has anything to page through — the full set is already resident). */
const loadMoreTasks = async () => 0;
window.loadMoreTasks = loadMoreTasks;

// الاستماع الحي للمهام — مُقيَّد بفريق المندوب + نافذة مرتّبة قابلة للترقيم
window.listenToTasks = () => {
    if (typeof onSnapshot !== 'function' || typeof collection !== 'function' || typeof db === 'undefined') return;
    if (window._tasksListenerStarted) return;
    window._tasksListenerStarted = true;

    /* A fresh listener (e.g. after re-login as another team) must start from a
       clean memory, otherwise docs from the previous session linger. */
    if (!window.tasksMemory) window.tasksMemory = new Map();
    window.tasksMemory.clear();
    /* A new session/window must invalidate the memoized full-memory scans so the
       first render rebuilds from this listener's data, not a previous login. */
    window.tasksMemoryVersion = tasksMemoryVersion() + 1;

    /* Scope the previously-unfiltered tasks listener. A field rep only needs
       their own team's tasks; managers get the whole set. */
    const repTeam = (currentUser && currentUser.role === 'rep' && currentUser.team) ? currentUser.team : null;
    const baseConstraints = repTeam ? [where("team", "==", repTeam)] : [];

    /* Initial fetch is scoped to the day the dashboard is showing (today by
       default) so the first paint never waits on the full historical archive.
       Persistence keeps it in IndexedDB, so it is paid once and then served
       from cache. The archive is streamed afterwards by `startHistoricalListener`
       (see below) without blocking the main thread. */
    const selectedDate = (typeof window.getTasksSelectedDate === 'function')
        ? window.getTasksSelectedDate()
        : new Date().toISOString().slice(0, 10);

    const buildDateQuery = () => query(
        collection(db, "tasks"),
        ...baseConstraints,
        where(TASKS_ORDER_FIELD, "==", selectedDate),
        orderBy(TASKS_ORDER_FIELD, "desc")
    );

    /* Fallback for a missing composite index. The rep-scoped ordered query needs
       tasks(team ASC, time DESC); until that index exists Firestore rejects it
       with FAILED_PRECONDITION (surfaced to users as the generic fetch error).
       Dropping orderBy removes the index requirement so the dashboard still
       loads — in this degraded mode newest-first ordering is not guaranteed. */
    const buildDateFallback = () => query(
        collection(db, "tasks"),
        ...baseConstraints,
        where(TASKS_ORDER_FIELD, "==", selectedDate)
    );

    /* Complete dataset (all dates) for the background archive listener. */
    const buildHistoryQuery = () => query(
        collection(db, "tasks"),
        ...baseConstraints,
        orderBy(TASKS_ORDER_FIELD, "desc")
    );

    const buildHistoryFallback = () => query(
        collection(db, "tasks"),
        ...baseConstraints
    );

    window._tasksPage = { repTeam, buildQuery: buildDateQuery, fallback: false };

    /* Apply only the changed documents instead of clearing and rebuilding the
       whole Map on every write (the main source of lag at scale). */
    const applySnapshotToMemory = (snapshot) => {
        let mutated = false;
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === 'removed') {
                if (window.tasksMemory.delete(id)) mutated = true;
            } else {
                window.tasksMemory.set(id, change.doc.data());
                mutated = true;
            }
        });
        return mutated;
    };

    /* One-time signed/achieved correction intentionally removed: the archive
       fetch below is a read cycle and must never run heavy synchronous writes. */

    /* Identity of this listener session: a re-login replaces window._tasksPage,
       so any in-flight REST promise from the previous session is discarded
       instead of merging a stale team's documents into the new memory. */
    const sessionPage = window._tasksPage;

    let firstSnapshot = true;

    /* Apply a getDocs (REST) result to memory: merge every document directly. */
    const applyDocsToMemory = (snapshot) => {
        let mutated = false;
        snapshot.docs.forEach((docSnap) => {
            window.tasksMemory.set(docSnap.id, docSnap.data());
            mutated = true;
        });
        return mutated;
    };

    /* Apply a direct-REST document list ([{ id, ...fields }]) to memory. Used as
       the primary read path because it bypasses the SDK transport entirely. */
    const applyRestDocsToMemory = (docs) => {
        let mutated = false;
        docs.forEach((doc) => {
            if (!doc || !doc.id) return;
            const { id, ...data } = doc;
            window.tasksMemory.set(id, data);
            mutated = true;
        });
        return mutated;
    };

    const commitRenderIfNeeded = (mutated) => {
        if (window._tasksPage !== sessionPage) return;
        if (mutated || firstSnapshot) {
            if (mutated) window.tasksMemoryVersion = tasksMemoryVersion() + 1;
            firstSnapshot = false;
            scheduleTaskSync();
        }
        /* Paint the selected day first, then stream the archive in the
           background so the global stats fill in without blocking the UI. */
        startHistoricalListener();
    };

    /* Real-time delta handler (onSnapshot -> docChanges). */
    const handleSnapshot = (snapshot) => {
        commitRenderIfNeeded(applySnapshotToMemory(snapshot));
    };

    /* REST handler (getDocs): the very first paint and every silent poll. */
    const handleDocsSnapshot = (snapshot) => {
        commitRenderIfNeeded(applyDocsToMemory(snapshot));
    };

    /* Direct-REST handler: same render path, transport-independent payload. */
    const handleRestDocs = (docs) => {
        commitRenderIfNeeded(applyRestDocsToMemory(docs));
    };

    const isMissingIndex = (error) => {
        const code = (error && error.code) || '';
        const msg = (error && error.message) || '';
        return code === 'failed-precondition' || /requires an index/i.test(msg);
    };

    /* Strict enterprise firewalls kill the WebSocket/WebChannel transport: the
       SDK then reports unavailable/deadline/internal or a transport/offline
       message. That is NOT a data error, so we degrade to REST polling instead
       of showing the 0-count recovery card. */
    const isTransportError = (error) => {
        const code = String((error && error.code) || '').toLowerCase();
        const msg = String((error && error.message) || '');
        if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return true;
        return /transport errored/i.test(msg)
            || /WebChannelConnection/i.test(msg)
            || /Could not reach Cloud Firestore backend/i.test(msg)
            || /client is offline/i.test(msg);
    };

    let currentUnsub = null;
    let fallbackActive = false;
    let retriedForAuth = false;
    let pollingTimer = null;
    let realtimeFailed = false;

    const registerUnsub = () => {
        if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];
        if (typeof currentUnsub === 'function') window._appListenerUnsubscribers.push(currentUnsub);
    };

    const detachCurrentUnsub = () => {
        if (typeof currentUnsub === 'function') { try { currentUnsub(); } catch (e) {} }
        currentUnsub = null;
    };

    /* Resolve the loading UI on any terminal error. Surfacing the recovery card
       immediately avoids a dead spinner when we already know the read cannot
       recover; transport errors are excluded because the silent poller keeps
       the REST data live instead. */
    const recoverOrToast = (error) => {
        if (!window.hasRenderedData && typeof window.showDashboardLoadFailure === 'function') {
            window.showDashboardLoadFailure(error);
            return;
        }
        /* A permission-denied is an authorization outcome, not a connection
           failure: never surface the misleading "check your connection" toast
           for it. It is logged for operators instead. */
        const code = String((error && error.code) || '').toLowerCase();
        if (code === 'permission-denied') {
            console.error('[tasks] permission denied; suppressing generic network toast:', error);
            return;
        }
        if (typeof showToast === 'function') {
            showToast("حدث خطأ أثناء جلب البيانات من السيرفر. برجاء فحص الاتصال.", false);
        }
    };

    /* Silent REST polling: graceful degradation when the real-time stream is
       unavailable. No user-facing error and no recovery UI — the current-day
       data keeps refreshing every 30s over plain HTTP. */
    const startSilentPolling = () => {
        if (pollingTimer) return;
        console.warn('[tasks] real-time stream unavailable; keeping REST data and polling every 30s.');
        const poll = async () => {
            if (!window._tasksListenerStarted) return;
            /* Direct REST first: it works even while the SDK transport is
               offline, which is exactly the case that starts this poller. */
            if (window.kanjoRest && typeof window.kanjoRest.fetchTasks === 'function') {
                try {
                    handleRestDocs(await window.kanjoRest.fetchTasks({ team: repTeam, date: selectedDate }));
                    return;
                } catch (restError) {
                    console.warn('[tasks] silent REST poll failed; trying SDK getDocs:', restError);
                }
            }
            try {
                const snapshot = await getDocs(fallbackActive ? buildDateFallback() : buildDateQuery());
                handleDocsSnapshot(snapshot);
            } catch (error) {
                if (isMissingIndex(error)) {
                    fallbackActive = true;
                    const page = window._tasksPage;
                    if (page) { page.fallback = true; page.buildQuery = buildDateFallback; }
                    try {
                        handleDocsSnapshot(await getDocs(buildDateFallback()));
                    } catch (fallbackError) {
                        console.error('[tasks] polling fallback failed:', fallbackError);
                    }
                } else {
                    console.error('[tasks] silent poll failed:', error);
                }
            }
        };
        pollingTimer = setInterval(poll, 30000);
        if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];
        window._appListenerUnsubscribers.push(() => {
            if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
        });
    };

    /* Real-time error handling with silent degradation. */
    const handleRealtimeError = (error) => {
        console.error("Firestore snapshot error:", error);
        if (!fallbackActive && isMissingIndex(error)) {
            detachCurrentUnsub();
            startFallback();
            return;
        }
        if (isTransportError(error)) {
            realtimeFailed = true;
            detachCurrentUnsub();
            startSilentPolling();
            return;
        }
        const code = String((error && error.code) || '').toLowerCase();
        if (!retriedForAuth && code === 'permission-denied') {
            /* Anonymous auth can still be settling on slow/private mobile
               sessions. Retry once it resolves instead of alarming the user. */
            retriedForAuth = true;
            detachCurrentUnsub();
            Promise.resolve(window.authReady).catch(() => null).then(() => {
                if (window._tasksListenerStarted && !fallbackActive) {
                    attachRealtimeListener();
                }
            });
            return;
        }
        recoverOrToast(error);
    };

    const startFallback = () => {
        fallbackActive = true;
        const page = window._tasksPage;
        if (page) {
            page.fallback = true;
            page.buildQuery = buildDateFallback;
            page.cursor = null;
            page.exhausted = true;
        }
        console.warn('[tasks] composite index missing; loading without newest-first ordering.');
        currentUnsub = onSnapshot(buildDateFallback(), handleSnapshot, handleRealtimeError);
        registerUnsub();
    };

    /* Attach the real-time day listener. Called only AFTER the REST paint (or a
       permission-denied retry) — never as the initial fetch. */
    const attachRealtimeListener = () => {
        if (!window._tasksListenerStarted || realtimeFailed || typeof currentUnsub === 'function') return;
        currentUnsub = onSnapshot(fallbackActive ? buildDateFallback() : buildDateQuery(), handleSnapshot, handleRealtimeError);
        registerUnsub();
    };

    /* Background archive fetch (non-blocking, one-shot). Starts 5s AFTER the
       first day has painted, reads the complete task set once with getDocs
       (never a live listener over thousands of archived docs), merges the
       documents into tasksMemory and re-renders exactly once at the end.
       Historical reads are best-effort: a failure logs and degrades to the
       date-scoped data instead of alarming the user. */
    let historyStarted = false;
    function startHistoricalListener() {
        if (historyStarted) return;
        historyStarted = true;
        const page = window._tasksPage;
        const mergeDocs = (snapshot) => {
            let mutated = false;
            snapshot.docs.forEach((docSnap) => {
                window.tasksMemory.set(docSnap.id, docSnap.data());
                mutated = true;
            });
            return mutated;
        };
        const applyHistory = (snapshot) => {
            /* Drop a fetch that belongs to a previous session/identity. */
            if (window._tasksPage !== page) return;
            if (mergeDocs(snapshot)) {
                window.tasksMemoryVersion = tasksMemoryVersion() + 1;
                scheduleTaskSync();
            }
        };
        const applyHistoryDocs = (docs) => {
            if (window._tasksPage !== page) return;
            if (applyRestDocsToMemory(docs)) {
                window.tasksMemoryVersion = tasksMemoryVersion() + 1;
                scheduleTaskSync();
            }
        };
        window.setTimeout(async () => {
            /* Direct REST first: the whole archive must load even when the SDK
               is stuck offline, otherwise global counts stay at 0. */
            if (window.kanjoRest && typeof window.kanjoRest.fetchTasks === 'function') {
                try {
                    const docs = await window.kanjoRest.fetchTasks({ team: page ? page.repTeam : repTeam });
                    console.log('[KANJO-DIAGNOSTIC] Background history REST fetch completed. Tasks loaded:', docs.length);
                    applyHistoryDocs(docs);
                    return;
                } catch (restError) {
                    console.warn('[tasks] REST history fetch failed; trying SDK getDocs:', restError);
                }
            }
            try {
                applyHistory(await getDocs(buildHistoryQuery()));
            } catch (error) {
                console.error("Firestore history fetch error:", error);
                if (!isMissingIndex(error)) return;
                try {
                    applyHistory(await getDocs(buildHistoryFallback()));
                } catch (fallbackError) {
                    console.error("Firestore history fallback fetch error:", fallbackError);
                }
            }
        }, 5000);
    }

    /* ─── Hybrid bootstrap: fast day paint first, full archive in background ───
       1) A direct REST runQuery paints TODAY in under a second. It is a plain
           request/response call, so it still works when the SDK transport is
           reset/offline (which makes the SDK serve an empty local cache → the
           0-count dashboard). The SDK getDocs is kept as a fallback.
       2) Only after that fast paint resolves do we attach the day onSnapshot
          listener for live updates.
       3) startHistoricalListener then reads the COMPLETE archive 5s later in
          the background (guarded by historyStarted) so global search and global
          stats fill in without blocking first paint.
       4) If the stream is killed, the silent poller keeps the day fresh over
          REST instead of showing the 0-count recovery UI. */
    const handleInitialError = (error) => {
        console.error("Firestore initial fetch error:", error);
        const code = String((error && error.code) || '').toLowerCase();
        if (isTransportError(error)) { startSilentPolling(); return; }
        if (code === 'permission-denied' && !retriedForAuth) {
            retriedForAuth = true;
            Promise.resolve(window.authReady).catch(() => null).then(() => {
                if (window._tasksListenerStarted) bootstrapInitialData();
            });
            return;
        }
        recoverOrToast(error);
    };

    const bootstrapInitialData = async () => {
        let snapshot = null;
        let attachRealtime = true;
        /* Primary read: direct REST. It is a plain request/response call that
           succeeds even when the SDK has dropped into offline mode, which is
           the failure mode that otherwise leaves the dashboard at 0. */
        if (window.kanjoRest && typeof window.kanjoRest.fetchTasks === 'function') {
            try {
                const docs = await window.kanjoRest.fetchTasks({ team: repTeam, date: selectedDate });
                console.log('[KANJO-DIAGNOSTIC] Initial REST fetch completed. Tasks loaded:', docs.length);
                handleRestDocs(docs);
                /* REST is the primary transport. Never wake the SDK's streaming
                   transport (blocked here, so it only produces the 10s offline
                   timeout and Listen-channel errors): refresh the day through
                   the silent REST poller instead of a live onSnapshot. */
                startSilentPolling();
                return;
            } catch (restError) {
                console.warn('[tasks] direct REST initial fetch failed; falling back to SDK getDocs:', restError);
            }
        }
        try {
            snapshot = await getDocs(buildDateQuery());
            console.log('[KANJO-DIAGNOSTIC] Initial REST fetch completed. Tasks loaded:', snapshot.size);
        } catch (error) {
            if (isMissingIndex(error)) {
                fallbackActive = true;
                const page = window._tasksPage;
                if (page) { page.fallback = true; page.buildQuery = buildDateFallback; }
                console.warn('[tasks] composite index missing on initial fetch; loading without ordering.');
                try {
                    snapshot = await getDocs(buildDateFallback());
                    console.log('[KANJO-DIAGNOSTIC] Initial REST fetch completed. Tasks loaded:', snapshot.size);
                } catch (fallbackError) {
                    handleInitialError(fallbackError);
                    return;
                }
            } else if (isTransportError(error)) {
                attachRealtime = false;
                handleInitialError(error);
            } else {
                handleInitialError(error);
                return;
            }
        }
        /* Day data is painted now; the full archive streams in 5s later via
           startHistoricalListener (scheduled by commitRenderIfNeeded). */
        if (snapshot) handleDocsSnapshot(snapshot);
        if (attachRealtime) attachRealtimeListener();
    };

    bootstrapInitialData().catch((err) => {
        console.error('[tasks] initial bootstrap failed:', err);
        if (typeof handleInitialError === 'function') handleInitialError(err);
    });

    /* Prime the server-side aggregate summary for this scope (P1.4). Only when
       REST is unavailable: the aggregate API also travels the SDK streaming
       transport, which is blocked here and only produces offline/timeout noise.
       When REST is present the dashboard already computes these locally. */
    if (!window.kanjoRest && window.kanjoAggregates && typeof window.kanjoAggregates.getServerSummary === 'function') {
        Promise.resolve(window.kanjoAggregates.getServerSummary({ team: repTeam })).catch(() => {});
    }
};

function updateQuickLinksWalletCounter() {
    let missingCount = 0;
    if (!window.allTasksCache) return;
    
    window.allTasksCache.forEach(t => {
        if (t.team !== currentUser.team) return;
        let hasV = (t.attendances && t.attendances.length > 0) || t.isSigned || t.isProvisional;
        if (hasV) {
            const fbPage = String(t.fbPage || '').trim();
            const fbGroup = String(t.fbGroup || '').trim();
            const insta = String(t.insta || '').trim();
            const website = String(t.website || '').trim();
            if (!fbPage || !fbGroup || !insta || !website) {
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
