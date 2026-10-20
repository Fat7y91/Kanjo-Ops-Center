/* Kanjo Ops — User Access Management (UAM) + Ghost super-admin
 * ---------------------------------------------------------------------------
 * A Firestore-backed RBAC layer that rides ON TOP of the existing PIN / claims
 * identity — it never replaces it:
 *   - `users/{docId}` stores each operator's GRANULAR permissions + a
 *     `superAdmin` flag. docId = email (preferred) → Firebase uid → pin → name.
 *   - On login/boot the current identity is matched to its `users` doc and the
 *     permission map is folded onto `window.currentUser.permissions`, so
 *     `window.kanjoCan(perm, legacyDefault)` can gate actions.
 *   - `super_admin` (Dr. Ahmed Fathy / the elevated founder) inherently holds
 *     EVERY permission and is invisible to the Black Box (see audit.js).
 *
 * Zero-bleed: the collection is read cache-first (one small REST list), and
 * every toggle patches ONLY the one user doc + updates the in-memory cache —
 * never a full re-read.
 */
(function () {
    'use strict';

    const UAM_USERS_COLLECTION = 'users';
    const SUPER_ADMIN_ROLE = 'super_admin';
    const UAM_CACHE_TTL = 60 * 1000;

    /* Identity auto-provisioning: an EXACT (normalized) name/email match is
       promoted to super_admin on sight, so the founder can simply sign in with
       the configured profile. Extend the lists to onboard another principal. */
    const SUPER_ADMIN_IDENTITIES = {
        names: ['د. أحمد فتحي', 'د أحمد فتحي', 'أحمد فتحي', 'ahmed fathy', 'dr. ahmed fathy', 'dr ahmed fathy'],
        emails: []
    };

    /* The granular permission catalogue — the single source of truth shared by
       the matrix UI and the enforcers. `group` clusters the columns in the
       checkbox matrix so the grid stays legible. */
    /* Exhaustive audit of every RBAC-gated surface in the app (auth element
       gates, audit/kpi/marketing/catalog/authorization/menu-import guards).
       Grouped so the checkbox grid stays legible. `legacy` enforcers pass the
       pre-UAM predicate as `legacyDefault`, so a user with NO explicit override
       keeps today's exact behaviour and only an explicit toggle changes it. */
    const UAM_PERMISSIONS = [
        /* المهام والعمليات */
        { key: 'canCreateTasks', label: 'إضافة/تعيين مهام', icon: 'fa-list-check', group: 'المهام والعمليات' },
        { key: 'canApproveTasks', label: 'اعتماد المهام', icon: 'fa-check-double', group: 'المهام والعمليات' },
        { key: 'canViewTasks', label: 'لوحة المهام اليومية', icon: 'fa-clipboard-list', group: 'المهام والعمليات' },
        { key: 'canManageTransferQueue', label: 'طلبات النقل', icon: 'fa-right-left', group: 'المهام والعمليات' },
        { key: 'canArchiveReports', label: 'أرشيف التقارير', icon: 'fa-box-archive', group: 'المهام والعمليات' },
        /* المنتجات والكتالوج */
        { key: 'canBrowseCatalog', label: 'تصفح منتجات الفريق', icon: 'fa-magnifying-glass', group: 'المنتجات والكتالوج' },
        { key: 'canViewAllCatalogProducts', label: 'عرض كل المنتجات', icon: 'fa-layer-group', group: 'المنتجات والكتالوج' },
        { key: 'canAddProducts', label: 'إضافة منتجات', icon: 'fa-plus', group: 'المنتجات والكتالوج' },
        { key: 'canEditProducts', label: 'تعديل منتجات', icon: 'fa-pen-to-square', group: 'المنتجات والكتالوج' },
        { key: 'canReviewImages', label: 'مهام معالجة الصور', icon: 'fa-image', group: 'المنتجات والكتالوج' },
        { key: 'canDeleteProducts', label: 'حذف منتجات', icon: 'fa-trash-can', group: 'المنتجات والكتالوج' },
        { key: 'canExportExcel', label: 'تصدير إكسل', icon: 'fa-file-excel', group: 'المنتجات والكتالوج' },
        { key: 'canUseDataEntryTools', label: 'أدوات إدخال البيانات', icon: 'fa-keyboard', group: 'المنتجات والكتالوج' },
        { key: 'canImportProductsExcel', label: 'استيراد منتجات Excel', icon: 'fa-file-excel', group: 'المنتجات والكتالوج' },
        /* التجار والعقود */
        { key: 'canEditMerchant', label: 'تعديل بيانات التاجر', icon: 'fa-store', group: 'التجار والعقود' },
        { key: 'canManageContracts', label: 'إدارة العقود', icon: 'fa-file-signature', group: 'التجار والعقود' },
        /* المالية */
        { key: 'canViewFinance', label: 'الرواتب والماليات', icon: 'fa-coins', group: 'المالية' },
        { key: 'canViewFinancialProfile', label: 'كشف حساب مندوب', icon: 'fa-wallet', group: 'المالية' },
        /* التقارير والمؤشرات */
        { key: 'canViewKpi', label: 'مؤشرات الأداء', icon: 'fa-chart-line', group: 'التقارير والمؤشرات' },
        { key: 'canViewFounderAudit', label: 'تدقيق المؤسسين', icon: 'fa-clipboard-check', group: 'التقارير والمؤشرات' },
        { key: 'canViewAnalytics', label: 'لوحة تحليل الأداء', icon: 'fa-chart-pie', group: 'التقارير والمؤشرات' },
        /* النظام والأمان */
        { key: 'canViewNotifications', label: 'الإشعارات', icon: 'fa-bell', group: 'النظام والأمان' },
        { key: 'canViewMarketing', label: 'بوابة التسويق', icon: 'fa-bullhorn', group: 'النظام والأمان' },
        { key: 'canViewBlackBox', label: 'الصندوق الأسود', icon: 'fa-user-secret', group: 'النظام والأمان' },
        { key: 'canIssueAuthorization', label: 'إصدار تفويض تعاقد', icon: 'fa-file-shield', group: 'النظام والأمان' },
        { key: 'canImportMenu', label: 'استيراد المنيو', icon: 'fa-file-import', group: 'النظام والأمان' },
        { key: 'canManageUsers', label: 'إدارة المستخدمين', icon: 'fa-users-gear', group: 'النظام والأمان' }
    ];
    const UAM_PERMISSION_KEYS = UAM_PERMISSIONS.map((p) => p.key);
    /* Legacy singular aliases (older docs / call sites) → canonical key. */
    const UAM_PERMISSION_ALIASES = {
        canAddProduct: 'canAddProducts',
        canDeleteProduct: 'canDeleteProducts',
        canEditProduct: 'canEditProducts',
        canViewKpiDashboard: 'canViewKpi',
        canViewPersonalKpi: 'canViewKpi',
        canViewCatalog: 'canBrowseCatalog'
    };

    /* Baseline a role is assumed to hold when its `users` doc carries no explicit
       override. The admin ("Manager") role is deliberately broad — the whole
       point of the matrix is to REVOKE individual actions from it per user. */
    /* Baseline a role is assumed to hold when its `users` doc carries no explicit
       override. The admin ("Manager") role is deliberately broad — the whole
       point of the matrix is to REVOKE individual actions from it per user.
       The Black-Box / authorization / menu-import / staging caps are NOT part
       of the admin default (they stay dedicated grants); enforcers still pass
       the legacy predicate so nothing regresses. */
    const UAM_ROLE_DEFAULTS = {
        super_admin: UAM_PERMISSION_KEYS.slice(),
        founder: UAM_PERMISSION_KEYS.slice(),
        admin: ['canCreateTasks', 'canApproveTasks', 'canViewTasks', 'canManageTransferQueue',
            'canArchiveReports', 'canBrowseCatalog', 'canViewAllCatalogProducts', 'canAddProducts',
            'canEditProducts', 'canDeleteProducts', 'canExportExcel', 'canEditMerchant',
            'canManageContracts', 'canViewFinance', 'canViewFinancialProfile', 'canViewKpi',
            'canViewAnalytics', 'canViewNotifications', 'canViewMarketing'],
        product_audit: ['canBrowseCatalog', 'canViewAllCatalogProducts', 'canAddProducts',
            'canEditProducts', 'canDeleteProducts'],
        rep: ['canBrowseCatalog', 'canAddProducts', 'canEditProducts',
            'canViewKpi', 'canViewFinancialProfile'],
        data_entry: ['canUseDataEntryTools', 'canImportMenu', 'canImportProductsExcel'],
        accounting: ['canViewFinance', 'canExportExcel', 'canViewNotifications'],
        marketing: ['canViewMarketing'],
        marketing_agency: [],
        media: []
    };

    /* The role list surfaced in the matrix UI (value → Arabic label). */
    const UAM_ROLES = [
        { value: 'admin', label: 'مدير (Manager)' },
        { value: 'founder', label: 'مؤسس' },
        { value: 'rep', label: 'مندوب' },
        { value: 'accounting', label: 'محاسبة' },
        { value: 'product_audit', label: 'تدقيق منتجات' },
        { value: 'data_entry', label: 'إدخال بيانات' },
        { value: 'marketing', label: 'تسويق' },
        { value: 'media', label: 'ميديا' },
        { value: 'super_admin', label: 'مشرف عام' }
    ];

    const UAM_USER_FIELDS = ['uid', 'email', 'name', 'pin', 'role', 'team', 'superAdmin',
        'permissions', 'active', 'updatedAt', 'updatedBy'];

    const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const userName = () => String((window.currentUser && window.currentUser.name) || '');

    const escapeHtml = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /* ── Super-admin resolution ───────────────────────────────────────────── */
    const isSuperAdminIdentity = (u) => {
        if (!u) return false;
        const name = norm(u.name);
        const email = norm(u.email);
        if (name && SUPER_ADMIN_IDENTITIES.names.some((n) => norm(n) === name)) return true;
        if (email && SUPER_ADMIN_IDENTITIES.emails.some((e) => norm(e) === email)) return true;
        return false;
    };

    window.kanjoIsSuperAdmin = () => {
        const u = window.currentUser;
        if (!u) return false;
        if (String(u.role || '') === SUPER_ADMIN_ROLE) return true;
        if (u.superAdmin === true) return true;
        return isSuperAdminIdentity(u);
    };

    /* Ghost mode: a super admin leaves NO trace in any audit/history surface. */
    window.kanjoUamIsGhost = () => window.kanjoIsSuperAdmin();

    /* ── Permission gate used across the app ──────────────────────────────────
       Precedence (STRICT micro-RBAC):
         1. super_admin → always allowed.
         2. the user's explicit `permissions[key]` (true OR false) — this
            OVERRIDES the base role in both directions.
         3. the caller's `legacyDefault` when supplied (keeps pre-UAM behaviour).
         4. the base role's default (UAM_ROLE_DEFAULTS). */
    const canonicalKey = (perm) => UAM_PERMISSION_ALIASES[perm] || perm;

    window.kanjoRoleDefault = (role, perm) => {
        const key = canonicalKey(perm);
        const defs = UAM_ROLE_DEFAULTS[String(role || '')] || [];
        return defs.indexOf(key) !== -1;
    };

    window.kanjoCan = (perm, legacyDefault) => {
        if (window.kanjoIsSuperAdmin()) return true;
        const key = canonicalKey(perm);
        const u = window.currentUser;
        const p = u && u.permissions;
        if (p && typeof p === 'object') {
            if (typeof p[key] === 'boolean') return p[key];      /* explicit wins */
            for (const alias in UAM_PERMISSION_ALIASES) {
                if (UAM_PERMISSION_ALIASES[alias] === key && typeof p[alias] === 'boolean') return p[alias];
            }
        }
        if (typeof legacyDefault === 'boolean') return legacyDefault;
        return window.kanjoRoleDefault(u && u.role, key);
    };

    /* ── Doc-id + identity matching ───────────────────────────────────────── */
    const normalizeDocId = (v) => {
        const s = String(v == null ? '' : v).trim();
        if (!s) return '';
        if (/^[pn]:/.test(s)) return s;                      /* already normalized */
        if (s.indexOf('@') !== -1) return s.toLowerCase();
        if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;        /* Firebase uid */
        if (/^\d{3,8}$/.test(s)) return 'p:' + s;            /* PIN */
        return 'n:' + s.replace(/\s+/g, ' ').toLowerCase();  /* display name */
    };

    const candidateDocIds = (u) => {
        if (!u) return [];
        const raw = [normalizeDocId(u.email), normalizeDocId(u.uid || u.repId),
            normalizeDocId(u.name), normalizeDocId(u.pin)];
        const seen = new Set();
        return raw.filter((id) => { if (!id || seen.has(id)) return false; seen.add(id); return true; });
    };

    const matchUserDoc = (rows, u) => {
        if (!Array.isArray(rows) || !u) return null;
        const email = norm(u.email);
        const uid = norm(u.uid || u.repId);
        const name = norm(u.name);
        const pin = norm(u.pin);
        return rows.find((r) => {
            if (!r) return false;
            if (email && norm(r.email) === email) return true;
            if (uid && norm(r.uid) === uid) return true;
            if (pin && norm(r.pin) === pin && norm(r.name) === name) return true;
            return name && norm(r.name) === name;
        }) || null;
    };

    /* ── Load (persistent cache-first, TTL-gated) ────────────────────────────
       Zero-bleed: the resolved `users` docs are mirrored in localStorage so the
       NEXT boot can fold a session's permissions with NO Firestore read at all.
       The network is touched only when the store is missing/expired (or the
       super-admin explicitly forces a refresh from the UAM panel). This replaces
       the previous per-boot full-collection read that made the shell sluggish. */
    let _uamCache = null;
    let _uamCacheAt = 0;

    const UAM_STORE_KEY = 'kanjo_uam_store_v1';
    const UAM_STORE_TTL = 10 * 60 * 1000;
    const UAM_LOAD_RETRY_MS = 60 * 1000;

    let _uamLoadPromise = null;
    let _uamLoadFailedAt = 0;

    /* The `users` collection is readable by super_admins only. Everyone else
       folds the persisted roster/local store — attempting the list for a
       manager produced a 403 on every boot (session restore + PIN login). */
    const canListUsers = () => {
        try {
            return typeof window.kanjoIsSuperAdmin === 'function' && !!window.kanjoIsSuperAdmin();
        } catch (_) {
            return false;
        }
    };

    const readStore = () => {
        try {
            const raw = localStorage.getItem(UAM_STORE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return (parsed && typeof parsed === 'object' && parsed.docs) ? parsed : { fetchedAt: 0, docs: {} };
        } catch (_) { return { fetchedAt: 0, docs: {} }; }
    };
    const writeStore = (store) => {
        try { localStorage.setItem(UAM_STORE_KEY, JSON.stringify(store)); } catch (_) { /* quota / private mode */ }
    };
    const persistDocs = (rows) => {
        const store = readStore();
        (rows || []).forEach((r) => { if (r && r.id) store.docs[r.id] = r; });
        store.fetchedAt = Date.now();
        writeStore(store);
    };
    const storeRows = () => {
        const s = readStore();
        return Object.keys(s.docs).map((id) => s.docs[id]);
    };

    const currentUserStoreRows = () => {
        const u = window.currentUser;
        if (!u) return [];
        const hit = matchUserDoc(storeRows(), u);
        return hit ? [hit] : [];
    };

    const loadCurrentUserRows = async () => {
        const u = window.currentUser;
        if (!u || !window.kanjoRest || typeof window.kanjoRest.runQuery !== 'function') return [];
        const pin = String(u.pin == null ? (u.pinCode == null ? '' : u.pinCode) : u.pin).trim();
        const uid = String(u.uid || u.repId || '').trim();
        const queries = [];
        if (pin) queries.push(['pin', pin]);
        if (u.email) queries.push(['email', String(u.email).trim()]);
        if (uid) queries.push(['uid', uid]);
        if (u.name) queries.push(['name', String(u.name).trim()]);
        for (const [field, value] of queries) {
            if (!value) continue;
            try {
                const rows = await window.kanjoRest.runQuery(UAM_USERS_COLLECTION, [[field, 'EQUAL', value]], 20, { select: UAM_USER_FIELDS });
                const hits = (rows || []).filter((row) => row && row.active !== false);
                if (hits.length) {
                    persistDocs(hits);
                    return hits;
                }
            } catch (err) {
                console.warn('[uam] self user read failed:', err && err.message ? err.message : err);
                break;
            }
        }
        return [];
    };

    const allTruePermissions = () => {
        const out = {};
        UAM_PERMISSION_KEYS.forEach((k) => { out[k] = true; });
        return out;
    };

    const loadUsers = async ({ force = false } = {}) => {
        const now = Date.now();
        if (!force && Array.isArray(_uamCache) && _uamCache.length && (now - _uamCacheAt) < UAM_CACHE_TTL
            && (canListUsers() || matchUserDoc(_uamCache, window.currentUser))) {
            return _uamCache;
        }
        const store = readStore();
        /* Super-admin cache-first: a warm store serves instantly with NO network call. */
        if (!force && canListUsers() && store.fetchedAt && (now - store.fetchedAt) < UAM_STORE_TTL) {
            const rows = Object.keys(store.docs).map((id) => store.docs[id]);
            _uamCache = rows; _uamCacheAt = now; window.kanjoUamUsersCache = rows;
            return rows;
        }
        /* Authorization gate: never issue a full-list read the rules will deny. */
        if (!canListUsers()) {
            let rows = await loadCurrentUserRows();
            if (!rows.length) rows = currentUserStoreRows();
            if (!rows.length) rows = storeRows();
            _uamCache = rows;
            _uamCacheAt = rows.length ? now : 0;
            window.kanjoUamUsersCache = rows;
            return rows;
        }
        /* Collapse the duplicate boot callers (session restore + PIN login). */
        if (!force && _uamLoadPromise) return _uamLoadPromise;
        /* Short negative cache: do not hammer the same transient failure. */
        if (!force && _uamLoadFailedAt && (now - _uamLoadFailedAt) < UAM_LOAD_RETRY_MS) {
            const rows = storeRows();
            _uamCache = rows; _uamCacheAt = now; window.kanjoUamUsersCache = rows;
            return rows;
        }
        _uamLoadPromise = (async () => {
            try {
                let rows = [];
                if (window.kanjoRest && typeof window.kanjoRest.list === 'function') {
                    rows = await window.kanjoRest.list([UAM_USERS_COLLECTION], {
                        pageSize: 500, maxPages: 5, select: UAM_USER_FIELDS
                    });
                }
                if (!Array.isArray(rows)) rows = [];
                persistDocs(rows);
                _uamCache = rows; _uamCacheAt = Date.now(); window.kanjoUamUsersCache = rows;
                _uamLoadFailedAt = 0;
                return rows;
            } catch (err) {
                console.warn('[uam] users load failed:', err && err.message ? err.message : err);
                _uamLoadFailedAt = Date.now();
                const fallback = storeRows();
                _uamCache = fallback.length ? fallback : (_uamCache || []);
                window.kanjoUamUsersCache = _uamCache;
                return _uamCache;
            } finally {
                _uamLoadPromise = null;
            }
        })();
        return _uamLoadPromise;
    };
    window.kanjoUamLoad = loadUsers;

    /* ── Registry merge (Bug 1) ──────────────────────────────────────────────
       The authoritative roster of EXISTING users is the constants PIN table
       (`window.users`), not the Firestore `users` collection — which is empty
       on a fresh install. Until now the panel only listed Firestore docs, so a
       live system looked empty. We now render the UNION: every configured
       principal from `window.users`, enriched with its Firestore doc when one
       exists (the doc id stays canonical so toggles persist to the right doc). */
    /* `window.users` is a PIN-keyed registry object (`{ '2811': {...}, ... }`),
       though an array form is tolerated for forward-compatibility. Flatten it
       to rows and inject the map key as the `pin` so PIN-less entries survive. */
    const rosterUsers = () => {
        const src = window.users;
        if (!src) return [];
        if (Array.isArray(src)) return src;
        if (typeof src === 'object') {
            return Object.keys(src).map((pin) => Object.assign({ pin }, src[pin] || {}));
        }
        return [];
    };
    const mergeRosterRows = (fsRows) => {
        const fs = Array.isArray(fsRows) ? fsRows.slice() : [];
        const eq = (a, b) => a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
        const findIdx = (u) => fs.findIndex((r) => r && (
            eq(u.email, r.email) || eq(u.uid, r.uid) || (eq(u.pin, r.pin) && eq(u.name, r.name)) || eq(u.name, r.name)
        ));
        const out = [];
        rosterUsers().forEach((ru) => {
            if (!ru) return;
            const hit = findIdx(ru);
            if (hit !== -1) {
                const f = fs.splice(hit, 1)[0];
                out.push(Object.assign({}, ru, f, { _roster: true }));
            } else {
                out.push({
                    id: normalizeDocId(ru.email || ru.name || ru.pin),
                    name: ru.name || '', email: ru.email || '', pin: ru.pin || '',
                    role: ru.role || 'rep', _roster: true
                });
            }
        });
        fs.forEach((f) => out.push(f));
        const isSA = (x) => (x && (x.superAdmin === true || String(x.role || '') === SUPER_ADMIN_ROLE)) ? 0 : 1;
        out.sort((a, b) => (isSA(a) - isSA(b)) || String(a.name || a.id).localeCompare(String(b.name || b.id), 'ar'));
        return out;
    };
    window.kanjoUamMergeRoster = mergeRosterRows;

    /* ── Write one user doc (merge) + keep the cache warm ─────────────────── */
    const saveUserDoc = async (docId, patch) => {
        const id = normalizeDocId(docId);
        if (!id) throw new Error('[uam] invalid user id');
        const payload = Object.assign({}, patch, {
            updatedAt: new Date().toISOString(),
            updatedBy: userName()
        });
        if (window.kanjoRest && typeof window.kanjoRest.patch === 'function') {
            await window.kanjoRest.patch([UAM_USERS_COLLECTION, id], payload);
        } else if (window.setDoc && window.doc && window.db) {
            await window.setDoc(window.doc(window.db, UAM_USERS_COLLECTION, id), payload, { merge: true });
        } else {
            throw new Error('[uam] no writer available');
        }
        const list = Array.isArray(_uamCache) ? _uamCache : (_uamCache = []);
        const idx = list.findIndex((r) => r && r.id === id);
        const prev = idx >= 0 ? list[idx] : { id };
        const merged = Object.assign({}, prev, payload, { id });
        if (idx >= 0) list[idx] = merged; else list.push(merged);
        _uamCacheAt = Date.now();
        window.kanjoUamUsersCache = list;
        persistDocs([merged]);
        return merged;
    };
    window.kanjoUamSaveUser = saveUserDoc;

    /* ── Apply a user's stored permissions to the live session ────────────── */
    /* Fold a resolved user doc onto the live session (mutates `u`). Returns
       true only when the effective permissions / super-admin flag actually
       changed, so callers repaint ONLY on a real change (no flicker). */
    const foldDoc = (u, doc) => {
        const before = JSON.stringify({ p: u.permissions || {}, r: u.role, s: u.superAdmin === true });
        if (doc) {
            if (doc.permissions && typeof doc.permissions === 'object') {
                u.permissions = Object.assign({}, u.permissions, doc.permissions);
            }
            if (doc.superAdmin === true || String(doc.role || '') === SUPER_ADMIN_ROLE) {
                u.role = SUPER_ADMIN_ROLE;
                u.superAdmin = true;
            }
            if (doc.uid) u.uid = u.uid || doc.uid;
            if (doc.email) u.email = u.email || doc.email;
            /* Team assignment (reps) travels with the doc so a reassigned rep
               lands on the right team without a local-table edit. */
            if (doc.team) u.team = doc.team;
            u.uamDocId = doc.id;
        }
        /* Identity auto-provisioning (exact configured principal). */
        if (isSuperAdminIdentity(u)) {
            u.role = SUPER_ADMIN_ROLE;
            u.superAdmin = true;
            u.permissions = Object.assign({}, u.permissions, allTruePermissions());
        }
        const after = JSON.stringify({ p: u.permissions || {}, r: u.role, s: u.superAdmin === true });
        window.currentUser = u;
        if (window.saveSession) window.saveSession(u);
        return after !== before;
    };

    /* SYNCHRONOUS, cache-only: fold the PERSISTED (localStorage) doc with no
       network. Call this BEFORE the first paint so the shell renders correctly
       in a single frame. */
    window.kanjoUamApplyPermissionsSync = (user) => {
        const u = user || window.currentUser;
        if (!u) return null;
        const doc = matchUserDoc(storeRows(), u);
        foldDoc(u, doc);
        return doc;
    };

    const applyPermissions = async (user) => {
        const u = user || window.currentUser;
        if (!u) return { doc: null, changed: false };
        /* 1. Instant, cache-only fold (no network, no await). */
        const doc0 = window.kanjoUamApplyPermissionsSync(u);
        try {
            /* 2. TTL-gated refresh — a no-op when the store is warm. */
            const rows = await loadUsers();
            const doc = matchUserDoc(rows, u) || doc0;
            if (!doc) return { doc: doc0, changed: false };
            return { doc, changed: foldDoc(u, doc) };
        } catch (err) {
            console.warn('[uam] apply permissions failed:', err && err.message ? err.message : err);
            return { doc: doc0, changed: false };
        }
    };
    window.kanjoUamApplyPermissions = applyPermissions;
    window.kanjoUamRefreshSelf = () => applyPermissions();

    /* ── Effective permission (explicit → role default → false) ───────────── */
    const effectivePermission = (rec, perm) => {
        if (!rec) return false;
        if (rec.superAdmin === true || String(rec.role || '') === SUPER_ADMIN_ROLE) return true;
        const key = canonicalKey(perm);
        const p = rec.permissions;
        if (p && typeof p === 'object') {
            if (typeof p[key] === 'boolean') return p[key];
            for (const alias in UAM_PERMISSION_ALIASES) {
                if (UAM_PERMISSION_ALIASES[alias] === key && typeof p[alias] === 'boolean') return p[alias];
            }
        }
        const defs = UAM_ROLE_DEFAULTS[String(rec.role || '')] || [];
        return defs.indexOf(key) !== -1;
    };
    window.kanjoUamEffective = effectivePermission;

    const roleDefaultsObject = (role) => {
        const out = {};
        const defs = UAM_ROLE_DEFAULTS[String(role || '')] || [];
        UAM_PERMISSION_KEYS.forEach((k) => { out[k] = defs.indexOf(k) !== -1; });
        return out;
    };
    window.kanjoUamRoleDefaults = roleDefaultsObject;

    /* ── Mutations ────────────────────────────────────────────────────────── */
    const setPermission = async (docId, perm, value) => {
        const id = String(docId || '');
        const key = canonicalKey(perm);
        if (!id || UAM_PERMISSION_KEYS.indexOf(key) === -1) return null;
        const list = Array.isArray(_uamCache) ? _uamCache : (_uamCache = []);
        const rec = list.find((r) => r && r.id === id) || { id };
        const perms = Object.assign({}, rec.permissions || {});
        perms[key] = !!value;
        await saveUserDoc(id, { permissions: perms });
        if (isSelfDoc(id)) await applyPermissions();
        return perms;
    };
    window.kanjoUamSetPermission = setPermission;

    /* Change a user's base ROLE. Leaves their explicit permission overrides in
       place (they keep priority), so a role switch never silently wipes a
       hand-tuned profile. */
    window.kanjoUamSetRole = async (docId, role) => {
        const id = String(docId || '');
        if (!id) return null;
        const merged = await saveUserDoc(id, { role: String(role || 'rep') });
        if (isSelfDoc(id)) await applyPermissions();
        return merged;
    };

    /* Bulk-save the whole permission map for one user (from the matrix editor). */
    window.kanjoUamSetPermissions = async (docId, permissions) => {
        const id = String(docId || '');
        if (!id || !permissions || typeof permissions !== 'object') return null;
        const perms = {};
        UAM_PERMISSION_KEYS.forEach((k) => { perms[k] = !!permissions[k]; });
        await saveUserDoc(id, { permissions: perms });
        if (isSelfDoc(id)) await applyPermissions();
        return perms;
    };

    window.kanjoUamSetSuperAdmin = async (docId, value) => {
        const id = String(docId || '');
        if (!id) return null;
        const patch = value
            ? { superAdmin: true, role: SUPER_ADMIN_ROLE, permissions: allTruePermissions() }
            : { superAdmin: false, role: 'admin' };
        const merged = await saveUserDoc(id, patch);
        if (isSelfDoc(id)) await applyPermissions();
        return merged;
    };

    window.kanjoUamSetActive = async (docId, active) => {
        const id = String(docId || '');
        if (!id) return null;
        return saveUserDoc(id, { active: !!active });
    };

    window.kanjoUamAddUser = async ({ email, uid, name, role, pin, team, permissions }) => {
        const cleanEmail = String(email || '').trim();
        const cleanUid = String(uid || '').trim();
        const cleanName = String(name || '').trim();
        const cleanPin = String(pin || '').trim();
        const docId = normalizeDocId(cleanEmail || cleanUid || cleanName || cleanPin);
        if (!docId) throw new Error('[uam] provide an email, uid, name or pin');
        const role2 = String(role || 'rep').trim() || 'rep';
        /* Prefer the exact checkbox set the super admin submitted; fall back
           to the role's baseline only when no set was supplied. */
        let perms;
        if (permissions && typeof permissions === 'object') {
            perms = {};
            UAM_PERMISSION_KEYS.forEach((k) => { perms[k] = !!permissions[k]; });
        } else {
            perms = roleDefaultsObject(role2);
        }
        return saveUserDoc(docId, {
            email: cleanEmail, uid: cleanUid, name: cleanName, pin: cleanPin,
            role: role2, team: String(team || '').trim(), superAdmin: false, active: true, permissions: perms
        });
    };

    /* One-time self elevation to super_admin (the founder's bootstrap). */
    window.kanjoElevateToSuperAdmin = async () => {
        const u = window.currentUser;
        if (!u) { if (window.showToast) window.showToast('سجّل الدخول أولاً', false); return null; }
        const docId = candidateDocIds(u)[0] || normalizeDocId('u:' + u.name);
        try {
            await saveUserDoc(docId, {
                name: u.name || '', email: u.email || '', uid: u.uid || '', pin: u.pin || '',
                role: SUPER_ADMIN_ROLE, superAdmin: true, active: true,
                permissions: allTruePermissions()
            });
        } catch (err) {
            console.warn('[uam] elevate write failed:', err);
        }
        u.role = SUPER_ADMIN_ROLE;
        u.superAdmin = true;
        u.permissions = allTruePermissions();
        u.uamDocId = docId;
        window.currentUser = u;
        if (window.saveSession) window.saveSession(u);
        if (window.kanjoWorkspace && typeof window.kanjoWorkspace.refresh === 'function') {
            try { window.kanjoWorkspace.refresh(); } catch (_) { /* ignore */ }
        }
        if (window.showToast) window.showToast('تم ترقية حسابك إلى مشرف عام (Ghost)', true);
        return docId;
    };

    const isSelfDoc = (docId) => {
        const u = window.currentUser;
        if (!u) return false;
        return candidateDocIds(u).indexOf(String(docId)) !== -1;
    };

    /* ── Teams (rep assignment) ───────────────────────────────────────────── */
    const DEFAULT_TEAMS = [
        { name: 'Fox Team', logo: 'Fox Team.png' },
        { name: 'Power Team', logo: 'Power Team.png' }
    ];
    const TEAMS_STORE_KEY = 'kanjo_teams_v1';
    let _teamsCache = null;
    const readTeamsStore = () => {
        try {
            const raw = localStorage.getItem(TEAMS_STORE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    };
    const writeTeamsStore = (list) => {
        try { localStorage.setItem(TEAMS_STORE_KEY, JSON.stringify(list)); } catch (_) { /* ignore */ }
    };
    const mergeTeams = (a, b) => {
        const out = [];
        const seen = {};
        (a || []).concat(b || []).forEach((t) => {
            if (!t) return;
            const name = String(t.name || t || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            out.push({ name, logo: String(t.logo || t.logoUrl || '').trim() });
        });
        return out;
    };
    const loadTeams = async ({ force = false } = {}) => {
        if (_teamsCache && !force) return _teamsCache;
        let stored = readTeamsStore();
        try {
            if (window.kanjoRest && typeof window.kanjoRest.getDocument === 'function') {
                const doc = await window.kanjoRest.getDocument(['system_config', 'teams']);
                if (doc && Array.isArray(doc.list) && doc.list.length) {
                    stored = mergeTeams(doc.list, stored);
                    writeTeamsStore(stored);
                }
            }
        } catch (_) { /* remote sync is optional; defaults + local cache always work */ }
        _teamsCache = mergeTeams(DEFAULT_TEAMS, stored);
        return _teamsCache;
    };
    const saveTeam = async (name, logo) => {
        const clean = String(name || '').trim();
        if (!clean) throw new Error('[uam] team name required');
        const list = mergeTeams(await loadTeams(), [{ name: clean, logo: String(logo || '').trim() }]);
        _teamsCache = list;
        writeTeamsStore(list);
        try {
            if (window.kanjoRest && typeof window.kanjoRest.patch === 'function') {
                await window.kanjoRest.patch(['system_config', 'teams'], { list });
            }
        } catch (err) { console.warn('[uam] team persist failed:', err && err.message ? err.message : err); }
        return list;
    };
    window.kanjoUamLoadTeams = loadTeams;

    /* ── UAM card grid + user-management modal ────────────────────────────── */
    const recTitle = (rec) => (rec && (rec.name || rec.email || rec.uid || rec.id)) || '';
    const roleLabel = (role) => {
        const hit = UAM_ROLES.find((r) => r.value === String(role || ''));
        return hit ? hit.label : (role || '—');
    };
    const permissionGroups = () => {
        const groups = [];
        UAM_PERMISSIONS.forEach((p) => {
            const name = p.group || 'عام';
            let last = groups[groups.length - 1];
            if (!last || last.name !== name) { last = { name, items: [] }; groups.push(last); }
            last.items.push(p);
        });
        return groups;
    };
    const countPermissions = (rec) => UAM_PERMISSION_KEYS.filter((k) => effectivePermission(rec, k)).length;

    const renderUserCard = (rec) => {
        const id = escapeHtml(rec.id);
        const isSA = rec.superAdmin === true || String(rec.role || '') === SUPER_ADMIN_ROLE;
        const active = rec.active !== false;
        const permCount = countPermissions(rec);
        return '<article class="uam-user-card' + (isSA ? ' uam-user-card--sa' : '') + (!active ? ' uam-user-card--off' : '') + '">'
            + '<div class="uam-user-card__head">'
            + '<span class="uam-user-card__avatar"><i class="fa-solid fa-user"></i></span>'
            + '<div class="uam-user-card__ident">'
            + '<div class="uam-user-card__name">' + escapeHtml(recTitle(rec)) + '</div>'
            + '<div class="uam-user-card__sub" dir="ltr">' + escapeHtml(rec.email || rec.uid || '') + '</div>'
            + '</div></div>'
            + '<div class="uam-user-card__meta">'
            + '<span class="uam-chip">' + (isSA ? 'مشرف عام' : escapeHtml(roleLabel(rec.role))) + '</span>'
            + '<span class="uam-chip uam-chip--gold" dir="ltr">PIN: ' + escapeHtml(rec.pin || '—') + '</span>'
            + (rec.team ? '<span class="uam-chip">' + escapeHtml(rec.team) + '</span>' : '')
            + (rec._roster ? '<span class="uam-chip uam-chip--muted">قائمة الدخول</span>' : '')
            + (!active ? '<span class="uam-chip uam-chip--red">موقوف</span>' : '')
            + '</div>'
            + '<div class="uam-user-card__perms"><i class="fa-solid fa-key"></i> ' + permCount + ' / ' + UAM_PERMISSION_KEYS.length + ' صلاحية</div>'
            + '<div class="uam-user-card__actions">'
            + '<button type="button" class="uam-btn uam-btn--gold" onclick="window.kanjoUamOpenModal(\'' + id + '\')"><i class="fa-solid fa-pen-to-square ml-1"></i> تعديل</button>'
            + '</div></article>';
    };

    const renderUam = async ({ force = false } = {}) => {
        const root = document.getElementById('kanjoUamWidget');
        if (!root) return;
        if (!window.kanjoIsSuperAdmin()) { root.classList.add('hidden'); return; }
        root.classList.remove('hidden');
        const body = document.getElementById('kanjoUamBody');
        if (body) body.innerHTML = '<div class="uam-loading"><i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري تحميل المستخدمين...</div>';
        await loadTeams();
        const rows = mergeRosterRows(await loadUsers({ force }));
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = '<div class="uam-empty"><i class="fa-solid fa-users"></i>'
                + '<p>لا يوجد مستخدمون بعد. اضغط «مستخدم جديد» لإضافة أول مستخدم.</p></div>';
            return;
        }
        body.innerHTML = '<div class="uam-card-grid">' + rows.map(renderUserCard).join('') + '</div>';
    };
    window.kanjoRenderUam = renderUam;

    /* ── Modal ────────────────────────────────────────────────────────────── */
    let _uamEditingId = '';

    const modalVal = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const permCheckbox = (p, checked) =>
        '<label class="uam-perm">'
        + '<input type="checkbox" class="uam-modal-perm accent-[#FFD700]" data-perm="' + p.key + '"' + (checked ? ' checked' : '') + '>'
        + '<i class="fa-solid ' + p.icon + '"></i>'
        + '<span>' + escapeHtml(p.label) + '</span>'
        + '</label>';

    const syncTeamSection = () => {
        const roleEl = document.getElementById('uamFieldRole');
        const section = document.getElementById('uamTeamSection');
        if (!roleEl || !section) return;
        section.classList.toggle('hidden', String(roleEl.value) !== 'rep');
    };
    window.kanjoUamSyncTeam = syncTeamSection;

    const collectModalPermissions = () => {
        const out = {};
        document.querySelectorAll('#kanjoUamModal .uam-modal-perm').forEach((n) => {
            out[n.getAttribute('data-perm')] = !!n.checked;
        });
        return out;
    };

    const openUserModal = async (docId) => {
        if (!window.kanjoIsSuperAdmin()) return;
        const teams = await loadTeams();
        const rows = mergeRosterRows(await loadUsers());
        const rec = docId ? (rows.find((r) => String(r.id) === String(docId)) || null) : null;
        _uamEditingId = rec ? String(rec.id) : '';
        const isNew = !rec;
        const permGroups = permissionGroups();
        const permsHost = permGroups.map((g) =>
            '<section class="uam-perm-group"><h4>' + escapeHtml(g.name) + '</h4><div class="uam-perm-grid">'
            + g.items.map((p) => permCheckbox(p, effectivePermission(rec, p.key))).join('')
            + '</div></section>').join('');
        const teamOptions = teams.map((t) =>
            '<option value="' + escapeHtml(t.name) + '"' + (rec && rec.team === t.name ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('');
        const cloneOptions = '<option value="">— اختر مستخدماً —</option>'
            + rows.filter((r) => r && String(r.id) !== _uamEditingId).map((r) =>
                '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(recTitle(r)) + '</option>').join('');

        let modal = document.getElementById('kanjoUamModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'kanjoUamModal';
            modal.className = 'uam-modal hidden';
            document.body.appendChild(modal);
        }
        modal.innerHTML =
            '<div class="uam-modal__backdrop" onclick="window.kanjoUamCloseModal()"></div>'
            + '<div class="uam-modal__panel" role="dialog" aria-modal="true">'
            + '<header class="uam-modal__head"><h3>' + (isNew ? 'مستخدم جديد' : 'تعديل: ' + escapeHtml(recTitle(rec))) + '</h3>'
            + '<button type="button" class="uam-modal__x" onclick="window.kanjoUamCloseModal()"><i class="fa-solid fa-xmark"></i></button></header>'
            + '<div class="uam-modal__body">'
            + '<div class="uam-field-grid">'
            + '<label class="uam-field"><span>الاسم</span><input id="uamFieldName" type="text" value="' + escapeHtml(rec ? rec.name || '' : '') + '" placeholder="اسم المستخدم"></label>'
            + '<label class="uam-field"><span>البريد الإلكتروني</span><input id="uamFieldEmail" type="email" dir="ltr" value="' + escapeHtml(rec ? rec.email || '' : '') + '" placeholder="name@example.com"></label>'
            + '<label class="uam-field"><span>رمز الدخول (PIN)</span><input id="uamFieldPin" type="text" inputmode="numeric" dir="ltr" value="' + escapeHtml(rec ? rec.pin || '' : '') + '" placeholder="1234"></label>'
            + '<label class="uam-field"><span>معرّف Firebase (UID)</span><input id="uamFieldUid" type="text" dir="ltr" value="' + escapeHtml(rec ? rec.uid || '' : '') + '" placeholder="uid..."></label>'
            + '<label class="uam-field"><span>الدور</span><select id="uamFieldRole">'
            + UAM_ROLES.map((r) => '<option value="' + r.value + '"' + (rec && String(rec.role) === r.value ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>').join('')
            + '</select></label></div>'
            + '<div id="uamTeamSection" class="uam-team-section">'
            + '<div class="uam-team-row">'
            + '<label class="uam-field"><span>الفريق (للمناديب)</span><select id="uamFieldTeam">' + teamOptions + '</select></label>'
            + '<button type="button" class="uam-btn uam-btn--ghost" onclick="window.kanjoUamToggleTeamForm()"><i class="fa-solid fa-plus ml-1"></i> إضافة فريق</button>'
            + '</div>'
            + '<div id="uamTeamForm" class="uam-team-form hidden">'
            + '<input id="uamNewTeamName" type="text" placeholder="اسم الفريق">'
            + '<input id="uamNewTeamLogo" type="text" dir="ltr" placeholder="رابط شعار الفريق (اختياري)">'
            + '<button type="button" class="uam-btn uam-btn--gold" onclick="window.kanjoUamCreateTeam()">حفظ الفريق</button>'
            + '</div></div>'
            + '<div class="uam-clone-row"><i class="fa-solid fa-copy"></i>'
            + '<label class="uam-field"><span>نسخ صلاحيات من...</span><select id="uamCloneFrom" onchange="window.kanjoUamClonePermissions(this.value)">' + cloneOptions + '</select></label></div>'
            + '<div class="uam-perms-wrap">' + permsHost + '</div>'
            + '</div>'
            + '<footer class="uam-modal__foot">'
            + (isNew ? '' : '<button type="button" class="uam-btn uam-btn--danger" onclick="window.kanjoUamDeleteUser()"><i class="fa-solid fa-trash-can ml-1"></i> حذف المستخدم</button>')
            + '<div class="uam-foot-spacer"></div>'
            + '<button type="button" class="uam-btn uam-btn--ghost" onclick="window.kanjoUamCloseModal()">إلغاء</button>'
            + '<button type="button" class="uam-btn uam-btn--gold" onclick="window.kanjoUamSaveUser()"><i class="fa-solid fa-floppy-disk ml-1"></i> حفظ</button>'
            + '</footer></div>';

        window._uamModalRows = rows;
        modal.classList.remove('hidden');
        document.body.classList.add('uam-modal-open');
        const roleEl = document.getElementById('uamFieldRole');
        if (roleEl) roleEl.addEventListener('change', syncTeamSection);
        syncTeamSection();
    };
    window.kanjoUamOpenModal = openUserModal;

    window.kanjoUamCloseModal = () => {
        const modal = document.getElementById('kanjoUamModal');
        if (modal) modal.classList.add('hidden');
        document.body.classList.remove('uam-modal-open');
        _uamEditingId = '';
    };

    window.kanjoUamToggleTeamForm = () => {
        const f = document.getElementById('uamTeamForm');
        if (f) f.classList.toggle('hidden');
    };

    window.kanjoUamCreateTeam = async () => {
        const name = modalVal('uamNewTeamName');
        const logo = modalVal('uamNewTeamLogo');
        if (!name) { if (window.showToast) window.showToast('اكتب اسم الفريق', false); return; }
        try {
            const teams = await saveTeam(name, logo);
            const sel = document.getElementById('uamFieldTeam');
            if (sel) sel.innerHTML = teams.map((t) => '<option value="' + escapeHtml(t.name) + '"' + (t.name === name ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('');
            const nEl = document.getElementById('uamNewTeamName'); if (nEl) nEl.value = '';
            const lEl = document.getElementById('uamNewTeamLogo'); if (lEl) lEl.value = '';
            window.kanjoUamToggleTeamForm();
            if (window.showToast) window.showToast('تم إنشاء الفريق «' + name + '»', true);
        } catch (err) {
            if (window.showToast) window.showToast('تعذر إنشاء الفريق', false);
        }
    };

    window.kanjoUamClonePermissions = (fromId) => {
        if (!fromId) return;
        const src = (window._uamModalRows || []).find((r) => String(r.id) === String(fromId));
        if (!src) return;
        document.querySelectorAll('#kanjoUamModal .uam-modal-perm').forEach((n) => {
            n.checked = effectivePermission(src, n.getAttribute('data-perm'));
        });
        if (window.showToast) window.showToast('تم نسخ الصلاحيات من «' + recTitle(src) + '»', true);
    };

    /* Persist a full user profile (core info + team + permissions) to Firestore. */
    window.kanjoUamSaveProfile = async ({ id, name, email, pin, uid, role, team, permissions }) => {
        const cleanName = String(name || '').trim();
        const cleanEmail = String(email || '').trim();
        const cleanPin = String(pin || '').trim();
        const cleanUid = String(uid || '').trim();
        const cleanRole = String(role || 'rep').trim() || 'rep';
        const docId = id ? normalizeDocId(id) : normalizeDocId(cleanEmail || cleanUid || cleanName || cleanPin);
        if (!docId) throw new Error('[uam] provide a name, email, uid or pin');
        const perms = {};
        UAM_PERMISSION_KEYS.forEach((k) => { perms[k] = !!(permissions && permissions[k]); });
        const patch = {
            name: cleanName, email: cleanEmail, pin: cleanPin, uid: cleanUid,
            role: cleanRole, team: String(team || '').trim(), active: true, permissions: perms
        };
        if (cleanRole === SUPER_ADMIN_ROLE) { patch.superAdmin = true; patch.permissions = allTruePermissions(); }
        return saveUserDoc(docId, patch);
    };

    window.kanjoUamSaveUser = async () => {
        const name = modalVal('uamFieldName');
        const email = modalVal('uamFieldEmail');
        const pin = modalVal('uamFieldPin');
        const uid = modalVal('uamFieldUid');
        const role = modalVal('uamFieldRole') || 'rep';
        const team = role === 'rep' ? modalVal('uamFieldTeam') : '';
        if (!name && !email && !pin && !uid) {
            if (window.showToast) window.showToast('أدخل الاسم أو البريد أو الرمز على الأقل', false);
            return;
        }
        try {
            await window.kanjoUamSaveProfile({ id: _uamEditingId || '', name, email, pin, uid, role, team, permissions: collectModalPermissions() });
            if (window.showToast) window.showToast('تم حفظ بيانات المستخدم وصلاحياته', true);
            window.kanjoUamCloseModal();
            await renderUam({ force: true });
        } catch (err) {
            if (window.showToast) window.showToast('تعذر حفظ المستخدم', false);
            console.warn('[uam] save profile failed:', err && err.message ? err.message : err);
        }
    };

    window.kanjoUamDeleteUser = async () => {
        const id = _uamEditingId;
        if (!id) return;
        const rec = (window._uamModalRows || []).find((r) => String(r.id) === String(id));
        if (!window.confirm('حذف المستخدم «' + recTitle(rec || { id }) + '» نهائياً؟')) return;
        const normId = normalizeDocId(id);
        try {
            if (window.kanjoRest && typeof window.kanjoRest.remove === 'function') {
                await window.kanjoRest.remove([UAM_USERS_COLLECTION, normId]);
            }
            if (Array.isArray(_uamCache)) _uamCache = _uamCache.filter((r) => String(r.id) !== normId);
            window.kanjoUamUsersCache = _uamCache || [];
            const store = readStore(); if (store.docs[normId]) { delete store.docs[normId]; writeStore(store); }
            if (window.showToast) window.showToast('تم حذف المستخدم', true);
            window.kanjoUamCloseModal();
            await renderUam({ force: true });
        } catch (err) {
            if (window.showToast) window.showToast('تعذر حذف المستخدم', false);
        }
    };

    /* Refresh button on the UAM panel (forces a fresh small read). */
    window.kanjoUamReload = () => renderUam({ force: true });

    /* ── Bootstrap: hash trigger (`#uam-bootstrap`) + form wiring ─────────── */
    const maybeBootstrap = () => {
        const hash = String(location.hash || '');
        if (hash.indexOf('uam-bootstrap') === -1) return;
        const u = window.currentUser;
        const allowed = window.kanjoIsSuperAdmin()
            || String((u && u.role) || '') === 'founder'
            || String((u && u.role) || '') === 'admin';
        if (!allowed) return;
        window.kanjoElevateToSuperAdmin().then(() => {
            try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* ignore */ }
        });
    };

    const initUam = () => {
        maybeBootstrap();
        if (window.currentUser && window.kanjoIsSuperAdmin()) renderUam();
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('hashchange', maybeBootstrap);
            /* Re-fold permissions from the PERSISTED store on focus — no
               network read, no blocking, no full repaint (zero-bleed). */
            window.addEventListener('focus', () => {
                if (window.currentUser && typeof window.kanjoUamApplyPermissionsSync === 'function') {
                    try { window.kanjoUamApplyPermissionsSync(window.currentUser); } catch (_) { /* ignore */ }
                }
            });
            window.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                const modal = document.getElementById('kanjoUamModal');
                if (modal && !modal.classList.contains('hidden')) window.kanjoUamCloseModal();
            });
        }
    };
    window.initUam = initUam;

    /* ── Executive VIP theming (super_admin exclusive) ───────────────────── */
    const applyExecutiveTheme = () => {
        const on = window.kanjoIsSuperAdmin();
        /* The single CSS switch: every .theme-executive-vip rule is scoped to
           this class, so the VIP theme is impossible for any other role. */
        if (document.body) document.body.classList.toggle('theme-executive-vip', on);
        if (!on) return false;
        /* Prestigious role badge: replaces the ordinary role label. */
        const roleEl = document.getElementById('kanjoSidebarUserRole');
        if (roleEl) {
            roleEl.textContent = 'المدير العام للنظام';
            roleEl.classList.add('ksb-user-role-vip');
        }
        const teamEl = document.getElementById('kanjoSidebarTeam');
        if (teamEl) teamEl.textContent = 'EXECUTIVE OFFICE';
        return true;
    };
    window.kanjoApplyExecutiveTheme = applyExecutiveTheme;

    window.UAM_PERMISSIONS = UAM_PERMISSIONS;
    window.UAM_ROLE_DEFAULTS = UAM_ROLE_DEFAULTS;
    window.UAM_USERS_COLLECTION = UAM_USERS_COLLECTION;
})();
