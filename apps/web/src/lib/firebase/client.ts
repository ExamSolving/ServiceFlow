import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

import { firebaseConfig } from "./config";

// Only Firebase Authentication runs in the browser. All data access goes
// through the server with the Admin SDK, so Firestore/Storage are not loaded.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export { app };
