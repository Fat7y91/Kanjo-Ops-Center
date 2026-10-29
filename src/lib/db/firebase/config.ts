import { optionalEnv, requireEnv } from "@/lib/db/env";

/**
 * Firebase web configuration. These values are public identifiers (they ship
 * in the browser bundle), so they are read from `NEXT_PUBLIC_*` keys. They are
 * separate from the legacy static-site `FIREBASE_*` keys in `.env.example`,
 * which belong to `public/js/config/firebase.js` and the build scripts.
 */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export function getFirebaseWebConfig(): FirebaseWebConfig {
  const measurementId = optionalEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID");

  return {
    apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
    ...(measurementId ? { measurementId } : {}),
  };
}

export function getFirebaseProjectId(): string {
  const publicProjectId = optionalEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  return publicProjectId ?? requireEnv("FIREBASE_PROJECT_ID");
}

export function getFirebaseAppCheckSiteKey(): string | undefined {
  return optionalEnv("NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY");
}

export function hasFirebaseWebConfig(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    optionalEnv("NEXT_PUBLIC_FIREBASE_API_KEY", source) &&
      optionalEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", source) &&
      optionalEnv("NEXT_PUBLIC_FIREBASE_APP_ID", source),
  );
}
