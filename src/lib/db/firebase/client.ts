import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

import { getFirebaseWebConfig } from "@/lib/db/firebase/config";

/**
 * Browser Firebase client for the Operations domain: live order tracking,
 * catalog browsing and offline-first field data. Memoised per tab so HMR and
 * repeated imports never create a second FirebaseApp.
 */
const APP_NAME = "kanjo-v2-operations";
let webApp: FirebaseApp | null = null;
let webFirestore: Firestore | null = null;

function toFirebaseOptions(): FirebaseOptions {
  const config = getFirebaseWebConfig();
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId,
  };
}

export function getFirebaseClientApp(): FirebaseApp {
  if (webApp) return webApp;

  webApp = getApps().some((app) => app.name === APP_NAME)
    ? getApp(APP_NAME)
    : initializeApp(toFirebaseOptions(), APP_NAME);

  return webApp;
}

export function getFirebaseClientFirestore(): Firestore {
  if (webFirestore) return webFirestore;

  const app = getFirebaseClientApp();
  const supportsIndexedDb = typeof indexedDB !== "undefined";

  // Safari private mode and storage-restricted WebViews fail the persistent
  // cache probe. Fall back to the default in-memory cache rather than let the
  // first read reject with failed-precondition.
  webFirestore = supportsIndexedDb
    ? initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    : getFirestore(app);

  return webFirestore;
}
