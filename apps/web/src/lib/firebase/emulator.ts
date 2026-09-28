import { connectAuthEmulator } from "firebase/auth";

import { auth } from "./client";

let authEmulatorConnected = false;

export function connectAuthEmulatorIfNeeded() {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") {
    return;
  }

  if (authEmulatorConnected) {
    return;
  }

  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });

  authEmulatorConnected = true;
}
