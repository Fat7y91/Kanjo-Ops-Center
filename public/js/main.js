/* Kanjo Ops — Application Entry Point */
import './config/firebase.js';
import './services/audit.js';
import './services/authorization.js';
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

   No client-side deadline: boot waits for Firebase's real auth state to settle.
   A slow handshake keeps the spinner up instead of restoring the session while
   Firestore is still unauthenticated (which would paint empty lists). */
const authReadyWithTimeout = Promise.resolve(window.authReady).catch(() => null);

authReadyWithTimeout.then(() => {
    const savedUser = localStorage.getItem(SESSION_KEY);
    if (!savedUser) return;
    let restoredUser = null;
    try {
        restoredUser = JSON.parse(savedUser);
    } catch (err) {
        console.error('[boot] invalid saved session, ignoring:', err);
        return;
    }
    if (!restoredUser || typeof restoredUser !== 'object') return;
    window.currentUser = restoredUser;
    if (typeof window.showDashboardLoading === 'function') {
        window.showDashboardLoading();
    }
    /* Cache-first boot: restore the UI and attach listeners immediately.
       RBAC claims are reconciled in the background and re-apply the theme
       only if they change the identity, so a slow token round-trip can no
       longer block the first paint. Bounded internally so a slow network
       cannot hang the boot. */
    applyThemeAndShowDashboard();
    const intendedIdentity = window.currentUser;
    const beforeKey = [intendedIdentity.name, intendedIdentity.role, intendedIdentity.team].join('|');
    if (typeof window.ensureAuthClaims === 'function') {
        window.ensureAuthClaims(intendedIdentity).then(() => {
            const resolved = window.currentUser || {};
            const afterKey = [resolved.name, resolved.role, resolved.team].join('|');
            /* If claims changed the person/role/team the listeners were first
               bound to, re-bind them so the scope (e.g. team-scoped tasks) is
               correct instead of silently showing the wrong slice. */
            if (afterKey !== beforeKey && typeof window.detachAppListeners === 'function') {
                window.detachAppListeners();
            }
            applyThemeAndShowDashboard();
            if (window.lastSnapshot && typeof window.renderDashboard === 'function' && window.hasRenderedData) {
                window.renderDashboard(window.lastSnapshot);
            }
        }).catch(() => {});
    }
}).catch((err) => {
    /* A failed auth baseline must not leave the boot chain rejected with an
       unhandled error and the spinner stuck forever. */
    console.error('[boot] session restore failed:', err);
    const login = document.getElementById('loginSection');
    if (login) login.classList.remove('hidden');
});
