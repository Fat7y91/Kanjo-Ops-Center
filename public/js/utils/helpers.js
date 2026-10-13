/* Kanjo Ops — Utility Helpers */

const getBaseName = (name) => {

    if (!name) return '';

    /* Strip RTL / bidi / invisible formatting control marks (U+200B-U+200F,
       U+202A-U+202E, U+2060-U+2069, U+FEFF, U+061C) so base-name matching is
       stable regardless of how a name was pasted (e.g. "‏‎Mr Molten‎‏" and
       "Mr Molten" are the same group). */
    let clean = String(name).replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u061C]/g, '');

    while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {

        clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();

    }

    return clean.trim();

};



window.showToast = (message, isSuccess = true) => {

    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');

    toast.className = `p-4 rounded-2xl shadow-lg text-white font-bold flex items-center gap-3 ${isSuccess ? 'bg-emerald-600' : 'bg-red-600'} toast-animate`;

    toast.innerHTML = `<i class="fa-solid ${isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);

};



window.safeString = (str) => {

    if (!str) return '';

    return String(str)

        .replace(/\\/g, '\\\\')

        .replace(/'/g, "\\'")

        .replace(/"/g, '&quot;')

        .replace(/\n/g, '\\n')

        .replace(/\r/g, '\\r');

};

window.formatNotificationTime = (timestamp) => {

    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    const now = new Date();

    const diffMs = now - date;

    const diffMins = Math.floor(diffMs / 60000);

    const diffHours = Math.floor(diffMins / 60);



    if (diffMins < 30) {

        if (diffMins <= 1) return 'منذ لحظات';

        return `منذ ${diffMins} دقائق`;

    } else if (diffHours < 24) {

        return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    } else {

        return `${date.toLocaleDateString('ar-EG')} - ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

    }

};

window.normalizeArabic = (str) => str.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase();

/* Coalesce a burst of render calls into at most one execution per animation
   frame (or the next macrotask as a fallback). Multiple Firestore snapshots can
   land in the same tick; running the (heavy) render synchronously for each one
   blocks the main thread and makes the UI feel frozen. */
window.scheduleFrameRender = (fn) => {
    let scheduled = false;
    let latestArgs = null;
    return (...args) => {
        latestArgs = args;
        if (scheduled) return;
        scheduled = true;
        const run = () => {
            scheduled = false;
            const a = latestArgs;
            latestArgs = null;
            try {
                fn.apply(null, a || []);
            } catch (err) {
                console.error('[render] scheduled render failed:', err);
            }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 16);
    };
};

window.calculateComm = (target, achieved) => { 

    if (!target || !achieved) return ''; 

    const ratio = (achieved / target) * 100; 

    if (ratio > 100) return `<div class="mt-1.5 p-2 bg-gradient-to-r from-purple-600 to-violet-700 text-white font-bold rounded-xl text-center text-[11px] shadow-sm animate-pulse">🎉 Extra Incentive!</div>`; 

    if (ratio === 100) return `<div class="mt-1.5 p-2 bg-green-600 text-white font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 200 جنيه (100% بالظبط)</div>`; 

    if (ratio > 90) return `<div class="mt-1.5 p-2 bg-blue-600 text-white font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 150 جنيه (> 90%)</div>`; 

    return `<div class="mt-1.5 p-2 bg-yellow-400 text-slate-900 font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 100 جنيه (< 90%)</div>`; 

};

window.getBaseName = getBaseName;

/* ── Resilient avatars ──────────────────────────────────────────────────────
   Every profile / team / rep avatar must degrade gracefully instead of showing
   a broken-image glyph. Prefer the real image; on error (or when no URL is
   supplied) swap to a styled circle carrying the person/team initial. */
window.kanjoInitial = (name) => {
    const s = String(name || '').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u061C]/g, '').trim();
    return s ? s.charAt(0).toUpperCase() : '؟';
};

window.kanjoAvatarError = (img) => {
    if (!img || !img.parentNode) return;
    const name = img.getAttribute('data-name') || img.getAttribute('alt') || '';
    const cls = (img.getAttribute('class') || '').replace(/\bkanjo-avatar-fallback\b/g, '').trim();
    const div = document.createElement('div');
    div.className = (cls ? cls + ' ' : '') + 'kanjo-avatar-fallback';
    div.textContent = window.kanjoInitial(name);
    img.parentNode.replaceChild(div, img);
};

window.kanjoAvatarImg = (url, name, cls) => {
    const safeName = String(name || '').replace(/"/g, '&quot;');
    if (!url) {
        return `<div class="${(cls || '') + ' kanjo-avatar-fallback'}" title="${safeName}">${window.kanjoInitial(name)}</div>`;
    }
    const safeUrl = String(url).replace(/"/g, '&quot;');
    return `<img src="${safeUrl}" alt="${safeName}" data-name="${safeName}" loading="lazy" decoding="async" class="${cls || ''}" onerror="window.kanjoAvatarError&&window.kanjoAvatarError(this)">`;
};

window.isRestaurantCafeCategory = (cat) => String(cat || '').includes('مطاعم وكافيهات');

window.isRestaurantCafeCategoryExact = (cat) => {
    const c = String(cat || '').trim();
    return c === 'مطاعم وكافيهات' || c.endsWith('مطاعم وكافيهات');
};

/* Cooperative yield point for long, CPU-bound loops (P1.7).
   Give the browser a chance to paint / handle input between chunks of heavy
   work instead of freezing until the whole export/import finishes. Prefers the
   modern scheduler.yield() when available and degrades to a macrotask. */
window.kanjoYieldToMain = () => {
    if (typeof scheduler !== 'undefined' && scheduler && typeof scheduler.yield === 'function') {
        return scheduler.yield();
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
};

export { getBaseName };
