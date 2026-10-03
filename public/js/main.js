/* Kanjo Ops — Application Entry Point */
import './utils/cache.js';
import './config/firebase.js';
import './config/build-info.generated.js';
import './services/audit.js';
import './services/authorization.js';
import { categories } from './config/constants.js';
import './utils/helpers.js';
import './utils/exportWorker.js';
import './services/aggregates.js';
import './utils/export.js';
import './services/contracts.js';
import './services/geolocation.js';
import './services/merchantDocs.js';
import { SESSION_KEY, applyThemeAndShowDashboard } from './services/auth.js';
import './services/firestore.js';
import './services/catalog.js';
import './services/vendorExport.js';
import './services/pharmacyIntake.js';
import './services/founderAudit.js';
import './ui/modals.js';
import './ui/accounting.js';
import './ui/dashboard.js';
import './ui/charts.js';
import './services/kpi.js';

/* Populate category dropdowns (build the option list once instead of
   re-serialising the whole select on every iteration). */
const categoryOptionsHtml = categories.sort().map((c) => `<option value="${c}">${c}</option>`).join('');
const mCat = document.getElementById('mCat');
const editCat = document.getElementById('editCat');
if (mCat) mCat.innerHTML = categoryOptionsHtml;
if (editCat) editCat.innerHTML = categoryOptionsHtml;

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

/* ─── Stale-tab killer ───────────────────────────────────────────────────────
   A long-lived tab keeps the JS it loaded in memory, so a tab opened before a
   deploy can keep running outdated (and previously leak-prone) code even after
   the fix is live. Compare this page's build id against the freshly-served
   `version.json` (served no-store) and force a single reload when they differ.
   JS is served `Cache-Control: no-cache`, so the reload always lands on the new
   build; the 60s loop guard prevents a reload storm if it ever does not.
   Disabled for the local/emulator build ('dev'). */
(function kanjoStaleTabGuard() {
    const build = (window.KANJO_BUILD && window.KANJO_BUILD.build) || '';
    if (!build || build === 'dev') return;
    const RELOAD_AT_KEY = 'kanjo_stale_reload_at';
    let checking = false;
    const checkForUpdate = async () => {
        if (checking || document.hidden) return;
        checking = true;
        try {
            const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json().catch(() => null);
            const live = data && data.build ? String(data.build) : '';
            if (!live || live === build) return;
            const last = Number((window.sessionStorage && sessionStorage.getItem(RELOAD_AT_KEY)) || 0);
            if (Date.now() - last < 60000) return;
            try { sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now())); } catch (_) {}
            if (typeof window.showToast === 'function') {
                window.showToast('تم تحديث التطبيق، جاري إعادة التحميل...', false);
            }
            setTimeout(() => window.location.reload(), 700);
        } catch (_) {
            /* Offline / transient failure: retry on the next tick. */
        } finally {
            checking = false;
        }
    };
    setTimeout(checkForUpdate, 5000);
    setInterval(checkForUpdate, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
})();
