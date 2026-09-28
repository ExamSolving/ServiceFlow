import { FirebaseError } from "firebase/app";

export function getFirebaseAuthError(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "auth/invalid-credential":
      return "Email or password is incorrect.";

    case "auth/user-disabled":
      return "This account has been disabled.";

    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Unable to connect. Check your internet connection.";

    default:
      return "Unable to sign in. Please try again.";
  }
}
