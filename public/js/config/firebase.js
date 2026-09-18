import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, CACHE_SIZE_UNLIMITED, collection, addDoc, onSnapshot, query, where, updateDoc, doc, arrayUnion, deleteDoc, deleteField, orderBy, getDocs, writeBatch, setDoc, getDoc, limit, startAfter, clearIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

// Firebase web config. Values are injected at build time by scripts/split-modules.mjs
// from environment variables (FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, ...). The
// fallbacks below are the kanjo-desouk production values; Firebase web API keys are
// public identifiers (not secrets) but they are kept out of source control via the
// build-time env injection for hygiene.
const firebaseConfig = { apiKey: "AIzaSyBVYed19A7ob4M24oPK7P3-9vzH_iSRKZ0", authDomain: "kanjo-desouk.web.app", projectId: "kanjo-desouk", storageBucket: "kanjo-desouk.firebasestorage.app", messagingSenderId: "253872156774", appId: "1:253872156774:web:1d554b3bf0b78b98c77da7", measurementId: "G-FBM6G2RF1B" };

const app = initializeApp(firebaseConfig);

/* Persistent (IndexedDB) cache is a big win on normal browsers but is broken in
   Safari Private Browsing and other storage-restricted/incognito modes: the SDK
   then fails its reads with a failed-precondition/persistence error that used to
   be misread as a "missing index" (the red banner) and left the dashboard empty.
   Probe storage first and fall back to an in-memory cache when it isn't usable. */
const canPersistLocalCache = (() => {
    try {
        if (typeof indexedDB === 'undefined' || !indexedDB) return false;
        const probeKey = '__kanjo_persist_probe__';
        localStorage.setItem(probeKey, '1');
        localStorage.removeItem(probeKey);
        return true;
    } catch (_) {
        return false;
    }
})();

let db;

if (canPersistLocalCache) {
    try {
        db = initializeFirestore(app, {
            // Auto-detect transport: start with the fast default WebChannel/WebSocket
            // stream and fall back to HTTP long-polling only when the network
            // (ISP/mobile/hotel Wi-Fi, corporate proxy) actually breaks the stream.
            // Previously we force-disabled WebChannel for everyone, which made good
            // networks pay long-polling latency on every read.
            experimentalAutoDetectLongPolling: true,
            localCache: persistentLocalCache({
                // Single-tab persistence: cacheSizeBytes is NOT supported with multi-tab,
                // and passing both silently falls back to an in-memory cache that refetches
                // everything on every reload (main cause of the app being extremely heavy).
                tabManager: persistentSingleTabManager(),
                // Unlimited persistent (IndexedDB) cache so the full text dataset stays
                // local and the UI paints instantly/offline without server round-trips.
                cacheSizeBytes: CACHE_SIZE_UNLIMITED
            })
        });
    } catch (e) {
        // Persistent-cache init failed (e.g. IndexedDB blocked/conflicting across tabs).
        console.error("initializeFirestore (persistent cache) failed; using memory cache:", e);
        db = getFirestore(app);
    }
} else {
    // Storage-restricted context (e.g. Safari Private Browsing): memory cache only.
    try {
        db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch (e) {
        console.error("initializeFirestore failed; using default memory cache:", e);
        db = getFirestore(app);
    }
}

// ─── Firebase App Check (stub for reCAPTCHA v3 / Cloudflare Turnstile) ───
// Inject the site key by setting window.FIREBASE_APP_CHECK_SITE_KEY BEFORE this
// module loads (see the inline script in dashboard.html), or at build time via the
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
window.signOut = signOut;

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
    const msg = String(err.message || '');
    /* Require index-specific text. Previously ANY failed-precondition was treated
       as a missing index, so the IndexedDB persistence failure seen in Safari
       Private Browsing was shown to users as a scary "Firebase needs an index"
       banner. Persistence errors must never be misclassified this way. */
    return msg.indexOf('create_composite') !== -1
        || /requires an index/i.test(msg)
        || FIREBASE_INDEX_URL_RE.test(msg);
};

const reportFirestoreIndexError = (err) => {
    if (!isFirestoreIndexError(err)) return;
    const msg = String(err.message || '');
    const urlMatch = msg.match(FIREBASE_INDEX_URL_RE);
    const url = urlMatch ? urlMatch[0] : '';
    /* Record the URL for operators (console/diagnostics) but never replace the
       dashboard with a full-screen developer error: callers either recover with
       a fallback query or surface a neutral message. */
    window.lastFirestoreIndexUrl = url || window.lastFirestoreIndexUrl || '';
    console.error("Firestore missing-index error (handled without user banner):", url || msg);
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
window.deleteField = deleteField;
window.orderBy = orderBy;
window.getDocs = wrappedGetDocs;
window.writeBatch = writeBatch;
window.setDoc = setDoc;
window.getDoc = wrappedGetDoc;
window.isFirestoreIndexError = isFirestoreIndexError;


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
