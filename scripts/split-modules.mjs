/**
 * Kanjo Ops — Monolith → Modular ES Modules splitter
 * Preserves every line of logic; only adds imports/exports/window mirrors.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const lines = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8').split(/\r?\n/);

/** Extract 1-based inclusive line range, preserving original text */
function extract(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function write(rel, content) {
  const full = path.join(publicDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\n+$/, '') + '\n', 'utf8');
  console.log('Wrote', rel, '(' + content.length + ' chars)');
}

// ─── Shared state initializer (injected into firebase.js after db setup) ───
const sharedState = `
/* Shared mutable state (mirrored on window for cross-module bare access in ES Modules) */
window.editTaskId = null;
window.taskToDelete = null;
window.isLiveView = false;
window.currentTarget = 0;
window.currentNotes = "";
window.allTasksCache = [];
window.tasksMemory = new Map();
window.pendingTransferTaskIds = new Set();
window.perfChartInstance = null;
window.catChartInstance = null;
window.filteredTasksForExport = [];
window.currentUniqueMerchantsGlobal = new Map();
window.currentUnsignedCategoriesGlobal = [];
window.topPerformerContractsGlobal = [];
window.topTeamContractsGlobal = [];
window.activeTransferTaskId = null;
window.activeTransferTaskName = '';
window.activeTransferTaskTeam = '';
window.activeMerchantBaseName = '';
window.currentStatModalType = '';
window.activeReportArchiveTaskId = null;
window.activeReportArchiveIndex = null;
window.hasRunGeoUpdate = false;
window.currentUser = null;
window.activeTaskId = null;
window.activeTaskName = '';
window.activeTaskTeam = '';
`;

// ═══════════════════════════════════════════════════════════
// 1. firebase.js
// ═══════════════════════════════════════════════════════════
const firebaseBody = `import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, onSnapshot, query, where, updateDoc, doc, arrayUnion, deleteDoc, orderBy, getDocs, writeBatch, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0", authDomain: "kanjo-desouk.firebaseapp.com", projectId: "kanjo-desouk", storageBucket: "kanjo-desouk.firebasestorage.app", messagingSenderId: "253872156774", appId: "1:253872156774:web:1d554b3bf0b78b98c77da7", measurementId: "G-FBM6G2RF1B" };

const app = initializeApp(firebaseConfig);

let db;

try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
} catch (e) {
    db = getFirestore(app);
}

window.db = db;
window.collection = collection;
window.addDoc = addDoc;
window.onSnapshot = onSnapshot;
window.query = query;
window.where = where;
window.updateDoc = updateDoc;
window.doc = doc;
window.arrayUnion = arrayUnion;
window.deleteDoc = deleteDoc;
window.orderBy = orderBy;
window.getDocs = getDocs;
window.writeBatch = writeBatch;
window.setDoc = setDoc;
window.getDoc = getDoc;

${sharedState}

export {
    app, db, firebaseConfig,
    collection, addDoc, onSnapshot, query, where, updateDoc, doc,
    arrayUnion, deleteDoc, orderBy, getDocs, writeBatch, setDoc, getDoc,
    initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager
};
`;

write('js/config/firebase.js', firebaseBody);

// ═══════════════════════════════════════════════════════════
// 2. constants.js
// ═══════════════════════════════════════════════════════════
const userImageMap = extract(93, 113);
const categoriesBlock = extract(3553, 3573);

const constantsBody = `/* Kanjo Ops — Global Constants */

${userImageMap}

${categoriesBlock}

window.userImageMap = userImageMap;
window.teamImageMap = teamImageMap;
window.categories = categories;
window.users = users;
window.teamMembers = teamMembers;

export { userImageMap, teamImageMap, categories, users, teamMembers };
`;

write('js/config/constants.js', constantsBody);

// ═══════════════════════════════════════════════════════════
// 3. helpers.js
// ═══════════════════════════════════════════════════════════
const helpersBody = `/* Kanjo Ops — Utility Helpers */

${extract(117, 169)}

${extract(1525, 1557)}

${extract(3353, 3353)}

${extract(3433, 3447)}

window.getBaseName = getBaseName;

export { getBaseName };
`;

write('js/utils/helpers.js', helpersBody);

// ═══════════════════════════════════════════════════════════
// 4. geolocation.js
// ═══════════════════════════════════════════════════════════
const geoFn = extract(173, 311);
const geoClean = geoFn
  .replace(/let hasRunGeoUpdate = false;\r?\n\r?\n/, '')
  .replace(/\bhasRunGeoUpdate\b/g, 'window.hasRunGeoUpdate');

const geoBodyFinal = `/* Kanjo Ops — Geolocation & Nominatim Reverse Geocoding */

${geoClean}

window.getCleanAddressFromCoords = getCleanAddressFromCoords;
window.checkAndUpdateMissingAddresses = checkAndUpdateMissingAddresses;

export { getCleanAddressFromCoords, checkAndUpdateMissingAddresses };
`;

write('js/services/geolocation.js', geoBodyFinal);

// ═══════════════════════════════════════════════════════════
// 5. export.js (Excel / SheetJS)
// ═══════════════════════════════════════════════════════════
const exportBody = `/* Kanjo Ops — Excel Export (SheetJS / XLSX) */

${extract(1101, 1521)}

${extract(2185, 2403)}

${extract(2118, 2155)}

${extract(4423, 4617)}

export {};
`;

write('js/utils/export.js', exportBody);

// ═══════════════════════════════════════════════════════════
// 6. auth.js
// ═══════════════════════════════════════════════════════════
// Need: SESSION/idle (2163-2181), applyTeamTheme (3525-3549), login + applyTheme (3583-3847), logout (6945)
// applyThemeAndShowDashboard references many UI functions via window — OK if called after all modules load

const authBody = `/* Kanjo Ops — Auth, Session & Idle Timeout */

import { users } from '../config/constants.js';

${extract(2163, 2181)}

window.SESSION_KEY = SESSION_KEY;
window.resetIdleTimer = resetIdleTimer;

${extract(3525, 3549)}

window.applyTeamTheme = applyTeamTheme;

${extract(3583, 3847)}

window.applyThemeAndShowDashboard = applyThemeAndShowDashboard;

window.logout = () => { window.clearSession(); window.location.reload(); };

export { SESSION_KEY, IDLE_TIMEOUT, resetIdleTimer, applyThemeAndShowDashboard };
`;

write('js/services/auth.js', authBody);

// ═══════════════════════════════════════════════════════════
// 7. firestore.js — cloud ops, snapshot, notifications, transfers, reports
// ═══════════════════════════════════════════════════════════
const firestoreBody = `/* Kanjo Ops — Firestore Cloud Operations */

${extract(1561, 1780)}

${extract(3451, 3521)}

${extract(4703, 5311)}

${extract(5315, 5469)}

${extract(5473, 5517)}

window.updateNotificationsUI = updateNotificationsUI;
window.updateQuickLinksWalletCounter = updateQuickLinksWalletCounter;

export { updateNotificationsUI, updateQuickLinksWalletCounter };
`;

write('js/services/firestore.js', firestoreBody);

// ═══════════════════════════════════════════════════════════
// 8. modals.js
// ═══════════════════════════════════════════════════════════
const modalsBody = `/* Kanjo Ops — Advanced Modal Interactions */

${extract(315, 1029)}

${extract(1031, 1099)}

${extract(3369, 3431)}

${extract(4743, 4989)}

${extract(6939, 6943)}

export {};
`;

write('js/ui/modals.js', modalsBody);

// ═══════════════════════════════════════════════════════════
// 9. accounting.js
// ═══════════════════════════════════════════════════════════
const accountingBody = `/* Kanjo Ops — Payroll, Commissions & Financial Profiles */

${extract(1781, 2159)}

${extract(2411, 2641)}

${extract(3851, 4421)}

export {};
`;

write('js/ui/accounting.js', accountingBody);

// ═══════════════════════════════════════════════════════════
// 10. dashboard.js
// ═══════════════════════════════════════════════════════════
const dashboardBody = `/* Kanjo Ops — Dashboard, Filters, Task Cards & Rankings */

${extract(2407, 2407)}

${extract(2645, 3349)}

${extract(3355, 3365)}

${extract(4621, 4699)}

${extract(5521, 6125)}

${extract(6129, 6375)}

${extract(6603, 6935)}

window.setupAdvancedFilterElements = setupAdvancedFilterElements;
window.calculateTopPerformer = calculateTopPerformer;
window.calculateTopTeam = calculateTopTeam;

export { setupAdvancedFilterElements, calculateTopPerformer, calculateTopTeam };
`;

write('js/ui/dashboard.js', dashboardBody);

// ═══════════════════════════════════════════════════════════
// 11. charts.js
// ═══════════════════════════════════════════════════════════
const chartsBody = `/* Kanjo Ops — Chart.js Statistical Charts */

${extract(6379, 6599)}

window.renderAdvancedCharts = renderAdvancedCharts;
window.valueLabelsPlugin = valueLabelsPlugin;
window.centerLogoPlugin = centerLogoPlugin;

export { renderAdvancedCharts, valueLabelsPlugin, centerLogoPlugin };
`;

write('js/ui/charts.js', chartsBody);

// ═══════════════════════════════════════════════════════════
// 12. main.js — Entry Point
// ═══════════════════════════════════════════════════════════
const mainBody = `/* Kanjo Ops — Application Entry Point */
import './config/firebase.js';
import { categories, users } from './config/constants.js';
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
    if (mCat) mCat.innerHTML += \`<option value="\${c}">\${c}</option>\`;
    if (editCat) editCat.innerHTML += \`<option value="\${c}">\${c}</option>\`;
});

/* Restore session if present */
const savedUser = localStorage.getItem(SESSION_KEY);
if (savedUser) {
    window.currentUser = JSON.parse(savedUser);
    applyThemeAndShowDashboard();
}
`;

write('js/main.js', mainBody);

console.log('\n✅ Modular split complete.');
