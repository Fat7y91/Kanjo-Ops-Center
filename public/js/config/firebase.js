import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, addDoc, onSnapshot, query, where, updateDoc, doc, arrayUnion, deleteDoc, orderBy, getDocs, writeBatch, setDoc, getDoc, limit, startAfter, clearIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

// Firebase web config. Values are injected at build time by scripts/split-modules.mjs
// from environment variables (FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, ...). The
// fallbacks below are the kanjo-desouk production values; Firebase web API keys are
// public identifiers (not secrets) but they are kept out of source control via the
// build-time env injection for hygiene.
const firebaseConfig = { apiKey: "AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0", authDomain: "kanjo-desouk.firebaseapp.com", projectId: "kanjo-desouk", storageBucket: "kanjo-desouk.firebasestorage.app", messagingSenderId: "253872156774", appId: "1:253872156774:web:1d554b3bf0b78b98c77da7", measurementId: "G-FBM6G2RF1B" };

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
    // Persistent-cache init failed (e.g. IndexedDB blocked/conflicting across tabs).
    // Clear any half-initialized persisted cache BEFORE falling back to memory so a
    // stale IndexedDB state can never poison reads again.
    console.error("initializeFirestore (persistent cache) failed:", e);
    db = getFirestore(app); // Fallback to memory cache immediately
    if (typeof clearIndexedDbPersistence === 'function') {
        clearIndexedDbPersistence(db).then(() => {
            console.log("Firestore persisted cache cleared; falling back to memory cache.");
        }).catch((ce) => console.error("clearIndexedDbPersistence error:", ce));
    }
}

// ─── Firebase App Check (stub for reCAPTCHA v3 / Cloudflare Turnstile) ───
// Inject the site key by setting window.FIREBASE_APP_CHECK_SITE_KEY BEFORE this
// module loads (see the inline script in index.html), or at build time via the
// FIREBASE_APP_CHECK_SITE_KEY env var in scripts/split-modules.mjs.
// App Check only starts enforcing after "Enforce" is enabled in the Firebase console.
const appCheckSiteKey = (typeof window !== 'undefined' && window.FIREBASE_APP_CHECK_SITE_KEY) || "";
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
// anonymously to Firebase Auth. This makes `request.auth != null` true for every
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

/* ─── Firestore index-error interception ───
   The paginated queries (orderBy + limit/startAfter) can throw
   FAILED_PRECONDITION when a required composite index is missing in the
   Firebase console. Every read in the app goes through these window mirrors,
   so we wrap them once here: on an index error we surface the exact Firebase
   index-creation URL through window.showFirestoreIndexError() (rendered by
   ui/dashboard.js) and still propagate the error to the original caller. */

const FIREBASE_INDEX_URL_RE = /https?:\/\/console\.firebase\.google\.com\/[^\s"'<>)]+/;

const isFirestoreIndexError = (err) => {
    if (!err) return false;
    const code = String(err.code || '').toLowerCase();
    const msg = String(err.message || '');
    return code === 'failed-precondition'
        || msg.indexOf('FAILED_PRECONDITION') !== -1
        || msg.indexOf('indexes?create_composite') !== -1
        || FIREBASE_INDEX_URL_RE.test(msg);
};

const reportFirestoreIndexError = (err) => {
    if (!isFirestoreIndexError(err)) return;
    const msg = String(err.message || '');
    const urlMatch = msg.match(FIREBASE_INDEX_URL_RE);
    const url = urlMatch ? urlMatch[0] : '';
    console.error("Firestore index error detected:", url || msg);
    if (typeof window.showFirestoreIndexError === 'function') {
        window.showFirestoreIndexError(url, err);
    }
};

const wrappedGetDocs = (queryRef, ...rest) => {
    const p = getDocs(queryRef, ...rest);
    return p.then(
        (snap) => snap,
        (err) => { reportFirestoreIndexError(err); throw err; }
    );
};

const wrappedGetDoc = (docRef, ...rest) => {
    const p = getDoc(docRef, ...rest);
    return p.then(
        (snap) => snap,
        (err) => { reportFirestoreIndexError(err); throw err; }
    );
};

const wrappedOnSnapshot = (ref, ...args) => {
    const functionCount = args.filter(a => typeof a === 'function').length;
    const wrappedArgs = args.map((arg, i) => {
        if (typeof arg !== 'function') return arg;
        const isLastFunction = args.slice(i + 1).every(a => typeof a !== 'function');
        const isErrorHandler = functionCount > 1 && isLastFunction;
        if (!isErrorHandler) return arg;
        return (error) => {
            reportFirestoreIndexError(error);
            return arg(error);
        };
    });
    return onSnapshot(ref, ...wrappedArgs);
};

window.db = db;
window.collection = collection;
window.addDoc = addDoc;
window.onSnapshot = wrappedOnSnapshot;
window.query = query;
window.where = where;
window.limit = limit;
window.startAfter = startAfter;
window.updateDoc = updateDoc;
window.doc = doc;
window.arrayUnion = arrayUnion;
window.deleteDoc = deleteDoc;
window.orderBy = orderBy;
window.getDocs = wrappedGetDocs;
window.writeBatch = writeBatch;
window.setDoc = setDoc;
window.getDoc = wrappedGetDoc;


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


export {
    app, db, firebaseConfig,
    collection, addDoc, wrappedOnSnapshot as onSnapshot, query, where, updateDoc, doc,
    arrayUnion, deleteDoc, orderBy, wrappedGetDocs as getDocs, writeBatch, setDoc, wrappedGetDoc as getDoc,
    limit, startAfter,
    initializeFirestore, getFirestore, persistentLocalCache, persistentSingleTabManager, clearIndexedDbPersistence
};
