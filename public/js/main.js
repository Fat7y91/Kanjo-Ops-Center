/* Kanjo Ops — Application Entry Point */
import './utils/cache.js';
import './config/firebase.js';
import './services/idb.js';
import './services/syncEngine.js';
import './services/updatedAt.js';
import './config/build-info.generated.js';
import './config/qemaTaxonomy.js';
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
import './services/catalog.js?v=20261011c';
import './services/dynamicTaxonomy.js';
import './services/catalogDuplicates.js';
import './services/templateExport.js';
import './services/menuImport.js';
import './services/vendorExport.js';
import './services/pharmacyIntake.js';
import './services/founderAudit.js';
import './ui/modals.js?v=20261011c';
import './ui/accounting.js';
import './ui/dashboard.js';
import './ui/charts.js';
import './services/kpi.js';
import './services/marketing.js';
import './services/workspace.js';

/* Start the IndexedDB delta-sync triggers (focus / visibilitychange + a 45s
   visible-tab heartbeat). The engine is inert until a collection registers a
   fetcher, so starting it up-front is safe. */
if (window.kanjoSync && typeof window.kanjoSync.start === 'function') window.kanjoSync.start();

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

/* ─── Stale-tab notice ───────────────────────────────────────────────────────
   A long-lived tab keeps the JS it loaded in memory, so a tab opened before a
   deploy can keep running outdated (and previously leak-prone) code even after
   the fix is live. Compare this page's build id against the freshly-served
   `version.json` (served no-store) and, when they differ, offer a NON-intrusive,
   user-initiated refresh instead of force-reloading (an automatic reload could
   interrupt data entry and, on a load-balanced deploy, re-boot in a loop).
   JS is served `Cache-Control: no-cache`, so a manual reload lands on the new
   build. Disabled for the local/emulator build ('dev'). */
(function kanjoStaleTabGuard() {
    const build = (window.KANJO_BUILD && window.KANJO_BUILD.build) || '';
    if (!build || build === 'dev') return;
    const NOTified_AT_KEY = 'kanjo_stale_notified_at';
    let checking = false;
    const offerReload = () => {
        if (document.getElementById('kanjoUpdateBanner')) return;
        const bar = document.createElement('div');
        bar.id = 'kanjoUpdateBanner';
        bar.setAttribute('role', 'status');
        bar.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));'
            + 'transform:translateX(-50%);z-index:120;background:#230535;color:#fff;'
            + 'border:1px solid #facc15;border-radius:9999px;box-shadow:0 8px 24px rgba(0,0,0,.35);'
            + 'padding:10px 12px 10px 18px;display:flex;align-items:center;gap:12px;'
            + 'font-weight:800;font-size:13px;max-width:92vw';
        bar.innerHTML = '<span>تحديث جديد متاح</span>'
            + '<button type="button" id="kanjoUpdateBtn" style="background:#facc15;color:#230535;'
            + 'border:0;border-radius:9999px;padding:8px 16px;font-weight:900;cursor:pointer">'
            + 'اضغط للتحديث</button>';
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', 'إغلاق');
        dismiss.style.cssText = 'background:transparent;border:0;color:#e9d5ff;font-size:16px;cursor:pointer;line-height:1';
        dismiss.textContent = '\u00d7';
        dismiss.addEventListener('click', () => bar.remove());
        bar.appendChild(dismiss);
        const btn = bar.querySelector('#kanjoUpdateBtn');
        if (btn) btn.addEventListener('click', () => window.location.reload());
        document.body.appendChild(bar);
    };
    const checkForUpdate = async () => {
        if (checking || document.hidden) return;
        checking = true;
        try {
            const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json().catch(() => null);
            const live = data && data.build ? String(data.build) : '';
            if (!live || live === build) return;
            const last = Number((window.sessionStorage && sessionStorage.getItem(NOTified_AT_KEY)) || 0);
            if (Date.now() - last < 60000) return;
            try { sessionStorage.setItem(NOTified_AT_KEY, String(Date.now())); } catch (_) {}
            offerReload();
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
