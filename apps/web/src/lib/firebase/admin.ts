import "server-only";

import { getApps, initializeApp } from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

if (!projectId) {
  throw new Error("Missing FIREBASE_ADMIN_PROJECT_ID");
}

if (process.env.NODE_ENV === "development") {
  console.log("[FIREBASE ADMIN] projectId:", projectId);

  console.log(
    "[FIREBASE ADMIN] auth emulator:",
    process.env.FIREBASE_AUTH_EMULATOR_HOST,
  );

  console.log(
    "[FIREBASE ADMIN] firestore emulator:",
    process.env.FIRESTORE_EMULATOR_HOST,
  );
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        projectId,
      });

export const adminAuth = getAuth(adminApp);

export const adminDb = getFirestore(adminApp);
