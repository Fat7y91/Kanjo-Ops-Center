import "server-only";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { optionalEnv, requireEnv } from "@/lib/db/env";

/**
 * Privileged Firebase Admin client for Operations writes that cannot be
 * expressed as client-side rules (order state machines, background sync).
 *
 * IMPORTANT: `firebase-admin` depends on Node built-ins and therefore cannot
 * run on the Cloudflare Edge Runtime. Tier 2 controllers that use this client
 * MUST declare `export const runtime = "nodejs"`. Edge routes must go through
 * the client SDK or the REST API instead.
 */
const ADMIN_APP_NAME = "kanjo-v2-admin";
let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;

function readServiceAccount(): ServiceAccount {
  const rawJson = optionalEnv("FIREBASE_SERVICE_ACCOUNT");

  if (rawJson) {
    const parsed = JSON.parse(rawJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT must contain client_email and private_key.",
      );
    }

    return {
      projectId: parsed.project_id ?? requireEnv("FIREBASE_PROJECT_ID"),
      clientEmail: parsed.client_email,
      // Cloudflare stores secrets literally; restore newlines from \n escapes.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  return {
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

export function getFirebaseAdminApp(): App {
  if (adminApp) return adminApp;

  if (process.env.NEXT_RUNTIME === "edge") {
    throw new Error(
      "firebase-admin is not supported on the Edge Runtime. Declare " +
        'export const runtime = "nodejs" on this route, or use the client SDK.',
    );
  }

  adminApp = getApps().some((app) => app.name === ADMIN_APP_NAME)
    ? getApp(ADMIN_APP_NAME)
    : initializeApp(
        {
          credential: cert(readServiceAccount()),
          projectId: requireEnv("FIREBASE_PROJECT_ID"),
        },
        ADMIN_APP_NAME,
      );

  return adminApp;
}

export function getFirebaseAdminFirestore(): Firestore {
  if (adminFirestore) return adminFirestore;
  adminFirestore = getFirestore(getFirebaseAdminApp());
  return adminFirestore;
}
