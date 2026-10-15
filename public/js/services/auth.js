/* Kanjo Ops — Auth, Session & Idle Timeout */
import { users } from '../config/constants.js?v=20261014d';

const SESSION_KEY = 'kanjo_session_user';
const IDLE_TIMEOUT = 30 * 60 * 1000;

/* ── Master access key (PIN 2811) ─────────────────────────────────────────
   Resolved INDEPENDENTLY of the (browser-cached) `users` table so a stale
   client bundle can never lock the system owner out. Keep in sync with the
   `2811` entry in constants.js. */
const MASTER_PIN = '2811';
const MASTER_IDENTITY = Object.freeze({
    name: 'د. أحمد فتحي', role: 'super_admin', superAdmin: true
});
window.KANJO_MASTER_PIN = MASTER_PIN;

/* Resolve a typed PIN to its identity: the users table first, then the
   hard-wired master key, then nothing. Everything is trimmed so stray
   whitespace from paste/autofill can never cause a false rejection. */
function resolveIdentity(pin) {
    const key = String(pin == null ? '' : pin).trim();
    if (!key) return null;
    if (users && Object.prototype.hasOwnProperty.call(users, key)) return users[key];
    if (key === MASTER_PIN) return MASTER_IDENTITY;
    return null;
}
window.resolveKanjoIdentity = resolveIdentity;

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

/* ─── Claims-based identity sync ─────────────────────────────────────────
   Anonymous sign-in gives every device an Auth UID; the Admin SDK script
   (scripts/set-auth-claims.mjs) attaches kanjoRole/kanjoTeam/kanjoName/...
   claims to that UID. When claims exist we treat them as authoritative over
   the client PIN table; when they do not (pre-enrollment) we keep the PIN
   identity so the app never locks out. Mirrors firestore.rules. */
let _authClaimsSynced = false;
window.authClaims = window.authClaims || null;

window.ensureAuthClaims = async (intendedIdentity) => {
    if (_authClaimsSynced) return window.authClaims;
    try {
        const fbUser = window.auth && window.auth.currentUser;
        if (fbUser && typeof fbUser.getIdTokenResult === 'function') {
            /* Bound the token refresh so a slow network can never hang boot. */
            const token = await Promise.race([
                fbUser.getIdTokenResult(true),
                new Promise((res) => setTimeout(() => res(null), 5000))
            ]);
            if (!token) return window.authClaims;
            const claims = (token && token.claims) || {};

            /* Which person is signing in on THIS device right now? An explicit
               argument (PIN login) wins, then the module-local user, then the
               session restored by main.js. */
            const intended = intendedIdentity || currentUser || window.currentUser || null;
            const intendedName = String((intended && intended.name) || '').trim();
            const claimName = String(claims.kanjoName || '').trim();

            /* Shared-device reconciliation: the browser's anonymous UID can still
               carry a *different* teammate's claims from a previous shift. Those
               claims would scope every team/time read to the wrong person (or to
               nobody), so a PIN login must never inherit them. Re-authenticate to
               a clean UID and register this identity as an enrollment hint. */
            if (claims.kanjoRole && intendedName && claimName && claimName !== intendedName) {
                if (!window._claimsReauthAttempted) {
                    window._claimsReauthAttempted = true;
                    try {
                        if (typeof window.signOut === 'function' && window.auth) {
                            await window.signOut(window.auth);
                        }
                        const cred = (typeof window.signInAnonymously === 'function' && window.auth)
                            ? await window.signInAnonymously(window.auth)
                            : null;
                        const newUid = cred && cred.user && cred.user.uid;
                        window.authReady = Promise.resolve(cred && cred.user);
                        if (newUid) {
                            window.setDoc(
                                window.doc(window.db, 'enrollment_requests', newUid),
                                {
                                    uid: newUid,
                                    name: intendedName,
                                    role: (intended && intended.role) || '',
                                    team: (intended && intended.team) || '',
                                    at: new Date()
                                },
                                { merge: true }
                            ).catch(() => {});
                        }
                        window.authClaims = {};
                        _authClaimsSynced = true;
                        currentUser = Object.assign({}, intended || {});
                        window.currentUser = currentUser;
                        window.saveSession(currentUser);
                        /* Re-bind listeners under the new UID/identity. */
                        if (typeof window.detachAppListeners === 'function') window.detachAppListeners();
                        applyThemeAndShowDashboard();
                        return window.authClaims;
                    } catch (e) {
                        console.warn('[auth] shared-device re-auth failed:', e);
                    }
                }
                /* Re-auth unavailable: keep the PIN identity for this session so
                   we never silently impersonate the other teammate. */
                currentUser = Object.assign({}, intended || {});
                window.currentUser = currentUser;
                window.authClaims = claims;
                _authClaimsSynced = true;
                return claims;
            }

            window.authClaims = claims;
            _authClaimsSynced = true;

            /* Session restore only sets window.currentUser (via main.js); the
               module-local currentUser is set by an explicit PIN login. Use
               either so a plain page reload also registers the hint. */
            const identity = intended;

            if (claims.kanjoRole) {
                currentUser = {
                    ...(identity || {}),
                    name: claims.kanjoName || (identity && identity.name) || '',
                    role: claims.kanjoRole,
                    team: claims.kanjoTeam || (identity && identity.team) || '',
                    repId: claims.kanjoRepId || ''
                };
                window.currentUser = currentUser;
                window.saveSession(currentUser);
            } else if (identity && fbUser.uid) {
                /* Pre-enrollment: register an untrusted hint so the operator can
                   map this device UID to a PIN identity before running the
                   claims script. Hints are never an authorization source. */
                window.setDoc(
                    window.doc(window.db, 'enrollment_requests', fbUser.uid),
                    {
                        uid: fbUser.uid,
                        name: identity.name || '',
                        role: identity.role || '',
                        team: identity.team || '',
                        at: new Date()
                    },
                    { merge: true }
                ).catch(() => {});
            }
            return claims;
        }
    } catch (err) {
        console.warn('[auth] claims sync failed:', err);
    }
    return window.authClaims;
};

/* Force a re-read of the token (e.g. right after claims were provisioned). */
window.syncAuthClaims = async () => {
    _authClaimsSynced = false;
    return window.ensureAuthClaims();
};

async function login(pinOverride = null) {
    if (window.authReady) { try { await window.authReady; } catch (e) {} }
    const pinEl = document.getElementById('pinInput');
    const rawPin = (pinOverride != null && pinOverride !== '')
        ? pinOverride
        : (pinEl ? pinEl.value : '');
    const pin = String(rawPin == null ? '' : rawPin).trim();
    const identity = resolveIdentity(pin);
    if (identity) {
        /* Keep the PIN on the session identity (without mutating the shared
           constants entry) so PIN-scoped screens such as the authorization
           issuance view can re-check the operator after a reload. */
        currentUser = Object.assign({}, identity, { pin: pin });
        window.currentUser = currentUser;
        window.saveSession(currentUser);
        if (window.kanjoAuditLogLogin) window.kanjoAuditLogLogin();
        /* Paint the dashboard and attach listeners immediately: never block the
           UI on the token/claims round-trip. Claims reconciliation runs in the
           background and re-applies the theme if it changes the identity. */
        applyThemeAndShowDashboard();
        /* Fold stored granular permissions / super-admin flag onto this session
           (cache-first) and re-render the shell so the exclusive UAM tab shows. */
        if (typeof window.kanjoUamApplyPermissions === 'function') {
            window.kanjoUamApplyPermissions(currentUser).then(() => {
                applyThemeAndShowDashboard();
                try { if (window.kanjoWorkspace && window.kanjoWorkspace.refresh) window.kanjoWorkspace.refresh(); } catch (_) { /* ignore */ }
            }).catch(() => {});
        }
        resetIdleTimer();
        const intendedIdentity = currentUser;
        const beforeKey = [intendedIdentity.name, intendedIdentity.role, intendedIdentity.team].join('|');
        if (typeof window.ensureAuthClaims === 'function') {
            window.ensureAuthClaims(intendedIdentity).then(() => {
                currentUser = window.currentUser || currentUser;
                window.saveSession(currentUser);
                const afterKey = [currentUser.name, currentUser.role, currentUser.team].join('|');
                if (afterKey !== beforeKey && typeof window.detachAppListeners === 'function') {
                    window.detachAppListeners();
                }
                applyThemeAndShowDashboard();
                if (window.lastSnapshot && typeof renderDashboard === 'function') renderDashboard(window.lastSnapshot);
            }).catch(() => {});
        }
    } else { 
        if(pinOverride == null) {
            if(window.showToast) window.showToast("رمز الدخول غير صحيح", false);
            else alert("رمز الدخول غير صحيح");
        }
    }
}
window.login = login;

const afterAuthReady = () => Promise.resolve(window.authReady).catch(() => null);

function applyThemeAndShowDashboard() {
    // هذه الأسطر ستقوم بمزامنة المستخدم لو كان هناك تسجيل دخول تلقائي
    currentUser = window.currentUser || currentUser;
    if (!currentUser) return; 

    if(currentUser.team === 'Fox Team' || currentUser.team === 'Power Team') applyTeamTheme(currentUser.team);
    document.getElementById('loginSection').classList.add('hidden'); 

    const isAccounting = (currentUser.role === 'accounting');
    const isSuperAdmin = (typeof window.kanjoIsSuperAdminRole === 'function' && window.kanjoIsSuperAdminRole());
    const isFounder = (currentUser.role === 'founder') || isSuperAdmin;
    const isMarketing = (currentUser.role === 'marketing');
    const isProductAudit = (currentUser.role === 'product_audit');
    
    if (isAccounting) {
        document.getElementById('accountingSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
        afterAuthReady().then(() => { if(window.loadPayrollSettingsFromFirebase) window.loadPayrollSettingsFromFirebase(); });
        const financialAccountingSection = document.getElementById('financialAccountingSection');
        if (financialAccountingSection) {
            financialAccountingSection.classList.remove('hidden');
            afterAuthReady().then(() => { if(window.loadFinancialProfilesForAccounting) window.loadFinancialProfilesForAccounting(); });
        }
    } else if (isMarketing) {
        /* Marketing is a first-class dashboard role now: it lands on the
           integrated marketing section instead of a separate page. */
        document.getElementById('accountingSection').classList.add('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
        const financialAccountingSection = document.getElementById('financialAccountingSection');
        if (financialAccountingSection) financialAccountingSection.classList.add('hidden');
        const marketingSection = document.getElementById('marketingSection');
        if (marketingSection) marketingSection.classList.remove('hidden');
        afterAuthReady().then(() => { if (typeof window.initMarketingDashboard === 'function') window.initMarketingDashboard(); });
    } else {
        document.getElementById('accountingSection').classList.add('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        const financialAccountingSection = document.getElementById('financialAccountingSection');
        if (financialAccountingSection) {
            financialAccountingSection.classList.add('hidden');
        }
        const marketingSection = document.getElementById('marketingSection');
        if (marketingSection) marketingSection.classList.add('hidden');
    }

    document.getElementById('userInfo').classList.remove('hidden'); 
    document.getElementById('userNameDisplay').innerText = currentUser.name; 

    const avatarContainer = document.getElementById('userAvatarContainer');
    if (avatarContainer) {
        const pic = (window.userImageMap && window.userImageMap[currentUser.name]) || '';
        if (typeof window.kanjoAvatarImg === 'function') {
            avatarContainer.innerHTML = window.kanjoAvatarImg(pic, currentUser.name, 'w-7 h-7 rounded-full object-cover border border-purple-300 shadow-sm');
        } else if (pic) {
            avatarContainer.innerHTML = `<img src="${pic}" alt="${currentUser.name}" decoding="async" class="w-7 h-7 rounded-full object-cover border border-purple-300 shadow-sm">`;
        } else {
            avatarContainer.innerHTML = `<img src="logo.png" alt="Kanjo" decoding="async" class="w-7 h-7 rounded-full object-contain p-0.5 bg-white border border-purple-200">`;
        }
    }
    
    const isMahmoud = (window.canManageContracts ? window.canManageContracts() : false);
    const isAdmin = (currentUser.role === 'admin') || isSuperAdmin;
    const isRep = (currentUser.role === 'rep');
    const isDataEntry = (currentUser.role === 'data_entry');
    const canViewLive = !isDataEntry && (isMahmoud || isFounder);
    /* Granular micro-RBAC resolver: an explicit per-user override wins over the
       legacy predicate (the 2nd arg), so pre-UAM behaviour is preserved for
       every user who was not hand-tuned in the permission matrix. */
    const canGate = (key, legacy) => (typeof window.kanjoCan === 'function')
        ? window.kanjoCan(key, legacy) : legacy;
    
    if (!isAccounting && !isMarketing) {
        document.getElementById('advancedDashboard').classList.toggle('hidden', !canGate('canViewAnalytics', canViewLive));
        /* Compact action buttons; the bulky forms now live inside their modals.
           Granular micro-RBAC: the assign-task (create tasks) and Excel-export
           buttons honour the per-user permission matrix — an explicit override
           (true or false) wins over the base role. */
        const canCreateTasks = (typeof window.kanjoCan === 'function')
            ? (window.kanjoCan('canCreateTasks') && !isDataEntry)
            : (isMahmoud && isAdmin && !isDataEntry);
        const assignTaskBtn = document.getElementById('assignTaskBtn');
        if (assignTaskBtn) assignTaskBtn.classList.toggle('hidden', !canCreateTasks);
        const canExportExcel = (typeof window.kanjoCan === 'function')
            ? window.kanjoCan('canExportExcel', canViewLive)
            : canViewLive;
        const exportProductsBtn = document.getElementById('openExportProductsBtn');
        if (exportProductsBtn) exportProductsBtn.classList.toggle('hidden', !canExportExcel);
        document.getElementById('notificationsWrapper').classList.toggle('hidden', !canGate('canViewNotifications', canViewLive));
        /* Data-entry and the product-audit team are not operations users: hide
           the day-task board so their screen is focused on the catalog. */
        const hideTasks = !canGate('canViewTasks', !(isDataEntry || isProductAudit));
        const searchWrapper = document.getElementById('tasksSearchWrapper');
        if (searchWrapper) searchWrapper.classList.toggle('hidden', hideTasks);
        const tasksContainer = document.getElementById('tasksContainer');
        if (tasksContainer) tasksContainer.classList.toggle('hidden', hideTasks);
        const tasksDateNav = document.getElementById('tasksDateNav');
        if (tasksDateNav) tasksDateNav.classList.toggle('hidden', hideTasks);
        
        const founderPayrollSummaryBox = document.getElementById('founderPayrollSummaryBox');
        if (founderPayrollSummaryBox) {
            founderPayrollSummaryBox.classList.toggle('hidden', !canGate('canViewFinance', isFounder && !isDataEntry));
        }

        const quickLinksWalletBanner = document.getElementById('quickLinksWalletBanner');
        if (quickLinksWalletBanner) {
            quickLinksWalletBanner.classList.toggle('hidden', !canGate('canViewFinancialProfile', isRep && !isDataEntry));
        }

        const financialProfileBtnWrapper = document.getElementById('financialProfileBtnWrapper');
        if (financialProfileBtnWrapper) {
            financialProfileBtnWrapper.classList.toggle('hidden', !canGate('canViewFinancialProfile', isRep && !isDataEntry));
        }

        const financialProfileBanner = document.getElementById('financialProfileBanner');
        if (financialProfileBanner) {
            financialProfileBanner.classList.toggle('hidden', !canGate('canViewFinancialProfile', isRep && !isDataEntry));
        }

        if (typeof window.renderCatalogWidgets === 'function') {
            window.renderCatalogWidgets();
        }

        if (typeof window.renderFounderAuditWidget === 'function') {
            window.renderFounderAuditWidget();
        }

        if (isRep && window.refreshFinancialProfileBanner) {
            window.refreshFinancialProfileBanner();
        }
        
        const isMahmoudOps = (typeof window.isMahmoudOpsUser === 'function')
            ? window.isMahmoudOpsUser()
            : String((currentUser && currentUser.name) || '').includes('محمود');

        const adminTransferNavBtnWrapper = document.getElementById('adminTransferNavBtnWrapper');
        if (adminTransferNavBtnWrapper) {
            adminTransferNavBtnWrapper.classList.toggle('hidden', !canGate('canManageTransferQueue', isMahmoudOps));
        }

        const contractsNavBtnWrapper = document.getElementById('contractsNavBtnWrapper');
        if (contractsNavBtnWrapper) {
            contractsNavBtnWrapper.classList.toggle('hidden', !canGate('canManageContracts', isMahmoudOps));
        }

        const archivedReportsBtnWrapper = document.getElementById('archivedReportsBtnWrapper');
        if (archivedReportsBtnWrapper) {
            archivedReportsBtnWrapper.classList.toggle('hidden', !canGate('canArchiveReports', isMahmoudOps));
        }

        const kpiNavBtnWrapper = document.getElementById('kpiNavBtnWrapper');
        if (kpiNavBtnWrapper) {
            const canViewKpi = (typeof window.canViewPersonalKpi === 'function')
                ? window.canViewPersonalKpi()
                : false;
            kpiNavBtnWrapper.classList.toggle('hidden', !canViewKpi);
            const kpiNavLabel = kpiNavBtnWrapper.querySelector('span');
            if (kpiNavLabel) kpiNavLabel.textContent = isRep ? 'لوحة أدائي' : 'لوحة المؤشرات';
        }

        const blackBoxNavBtnWrapper = document.getElementById('blackBoxNavBtnWrapper');
        if (blackBoxNavBtnWrapper) {
            const canBlackBox = (typeof window.kanjoAuditCanView === 'function')
                ? window.kanjoAuditCanView()
                : false;
            blackBoxNavBtnWrapper.classList.toggle('hidden', !canBlackBox);
        }

        /* Marketing results are reachable from the header nav for oversight
           (marketing itself lands on the section, so the button is redundant). */
        const marketingNavBtnWrapper = document.getElementById('marketingNavBtnWrapper');
        if (marketingNavBtnWrapper) {
            marketingNavBtnWrapper.classList.toggle('hidden', !canGate('canViewMarketing', isAdmin || isFounder));
        }

        /* Product-audit team: a one-tap jump into the all-products catalog grid. */
        const catalogAuditNavBtnWrapper = document.getElementById('catalogAuditNavBtnWrapper');
        if (catalogAuditNavBtnWrapper) {
            catalogAuditNavBtnWrapper.classList.toggle('hidden', !canGate('canViewAllCatalogProducts', isProductAudit));
        }

        const canIssueAuthorization = (typeof window.kanjoCanIssueAuthorization === 'function')
            ? window.kanjoCanIssueAuthorization()
            : false;
        const authorizationNavBtnWrapper = document.getElementById('authorizationNavBtnWrapper');
        if (authorizationNavBtnWrapper) {
            authorizationNavBtnWrapper.classList.toggle('hidden', !canIssueAuthorization);
        }
        /* A non-authorized session must never inherit the letter view left open
           by a previous operator on a shared device. */
        const authorizationView = document.getElementById('authorizationView');
        if (authorizationView && !canIssueAuthorization) {
            authorizationView.classList.add('hidden');
            authorizationView.removeAttribute('data-built');
        }

        /* Data-Entry menu importer (PIN 2468). Hidden from every other role and
           force-closed on a non-authorized session, same as the letter view. */
        const canImportMenu = (typeof window.isMenuImportUser === 'function') ? window.isMenuImportUser() : false;
        if (typeof window.renderMenuImportNav === 'function') {
            window.renderMenuImportNav();
        }
        const menuImportModal = document.getElementById('menuImportModal');
        if (menuImportModal && !canImportMenu) menuImportModal.classList.add('hidden');

        if (typeof window.kpiStartActiveTracker === 'function') {
            window.kpiStartActiveTracker();
        }
        
        if(canViewLive && window.setupAdvancedFilterElements) {
            window.setupAdvancedFilterElements();
        }

        /* Field reps land directly on their personalised performance screen,
           which now serves as their native home view. */
        if (isRep && !isDataEntry && typeof window.openKpiDashboard === 'function') {
            afterAuthReady().then(() => {
                if (window._kpiDashboardOpenedOnLogin) return;
                window._kpiDashboardOpenedOnLogin = true;
                window.openKpiDashboard();
            });
        }
    }

    /* Modular workspace shell: single-active-view navigation. Must run AFTER
       the role/section visibility above so it never fights the RBAC gating. */
    if (window.kanjoWorkspace && typeof window.kanjoWorkspace.refresh === 'function') {
        try { window.kanjoWorkspace.refresh(); } catch (err) { console.error('[workspace] refresh failed', err); }
    }

    /* Super-admin "Oval Office" VIP theme. Runs AFTER the workspace refresh so
       the sidebar role badge is not overwritten; a no-op for every other role. */
    if (typeof window.kanjoApplyExecutiveTheme === 'function') {
        try { window.kanjoApplyExecutiveTheme(); } catch (_) { /* ignore */ }
    }
    
    afterAuthReady().then(() => {
        if (window._appListenersRegistered) return;
        /* The marketing section only needs campaign_leads, loaded on demand when
           the section is shown; no operational listeners belong to it. */
        if (isMarketing) return;
        window._appListenersRegistered = true;
        if (!window._appListenerUnsubscribers) window._appListenerUnsubscribers = [];

        if(canViewLive || isAdmin || isAccounting) {
            const paintNotifs = (notifs) => {
                if(typeof updateNotificationsUI !== 'undefined') updateNotificationsUI(notifs);
            };
            /* Prefer the direct REST transport when the SDK's streaming transport
               is blocked: an onSnapshot here would only 400 on the 'Listen'
               channel and retry forever. */
            if (typeof window.kanjoRestPreferred === 'function' && window.kanjoRestPreferred()) {
                /* One-shot initial load ONLY. Automated background polling is
                   forbidden (it leaked tens of thousands of reads); freshness is
                   manual via a page refresh. No setInterval here. */
                window.kanjoRest.runQuery('notifications', [], 50, { orderBy: [{ field: 'timestamp', direction: 'DESCENDING' }] })
                    .then((rows) => { if (Array.isArray(rows)) paintNotifs(rows); })
                    .catch(() => {});
            } else if (typeof onSnapshot !== 'undefined' && typeof query !== 'undefined' && typeof collection !== 'undefined' && typeof db !== 'undefined' && typeof orderBy !== 'undefined' && typeof limit !== 'undefined') {
                const unsub = onSnapshot(query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(50)), (snap) => {
                    const notifs = [];
                    snap.forEach(d => notifs.push({id: d.id, ...d.data()}));
                    paintNotifs(notifs);
                });
                window._appListenerUnsubscribers.push(unsub);
            }
            if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }

        const isMahmoudOps = (typeof window.isMahmoudOpsUser === 'function')
            ? window.isMahmoudOpsUser()
            : String((currentUser && currentUser.name) || '').includes('محمود');

        /* The pending-transfer badge is only ever surfaced to the Ops owner, so
           the global live listener is attached for that single role instead of
           every non-data-entry user. Reps no longer hold a persistent global
           subscription; they get one bounded, self-scoped read below so the
           cross-team search can still flag a request they already submitted. */
        const applyPendingTransfers = (items) => {
            if (window.pendingTransferTaskIds) window.pendingTransferTaskIds.clear();
            items.forEach((req) => { if (req && req.taskId && window.pendingTransferTaskIds) window.pendingTransferTaskIds.add(req.taskId); });
            const transferBadge = document.getElementById('transferBadge');
            if (transferBadge) {
                if (items.length > 0) transferBadge.classList.remove('hidden');
                else transferBadge.classList.add('hidden');
            }
            if (window.lastSnapshot && !isAccounting && typeof renderDashboard !== 'undefined') renderDashboard(window.lastSnapshot);
        };
        if (isMahmoudOps && !isDataEntry && typeof window.kanjoRestPreferred === 'function' && window.kanjoRestPreferred()
            && typeof where !== 'undefined') {
            /* One-shot initial load ONLY. Automated background polling is
               forbidden (it leaked reads); the badge refreshes on page reload. */
            window.kanjoRest.runQuery('transferRequests', [ where("status", "==", "pending") ], 50, { select: ['status', 'taskId'] })
                .then((rows) => { if (Array.isArray(rows)) applyPendingTransfers(rows); })
                .catch(() => {});
        } else if (isMahmoudOps && !isDataEntry && typeof onSnapshot !== 'undefined' && typeof query !== 'undefined' && typeof collection !== 'undefined' && typeof db !== 'undefined' && typeof where !== 'undefined' && typeof limit !== 'undefined') {
            const unsub = onSnapshot(query(collection(db, "transferRequests"), where("status", "==", "pending"), limit(50)), (snap) => {
                const items = [];
                snap.forEach(docSnap => items.push(docSnap.data()));
                if(window.pendingTransferTaskIds) window.pendingTransferTaskIds.clear();
                snap.forEach(docSnap => {
                    const req = docSnap.data();
                    if (req.taskId && window.pendingTransferTaskIds) window.pendingTransferTaskIds.add(req.taskId);
                });

                const transferBadge = document.getElementById('transferBadge');
                if (transferBadge) {
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
        } else if (isRep && !isDataEntry && typeof getDocs === 'function' && typeof query === 'function' && typeof collection === 'function' && typeof db !== 'undefined' && typeof where === 'function') {
            /* One-shot self-scoped read (no live subscription): only the rep's
               own requests, so a pending transfer shows as already submitted. */
            Promise.resolve()
                .then(() => getDocs(query(collection(db, "transferRequests"), where("requestedBy", "==", currentUser.name))))
                .then((snap) => {
                    if (!window.pendingTransferTaskIds) window.pendingTransferTaskIds = new Set();
                    snap.forEach((docSnap) => {
                        const req = docSnap.data() || {};
                        if (req.status === 'pending' && req.taskId) window.pendingTransferTaskIds.add(req.taskId);
                    });
                    if (window.lastSnapshot && typeof renderDashboard !== 'undefined') renderDashboard(window.lastSnapshot);
                })
                .catch((err) => console.error('[transferRequests] self-scoped read failed:', err));
        }

        /* Merchant records (authoritative drive-folder binding + merchantId).
           Loaded once through the shared TTL cache (window.loadMerchantsCache)
           instead of an unbounded onSnapshot. The directory changes rarely and
           is invalidated after any in-app merchant write, so a long-lived
           listener only burned reads. It still keeps window.merchantsById fresh
           enough for the merchant card / profile to render the official Drive
           button. */
        if (!isDataEntry && typeof window.loadMerchantsCache === 'function') {
            window.loadMerchantsCache()
                .then(() => {
                    if (window.lastSnapshot && !isAccounting && typeof renderDashboard !== 'undefined' && window.hasRenderedData) {
                        renderDashboard(window.lastSnapshot);
                    }
                })
                .catch((err) => console.error('[merchants] cache load failed:', err));
        }

        if (!isDataEntry && typeof window.startCatalogListeners === 'function') window.startCatalogListeners();
        /* The audit role edits the catalog only: skip the payroll + day-task
           listeners, which it has no use for. */
        if (!isDataEntry && !isProductAudit && typeof loadPayrollSettingsAndCalculateFounderSummary !== 'undefined') loadPayrollSettingsAndCalculateFounderSummary();
        if (!isDataEntry && !isProductAudit && typeof listenToTasks !== 'undefined') listenToTasks();
        if (isDataEntry && typeof window.renderStagingCatalogWidgets === 'function') window.renderStagingCatalogWidgets();

        /* Reps/data-entry/audit skip the heavy task archive, but the catalog's
           merchant picker still needs the finalized (signed) merchants. Load the
           tiny, field-masked signed-task set so the dropdown populates on boot. */
        if ((isRep || isDataEntry || isProductAudit) && typeof window.ensureFinalizedMerchantsLoaded === 'function') {
            window.ensureFinalizedMerchantsLoaded();
        }
    });
}

/* Detach every registered Firestore real-time listener. Without this the
   `_appListenerUnsubscribers` registry was write-only, so listeners stayed
   attached for the whole page lifetime. Call before logout / re-auth. */
window.detachAppListeners = () => {
    const subscribers = Array.isArray(window._appListenerUnsubscribers) ? window._appListenerUnsubscribers.slice() : [];
    subscribers.forEach((unsub) => {
        try {
            if (typeof unsub === 'function') unsub();
        } catch (err) {
            console.error('[listeners] detach failed:', err);
        }
    });
    window._appListenerUnsubscribers = [];
    window._appListenersRegistered = false;
    window._catalogListenerStarted = false;
    window._tasksListenerStarted = false;
    window._financialProfilesListenerStarted = false;
    if (typeof window.resetMarketingDashboard === 'function') window.resetMarketingDashboard();
};

window.applyThemeAndShowDashboard = applyThemeAndShowDashboard;
window.logout = () => {
    window.detachAppListeners();
    window.clearSession();
    window.location.reload();
};

export { SESSION_KEY, IDLE_TIMEOUT, resetIdleTimer, applyThemeAndShowDashboard, login };
