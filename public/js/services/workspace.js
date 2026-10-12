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

    const ADMIN_TABS = [
        { id: 'visits', label: 'المتابعة والمهام الميدانية', short: 'المتابعة', icon: 'fa-calendar-days', groups: ['visits'] },
        { id: 'catalog', label: 'كتالوج ومنتجات التجار', short: 'الكتالوج', icon: 'fa-box-open', groups: ['catalog', 'my_products'], badge: 'catalog' },
        { id: 'analytics', label: 'لوحة تحليل الأداء', short: 'التحليل', icon: 'fa-chart-line', groups: ['analytics'] },
        { id: 'pharmacy', label: 'مراجعة الصيدليات', short: 'الصيدليات', icon: 'fa-pills', groups: ['pharmacy'], badge: 'pharmacy' },
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
        if (shell === 'admin') return ADMIN_TABS;
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
        ALL_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            tagPane(el, id);
            if (active.has(ID_GROUP[id])) el.classList.add('kws-in-active-view');
            else el.classList.remove('kws-in-active-view');
        });
    }

    /* Mark the KPI view as the active pane (used when KPI is opened from the
       header nav or auto-opened on rep login) without re-rendering the KPI. */
    function markKpiOpen() {
        const tab = kpiTab();
        if (!tab) return;
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
        } else if (tabId === 'rep_catalog') {
            ensureCatalogSwitcher();
            const seg = repSeg();
            applyRepSeg(seg);
            openSelectedCatalog(seg);
        }
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
        if (roleEl) roleEl.textContent = ROLE_LABELS[u.role] || (u.role || '');
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
        const quick = document.getElementById('kanjoSidebarQuick');
        if (quick) {
            const wants = [];
            const mkt = document.getElementById('marketingNavBtnWrapper');
            if (mkt && !mkt.classList.contains('hidden')) {
                wants.push({ label: 'بوابة التسويق', icon: 'fa-bullhorn', fn: 'openMarketingDashboard()' });
            }
            const bb = document.getElementById('blackBoxNavBtnWrapper');
            if (bb && !bb.classList.contains('hidden')) {
                wants.push({ label: 'Black Box', icon: 'fa-box-archive', fn: 'openBlackBox()' });
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
            + `<span class="kws-tab-ic"><i class="fa-solid ${tab.icon}"></i>${badgeHtml}</span>`
            + `<span class="kws-tab-label">${tab.label}</span>`
            + `<span class="kws-tab-label-short">${tab.short}</span>`
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
        updateBadges: () => { if (state.shell) { renderNavs(); syncSidebarChrome(); } },
        get active() { return state.active; },
        get shell() { return state.shell; },
        _groups: GROUPS
    };

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
