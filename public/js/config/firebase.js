import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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


export {
    app, db, firebaseConfig,
    collection, addDoc, onSnapshot, query, where, updateDoc, doc,
    arrayUnion, deleteDoc, orderBy, getDocs, writeBatch, setDoc, getDoc,
    initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager
};
