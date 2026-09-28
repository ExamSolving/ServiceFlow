import "server-only";

import { getApps, initializeApp } from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

if (!projectId) {
  throw new Error("Missing FIREBASE_ADMIN_PROJECT_ID");
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        projectId,
      });

export const adminAuth = getAuth(adminApp);
