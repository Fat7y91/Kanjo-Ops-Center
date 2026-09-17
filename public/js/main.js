/* Kanjo Ops — Application Entry Point */
import './config/firebase.js';
import { categories } from './config/constants.js';
import './utils/helpers.js';
import './utils/exportWorker.js';
import './services/aggregates.js';
import './utils/export.js';
import './services/geolocation.js';
import './services/merchantDocs.js';
import { SESSION_KEY, applyThemeAndShowDashboard } from './services/auth.js';
import './services/firestore.js';
import './services/catalog.js';
import './ui/modals.js';
import './ui/accounting.js';
import './ui/dashboard.js';
import './ui/charts.js';
import './services/kpi.js';

/* Populate category dropdowns */
categories.sort().forEach(c => {
    const mCat = document.getElementById('mCat');
    const editCat = document.getElementById('editCat');
    if (mCat) mCat.innerHTML += `<option value="${c}">${c}</option>`;
    if (editCat) editCat.innerHTML += `<option value="${c}">${c}</option>`;
});

/* Restore session — but ONLY after the Firebase auth baseline (anonymous sign-in)
   has resolved, so the strict Firestore rules never reject the first reads and the
   UI never renders empty lists before data is fetched. The loading spinner
   (injected by dashboard.js) stays visible until the first batch of Firestore
   data arrives and renderDashboard() replaces it.

   On restrictive Wi-Fi networks the anonymous sign-in handshake can hang for a
   very long time; we race it against a deadline so the app always boots instead
   of freezing on the spinner forever. Firestore reads may briefly fail until auth
   lands, but the UI recovers as soon as the session is ready. */
const AUTH_READY_TIMEOUT_MS = 8000;
const authReadyWithTimeout = new Promise((resolve) => {
    let settled = false;
    const finish = (reason) => {
        if (settled) return;
        settled = true;
        if (reason === 'timeout') {
            console.warn('[boot] Firebase auth handshake timed out; restoring session optimistically.');
            if (typeof window.showToast === 'function') {
                window.showToast('الاتصال بالسيرفر بطيء، سيتم استئناف الجلسة عند توفّر الشبكة', false);
            }
        }
        resolve(null);
    };
    Promise.resolve(window.authReady).then(() => finish('ready')).catch(() => finish('error'));
    setTimeout(() => finish('timeout'), AUTH_READY_TIMEOUT_MS);
});

authReadyWithTimeout.then(async () => {
    const savedUser = localStorage.getItem(SESSION_KEY);
    if (savedUser) {
        window.currentUser = JSON.parse(savedUser);
        if (typeof window.showDashboardLoading === 'function') {
            window.showDashboardLoading();
        }
        /* Refresh the ID token so provisioned RBAC claims override the cached
           PIN identity before the UI is gated by role. Falls back silently to
           the PIN identity while claims are not yet enrolled. Bounded so a slow
           network cannot hang the boot. */
        if (typeof window.ensureAuthClaims === 'function') {
            try { await window.ensureAuthClaims(); } catch (e) {}
        }
        applyThemeAndShowDashboard();
    }
});
