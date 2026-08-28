/* Kanjo Ops — Auth, Session & Idle Timeout */
import { users } from '../config/constants.js';

const SESSION_KEY = 'kanjo_session_user';
const IDLE_TIMEOUT = 30 * 60 * 1000;
let idleTimer;
let currentUser = null; 

const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (window.currentUser) window.logout(); }, IDLE_TIMEOUT);
};

['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => document.addEventListener(evt, resetIdleTimer, true));

window.saveSession = (user) => localStorage.setItem(SESSION_KEY, JSON.stringify(user));
window.clearSession = () => localStorage.removeItem(SESSION_KEY);
window.SESSION_KEY = SESSION_KEY;
window.resetIdleTimer = resetIdleTimer;

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

async function login(pinOverride = null) {
    if (window.authReady) { try { await Promise.race([window.authReady, new Promise(r => setTimeout(r, 5000))]); } catch (e) {} }
    const pin = pinOverride || document.getElementById('pinInput').value;
    if(users[pin]) {
        currentUser = users[pin];
        window.currentUser = currentUser; 
        window.saveSession(currentUser);
        applyThemeAndShowDashboard();
        resetIdleTimer();
    } else { 
        if(!pinOverride) {
            if(window.showToast) window.showToast("رمز الدخول غير صحيح", false);
            else alert("رمز الدخول غير صحيح");
        }
    }
}
window.login = login;

const afterAuthReady = () => Promise.race([
    Promise.resolve(window.authReady).catch(() => null),
    new Promise((res) => setTimeout(() => res(null), 5000))
]);

function applyThemeAndShowDashboard() {
    // هذه الأسطر ستقوم بمزامنة المستخدم لو كان هناك تسجيل دخول تلقائي
    currentUser = window.currentUser || currentUser;
    if (!currentUser) return; 

    if(currentUser.team === 'Fox Team' || currentUser.team === 'Power Team') applyTeamTheme(currentUser.team);
    document.getElementById('loginSection').classList.add('hidden'); 

    const isAccounting = (currentUser.role === 'accounting');
    const isFounder = (currentUser.role === 'founder');
    
    if (isAccounting) {
        document.getElementById('accountingSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
        afterAuthReady().then(() => { if(window.loadPayrollSettingsFromFirebase) window.loadPayrollSettingsFromFirebase(); });
        const financialAccountingSection = document.getElementById('financialAccountingSection');
        if (financialAccountingSection) {
            financialAccountingSection.classList.remove('hidden');
            afterAuthReady().then(() => { if(window.loadFinancialProfilesForAccounting) window.loadFinancialProfilesForAccounting(); });
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
        if (window.userImageMap && window.userImageMap[currentUser.name]) {
            avatarContainer.innerHTML = `<img src="${window.userImageMap[currentUser.name]}" alt="${currentUser.name}" class="w-7 h-7 rounded-full object-cover border border-purple-300 shadow-sm">`;
        } else {
            avatarContainer.innerHTML = `<img src="logo.png" alt="Kanjo" class="w-7 h-7 rounded-full object-contain p-0.5 bg-white border border-purple-200">`;
        }
    }
    
    const isMahmoud = (window.canManageContracts ? window.canManageContracts() : false);
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

        if (isRep && window.refreshFinancialProfileBanner) {
            window.refreshFinancialProfileBanner();
        }
        
        const adminTransferNavBtnWrapper = document.getElementById('adminTransferNavBtnWrapper');
        if (adminTransferNavBtnWrapper) {
            adminTransferNavBtnWrapper.classList.toggle('hidden', !isMahmoud);
        }

        const contractsNavBtnWrapper = document.getElementById('contractsNavBtnWrapper');
        if (contractsNavBtnWrapper) {
            contractsNavBtnWrapper.classList.toggle('hidden', !isMahmoud);
        }

        const archivedReportsBtnWrapper = document.getElementById('archivedReportsBtnWrapper');
        if (archivedReportsBtnWrapper) {
            archivedReportsBtnWrapper.classList.toggle('hidden', !isMahmoud);
        }
        
        if(canViewLive && window.setupAdvancedFilterElements) {
            window.setupAdvancedFilterElements();
        }
    }
    
    afterAuthReady().then(() => {
        if (window._appListenersRegistered) return;
        window._appListenersRegistered = true;
        if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];

        if(canViewLive || isAdmin || isAccounting) {
            if (typeof onSnapshot !== 'undefined' && typeof query !== 'undefined' && typeof collection !== 'undefined' && typeof db !== 'undefined' && typeof orderBy !== 'undefined' && typeof limit !== 'undefined') {
                const unsub = onSnapshot(query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(50)), (snap) => {
                    const notifs = [];
                    snap.forEach(d => notifs.push({id: d.id, ...d.data()}));
                    if(typeof updateNotificationsUI !== 'undefined') updateNotificationsUI(notifs);
                });
                window._appListenerUnsubscribers.push(unsub);
            }
            if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }

        if (typeof onSnapshot !== 'undefined' && typeof query !== 'undefined' && typeof collection !== 'undefined' && typeof db !== 'undefined' && typeof where !== 'undefined' && typeof limit !== 'undefined') {
            const unsub = onSnapshot(query(collection(db, "transferRequests"), where("status", "==", "pending"), limit(50)), (snap) => {
                if(window.pendingTransferTaskIds) window.pendingTransferTaskIds.clear();
                snap.forEach(docSnap => {
                    const req = docSnap.data();
                    if (req.taskId && window.pendingTransferTaskIds) window.pendingTransferTaskIds.add(req.taskId);
                });

                const transferBadge = document.getElementById('transferBadge');
                if (transferBadge && isMahmoud) {
                    if (snap.size > 0) {
                        transferBadge.classList.remove('hidden');
                    } else {
                        transferBadge.classList.add('hidden');
                    }
                }
                if (window.lastSnapshot && !isAccounting && typeof renderDashboard !== 'undefined') {
                    renderDashboard(window.lastSnapshot);
                }
            });
            window._appListenerUnsubscribers.push(unsub);
        }

        /* Merchant records (authoritative drive-folder binding + merchantId).
           Keeps window.merchantsById fresh so the merchant card / profile can
           render the "ملفات التاجر الرسمية" Drive button from the permanent
           merchantId instead of a raw URL. */
        if (typeof onSnapshot !== 'undefined' && typeof collection !== 'undefined' && typeof db !== 'undefined') {
            window.merchantsById = window.merchantsById || new Map();
            const unsub = onSnapshot(collection(db, "merchants"), (snap) => {
                window.merchantsById.clear();
                snap.forEach(docSnap => window.merchantsById.set(docSnap.id, docSnap.data()));
                if (window.lastSnapshot && !isAccounting && typeof renderDashboard !== 'undefined' && window.hasRenderedData) {
                    renderDashboard(window.lastSnapshot);
                }
            });
            window._appListenerUnsubscribers.push(unsub);
        }

        if(typeof loadPayrollSettingsAndCalculateFounderSummary !== 'undefined') loadPayrollSettingsAndCalculateFounderSummary();
        if(typeof listenToTasks !== 'undefined') listenToTasks();
    });
}

window.applyThemeAndShowDashboard = applyThemeAndShowDashboard;
window.logout = () => { window.clearSession(); window.location.reload(); };

export { SESSION_KEY, IDLE_TIMEOUT, resetIdleTimer, applyThemeAndShowDashboard, login };
