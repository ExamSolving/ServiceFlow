import type { FirebaseOptions } from 'firebase/app';

import { env } from '@/lib/env';

/** The same Firebase project as the web admin. Only Authentication is used on mobile. */
export const firebaseConfig: FirebaseOptions = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  appId: env.firebase.appId,
  ...(env.firebase.storageBucket ? { storageBucket: env.firebase.storageBucket } : {}),
  ...(env.firebase.messagingSenderId ? { messagingSenderId: env.firebase.messagingSenderId } : {}),
};
