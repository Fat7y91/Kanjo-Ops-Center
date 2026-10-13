/* Kanjo Ops — Workspace Router (Part 2: modular single-active-view shell)
 * ---------------------------------------------------------------------------
 * Turns the long vertical stack of module "strips" into a single-active-view
 * workspace WITHOUT touching any existing DOM id, container or event listener.
 *
 * How it stays safe:
 *   - It never removes or renames an element. Each managed section keeps its
 *     exact id/classes, so dashboard.js / catalog.js / kpi.js / accounting.js /
 *     merchantDocs.js / pharmacyIntake.js / modals.js keep finding their nodes.
 *   - Visibility is applied with one added class (`kws-in-active-view`); CSS
 *     hides only the panes that are NOT in the active view. Any element the
 *     role logic marked `hidden` (display:none) stays hidden even inside the
 *     active view, so existing RBAC gating is preserved verbatim.
 *   - Top nav (desktop command center) and bottom nav (mobile app shell) are
 *     new, separate <nav> anchors; they never wrap existing content.
 *
 * Views are pure groups of existing element ids (see GROUPS). Two shells:
 *   - admin  : founder / admin / ops-manager / product-audit  (5 desktop tabs)
 *   - mobile : rep / data_entry / media                       (4 app tabs)
 * Accounting and marketing keep their single-section behaviour (no router).
 */
(function () {
    'use strict';

    /* ── Existing element ids grouped by logical workspace section ───────────
       Every direct child of #dashboardSection is covered, so no empty/orphan
       strip is ever left visible. An id may appear in several groups; the FIRST
       group listed owns it (ID_GROUP is first-wins). */
    const GROUPS = {
        /* Field-ops task board (action buttons + day nav + search + list). */
        visits: ['dashboardActionBar', 'tasksDateNav', 'tasksSearchWrapper', 'tasksContainer'],
        /* Executive performance dashboard (role-gated separately by auth.js). */
        analytics: ['advancedDashboard'],
        /* Rep "today" extras that sit above the task board. */
        rep_work_extra: ['catalogRepBanner', 'catalogDraftsWidget', 'pendingUploadsWidgetSlot'],
        /* Catalog management. */
        catalog: ['catalogAllProductsWidget', 'catalogDeleteRequestsWidget', 'catalogContentWidget'],
        my_products: ['catalogMyProductsWidget'],
        /* Pharmacy intake + founder audit. */
        pharmacy: ['pharmacyIntakeWidget', 'founderAuditWidget'],
        /* Finance / audit banners. */
        finance: ['founderPayrollSummaryBox', 'merchantDocsAuditBanner'],
        /* Data-entry staging tools. */
        data_entry: ['masterCatalogImporterWidget', 'masterCatalogDriveLinksWidget',
            'stagingCatalogImporterWidget', 'stagingRawTextParserWidget', 'stagingCatalogExportWidget'],
        /* Personal files + payroll banners. */
        rep_profile: ['quickLinksWalletBanner', 'financialProfileBanner']
    };

    /* Reverse index: element id -> group name (first group that lists it). */
    const ID_GROUP = {};
    Object.keys(GROUPS).forEach((g) => {
        GROUPS[g].forEach((id) => { if (!(id in ID_GROUP)) ID_GROUP[id] = g; });
    });
    const ALL_IDS = Object.keys(ID_GROUP);

    /* Action banners that render as elevated Bento cards on desktop. */
    const CARD_IDS = ['catalogRepBanner', 'catalogDraftsWidget', 'quickLinksWalletBanner',
        'financialProfileBanner', 'founderPayrollSummaryBox', 'merchantDocsAuditBanner'];

    /* Executive 4-tab top nav (founders/admins). Pharmacy is no longer a tab;
       it is revealed on demand from a compact pill inside the visits hub. */
    const ADMIN_TABS = [
        { id: 'visits', label: 'المتابعة والمهام الميدانية', short: 'المتابعة', icon: 'fa-calendar-days', groups: ['visits'] },
        { id: 'catalog', label: 'كتالوج ومنتجات التجار', short: 'الكتالوج', icon: 'fa-box-open', groups: ['catalog', 'my_products'], badge: 'catalog' },
        { id: 'analytics', label: 'لوحة تحليل الأداء', short: 'التحليل', icon: 'fa-chart-line', groups: ['analytics'] },
        { id: 'admin_finance', label: 'الإدارة والمالية والتدقيق', short: 'المالية', icon: 'fa-briefcase', groups: ['finance', 'data_entry'] }
    ];

    const MOBILE_TABS_BASE = [
        { id: 'rep_work', label: 'العمل اليومي', short: 'العمل', icon: 'fa-circle-plus', groups: ['visits', 'rep_work_extra'] },
        { id: 'rep_catalog', label: 'المنتجات والتجار', short: 'المنتجات', icon: 'fa-store', groups: ['my_products', 'catalog'] },
        { id: 'rep_kpi', label: 'لوحة أدائي', short: 'أدائي', icon: 'fa-trophy', kpi: true },
        { id: 'rep_profile', label: 'ملفاتي والمرتب', short: 'ملفاتي', icon: 'fa-folder-open', groups: ['rep_profile'] }
    ];
    const MOBILE_TABS_DATA_ENTRY = [
        { id: 'rep_work', label: 'إدخال البيانات', short: 'الإدخال', icon: 'fa-pen-to-square', groups: ['data_entry'] },
        { id: 'rep_catalog', label: 'المنتجات والتجار', short: 'المنتجات', icon: 'fa-store', groups: ['my_products', 'catalog'] },
        { id: 'rep_kpi', label: 'لوحة أدائي', short: 'أدائي', icon: 'fa-trophy', kpi: true },
        { id: 'rep_profile', label: 'ملفاتي', short: 'ملفاتي', icon: 'fa-folder-open', groups: ['rep_profile'] }
    ];

    const STORAGE_KEY = 'kanjo.workspace.tab';

    const state = { shell: null, tabs: [], active: null, started: false };

    /* ── Role detection (mirrors auth.js semantics, read-only) ─────────────── */
    const role = () => String((window.currentUser && window.currentUser.role) || '');
    /* Mahmoud is an `admin` by role but a distinct operations-manager persona:
       his identity comes from the shared name/handler contract, never a role id. */
    const isMahmoudOps = () => {
        try {
            if (typeof window.isMahmoudOpsUser === 'function') return !!window.isMahmoudOpsUser();
        } catch (_) { /* ignore */ }
        return String((window.currentUser && window.currentUser.name) || '').includes('محمود');
    };
    /* Finance / payroll / audit is founder + (non-Mahmoud) admin only. */
    const canViewFinance = () => {
        const r = role();
        if (r === 'founder') return true;
        if (r === 'admin') return !isMahmoudOps();
        return false;
    };
    const isOps = () => {
        try {
            if (typeof window.isMahmoudUser === 'function' && window.isMahmoudUser()) return true;
            if (typeof window.canManageContracts === 'function' && window.canManageContracts()) return true;
        } catch (_) { /* ignore */ }
        return false;
    };

    function detectShell() {
        const r = role();
        if (!r) return null;
        if (r === 'accounting' || r === 'marketing') return null;      // single-section pages
        if (r === 'rep' || r === 'media') return 'mobile';
        if (r === 'data_entry') return 'mobile';
        if (r === 'founder' || r === 'admin' || r === 'product_audit') return 'admin';
        if (isOps()) return 'admin';
        return 'mobile'; // unknown operational role — give the mobile shell
    }

    function tabsFor(shell) {
        if (shell === 'admin') {
            /* Bug 1: the finance/payroll/audit tab is strictly founder + admin
               (and never the Mahmoud operations-manager persona). */
            return canViewFinance()
                ? ADMIN_TABS
                : ADMIN_TABS.filter((t) => t.id !== 'admin_finance');
        }
        return role() === 'data_entry' ? MOBILE_TABS_DATA_ENTRY : MOBILE_TABS_BASE;
    }

    const kpiTab = () => state.tabs.find((t) => t.kpi) || null;
    const kpiViewEl = () => document.getElementById('kpiAnalyticsView');
    const isKpiOpen = () => { const v = kpiViewEl(); return !!(v && !v.classList.contains('hidden')); };

    /* ── Visibility engine ─────────────────────────────────────────────────── */
    function tagPane(el, id) {
        el.classList.add('kanjo-workspace-pane');
        if (CARD_IDS.indexOf(id) !== -1) el.classList.add('kws-card');
    }

    function hideAllPanes() {
        ALL_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            tagPane(el, id);
            el.classList.remove('kws-in-active-view');
        });
    }

    function applyGroups(groupNames) {
        const active = new Set(groupNames || []);
        /* Pharmacy is an on-demand overlay inside the visits view, revealed by
           the compact pill (body.kws-pharmacy-open) rather than a nav tab. */
        const pharmacyOpen = active.has('visits') && document.body.classList.contains('kws-pharmacy-open');
        ALL_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            tagPane(el, id);
            const grp = ID_GROUP[id];
            const inView = grp === 'pharmacy' ? pharmacyOpen : active.has(grp);
            if (inView) el.classList.add('kws-in-active-view');
            else el.classList.remove('kws-in-active-view');
        });
    }

    /* Mark the KPI view as the active pane (used when KPI is opened from the
       header nav or auto-opened on rep login) without re-rendering the KPI. */
    function markKpiOpen() {
        /* Opening KPI must dismiss the marketing / Black Box panes (no overlay
           lock-up), even when the active shell has no dedicated KPI tab. */
        OVERLAY_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (document.body) document.body.classList.remove('black-box-open');
        const tab = kpiTab();
        if (!tab) { renderNavs(); syncSidebarChrome(); return; }
        state.active = tab.id;
        try { sessionStorage.setItem(STORAGE_KEY, tab.id); } catch (_) { /* ignore */ }
        setViewClass(tab.id);
        hideAllPanes();
        renderNavs();
        syncSidebarChrome();
    }

    /* ── Tab activation ────────────────────────────────────────────────────── */
    async function setTab(tabId, opts) {
        const tab = state.tabs.find((t) => t.id === tabId) || state.tabs[0];
        if (!tab) return;
        state.active = tab.id;
        try { sessionStorage.setItem(STORAGE_KEY, tab.id); } catch (_) { /* ignore */ }
        setViewClass(tab.id);
        if (tab.id !== 'rep_catalog') {
            document.body.classList.remove('kws-repcatalog-all', 'kws-repcatalog-mine');
        }
        /* Leaving the visits view collapses the pharmacy overlay. */
        if (tab.id !== 'visits') document.body.classList.remove('kws-pharmacy-open');
        syncPharmacyPill();

        /* Bug 4: any real sidebar tab click force-closes the marketing / Black
           Box panes so the router can never lock up behind an overlay. */
        hideWorkspaceOverlays();

        if (tab.kpi) {
            hideAllPanes();
            if (!isKpiOpen() && typeof window.openKpiDashboard === 'function') {
                try { await window.openKpiDashboard(); } catch (_) { /* ignore */ }
            } else {
                const v = kpiViewEl();
                const d = document.getElementById('dashboardSection');
                if (d) d.classList.add('hidden');
                if (v) v.classList.remove('hidden');
            }
        } else {
            /* Leaving a KPI view restores the dashboard section. */
            if (isKpiOpen() && typeof window.closeKpiDashboard === 'function') {
                try { window.closeKpiDashboard(); } catch (_) { /* ignore */ }
            }
            applyGroups(tab.groups);
            autoOpenCatalogForView(tab.id);
            if (tab.id === 'visits') { wireDateStrip(); renderDateStrip(); }
            if (tab.id === 'admin_finance') syncFinanceHub();
        }

        renderNavs();
        syncSidebarChrome();
        const nextHash = '#ws=' + tab.id;
        if (!opts || opts.silentHash !== true) {
            if (location.hash !== nextHash) {
                try { history.replaceState(null, '', nextHash); } catch (_) { location.hash = nextHash; }
            }
        }
    }

    /* ── Badges (memory-only, zero Firestore reads) ────────────────────────── */
    function catalogCount() {
        if (Array.isArray(window.allCatalogProductsCache) && window.allCatalogProductsCache.length) {
            return window.allCatalogProductsCache.length;
        }
        const n = Number(window._catalogAllProductsCount);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function pharmacyCount() {
        if (typeof window.founderAuditPendingCount === 'function') {
            try { return Number(window.founderAuditPendingCount()) || 0; } catch (_) { /* ignore */ }
        }
        if (Array.isArray(window.founderAuditPendingCache)) return window.founderAuditPendingCache.length;
        return 0;
    }

    function badgeValue(kind) {
        if (kind === 'catalog') return catalogCount();
        if (kind === 'pharmacy') return pharmacyCount();
        return 0;
    }

    /* ── Desktop view state: body view class + Bento grid ──────────────────── */
    const VIEW_CLASS_PREFIX = 'kws-view-';
    let currentViewClass = '';

    function setViewClass(tabId) {
        if (currentViewClass) document.body.classList.remove(currentViewClass);
        currentViewClass = VIEW_CLASS_PREFIX + tabId;
        document.body.classList.add(currentViewClass);
    }

    function setBento(on) {
        const d = document.getElementById('dashboardSection');
        if (d) d.classList.toggle('kws-bento', !!on);
    }

    /* ── Rep catalog segmented switcher (all products | my products) ───────── */
    const REP_SEG_KEY = 'kanjo.repCatalogSeg';
    const repSeg = () => {
        try { return sessionStorage.getItem(REP_SEG_KEY) === 'mine' ? 'mine' : 'all'; }
        catch (_) { return 'all'; }
    };

    function applyRepSeg(seg) {
        document.body.classList.toggle('kws-repcatalog-all', seg !== 'mine');
        document.body.classList.toggle('kws-repcatalog-mine', seg === 'mine');
        const sw = document.getElementById('kanjoCatalogSwitcher');
        if (sw && typeof sw.querySelectorAll === 'function') {
            Array.prototype.forEach.call(sw.querySelectorAll('[data-kws-seg]'), (b) => {
                b.classList.toggle('is-active', b.getAttribute('data-kws-seg') === seg);
            });
        }
    }

    function ensureCatalogSwitcher() {
        let sw = document.getElementById('kanjoCatalogSwitcher');
        if (sw) return sw;
        if (typeof document.createElement !== 'function') return null;
        const anchor = document.getElementById('catalogMyProductsWidget');
        if (!anchor || !anchor.parentNode) return null;
        sw = document.createElement('div');
        sw.id = 'kanjoCatalogSwitcher';
        sw.className = 'kws-segmented';
        sw.innerHTML = '<button type="button" data-kws-seg="all"><i class="fa-solid fa-box"></i> جميع منتجات المناديب</button>'
            + '<button type="button" data-kws-seg="mine"><i class="fa-solid fa-user"></i> منتجاتي</button>';
        sw.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-kws-seg]') : null;
            if (!btn) return;
            const seg = btn.getAttribute('data-kws-seg');
            try { sessionStorage.setItem(REP_SEG_KEY, seg); } catch (_) { /* ignore */ }
            applyRepSeg(seg);
            openSelectedCatalog(seg);
        });
        anchor.parentNode.insertBefore(sw, anchor);
        return sw;
    }

    /* Open a catalog accordion body without ever closing an already-open one. */
    function forceOpenBody(bodyId, openFn) {
        const body = document.getElementById(bodyId);
        if (!body) return;
        const isHidden = body.classList.contains('hidden');
        if (!isHidden) return; // already expanded — no second click needed
        if (typeof openFn === 'function') {
            try { openFn(); } catch (_) { /* fall through to the defensive reveal */ }
        }
        if (body.classList.contains('hidden')) body.classList.remove('hidden');
    }

    function openSelectedCatalog(seg) {
        if (seg === 'mine') forceOpenBody('catalogMyProductsBody', window.toggleCatalogMyProductsWidget);
        else forceOpenBody('catalogAllProductsBody', window.toggleCatalogAllProductsWidget);
    }

    /* Auto-expand the catalog when its view becomes active (no accordion click). */
    function autoOpenCatalogForView(tabId) {
        if (tabId === 'catalog') {
            forceOpenBody('catalogAllProductsBody', window.toggleCatalogAllProductsWidget);
            wireCatalogTabs();
            /* Repaint from the hydrated cache in case the IDB boot finished
               before this view activated (cold-boot skeleton race). Zero reads. */
            try { if (typeof window.repaintCatalog === 'function') window.repaintCatalog(); } catch (_) { /* ignore */ }
        } else if (tabId === 'rep_catalog') {
            ensureCatalogSwitcher();
            const seg = repSeg();
            applyRepSeg(seg);
            openSelectedCatalog(seg);
            try { if (typeof window.repaintCatalog === 'function') window.repaintCatalog(); } catch (_) { /* ignore */ }
        }
    }

    /* ── Founder Command Hub (visits view) ─────────────────────────────────── */
    const TASKS_REVEAL = 'kws-tasks-revealed';

    function revealTasks() { document.body.classList.add(TASKS_REVEAL); }

    function syncPharmacyPill() {
        const pill = document.getElementById('kanjoPharmacyPill');
        if (pill) pill.classList.toggle('is-active', document.body.classList.contains('kws-pharmacy-open'));
    }

    function reapplyActiveGroups() {
        if (!state.shell) return;
        const t = state.tabs.find((x) => x.id === state.active);
        if (t && !t.kpi) applyGroups(t.groups);
    }

    /* ── Marketing / Black Box router panes (Bug 4) ─────────────────────────
       These are ordinary in-flow panes, not fixed overlays. Opening one hides
       the dashboard section; any sidebar tab click force-hides them again. */
    const OVERLAY_IDS = ['marketingSection', 'blackBoxModal'];

    function hideWorkspaceOverlays() {
        OVERLAY_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (document.body) document.body.classList.remove('black-box-open');
        const d = document.getElementById('dashboardSection');
        if (d) d.classList.remove('hidden');
    }

    function showWorkspaceOverlay(id) {
        OVERLAY_IDS.forEach((x) => {
            if (x === id) return;
            const el = document.getElementById(x);
            if (el) el.classList.add('hidden');
        });
        const target = document.getElementById(id);
        if (target) target.classList.remove('hidden');
        const d = document.getElementById('dashboardSection');
        if (d) d.classList.add('hidden');
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { /* ignore */ }
    }

    function openMarketingPane() {
        if (typeof window.marketingCanView === 'function' && !window.marketingCanView()) return;
        showWorkspaceOverlay('marketingSection');
        if (typeof window.initMarketingDashboard === 'function') {
            try { window.initMarketingDashboard(); } catch (_) { /* ignore */ }
        }
    }

    function openBlackBoxPane() {
        if (typeof window.kanjoAuditCanView === 'function' && !window.kanjoAuditCanView()) return;
        showWorkspaceOverlay('blackBoxModal');
        if (typeof window.openBlackBox === 'function') {
            try { window.openBlackBox(false); } catch (_) { /* ignore */ }
        }
    }

    function togglePharmacy() {
        const open = document.body.classList.toggle('kws-pharmacy-open');
        syncPharmacyPill();
        reapplyActiveGroups();
        if (open) {
            const el = document.getElementById('pharmacyIntakeWidget');
            if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function spotlightSearch(q) {
        const si = document.getElementById('searchInput');
        if (si) si.value = q || '';
        revealTasks();
        try { if (typeof window.applySearch === 'function') window.applySearch(); } catch (_) { /* ignore */ }
    }

    function visitsReset() {
        document.body.classList.remove(TASKS_REVEAL, 'kws-pharmacy-open');
        syncPharmacyPill();
        const spot = document.getElementById('kanjoSpotlightInput');
        if (spot) spot.value = '';
        const si = document.getElementById('searchInput');
        if (si) si.value = '';
        try { if (typeof window.applySearch === 'function') window.applySearch(); } catch (_) { /* ignore */ }
        reapplyActiveGroups();
    }

    function pickDate(value) {
        if (!value) return;
        revealTasks();
        try { if (typeof window.tasksDateChange === 'function') window.tasksDateChange(value); } catch (_) { /* ignore */ }
        renderDateStrip();
        const el = document.getElementById('tasksContainer');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ── Premium horizontal date-strip carousel (visits hub) ───────────────── */
    const AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    const STRIP_SPAN = 10;   /* days rendered at once */
    const STRIP_STEP = 7;    /* days moved by the nav arrows */
    let stripStart = null;   /* first day shown in the strip */

    function isoDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function taskDotsByDate() {
        const map = {};
        const list = Array.isArray(window.allTasksCache) ? window.allTasksCache : [];
        list.forEach((t) => {
            const raw = t && (t.time || t.date || '');
            const key = String(raw).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) map[key] = (map[key] || 0) + 1;
        });
        return map;
    }

    function renderDateStrip() {
        const strip = document.getElementById('kanjoDateStrip');
        if (!strip || typeof strip.innerHTML !== 'string') return;
        const now = new Date();
        const todayIso = isoDate(now);
        if (!stripStart) stripStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const selected = (typeof window.getTasksSelectedDate === 'function'
            ? window.getTasksSelectedDate() : '') || todayIso;
        const dots = taskDotsByDate();
        let html = '';
        for (let i = 0; i < STRIP_SPAN; i++) {
            const d = new Date(stripStart.getFullYear(), stripStart.getMonth(), stripStart.getDate() + i);
            const iso = isoDate(d);
            const cls = ['kds-day'];
            if (iso === todayIso) cls.push('is-today');
            if (iso === selected) cls.push('is-active');
            const dot = dots[iso] ? '<span class="kds-dot"></span>' : '';
            html += `<button type="button" role="option" aria-selected="${iso === selected}" class="${cls.join(' ')}" data-kds-day="${iso}">`
                + `<span class="kds-wd">${AR_DAYS[d.getDay()]}</span>`
                + `<span class="kds-num">${d.getDate()}</span>${dot}</button>`;
        }
        strip.innerHTML = html;
    }

    function stripShift(days) {
        const base = stripStart || new Date();
        stripStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
        renderDateStrip();
    }

    function stripToday() {
        stripStart = null;
        renderDateStrip();
    }

    function wireDateStrip() {
        const strip = document.getElementById('kanjoDateStrip');
        if (!strip || strip._kwsWired) return;
        strip._kwsWired = true;
        strip.addEventListener('click', (e) => {
            const day = e.target && e.target.closest ? e.target.closest('[data-kds-day]') : null;
            if (day) pickDate(day.getAttribute('data-kds-day'));
        });
        const wrap = strip.closest ? strip.closest('.kws-datestrip-wrap') : null;
        if (wrap) {
            wrap.addEventListener('click', (e) => {
                const nav = e.target && e.target.closest ? e.target.closest('[data-kds-nav]') : null;
                if (!nav) return;
                const delta = Number(nav.getAttribute('data-kds-nav')) || 0;
                if (delta === 0) stripToday();
                else stripShift(delta * STRIP_STEP);
            });
        }
    }

    /* ── Founder Finance Hub (admin_finance view): best-effort number mirror ── */
    function syncFinanceHub() {
        const hub = document.getElementById('kanjoFinanceHub');
        if (!hub) return;
        const monthEl = document.getElementById('kanjoFinMonth');
        if (monthEl) {
            try {
                monthEl.textContent = new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
            } catch (_) { /* ignore */ }
        }
        const net = document.getElementById('founderTotalNetDisplay');
        const totalEl = document.getElementById('kanjoFinPayrollTotal');
        if (totalEl) {
            const v = net ? String(net.textContent || '').trim() : '';
            totalEl.textContent = v || '—';
        }
        const banner = document.getElementById('merchantDocsAuditBanner');
        const ratioEl = document.getElementById('kanjoFinAuditRatio');
        const countEl = document.getElementById('kanjoFinAuditCount');
        const ratioSrc = document.getElementById('merchantDocsAuditRatio');
        const ratioText = ratioSrc ? String(ratioSrc.textContent || '').trim() : '';
        const ratio = ratioText.match(/(\d+)\s*\/\s*(\d+)/);
        if (ratioEl && ratio) ratioEl.textContent = ratio[1] + ' / ' + ratio[2];
        if (countEl) {
            if (ratio) countEl.textContent = ratio[2] + ' ملف';
            else if (banner) {
                const n = (banner.textContent || '').match(/(\d+)/);
                countEl.textContent = n ? n[1] + ' ملف' : '—';
            }
        }
    }

    /* ── Export Studio helpers (searchable merchant picker + card) ─────────── */
    function filterExportMerchants(q) {
        const select = document.getElementById('merchantExportFilter');
        if (!select || !select.options) return;
        const term = String(q || '').trim().toLowerCase();
        Array.prototype.forEach.call(select.options, (o) => {
            if (!o.value) { o.hidden = false; o.style.display = ''; return; } // placeholder
            const match = !term || String(o.textContent || '').toLowerCase().indexOf(term) !== -1;
            o.hidden = !match;
            o.style.display = match ? '' : 'none';
        });
        syncExportCardBtn();
    }

    function syncExportCardBtn() {
        const select = document.getElementById('merchantExportFilter');
        const btn = document.getElementById('kanjoExportMerchantCardBtn');
        if (btn) btn.disabled = !(select && select.value);
        /* Smart delta export: refresh the "updated-after-publish" affordance for
           the newly selected merchant (pure in-memory). */
        try { if (typeof window.kanjoSyncDeltaExport === 'function') window.kanjoSyncDeltaExport(); } catch (_) { /* ignore */ }
    }

    function openSelectedMerchantCard() {
        const select = document.getElementById('merchantExportFilter');
        const name = select ? String(select.value || '') : '';
        if (!name) return;
        if (typeof window.openMerchantProfile === 'function') window.openMerchantProfile(name);
    }


    /* ── Catalog executive sub-tabs (browse | export) ──────────────────────── */
    function wireCatalogTabs() {
        const tabs = document.getElementById('kanjoCatalogTabs');
        if (!tabs) return;
        /* Mirror the existing export RBAC gate: no export tab when the export
           button itself is hidden for this role. */
        const expBtn = document.getElementById('openExportProductsBtn');
        const expTab = tabs.querySelector ? tabs.querySelector('[data-kws-ctab="export"]') : null;
        if (expTab) expTab.style.display = (expBtn && !expBtn.classList.contains('hidden')) ? '' : 'none';
        if (tabs._kwsWired) return;
        tabs._kwsWired = true;
        tabs.addEventListener('click', (e) => {
            const btn = e.target.closest ? e.target.closest('[data-kws-ctab]') : null;
            if (!btn) return;
            const mode = btn.getAttribute('data-kws-ctab');
            Array.prototype.forEach.call(tabs.querySelectorAll('[data-kws-ctab]'), (b) => {
                b.classList.toggle('is-active', b === btn);
            });
            if (mode === 'export') {
                if (typeof window.openExportProductsModal === 'function') window.openExportProductsModal();
                else if (typeof window.openMerchantExportModal === 'function') window.openMerchantExportModal();
            }
        });
    }

    /* ── Desktop sidebar chrome (brand footer: user, notif, quick links) ───── */
    const ROLE_LABELS = {
        founder: 'مؤسس', admin: 'أدمن', rep: 'مندوب', media: 'ميديا',
        data_entry: 'إدخال بيانات', product_audit: 'تدقيق منتجات',
        accounting: 'حسابات', marketing: 'تسويق'
    };

    function syncSidebarChrome() {
        const side = document.getElementById('kanjoWorkspaceSidebar');
        if (!side) return;
        const u = window.currentUser || {};
        const nameEl = document.getElementById('kanjoSidebarUserName');
        if (nameEl) {
            const un = document.getElementById('userNameDisplay');
            nameEl.textContent = u.name || (un ? un.textContent : '') || '';
        }
        const roleEl = document.getElementById('kanjoSidebarUserRole');
        if (roleEl) {
            roleEl.textContent = isMahmoudOps()
                ? 'مدير التشغيل'
                : (ROLE_LABELS[u.role] || (u.role || ''));
        }
        const av = document.getElementById('kanjoSidebarAvatar');
        if (av) {
            const src = document.getElementById('userAvatarContainer');
            av.innerHTML = src ? src.innerHTML : '';
        }
        const badge = document.getElementById('kanjoSidebarNotifBadge');
        if (badge) {
            const src = document.getElementById('notifBadge');
            badge.classList.toggle('hidden', !src || src.classList.contains('hidden'));
        }

        /* Bug 1: the brand subtitle shows the field team ONLY for reps; the
           Mahmoud operations-manager persona is labelled مدير التشغيل, and every
           other executive role (founder/admin) sees the founders label. */
        const teamEl = document.getElementById('kanjoSidebarTeam');
        if (teamEl) {
            const isField = u.role === 'rep' || u.role === 'media';
            const teamName = u.team || '';
            if (isMahmoudOps()) teamEl.textContent = 'مدير التشغيل';
            else if (isField && teamName) teamEl.textContent = teamName;
            else teamEl.textContent = 'المؤسسين';
        }

        /* Bug 6: the sidebar notification bell is founder/admin-only. */
        const notifBtn = document.getElementById('kanjoSidebarNotifBtn');
        if (notifBtn) {
            const canNotif = u.role === 'admin' || u.role === 'founder';
            notifBtn.classList.toggle('hidden', !canNotif);
        }
        const quick = document.getElementById('kanjoSidebarQuick');
        if (quick) {
            /* The removed top header still owns the RBAC visibility of each
               utility link (auth.js toggles their wrapper's `hidden` class). We
               mirror those wrappers into the sidebar footer so founders and the
               Mahmoud operations-manager persona keep their admin tools. */
            const visible = (id) => {
                const el = document.getElementById(id);
                return !!(el && !el.classList.contains('hidden'));
            };
            const wrapperLabel = (id, fallback) => {
                const el = document.getElementById(id);
                const span = el && el.querySelector ? el.querySelector('span') : null;
                return (span && String(span.textContent || '').trim()) || fallback;
            };
            const wants = [];
            if (visible('kpiNavBtnWrapper')) {
                wants.push({ label: wrapperLabel('kpiNavBtnWrapper', 'لوحة المؤشرات'), icon: 'fa-chart-line', fn: 'openKpiDashboard()' });
            }
            if (visible('contractsNavBtnWrapper')) {
                wants.push({ label: 'إدارة العقود', icon: 'fa-file-signature', fn: 'openContractsManagerModal()' });
            }
            if (visible('adminTransferNavBtnWrapper')) {
                wants.push({ label: 'طلبات النقل', icon: 'fa-right-left', fn: 'openAdminTransferModal()' });
            }
            if (visible('archivedReportsBtnWrapper')) {
                wants.push({ label: 'سلة التقارير الخاطئة', icon: 'fa-inbox', fn: 'openViewArchivedReportsModal()' });
            }
            if (visible('marketingNavBtnWrapper')) {
                wants.push({ label: 'بوابة التسويق', icon: 'fa-bullhorn', fn: 'kanjoOpenMarketingPane()' });
            }
            if (visible('blackBoxNavBtnWrapper')) {
                wants.push({ label: 'Black Box', icon: 'fa-box-archive', fn: 'kanjoOpenBlackBoxPane()' });
            }
            const sig = wants.map((w) => w.fn).join('|');
            if (quick._kwsSig !== sig) {
                quick._kwsSig = sig;
                quick.innerHTML = wants.map((w) =>
                    `<button type="button" onclick="${w.fn}"><i class="fa-solid ${w.icon}"></i> ${w.label}</button>`
                ).join('');
            }
        }
    }

    /* ── Nav rendering ─────────────────────────────────────────────────────── */
    function tabButtonHtml(tab) {
        const badge = tab.badge ? badgeValue(tab.badge) : 0;
        const badgeHtml = tab.badge
            ? `<span class="kws-badge${badge > 0 ? '' : ' hidden'}" data-badge="${tab.badge}">${badge > 0 ? badge.toLocaleString('ar-EG') : ''}</span>`
            : '';
        return `<button type="button" class="kws-tab${tab.id === state.active ? ' is-active' : ''}" data-kws-tab="${tab.id}">`
            + `<span class="kws-tab-ic"><i class="fa-solid ${tab.icon}"></i></span>`
            + `<span class="kws-tab-label">${tab.label}</span>`
            + `<span class="kws-tab-label-short">${tab.short}</span>`
            + badgeHtml
            + `</button>`;
    }

    function renderNavs() {
        const inner = '<div class="kws-nav-inner">' + state.tabs.map(tabButtonHtml).join('') + '</div>';
        const top = document.getElementById('kanjoWorkspaceNav');
        if (top) top.innerHTML = inner;
        const bottom = document.getElementById('kanjoMobileNav');
        if (bottom) bottom.innerHTML = inner;
        const side = document.getElementById('kanjoSidebarNav');
        if (side) side.innerHTML = inner;
    }

    function onNavClick(e) {
        const btn = e.target.closest('[data-kws-tab]');
        if (!btn) return;
        setTab(btn.getAttribute('data-kws-tab'));
    }

    function wireNav(id) {
        const nav = document.getElementById(id);
        if (!nav || nav._kwsWired) return;
        nav._kwsWired = true;
        nav.addEventListener('click', onNavClick);
    }

    /* ── Public refresh (called after role/theme is applied) ───────────────── */
    function refresh() {
        const shell = detectShell();
        if (!shell) {
            /* Accounting / marketing: make sure no stale pane hiding leaks in. */
            document.body.classList.remove('kanjo-shell-admin', 'kanjo-shell-mobile',
                'kws-repcatalog-all', 'kws-repcatalog-mine');
            if (currentViewClass) { document.body.classList.remove(currentViewClass); currentViewClass = ''; }
            setBento(false);
            ALL_IDS.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('kanjo-workspace-pane', 'kws-in-active-view', 'kws-card');
            });
            ['kanjoWorkspaceNav', 'kanjoMobileNav', 'kanjoSidebarNav'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
            state.started = false;
            state.active = null;
            return;
        }
        const tabs = tabsFor(shell);
        const shellChanged = shell !== state.shell;
        state.shell = shell;
        state.tabs = tabs;
        document.body.classList.toggle('kanjo-shell-admin', shell === 'admin');
        document.body.classList.toggle('kanjo-shell-mobile', shell === 'mobile');
        setBento(true);

        wireNav('kanjoWorkspaceNav');
        wireNav('kanjoMobileNav');
        wireNav('kanjoSidebarNav');
        syncSidebarChrome();

        /* If the KPI view was auto-opened (rep home), keep its tab selected. */
        if (isKpiOpen() && kpiTab()) {
            if (shellChanged || state.active !== kpiTab().id || !state.started) {
                state.started = true;
                markKpiOpen();
            } else {
                renderNavs();
            }
            return;
        }

        const fromHash = (location.hash.match(/ws=([a-z_]+)/i) || [])[1];
        let wanted = fromHash;
        if (!wanted) { try { wanted = sessionStorage.getItem(STORAGE_KEY) || ''; } catch (_) { wanted = ''; } }
        if (!tabs.some((t) => t.id === wanted)) wanted = tabs[0].id;
        if (shellChanged || wanted !== state.active || !state.started) {
            state.started = true;
            setTab(wanted, { silentHash: true });
        } else {
            renderNavs();
        }
    }

    window.kanjoWorkspace = {
        refresh,
        setTab,
        updateBadges: () => { if (state.shell) { renderNavs(); syncSidebarChrome(); syncFinanceHub(); } },
        get active() { return state.active; },
        get shell() { return state.shell; },
        _groups: GROUPS
    };

    /* Founder Command Hub + Finance Hub public API (inline onclick handlers). */
    window.kanjoTogglePharmacy = togglePharmacy;
    window.kanjoDateStripToday = stripToday;
    window.kanjoPickDate = pickDate;
    window.kanjoSpotlightSearch = spotlightSearch;
    window.kanjoVisitsReset = visitsReset;
    window.kanjoSyncFinanceHub = syncFinanceHub;
    window.kanjoFilterExportMerchants = filterExportMerchants;
    window.kanjoSyncExportCardBtn = syncExportCardBtn;
    window.kanjoOpenSelectedMerchantCard = openSelectedMerchantCard;
    window.kanjoOpenMarketingPane = openMarketingPane;
    window.kanjoOpenBlackBoxPane = openBlackBoxPane;
    window.kanjoCloseWorkspaceOverlays = hideWorkspaceOverlays;

    /* Cold-boot safety: when the catalog cache finishes hydrating, repaint the
       catalog view if it is the active one. Covers the case where hydration
       resolved between the view activation and its first paint. */
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('kanjo:catalog-ready', () => {
            if (!state.shell) return;
            if (state.active === 'catalog' || state.active === 'rep_catalog') {
                try { if (typeof window.repaintCatalog === 'function') window.repaintCatalog(); } catch (_) { /* ignore */ }
            }
        });
    }

    /* ── Keep the router in sync with the existing header nav ────────────────
       Header buttons still run their original inline handler (capture runs
       first, so the target pane is already visible when it executes). */
    const HEADER_NAV_MAP = [
        { re: /openCatalogAudit/, group: 'catalog', kpi: false },
        { re: /openKpiDashboard/, group: null, kpi: true }
    ];
    document.addEventListener('click', (e) => {
        if (!state.shell) return;
        const el = e.target && e.target.closest ? e.target.closest('[onclick]') : null;
        if (!el) return;
        const oc = el.getAttribute('onclick') || '';
        const hit = HEADER_NAV_MAP.find((m) => m.re.test(oc));
        if (!hit) return;
        if (hit.kpi) {
            const tab = kpiTab();
            if (tab && tab.id !== state.active) state.active = tab.id;
            return; // openKpiDashboard itself handles the view; nav sync happens in its wrapper
        }
        const tab = state.tabs.find((t) => (t.groups || []).includes(hit.group));
        if (tab && tab.id !== state.active) setTab(tab.id, { silentHash: true });
    }, true);

    /* Wrap the KPI opener so opening it (header button OR rep auto-home) marks
       the matching workspace tab. Loaded after kpi.js in main.js. */
    if (typeof window.openKpiDashboard === 'function') {
        const origOpenKpi = window.openKpiDashboard;
        window.openKpiDashboard = function () {
            const r = origOpenKpi.apply(this, arguments);
            try { markKpiOpen(); } catch (_) { /* ignore */ }
            return r;
        };
    }

    /* Wrap the export studio opener so the searchable picker resets and the
       "merchant card" button state is correct each time it is shown. */
    if (typeof window.openExportProductsModal === 'function') {
        const origOpenExport = window.openExportProductsModal;
        window.openExportProductsModal = function () {
            const search = document.getElementById('kanjoExportMerchantSearch');
            if (search) search.value = '';
            filterExportMerchants('');
            syncExportCardBtn();
            return origOpenExport.apply(this, arguments);
        };
    }

    /* Keep the Finance Hub mirror in sync with the underlying payroll / audit
       widgets whenever they re-render (best-effort, zero reads). */
    ['renderPayrollTable', 'renderMerchantDocsAudit'].forEach((fn) => {
        const orig = window[fn];
        if (typeof orig === 'function') {
            window[fn] = function () {
                const r = orig.apply(this, arguments);
                try { syncFinanceHub(); } catch (_) { /* ignore */ }
                return r;
            };
        }
    });

    /* Update count badges when the source widgets re-render (memory-only). */
    ['renderCatalogWidgets', 'renderCatalogAllProductsWidget', 'renderFounderAuditWidget'].forEach((fn) => {
        const orig = window[fn];
        if (typeof orig === 'function') {
            window[fn] = function () {
                const r = orig.apply(this, arguments);
                if (window.kanjoWorkspace) window.kanjoWorkspace.updateBadges();
                return r;
            };
        }
    });

    /* Closing the Black Box pane (Bug 4) must restore the dashboard section so
       the router never strands the user on an empty canvas. Only relevant when
       a workspace shell is active (marketing role owns its section as home). */
    if (typeof window.closeBlackBox === 'function') {
        const origCloseBlackBox = window.closeBlackBox;
        window.closeBlackBox = function () {
            const r = origCloseBlackBox.apply(this, arguments);
            try { if (state.shell) hideWorkspaceOverlays(); } catch (_) { /* ignore */ }
            return r;
        };
    }
    if (typeof window.closeMarketingDashboard === 'function') {
        const origCloseMarketing = window.closeMarketingDashboard;
        window.closeMarketingDashboard = function () {
            const r = origCloseMarketing.apply(this, arguments);
            try { if (state.shell) hideWorkspaceOverlays(); } catch (_) { /* ignore */ }
            return r;
        };
    }

    window.addEventListener('hashchange', () => {
        const fromHash = (location.hash.match(/ws=([a-z_]+)/i) || [])[1];
        if (fromHash && state.tabs.some((t) => t.id === fromHash) && fromHash !== state.active) {
            setTab(fromHash, { silentHash: true });
        }
    });

    /* Re-apply once the DOM is fully parsed if refresh ran too early. */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (window.kanjoWorkspace) window.kanjoWorkspace.refresh(); });
    }
})();
