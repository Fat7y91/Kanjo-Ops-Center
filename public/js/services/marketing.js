/* Kanjo Ops — Marketing Dashboard (integrated view)
   Renders the campaign leads captured by the external Spinwheel campaign inside
   the main operations dashboard. There is no standalone page, login gate or
   sidebar: the marketing office signs in through the standard PIN gate and the
   app routes them straight to this section, while founders/admins can open it
   from the header nav. It reuses the dashboard's Firebase session and the
   signed-in REST transport, so the table is read + delete only (delete wipes a
   test entry so the same phone can spin again). */

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

let currentLeads = [];
let currentColumns = [];
let _bound = false;
let _loaded = false;

/* ─── Access (mirrors firestore.rules campaign_leads) ───
   Marketing is the owning role; founders/admins may open the same section from
   the header nav for oversight. */
window.marketingIsHome = () =>
    String((window.currentUser && window.currentUser.role) || '') === 'marketing';

window.marketingCanView = () => {
    const role = String((window.currentUser && window.currentUser.role) || '');
    return role === 'marketing' || role === 'founder' || role === 'admin';
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
    if (!head || !body) return;

    if (loading) loading.classList.add('hidden');
    head.innerHTML = '';
    body.innerHTML = '';

    const countEl = el('marketingCount');
    if (!currentLeads.length) {
        if (empty) empty.classList.remove('hidden');
        if (countEl) countEl.textContent = '0';
        const winsEl = el('marketingWins');
        if (winsEl) winsEl.textContent = '0';
        return;
    }
    if (empty) empty.classList.add('hidden');

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

    if (countEl) countEl.textContent = String(currentLeads.length);
    const wins = currentLeads.filter((doc) => {
        const promo = doc.promo_code || doc.coupon;
        return promo !== undefined && promo !== null && promo !== '';
    }).length;
    const winsEl = el('marketingWins');
    if (winsEl) winsEl.textContent = String(wins);
};

const setLoading = () => {
    const loading = el('marketingLoading');
    const empty = el('marketingEmpty');
    if (loading) loading.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    const head = el('marketingHead');
    const body = el('marketingBody');
    if (head) head.innerHTML = '';
    if (body) body.innerHTML = '';
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
        const empty = el('marketingEmpty');
        if (empty) empty.classList.remove('hidden');
        const countEl = el('marketingCount');
        if (countEl) countEl.textContent = '0';
        const winsEl = el('marketingWins');
        if (winsEl) winsEl.textContent = '0';
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

/* ─── Integrated view navigation ─── */
const smoothTop = () => {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (_) { try { window.scrollTo(0, 0); } catch (__) {} }
};

const bind = () => {
    if (_bound) return;
    _bound = true;
    const exportBtn = el('marketingExport');
    if (exportBtn) exportBtn.addEventListener('click', exportExcel);
    const refreshBtn = el('marketingRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadLeads);
    const backBtn = el('marketingBack');
    if (backBtn) backBtn.addEventListener('click', () => window.closeMarketingDashboard());

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
};

/* Make this section the visible view. Marketing uses it as home (no back
   button); founders/admins open it over the operations dashboard. */
window.openMarketingDashboard = () => {
    if (!window.marketingCanView()) {
        if (window.showToast) window.showToast('بوابة التسويق غير متاحة لحسابك', false);
        return;
    }
    const accounting = el('accountingSection');
    const dashboard = el('dashboardSection');
    const kpiView = el('kpiAnalyticsView');
    const view = el('marketingSection');
    if (accounting) accounting.classList.add('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (kpiView) kpiView.classList.add('hidden');
    if (view) view.classList.remove('hidden');
    smoothTop();
    window.initMarketingDashboard();
};

window.closeMarketingDashboard = () => {
    /* Marketing lands here as its home view, so it can never close it. */
    if (window.marketingIsHome()) return;
    const view = el('marketingSection');
    if (view) view.classList.add('hidden');
    const dashboard = el('dashboardSection');
    if (dashboard) dashboard.classList.remove('hidden');
    smoothTop();
};

window.initMarketingDashboard = () => {
    if (!window.marketingCanView()) return;
    bind();
    const backBtn = el('marketingBack');
    if (backBtn) backBtn.classList.toggle('hidden', window.marketingIsHome());
    if (!_loaded) {
        _loaded = true;
        loadLeads();
    } else {
        renderTable();
    }
};

/* Clear everything on logout / role switch so one identity's campaign data can
   never leak into the next session on a shared device. */
window.resetMarketingDashboard = () => {
    _bound = false;
    _loaded = false;
    currentLeads = [];
    currentColumns = [];
    const body = el('marketingBody');
    if (body) body.innerHTML = '';
    const head = el('marketingHead');
    if (head) head.innerHTML = '';
    const countEl = el('marketingCount');
    if (countEl) countEl.textContent = '0';
    const winsEl = el('marketingWins');
    if (winsEl) winsEl.textContent = '0';
};
