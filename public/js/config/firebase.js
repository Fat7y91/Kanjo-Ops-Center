import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, addDoc, onSnapshot, query, where, updateDoc, doc, arrayUnion, deleteDoc, deleteField, orderBy, getDocs, writeBatch, setDoc, getDoc, limit, startAfter, clearIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
            localCache: persistentLocalCache({
                // Single-tab persistence. cacheSizeBytes is intentionally left at the
                // SDK default: a custom/unlimited cap made low-end devices hang while
                // the SDK resolved indexes against a huge stale IndexedDB cache.
                tabManager: persistentSingleTabManager()
            }),
            // Let the SDK auto-detect the transport. Forcing long-polling was
            // keeping the client pinned to a long-lived streaming fetch that
            // some networks reset ("WebChannelConnection ... transport
            // errored"), which drops the SDK into offline mode. Auto-detect
            // uses the standard transport when it works and only falls back to
            // long-polling when the stream is genuinely blocked.
            experimentalAutoDetectLongPolling: true
        });
    } catch (e) {
        // Persistent-cache init failed (e.g. IndexedDB blocked/conflicting across tabs).
        console.error("initializeFirestore (persistent cache) failed; using memory cache:", e);
        db = getFirestore(app);
    }
} else {
    // Storage-restricted context (e.g. Safari Private Browsing): memory cache only.
    try {
        db = initializeFirestore(app, {
            // Memory-cache contexts get the same auto-detected transport.
            experimentalAutoDetectLongPolling: true
        });
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

/* ─── Direct Firestore REST reads (transport-independent) ───
   Some networks reset the SDK's long-lived streaming transport
   (WebChannel/long-polling) even when ordinary HTTPS to the same host works.
   The SDK then reports "Backend didn't respond within 10 seconds", flips to
   offline mode and makes getDocs resolve from the local cache — which is empty
   on a fresh profile, so the dashboard shows 0 everywhere. The plain REST
   endpoint is a normal request/response call that survives those networks, so
   the task read paths use it directly and keep the SDK for real-time deltas and
   writes. `runQuery` is CORS-enabled for web origins. */

/* Mirrors the Firestore Timestamp shape closely enough that both guarded
   (`.toDate ? ... : new Date(x)`) and unguarded timestamp consumers keep
   working after a REST read. */
class KanjoRestTimestamp {
    constructor(iso) { this._date = new Date(iso); }
    toDate() { return this._date; }
    toMillis() { return this._date.getTime(); }
    valueOf() { return this._date.getTime(); }
    toString() { return this._date.toISOString(); }
    get seconds() { return Math.floor(this._date.getTime() / 1000); }
}

const restValueToJs = (value) => {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return new KanjoRestTimestamp(value.timestampValue);
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(restValueToJs);
    if ('mapValue' in value) return restFieldsToJs(value.mapValue.fields || {});
    if ('referenceValue' in value) return value.referenceValue;
    if ('geoPointValue' in value) return value.geoPointValue;
    return null;
};

const restFieldsToJs = (fields) => {
    const out = {};
    Object.keys(fields).forEach((key) => { out[key] = restValueToJs(fields[key]); });
    return out;
};

/* ─── Generic REST transport helpers ───
   Everything below speaks the plain Firestore REST API over `fetch`, so it
   keeps working when the SDK's streaming transport is blocked/reset. */

const REST_DOCUMENTS_URL = 'https://firestore.googleapis.com/v1/projects/'
    + firebaseConfig.projectId + '/databases/(default)/documents';

const restAuthHeaders = async () => {
    const user = auth.currentUser;
    let token = '';
    if (user && typeof user.getIdToken === 'function') {
        try { token = await user.getIdToken(); } catch (_) { token = ''; }
    }
    return Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}
    );
};

const restDocId = (name) => String(name || '').split('/').pop();

/* Flatten a REST document to the exact same shape the SDK's
   `{ id: d.id, ...d.data() }` produces, so REST is a true drop-in for every
   consumer (catalog cards, KPI attribution, tasks memory). */
const restRowsToDocs = (rows) => {
    const docs = [];
    (rows || []).forEach((row) => {
        if (!row || !row.document) return;
        docs.push({ id: restDocId(row.document.name), ...restFieldsToJs(row.document.fields || {}) });
    });
    return docs;
};

/* Primitive -> Firestore REST Value, so call sites can pass plain JS values. */
const restJsToValue = (value) => {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    return value;
};

/* Deep JS -> Firestore REST Value (objects become mapValue, arrays become
   arrayValue, Date becomes timestampValue). Required for REST writes. */
const restJsToRestValue = (value) => {
    if (value === null || value === undefined) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(restJsToRestValue) } };
    if (typeof value === 'object') return { mapValue: { fields: restJsToFields(value) } };
    return restJsToValue(value);
};

const restJsToFields = (obj) => {
    const fields = {};
    Object.keys(obj || {}).forEach((key) => { fields[key] = restJsToRestValue(obj[key]); });
    return fields;
};

/* The REST API wants operator enum names (EQUAL, LESS_THAN, ...), not the SDK's
   symbolic operators (`==`, `<`, ...). Without this mapping every filtered REST
   query fails with HTTP 400 "Invalid value ... FieldFilter.Operator". */
const REST_OP_ALIASES = {
    '==': 'EQUAL', '=': 'EQUAL',
    '!=': 'NOT_EQUAL',
    '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL',
    '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL',
    'in': 'IN', 'not-in': 'NOT_IN',
    'array-contains': 'ARRAY_CONTAINS',
    'array-contains-any': 'ARRAY_CONTAINS_ANY'
};
const restNormalizeOp = (op) => REST_OP_ALIASES[op] || op;

/* Query a top-level collection over REST. `filters` is an array of
   `[fieldPath, op, value]` clauses combined with AND. Returns flat
   `[{ id, ...fields }]`, matching the SDK snapshot shape. */
const restRunQuery = async (collectionId, filters = [], limit = null) => {
    const clauses = (filters || []).map(([field, op, value]) => ({
        fieldFilter: { field: { fieldPath: field }, op: restNormalizeOp(op), value: restJsToValue(value) }
    }));
    const structuredQuery = { from: [{ collectionId }] };
    if (clauses.length === 1) structuredQuery.where = clauses[0];
    else if (clauses.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters: clauses } };
    if (limit) structuredQuery.limit = limit;

    const url = REST_DOCUMENTS_URL + ':runQuery?key=' + encodeURIComponent(firebaseConfig.apiKey);
    const response = await fetch(url, {
        method: 'POST',
        headers: await restAuthHeaders(),
        body: JSON.stringify({ structuredQuery })
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error('Firestore REST runQuery failed (' + response.status + '): ' + body.slice(0, 200));
    }
    return restRowsToDocs(await response.json());
};

/* List a collection or subcollection by path segments, following page tokens.
   Returns flat `[{ id, ...fields }]`; a missing path is an empty list, never an
   error. */
const restListCollection = async (segments, { pageSize = 300, maxPages = 20 } = {}) => {
    const path = segments.map(encodeURIComponent).join('/');
    const build = (pageToken) => {
        let u = REST_DOCUMENTS_URL + '/' + path + '?pageSize=' + pageSize + '&key=' + encodeURIComponent(firebaseConfig.apiKey);
        if (pageToken) u += '&pageToken=' + encodeURIComponent(pageToken);
        return u;
    };
    const docs = [];
    let token = null;
    let pages = 0;
    do {
        const response = await fetch(build(token), { method: 'GET', headers: await restAuthHeaders() });
        if (response.status === 404) break;
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error('Firestore REST list failed (' + response.status + '): ' + body.slice(0, 200));
        }
        const body = await response.json();
        (body.documents || []).forEach((doc) => {
            docs.push({ id: restDocId(doc.name), ...restFieldsToJs(doc.fields || {}) });
        });
        token = body.nextPageToken || null;
        pages += 1;
    } while (token && pages < maxPages);
    return docs;
};

/* Read one document by path segments. Returns a flat `{ id, ...fields }` or null.
   A missing document yields 404, which is a normal "not created yet" outcome for
   subcollection parents — handled silently, never thrown. */
const restGetDocument = async (segments) => {
    const path = segments.map(encodeURIComponent).join('/');
    const url = REST_DOCUMENTS_URL + '/' + path + '?key=' + encodeURIComponent(firebaseConfig.apiKey);
    const response = await fetch(url, { method: 'GET', headers: await restAuthHeaders() });
    if (response.status === 404) return null;
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error('Firestore REST doc fetch failed (' + response.status + '): ' + body.slice(0, 200));
    }
    const body = await response.json();
    return { id: restDocId(body.name), ...restFieldsToJs(body.fields || {}) };
};

/* Merge-write plain JS fields over REST (PATCH + updateMask), mirroring the
   SDK's `setDoc(ref, data, { merge: true })`. Used so KPI writes never have to
   wake the SDK streaming transport (the source of the offline/timeout noise). */
const restPatchDocument = async (segments, data) => {
    const path = segments.map(encodeURIComponent).join('/');
    const fieldPaths = Object.keys(data || {})
        .map((f) => 'updateMask.fieldPaths=' + encodeURIComponent(f))
        .join('&');
    const url = REST_DOCUMENTS_URL + '/' + path
        + '?key=' + encodeURIComponent(firebaseConfig.apiKey)
        + (fieldPaths ? '&' + fieldPaths : '');
    const response = await fetch(url, {
        method: 'PATCH',
        headers: await restAuthHeaders(),
        body: JSON.stringify({ fields: restJsToFields(data) })
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error('Firestore REST patch failed (' + response.status + '): ' + body.slice(0, 200));
    }
    const body = await response.json();
    return { id: restDocId(body.name), ...restFieldsToJs(body.fields || {}) };
};

/* Reads the `tasks` collection straight over REST. `team` scopes a rep to their
   own team; `date` scopes to a single day (omit for the full archive). */
const restFetchTasks = async ({ team = null, date = null } = {}) => {
    const filters = [];
    if (team) filters.push(['team', 'EQUAL', team]);
    if (date) filters.push(['time', 'EQUAL', date]);
    const docs = await restRunQuery('tasks', filters);
    /* runQuery preserves no order without an explicit orderBy; the dashboard
       expects newest-first, so sort by the `time` field descending. */
    docs.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    return docs;
};

window.kanjoRest = {
    fetchTasks: restFetchTasks,
    runQuery: restRunQuery,
    list: restListCollection,
    getDocument: restGetDocument,
    patch: restPatchDocument,
    parseValue: restValueToJs,
    parseFields: restFieldsToJs
};


/* Shared mutable state (mirrored on window for cross-module bare access in ES Modules) */
window.editTaskId = null;
window.taskToDelete = null;
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
