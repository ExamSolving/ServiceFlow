import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

/**
 * At runtime `firebase/auth` re-exports the React Native build of @firebase/auth
 * (Metro picks its "react-native" export condition), but the published type
 * definitions only describe the web build. Declare the React Native
 * persistence helper so TypeScript knows it exists.
 */
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
