/* Kanjo Ops — Auth, Session & Idle Timeout */

import { users } from '../config/constants.js';

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

window.login = async (pinOverride = null) => { 

    if (window.authReady) { try { await window.authReady; } catch (e) {} }

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



        const contractsNavBtnWrapper = document.getElementById('contractsNavBtnWrapper');

        if (contractsNavBtnWrapper) {

            contractsNavBtnWrapper.classList.toggle('hidden', currentUser.name !== 'أ/ محمود');

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

window.applyThemeAndShowDashboard = applyThemeAndShowDashboard;

window.logout = () => { window.clearSession(); window.location.reload(); };

export { SESSION_KEY, IDLE_TIMEOUT, resetIdleTimer, applyThemeAndShowDashboard };
