/* Kanjo Ops — Application Entry Point */
import './config/firebase.js';
import { categories } from './config/constants.js';
import './utils/helpers.js';
import './utils/export.js';
import './services/geolocation.js';
import './services/merchantDocs.js';
import { SESSION_KEY, applyThemeAndShowDashboard } from './services/auth.js';
import './services/firestore.js';
import './ui/modals.js';
import './ui/accounting.js';
import './ui/dashboard.js';
import './ui/charts.js';

/* Populate category dropdowns */
categories.sort().forEach(c => {
    const mCat = document.getElementById('mCat');
    const editCat = document.getElementById('editCat');
    if (mCat) mCat.innerHTML += `<option value="${c}">${c}</option>`;
    if (editCat) editCat.innerHTML += `<option value="${c}">${c}</option>`;
});

/* Restore session — but ONLY after the Firebase auth baseline (anonymous sign-in)
   has resolved, so the strict Firestore rules never reject the first reads and the
   UI never renders empty lists before data is fetched. There is NO artificial
   timeout: the loading spinner (injected by dashboard.js) stays visible until the
   first batch of Firestore data arrives and renderDashboard() replaces it. */
window.authReady.then(() => {
    const savedUser = localStorage.getItem(SESSION_KEY);
    if (savedUser) {
        window.currentUser = JSON.parse(savedUser);
        if (typeof window.showDashboardLoading === 'function') {
            window.showDashboardLoading();
        }
        applyThemeAndShowDashboard();
    }
});
