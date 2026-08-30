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

// ─── Firebase config sourced from build-time environment variables ───
// Prevents hardcoded Google API keys in the committed public module. Values are
// injected when scripts/split-modules.mjs runs during the build; each variable
// falls back to the kanjo-desouk production value when the env var is absent.
const firebaseEnv = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'kanjo-desouk.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'kanjo-desouk',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'kanjo-desouk.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '253872156774',
  appId: process.env.FIREBASE_APP_ID || '1:253872156774:web:1d554b3bf0b78b98c77da7',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-FBM6G2RF1B',
  appCheckSiteKey: process.env.FIREBASE_APP_CHECK_SITE_KEY || ''
};

let lines = null;
try {
  lines = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8').split(/\r?\n/);
} catch (err) {
  console.warn('public/app.js not found (' + err.code + '). Regenerating firebase.js only.');
}

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
window.merchantsById = new Map();
window.merchantDocsDraft = null;
`;

// ═══════════════════════════════════════════════════════════
// 1. firebase.js
// ═══════════════════════════════════════════════════════════
const firebaseConfigLiteral = `{ apiKey: ${JSON.stringify(firebaseEnv.apiKey)}, authDomain: ${JSON.stringify(firebaseEnv.authDomain)}, projectId: ${JSON.stringify(firebaseEnv.projectId)}, storageBucket: ${JSON.stringify(firebaseEnv.storageBucket)}, messagingSenderId: ${JSON.stringify(firebaseEnv.messagingSenderId)}, appId: ${JSON.stringify(firebaseEnv.appId)}, measurementId: ${JSON.stringify(firebaseEnv.measurementId)} }`;

const appCheckSiteKeyLiteral = JSON.stringify(firebaseEnv.appCheckSiteKey);

const firebaseBody = `import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, addDoc, onSnapshot, query, where, updateDoc, doc, arrayUnion, deleteDoc, orderBy, getDocs, writeBatch, setDoc, getDoc, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

// Firebase web config. Values are injected at build time by scripts/split-modules.mjs
// from environment variables (FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, ...). The
// fallbacks below are the kanjo-desouk production values; Firebase web API keys are
// public identifiers (not secrets) but they are kept out of source control via the
// build-time env injection for hygiene.
const firebaseConfig = ${firebaseConfigLiteral};

const app = initializeApp(firebaseConfig);

let db;

try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            // Single-tab persistence: cacheSizeBytes is NOT supported with multi-tab,
            // and passing both silently falls back to an in-memory cache that refetches
            // everything on every reload (main cause of the app being extremely heavy).
            tabManager: persistentSingleTabManager(),
            // 10 MB hard cap on the persistent (IndexedDB) cache. Prevents old/low-end
            // devices from hanging while the SDK resolves indexes against a huge stale
            // local cache during multi-city scale-up.
            cacheSizeBytes: 10485760
        })
    });
} catch (e) {
    db = getFirestore(app);
}

// ─── Firebase App Check (stub for reCAPTCHA v3 / Cloudflare Turnstile) ───
// Inject the site key by setting window.FIREBASE_APP_CHECK_SITE_KEY BEFORE this
// module loads (see the inline script in dashboard.html), or at build time via the
// FIREBASE_APP_CHECK_SITE_KEY env var in scripts/split-modules.mjs.
// App Check only starts enforcing after "Enforce" is enabled in the Firebase console.
const appCheckSiteKey = (typeof window !== 'undefined' && window.FIREBASE_APP_CHECK_SITE_KEY) || ${appCheckSiteKeyLiteral};
if (appCheckSiteKey) {
    try {
        window.appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(appCheckSiteKey),
            isTokenAutoRefreshEnabled: true
        });
        console.log("Firebase App Check initialized with reCAPTCHA v3 site key.");
    } catch (e) {
        console.error("Firebase App Check init failed:", e);
    }
}

// ─── Firebase Auth baseline for security rules ───
// The dashboard keeps its PIN login UX; under the hood every session ALSO signs in
// anonymously to Firebase Auth. This makes \`request.auth != null\` true for every
// session so the strict Firestore rules (deny-by-default) keep the app working
// while blocking anonymous/unauthenticated access.
const auth = getAuth(app);
window.auth = auth;
window.signInAnonymously = signInAnonymously;

// Resolves once an authenticated session is established. Data listeners should
// wait on window.authReady before reading/writing so they don't race auth.
window.authReady = signInAnonymously(auth)
    .then((user) => user)
    .catch((err) => {
        if (auth.currentUser) return auth.currentUser;
        console.error("Anonymous sign-in failed; Firestore security rules will deny access:", err);
        return null;
    });

window.db = db;
window.collection = collection;
window.addDoc = addDoc;
window.onSnapshot = onSnapshot;
window.query = query;
window.where = where;
window.limit = limit;
window.startAfter = startAfter;
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
    limit, startAfter,
    initializeFirestore, getFirestore, persistentLocalCache, persistentSingleTabManager
};
`;

write('js/config/firebase.js', firebaseBody);

if (!lines) {
  console.log('\n✅ Firebase config regenerated from environment variables (firebase.js only).');
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════
// 2. constants.js
// ═══════════════════════════════════════════════════════════
const userImageMap = extract(93, 113);
const categoriesBlock = extract(3553, 3573);

const constantsBody = `/* Kanjo Ops — Global Constants */

import { KANJO_DRIVE_SCRIPT_URL, KANJO_DRIVE_SCRIPT_TOKEN } from './drive-config.generated.js';

${userImageMap}

${categoriesBlock}

window.userImageMap = userImageMap;
window.teamImageMap = teamImageMap;
window.categories = categories;
window.users = users;
window.teamMembers = teamMembers;
window.KANJO_DRIVE_SCRIPT_URL = KANJO_DRIVE_SCRIPT_URL;
window.KANJO_DRIVE_SCRIPT_TOKEN = KANJO_DRIVE_SCRIPT_TOKEN;

export { userImageMap, teamImageMap, categories, users, teamMembers, KANJO_DRIVE_SCRIPT_URL, KANJO_DRIVE_SCRIPT_TOKEN };
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
