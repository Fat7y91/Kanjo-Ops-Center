/* Kanjo Ops — Utility Helpers */

const getBaseName = (name) => {

    if (!name) return '';

    let clean = name;

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

window.calculateComm = (target, achieved) => { 

    if (!target || !achieved) return ''; 

    const ratio = (achieved / target) * 100; 

    if (ratio > 100) return `<div class="mt-1.5 p-2 bg-gradient-to-r from-purple-600 to-violet-700 text-white font-bold rounded-xl text-center text-[11px] shadow-sm animate-pulse">🎉 Extra Incentive!</div>`; 

    if (ratio === 100) return `<div class="mt-1.5 p-2 bg-green-600 text-white font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 200 جنيه (100% بالظبط)</div>`; 

    if (ratio > 90) return `<div class="mt-1.5 p-2 bg-blue-600 text-white font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 150 جنيه (> 90%)</div>`; 

    return `<div class="mt-1.5 p-2 bg-yellow-400 text-slate-900 font-bold rounded-xl text-center text-[11px] shadow-sm">💰 عمولة الفرد: 100 جنيه (< 90%)</div>`; 

};

window.getBaseName = getBaseName;

window.isRestaurantCafeCategory = (cat) => String(cat || '').includes('مطاعم وكافيهات');

window.isRestaurantCafeCategoryExact = (cat) => {
    const c = String(cat || '').trim();
    return c === 'مطاعم وكافيهات' || c.endsWith('مطاعم وكافيهات');
};

export { getBaseName };
