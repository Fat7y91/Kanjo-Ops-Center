/* Kanjo Ops — Standalone Marketing Portal
   Isolated, sidebar-free page that lets the marketing office (or a founder)
   sign in with a PIN and review the campaign leads captured by the external
   Spinwheel campaign. It shares ONLY the auth/session contract (the same
   `kanjo_session_user` localStorage key) with the operations dashboard; it does
   not import any operational UI, so the ops sidebar/modals can never leak here. */
import '../config/firebase.js';
import { users } from '../config/constants.js';

const SESSION_KEY = 'kanjo_session_user';
const ALLOWED_ROLES = ['marketing', 'founder'];
const CAMPAIGN_LEADS = 'campaign_leads';
const MAX_ROWS = 500;

const COLUMN_LABELS = {
    phone_number: 'رقم الهاتف',
    phone: 'رقم الهاتف',
    mobile: 'رقم الهاتف',
    promo_code: 'كود العرض',
    coupon: 'كود العرض',
    user_guess: 'توقع العميل',
    guess: 'توقع العميل',
    prize_details: 'تفاصيل الجائزة',
    prize: 'الجائزة',
    created_at: 'التاريخ',
    createdAt: 'التاريخ',
    timestamp: 'التاريخ'
};

/* Preferred left-to-right order; any unknown keys are appended alphabetically
   so a schema change never hides a column. */
const PREFERRED_ORDER = [
    'phone_number', 'phone', 'mobile',
    'promo_code', 'coupon',
    'user_guess', 'guess',
    'prize_details', 'prize',
    'created_at', 'createdAt', 'timestamp'
];

const el = (id) => document.getElementById(id);

let currentSession = null;
let currentLeads = [];
let currentColumns = [];

/* ─── Session helpers (mirror services/auth.js) ─── */
const readSession = () => {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (_) {
        return null;
    }
};

const sessionHasAccess = (session) =>
    !!session && ALLOWED_ROLES.includes(String(session.role || ''));

const showLogin = (message) => {
    el('marketingApp').classList.add('hidden');
    el('marketingLogin').classList.remove('hidden');
    const err = el('marketingLoginError');
    if (message) {
        err.textContent = message;
        err.classList.remove('hidden');
    } else {
        err.classList.add('hidden');
    }
    const input = el('marketingPin');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
};

const showApp = (session) => {
    currentSession = session;
    el('marketingLogin').classList.add('hidden');
    el('marketingApp').classList.remove('hidden');
    const userLabel = el('marketingUser');
    if (userLabel) userLabel.textContent = session.name || '';
    loadLeads();
};

/* ─── Formatting ─── */
const isTimestamp = (value) =>
    !!value && typeof value === 'object' && typeof value.toDate === 'function';
const isDateLike = (value) =>
    !!value && typeof value === 'object' && typeof value.toLocaleString === 'function' && !Array.isArray(value);

const formatDate = (value) => {
    const date = isTimestamp(value) ? value.toDate() : value;
    if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
    try {
        return date.toLocaleString('ar-EG', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return date.toISOString();
    }
};

const formatCell = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
    if (isTimestamp(value)) return formatDate(value);
    if (isDateLike(value)) return formatDate(value);
    if (Array.isArray(value)) return value.map((v) => formatCell(v)).join('، ');
    if (typeof value === 'object') {
        try { return JSON.stringify(value); } catch (_) { return String(value); }
    }
    return String(value);
};

const labelFor = (key) => COLUMN_LABELS[key] || key.replace(/_/g, ' ');

const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ─── Table rendering ─── */
const buildColumns = (docs) => {
    const seen = new Set();
    docs.forEach((doc) => {
        Object.keys(doc || {}).forEach((key) => {
            if (key !== 'id') seen.add(key);
        });
    });
    const ordered = PREFERRED_ORDER.filter((key) => seen.has(key));
    const extras = Array.from(seen)
        .filter((key) => !PREFERRED_ORDER.includes(key))
        .sort();
    return ordered.concat(extras);
};

const renderTable = () => {
    const head = el('marketingHead');
    const body = el('marketingBody');
    const empty = el('marketingEmpty');
    const loading = el('marketingLoading');

    if (loading) loading.classList.add('hidden');
    head.innerHTML = '';
    body.innerHTML = '';

    if (!currentLeads.length) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    const headRow = document.createElement('tr');
    currentColumns.forEach((key) => {
        const th = document.createElement('th');
        th.className = 'px-4 py-3 text-xs font-black whitespace-nowrap';
        th.textContent = labelFor(key);
        headRow.appendChild(th);
    });
    const actionTh = document.createElement('th');
    actionTh.className = 'px-4 py-3 text-xs font-black whitespace-nowrap text-center';
    actionTh.textContent = 'حذف';
    headRow.appendChild(actionTh);
    head.appendChild(headRow);

    const rowsHtml = currentLeads.map((doc) => {
        const cells = currentColumns.map((key) => {
            const raw = doc[key];
            const isDate = isTimestamp(raw) || isDateLike(raw);
            const cls = 'px-4 py-3 whitespace-nowrap border-b border-purple-50' + (isDate ? ' text-slate-500' : ' font-bold text-brand-purple');
            return '<td class="' + cls + '">' + escapeHtml(formatCell(raw)) + '</td>';
        }).join('');
        /* Per-row wipe: permanently removes the entry (and its phone number) so
           the customer can spin again from scratch. Read + delete only. */
        const actionCell = '<td class="px-4 py-3 whitespace-nowrap border-b border-purple-50 text-center">'
            + '<button type="button" class="marketing-lead-delete text-rose-600 hover:text-rose-800 hover:bg-rose-50 w-9 h-9 rounded-lg transition" data-lead-id="' + escapeHtml(doc.id) + '" aria-label="حذف السجل" title="حذف السجل ورقم الهاتف نهائياً"><i class="fa-solid fa-trash-can"></i></button>'
            + '</td>';
        return '<tr class="hover:bg-brand-cream/60 transition">' + cells + actionCell + '</tr>';
    }).join('');
    body.innerHTML = rowsHtml;

    el('marketingCount').textContent = String(currentLeads.length);
    const wins = currentLeads.filter((doc) => {
        const promo = doc.promo_code || doc.coupon;
        return promo !== undefined && promo !== null && promo !== '';
    }).length;
    el('marketingWins').textContent = String(wins);
};

const setLoading = () => {
    const loading = el('marketingLoading');
    const empty = el('marketingEmpty');
    if (loading) loading.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    el('marketingHead').innerHTML = '';
    el('marketingBody').innerHTML = '';
};

/* ─── Data load (firestore REST, newest 500, no real-time listeners) ─── */
const loadLeads = async () => {
    setLoading();
    try {
        if (window.authReady) { try { await window.authReady; } catch (_) {} }
        const runQuery = window.kanjoRest && window.kanjoRest.runQuery;
        if (typeof runQuery !== 'function') throw new Error('transport unavailable');
        const docs = await runQuery(CAMPAIGN_LEADS, [], MAX_ROWS, {
            orderBy: [{ field: 'created_at', direction: 'DESCENDING' }]
        });
        currentLeads = Array.isArray(docs) ? docs : [];
        currentColumns = buildColumns(currentLeads);
        renderTable();
    } catch (err) {
        console.error('[marketing] load failed:', err);
        currentLeads = [];
        currentColumns = [];
        const loading = el('marketingLoading');
        if (loading) loading.classList.add('hidden');
        el('marketingEmpty').classList.remove('hidden');
        el('marketingCount').textContent = '0';
        el('marketingWins').textContent = '0';
        if (window.Swal) {
            window.Swal.fire({
                icon: 'error',
                title: 'تعذر تحميل البيانات',
                text: 'تأكد من الاتصال ثم أعد المحاولة.',
                confirmButtonColor: '#230535'
            });
        }
    }
};

/* ─── Delete one lead (permanent wipe) ───
   Removes the document (and therefore the phone number) straight over the
   signed-in REST transport, so the same phone can be cleared for a fresh spin.
   In-memory only afterwards: no re-read of the collection. */
const deleteLead = async (docId) => {
    const id = String(docId || '');
    if (!id) return;
    const lead = currentLeads.find((doc) => doc.id === id) || {};
    const phone = lead.phone_number || lead.phone || lead.mobile || '';
    let confirmed = false;
    if (window.Swal) {
        const result = await window.Swal.fire({
            icon: 'warning',
            title: 'تأكيد الحذف',
            html: 'سيتم حذف السجل'
                + (phone ? ' ورقم الهاتف <b dir="ltr">' + escapeHtml(String(phone)) + '</b>' : '')
                + ' نهائياً من قاعدة البيانات، ويمكن للعميل إعادة المحاولة من جديد.',
            showCancelButton: true,
            confirmButtonText: 'حذف نهائي',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#230535'
        });
        confirmed = !!(result && result.isConfirmed);
    } else {
        confirmed = window.confirm('تأكيد حذف السجل ورقم الهاتف نهائياً؟');
    }
    if (!confirmed) return;

    const remove = window.kanjoRest && window.kanjoRest.remove;
    if (typeof remove !== 'function') {
        if (window.Swal) window.Swal.fire({ icon: 'error', title: 'تعذر الحذف', text: 'خدمة الحذف غير متاحة حالياً.', confirmButtonColor: '#230535' });
        return;
    }
    try {
        await remove([CAMPAIGN_LEADS, id]);
        currentLeads = currentLeads.filter((doc) => doc.id !== id);
        currentColumns = buildColumns(currentLeads);
        renderTable();
        if (window.Swal) window.Swal.fire({ icon: 'success', title: 'تم حذف السجل', timer: 1400, showConfirmButton: false });
    } catch (err) {
        console.error('[marketing] delete failed:', err);
        if (window.Swal) window.Swal.fire({ icon: 'error', title: 'تعذر حذف السجل', text: 'تأكد من الاتصال ثم أعد المحاولة.', confirmButtonColor: '#230535' });
    }
};

/* ─── Excel export (global SheetJS; raw, uncorrupted values) ─── */
const exportExcel = () => {
    if (!currentLeads.length) {
        if (window.Swal) {
            window.Swal.fire({ icon: 'info', title: 'لا توجد بيانات للتصدير', confirmButtonColor: '#230535' });
        }
        return;
    }
    if (typeof window.XLSX === 'undefined') {
        if (window.Swal) {
            window.Swal.fire({ icon: 'error', title: 'مكتبة Excel غير محمّلة', confirmButtonColor: '#230535' });
        }
        return;
    }
    try {
        const header = currentColumns.map(labelFor);
        const rows = currentLeads.map((doc) => currentColumns.map((key) => {
            const raw = doc[key];
            if (raw === null || raw === undefined) return '';
            if (typeof raw === 'boolean') return raw;
            if (isTimestamp(raw)) return formatDate(raw);
            if (isDateLike(raw)) return formatDate(raw);
            if (typeof raw === 'object') {
                try { return JSON.stringify(raw); } catch (_) { return String(raw); }
            }
            return raw;
        }));
        const sheet = window.XLSX.utils.aoa_to_sheet([header].concat(rows));
        sheet['!cols'] = currentColumns.map((key) => ({
            wch: Math.min(40, Math.max(labelFor(key).length + 2, 14))
        }));
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, sheet, 'Campaign Leads');
        const stamp = new Date().toISOString().slice(0, 10);
        window.XLSX.writeFile(workbook, 'kanjo-marketing-leads-' + stamp + '.xlsx');
    } catch (err) {
        console.error('[marketing] export failed:', err);
        if (window.Swal) {
            window.Swal.fire({ icon: 'error', title: 'تعذر إنشاء ملف Excel', confirmButtonColor: '#230535' });
        }
    }
};

/* ─── Login / logout wiring ─── */
const attemptLogin = () => {
    const input = el('marketingPin');
    const pin = input ? String(input.value || '').trim() : '';
    const identity = users[pin];
    if (identity && ALLOWED_ROLES.includes(String(identity.role || ''))) {
        const session = Object.assign({}, identity, { pin });
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (_) {}
        window.currentUser = session;
        showApp(session);
        return;
    }
    showLogin('كود الدخول غير صحيح أو غير مصرح لهذه البوابة');
};

const logout = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.reload();
};

const init = () => {
    const loginBtn = el('marketingLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', attemptLogin);
    const pinInput = el('marketingPin');
    if (pinInput) {
        pinInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') attemptLogin();
        });
    }
    const exportBtn = el('marketingExport');
    if (exportBtn) exportBtn.addEventListener('click', exportExcel);
    const refreshBtn = el('marketingRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadLeads);
    const logoutBtn = el('marketingLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    /* Delegated delete: works for every dynamically-built row without rebinding
       after each render. */
    const tableBody = el('marketingBody');
    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const target = event.target;
            const btn = target && typeof target.closest === 'function'
                ? target.closest('.marketing-lead-delete')
                : null;
            if (!btn) return;
            event.preventDefault();
            deleteLead(btn.getAttribute('data-lead-id'));
        });
    }

    const session = readSession();
    if (sessionHasAccess(session)) showApp(session);
    else showLogin();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
