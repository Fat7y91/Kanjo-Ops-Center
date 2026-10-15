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
       the matrix UI and the enforcers. */
    const UAM_PERMISSIONS = [
        { key: 'canAddProduct', label: 'إضافة منتجات', icon: 'fa-plus' },
        { key: 'canDeleteProduct', label: 'حذف منتجات', icon: 'fa-trash' },
        { key: 'canExportExcel', label: 'تصدير Excel', icon: 'fa-file-excel' },
        { key: 'canViewFinance', label: 'عرض المالية', icon: 'fa-coins' },
        { key: 'canApproveTasks', label: 'اعتماد المهام', icon: 'fa-check-double' },
        { key: 'canManageContracts', label: 'إدارة العقود', icon: 'fa-file-signature' },
        { key: 'canViewKpi', label: 'عرض مؤشرات الأداء', icon: 'fa-chart-line' },
        { key: 'canManageUsers', label: 'إدارة المستخدمين', icon: 'fa-users-gear' }
    ];
    const UAM_PERMISSION_KEYS = UAM_PERMISSIONS.map((p) => p.key);

    /* Baseline a role is assumed to hold when its `users` doc carries no explicit
       override. Purely for UI prefill + display; enforcement always falls back to
       the caller's own legacy expression, so this never changes behaviour. */
    const UAM_ROLE_DEFAULTS = {
        super_admin: UAM_PERMISSION_KEYS.slice(),
        founder: UAM_PERMISSION_KEYS.slice(),
        admin: UAM_PERMISSION_KEYS.slice(),
        product_audit: ['canAddProduct', 'canDeleteProduct'],
        rep: ['canAddProduct'],
        data_entry: [],
        accounting: ['canViewFinance'],
        marketing: [],
        marketing_agency: [],
        media: []
    };

    const UAM_USER_FIELDS = ['uid', 'email', 'name', 'pin', 'role', 'superAdmin',
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

    /* ── Permission gate used across the app ──────────────────────────────── */
    window.kanjoCan = (perm, legacyDefault) => {
        if (window.kanjoIsSuperAdmin()) return true;
        const u = window.currentUser;
        const p = u && u.permissions;
        if (p && typeof p[perm] === 'boolean') return p[perm];
        return !!legacyDefault;
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

    /* ── Load (cache-first, small REST list) ──────────────────────────────── */
    let _uamCache = null;
    let _uamCacheAt = 0;

    const loadUsers = async ({ force = false } = {}) => {
        const now = Date.now();
        if (!force && _uamCache && (now - _uamCacheAt) < UAM_CACHE_TTL) return _uamCache;
        try {
            let rows = [];
            if (window.kanjoRest && typeof window.kanjoRest.list === 'function') {
                rows = await window.kanjoRest.list([UAM_USERS_COLLECTION], {
                    pageSize: 500, maxPages: 5, select: UAM_USER_FIELDS
                });
            }
            if (!Array.isArray(rows)) rows = [];
            _uamCache = rows;
            _uamCacheAt = now;
            window.kanjoUamUsersCache = rows;
            return rows;
        } catch (err) {
            console.warn('[uam] users load failed:', err && err.message ? err.message : err);
            return _uamCache || [];
        }
    };
    window.kanjoUamLoad = loadUsers;

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
        return merged;
    };
    window.kanjoUamSaveUser = saveUserDoc;

    /* ── Apply a user's stored permissions to the live session ────────────── */
    const applyPermissions = async (user) => {
        const u = user || window.currentUser;
        if (!u) return null;
        try {
            const rows = await loadUsers();
            let doc = matchUserDoc(rows, u);
            /* Fall back to a direct id probe when the list is empty/stale. */
            if (!doc && window.kanjoRest && typeof window.kanjoRest.getDocument === 'function') {
                for (const id of candidateDocIds(u)) {
                    try {
                        const hit = await window.kanjoRest.getDocument([UAM_USERS_COLLECTION, id]);
                        if (hit) { doc = hit; break; }
                    } catch (_) { /* keep probing */ }
                }
            }
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
                u.uamDocId = doc.id;
            }
            /* Identity auto-provisioning (exact configured principal). */
            if (isSuperAdminIdentity(u)) {
                u.role = SUPER_ADMIN_ROLE;
                u.superAdmin = true;
                u.permissions = Object.assign({}, u.permissions, allTruePermissions());
            }
            window.currentUser = u;
            if (window.saveSession) window.saveSession(u);
            return doc;
        } catch (err) {
            console.warn('[uam] apply permissions failed:', err && err.message ? err.message : err);
            return null;
        }
    };
    window.kanjoUamApplyPermissions = applyPermissions;
    window.kanjoUamRefreshSelf = () => applyPermissions();

    const allTruePermissions = () => {
        const out = {};
        UAM_PERMISSION_KEYS.forEach((k) => { out[k] = true; });
        return out;
    };

    /* ── Effective permission (explicit → role default → false) ───────────── */
    const effectivePermission = (rec, perm) => {
        if (!rec) return false;
        if (rec.superAdmin === true || String(rec.role || '') === SUPER_ADMIN_ROLE) return true;
        if (rec.permissions && typeof rec.permissions[perm] === 'boolean') return rec.permissions[perm];
        const defs = UAM_ROLE_DEFAULTS[String(rec.role || '')] || [];
        return defs.indexOf(perm) !== -1;
    };
    window.kanjoUamEffective = effectivePermission;

    /* ── Mutations ────────────────────────────────────────────────────────── */
    const setPermission = async (docId, perm, value) => {
        const id = String(docId || '');
        if (!id || UAM_PERMISSION_KEYS.indexOf(perm) === -1) return null;
        const list = Array.isArray(_uamCache) ? _uamCache : (_uamCache = []);
        const rec = list.find((r) => r && r.id === id) || { id };
        const perms = Object.assign({}, rec.permissions || {});
        perms[perm] = !!value;
        await saveUserDoc(id, { permissions: perms });
        if (isSelfDoc(id)) await applyPermissions();
        return perms;
    };
    window.kanjoUamSetPermission = setPermission;

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

    window.kanjoUamAddUser = async ({ email, uid, name, role, pin }) => {
        const cleanEmail = String(email || '').trim();
        const cleanUid = String(uid || '').trim();
        const cleanName = String(name || '').trim();
        const cleanPin = String(pin || '').trim();
        const docId = normalizeDocId(cleanEmail || cleanUid || cleanName || cleanPin);
        if (!docId) throw new Error('[uam] provide an email, uid, name or pin');
        const role2 = String(role || 'rep').trim() || 'rep';
        const defs = UAM_ROLE_DEFAULTS[role2] || [];
        const perms = {};
        UAM_PERMISSION_KEYS.forEach((k) => { perms[k] = defs.indexOf(k) !== -1; });
        return saveUserDoc(docId, {
            email: cleanEmail, uid: cleanUid, name: cleanName, pin: cleanPin,
            role: role2, superAdmin: false, active: true, permissions: perms
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

    /* ── UAM matrix UI ────────────────────────────────────────────────────── */
    const recTitle = (rec) => rec.name || rec.email || rec.uid || rec.id;

    const renderUam = async ({ force = false } = {}) => {
        const root = document.getElementById('kanjoUamWidget');
        if (!root) return;
        if (!window.kanjoIsSuperAdmin()) { root.classList.add('hidden'); return; }
        root.classList.remove('hidden');
        const body = document.getElementById('kanjoUamBody');
        if (body) {
            body.innerHTML = '<div class="p-6 text-center text-sm font-black text-slate-400">'
                + '<i class="fa-solid fa-circle-notch fa-spin ml-1"></i> جاري تحميل المستخدمين...</div>';
        }
        const rows = await loadUsers({ force });
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = '<div class="p-6 text-center text-sm font-black text-slate-400">'
                + 'لا يوجد مستخدمون بعد. أضِف مستخدماً بالأعلى لتفعيل صلاحياته.</div>';
            return;
        }
        const head = '<tr>'
            + '<th class="text-right px-3 py-2">المستخدم</th>'
            + UAM_PERMISSIONS.map((p) => `<th class="px-2 py-2 text-center"><i class="fa-solid ${p.icon}"></i><span class="block text-[10px] mt-0.5">${escapeHtml(p.label)}</span></th>`).join('')
            + '<th class="px-3 py-2 text-center">إجراءات</th>'
            + '</tr>';
        const bodyRows = rows.map((rec) => {
            const id = escapeHtml(rec.id);
            const isSA = rec.superAdmin === true || String(rec.role || '') === SUPER_ADMIN_ROLE;
            const active = rec.active !== false;
            const roleLabel = escapeHtml(rec.role || '—');
            const cells = UAM_PERMISSIONS.map((p) => {
                const on = effectivePermission(rec, p.key);
                return '<td class="px-2 py-3 text-center">'
                    + `<input type="checkbox" class="uam-toggle" ${on ? 'checked' : ''} ${isSA ? 'disabled' : ''}`
                    + ` onchange="window.kanjoUamSetPermission('${id}','${p.key}',this.checked)">`
                    + '</td>';
            }).join('');
            return '<tr class="border-t border-slate-100' + (isSA ? ' bg-[#230535]/5' : '') + (!active ? ' opacity-50' : '') + '">'
                + '<td class="px-3 py-3">'
                + `<div class="font-black text-sm text-[#230535]">${escapeHtml(recTitle(rec))}</div>`
                + `<div class="text-[11px] text-slate-400">${escapeHtml(rec.email || rec.uid || rec.id)}</div>`
                + `<span class="inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full ${isSA ? 'bg-[#230535] text-[#FFD700]' : 'bg-slate-100 text-slate-500'}">${isSA ? 'مشرف عام' : roleLabel}</span>`
                + '</td>'
                + cells
                + '<td class="px-3 py-3 text-center whitespace-nowrap">'
                + (isSA
                    ? `<button type="button" onclick="window.kanjoUamSetSuperAdmin('${id}',false);window.kanjoRenderUam()" class="text-[11px] font-black text-red-500 hover:underline">إلغاء الترقية</button>`
                    : `<button type="button" onclick="window.kanjoUamSetSuperAdmin('${id}',true);window.kanjoRenderUam()" class="text-[11px] font-black text-[#E57723] hover:underline">ترقية كمشرف</button>`)
                + `<button type="button" onclick="window.kanjoUamSetActive('${id}',${active ? 'false' : 'true'});window.kanjoRenderUam()" class="text-[11px] font-black text-slate-400 hover:underline block mt-1 mx-auto">${active ? 'إيقاف' : 'تفعيل'}</button>`
                + '</td>'
                + '</tr>';
        }).join('');
        body.innerHTML = '<div class="overflow-x-auto"><table class="w-full text-xs">'
            + '<thead class="bg-slate-50 text-slate-500">' + head + '</thead>'
            + '<tbody>' + bodyRows + '</tbody></table></div>';
    };
    window.kanjoRenderUam = renderUam;

    window.kanjoUamAddUserFromForm = async () => {
        const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        const email = val('kanjoUamNewEmail');
        const uid = val('kanjoUamNewUid');
        const name = val('kanjoUamNewName');
        const pin = val('kanjoUamNewPin');
        const roleSel = document.getElementById('kanjoUamNewRole');
        const role = roleSel ? String(roleSel.value || 'rep') : 'rep';
        if (!email && !uid && !name && !pin) {
            if (window.showToast) window.showToast('أدخل البريد أو UID أو الاسم على الأقل', false);
            return;
        }
        try {
            await window.kanjoUamAddUser({ email, uid, name, role, pin });
            ['kanjoUamNewEmail', 'kanjoUamNewUid', 'kanjoUamNewName', 'kanjoUamNewPin'].forEach((id) => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
            if (window.showToast) window.showToast('تمت إضافة المستخدم وتطبيق الصلاحيات', true);
            await renderUam({ force: true });
        } catch (err) {
            if (window.showToast) window.showToast('تعذر إضافة المستخدم', false);
            console.warn('[uam] add user failed:', err);
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
        const form = document.getElementById('kanjoUamAddForm');
        if (form && !form._uamWired) {
            form._uamWired = true;
            form.addEventListener('submit', (e) => { e.preventDefault(); window.kanjoUamAddUserFromForm(); });
        }
        maybeBootstrap();
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('hashchange', maybeBootstrap);
            /* Re-apply permissions when the tab regains focus (real-time-ish). */
            window.addEventListener('focus', () => { if (window.currentUser) applyPermissions(); });
        }
    };
    window.initUam = initUam;

    window.UAM_PERMISSIONS = UAM_PERMISSIONS;
    window.UAM_ROLE_DEFAULTS = UAM_ROLE_DEFAULTS;
    window.UAM_USERS_COLLECTION = UAM_USERS_COLLECTION;
})();
