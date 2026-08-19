/* Kanjo Ops — Application Entry Point */
import './config/firebase.js';
import { categories } from './config/constants.js';
import './utils/helpers.js';
import './utils/export.js';
import './services/geolocation.js';
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

/* Restore session if present — wait for Firebase auth baseline so Firestore
   rules (deny-by-default, require request.auth) don't reject the first reads. */
window.authReady.then(() => {
    const savedUser = localStorage.getItem(SESSION_KEY);
    if (savedUser) {
        window.currentUser = JSON.parse(savedUser);
        applyThemeAndShowDashboard();
    }
});
