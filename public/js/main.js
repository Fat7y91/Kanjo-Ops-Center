/* Kanjo Ops — Application Entry Point */
import './utils/cache.js';
import './config/firebase.js?v=20261021b';
import './services/idb.js?v=20261020c';
import './services/syncEngine.js?v=20261021b';
import './services/updatedAt.js';
import './config/build-info.generated.js';
import './config/qemaTaxonomy.js';
import './services/audit.js?v=20261016b';
import './services/authorization.js?v=20261016b';
import { categories } from './config/constants.js?v=20261014d';
import './utils/helpers.js?v=20261015a';
import './utils/exportWorker.js';
import './services/aggregates.js';
import './utils/export.js?v=20261027b';
import './services/contractProjection.js?v=20261018a';
import './services/contracts.js?v=20261027a';
import './services/geolocation.js';
import './services/merchantDocs.js';
import { SESSION_KEY, applyThemeAndShowDashboard } from './services/auth.js?v=20261021b';
import './services/firestore.js?v=20261025a';
import './services/catalog.js?v=20261025a';
import './services/dynamicTaxonomy.js';
import './services/catalogDuplicates.js';
import './services/templateExport.js';
import './services/menuImport.js?v=20261016b';
import './services/productImport.js?v=20261021a';
import './services/vendorExport.js';
import './services/pharmacyIntake.js';
import './services/founderAudit.js?v=20261020d';
import './ui/modals.js?v=20261027a';
import './ui/accounting.js';
import './ui/dashboard.js?v=20261016d';
import './ui/charts.js?v=20261017a';
import './services/kpi.js?v=20261021b';
import './services/marketing.js?v=20261016b';
import './services/workspace.js?v=20261021a';
import './services/uam.js?v=20261020f';

/* User Access Management wiring: hash bootstrap (`#uam-bootstrap`), the add-user
   form, and focus-triggered permission refresh. Safe when the widget is absent. */
if (typeof window.initUam === 'function') window.initUam();

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

/* Restore session and paint the shell IMMEDIATELY from localStorage — NOT gated
   on the Firebase auth baseline. Waiting for `signInAnonymously` (an unbounded
   network promise) before showing anything was the core cold-start regression:
   on a slow/blocked network the user stared at the splash for minutes.

   Data reads stay correct WITHOUT this gate: every Firestore read path already
   defers itself on `window.authReady` internally (and retries on
   permission-denied once auth settles). So the UI now renders in the first
   frame while auth + the first data snapshot settle in the background. */
const restoreSession = () => {
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
    /* Fold the PERSISTED (localStorage) permissions synchronously BEFORE the
       first paint, so the shell is already correct in a single frame — no
       blocking read and no second-repaint flicker. */
    if (typeof window.kanjoUamApplyPermissionsSync === 'function') {
        try { window.kanjoUamApplyPermissionsSync(restoredUser); } catch (_) { /* ignore */ }
    }
    applyThemeAndShowDashboard();
    /* Then a TTL-gated, NON-blocking refresh that repaints ONLY when the
       effective permissions / super-admin flag actually changed. A warm store
       performs no network call at all (zero-bleed). */
    if (typeof window.kanjoUamApplyPermissions === 'function') {
        window.kanjoUamApplyPermissions(restoredUser).then((res) => {
            if (!res || !res.changed) return;
            applyThemeAndShowDashboard();
            try { if (window.kanjoWorkspace && window.kanjoWorkspace.refresh) window.kanjoWorkspace.refresh(); } catch (_) { /* ignore */ }
        }).catch(() => {});
    }
    /* Auth↔claims reconciliation runs in the background; it only re-binds
       listeners / repaints when the resolved identity actually changed. */
    const intendedIdentity = window.currentUser;
    const beforeKey = [intendedIdentity.name, intendedIdentity.role, intendedIdentity.team].join('|');
    if (typeof window.ensureAuthClaims === 'function') {
        window.ensureAuthClaims(intendedIdentity).then(() => {
            const resolved = window.currentUser || {};
            const afterKey = [resolved.name, resolved.role, resolved.team].join('|');
            if (afterKey !== beforeKey && typeof window.detachAppListeners === 'function') {
                window.detachAppListeners();
            }
            applyThemeAndShowDashboard();
            if (window.lastSnapshot && typeof window.renderDashboard === 'function' && window.hasRenderedData) {
                window.renderDashboard(window.lastSnapshot);
            }
        }).catch(() => {});
    }
};

try {
    restoreSession();
} catch (err) {
    /* A failed restore must not leave the boot chain rejected with an unhandled
       error and the login hidden. */
    console.error('[boot] session restore failed:', err);
    const login = document.getElementById('loginSection');
    if (login) login.classList.remove('hidden');
}

/* ─── Stale-tab notice ───────────────────────────────────────────────────────
   A long-lived tab keeps the JS it loaded in memory, so a tab opened before a
   deploy can keep running outdated (and previously leak-prone) code even after
   the fix is live. We detect a newer deploy two ways and then offer a
   NON-intrusive, user-initiated refresh (an automatic reload could interrupt
   data entry and, on a load-balanced deploy, re-boot in a loop):
     1. the freshly-served `version.json` (no-store) build id, and
     2. the cache-buster token on the loaded `js/main.js` asset (changes on every
        release, so it works even for the local 'dev' build whose version.json
        does not change).
   Runs in EVERY environment; the banner is injected into <body> with a very
   high z-index and survives the app's own overlays. */
(function kanjoStaleTabGuard() {
    const build = (window.KANJO_BUILD && window.KANJO_BUILD.build) || 'dev';
    /* The version token baked into the <script src="js/main.js?v=..."> this tab
       loaded. A different token on disk means a newer bundle is available. */
    const bootScript = document.querySelector('script[type="module"][src*="main.js"]');
    const bootToken = (() => {
        const src = (bootScript && bootScript.getAttribute('src')) || '';
        const m = src.match(/main\.js\?v=([^&"'\s>]+)/);
        return m ? m[1] : '';
    })();
    const NOTIFIED_AT_KEY = 'kanjo_stale_notified_at';
    const HTML_CHECK_EVERY_MS = 5 * 60 * 1000;
    let checking = false;
    let lastHtmlCheck = 0;
    const offerReload = () => {
        if (document.getElementById('kanjoUpdateBanner')) return;
        if (!document.body) { setTimeout(offerReload, 500); return; }
        const bar = document.createElement('div');
        bar.id = 'kanjoUpdateBanner';
        bar.setAttribute('role', 'status');
        bar.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));'
            + 'transform:translateX(-50%);z-index:2147483000;background:#230535;color:#fff;'
            + 'border:1px solid #facc15;border-radius:9999px;box-shadow:0 8px 24px rgba(0,0,0,.35);'
            + 'padding:10px 12px 10px 18px;display:flex;align-items:center;gap:12px;'
            + 'font-weight:800;font-size:13px;max-width:92vw;flex-wrap:wrap;justify-content:center';
        bar.innerHTML = '<span>⚠️ هناك تحديث جديد للنظام! يرجى حفظ عملك الحالي، ثم</span>'
            + '<button type="button" id="kanjoUpdateBtn" style="background:#facc15;color:#230535;'
            + 'border:0;border-radius:9999px;padding:8px 16px;font-weight:900;cursor:pointer">'
            + 'اضغط هنا لتحديث الصفحة</button>';
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
    const liveMainTokenFromHtml = async () => {
        try {
            const res = await fetch('/dashboard.html?_=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return '';
            const html = await res.text();
            const m = html.match(/js\/main\.js\?v=([^"'\s>]+)/);
            return m ? m[1] : '';
        } catch (_) {
            return '';
        }
    };
    const checkForUpdate = async () => {
        if (checking || document.hidden) return;
        checking = true;
        try {
            let liveBuild = '';
            try {
                const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json().catch(() => null);
                    liveBuild = data && data.build ? String(data.build) : '';
                }
            } catch (_) { /* offline: retry next tick */ }
            let liveToken = '';
            if (Date.now() - lastHtmlCheck >= HTML_CHECK_EVERY_MS) {
                lastHtmlCheck = Date.now();
                liveToken = await liveMainTokenFromHtml();
            }
            const buildChanged = !!liveBuild && liveBuild !== build;
            const tokenChanged = !!bootToken && !!liveToken && liveToken !== bootToken;
            if (!buildChanged && !tokenChanged) return;
            const last = Number((window.sessionStorage && sessionStorage.getItem(NOTIFIED_AT_KEY)) || 0);
            if (Date.now() - last < 60000) return;
            try { sessionStorage.setItem(NOTIFIED_AT_KEY, String(Date.now())); } catch (_) {}
            offerReload();
        } finally {
            checking = false;
        }
    };
    /* Expose manual hooks so the banner can be verified and re-checked on demand. */
    window.kanjoCheckForUpdate = checkForUpdate;
    window.kanjoShowUpdateBanner = offerReload;
    setTimeout(checkForUpdate, 5000);
    setInterval(checkForUpdate, 60 * 1000);
    window.addEventListener('focus', () => checkForUpdate());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
})();
