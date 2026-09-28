"use client";

import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";

import { useRouter } from "next/navigation";

import { loginWithEmail } from "@/src/features/auth/services/auth.client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      await loginWithEmail({
        email,
        password,
      });

      router.replace("/dashboard");

      router.refresh();
    } catch (error) {
      console.error(error);

      if (error instanceof FirebaseError) {
        switch (error.code) {
          case "auth/invalid-credential":
          case "auth/invalid-login-credentials":
          case "auth/invalid-email":
          case "auth/user-not-found":
          case "auth/wrong-password":
            setError("Invalid email or password.");
            break;
          case "auth/network-request-failed":
            setError("Unable to reach Firebase. Check your connection and try again.");
            break;
          case "auth/too-many-requests":
            setError("Too many sign-in attempts. Please try again later.");
            break;
          case "auth/user-disabled":
            setError("This account has been disabled.");
            break;
          default:
            setError("Unable to sign in. Please try again later.");
        }
      } else {
        setError("Unable to establish your login session. Please try again or contact support.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">ServiceFlow</h1>

        <input
          type="email"
          value={email}
          placeholder="Email"
          required
          className="w-full border p-3"
          onChange={(event) => setEmail(event.target.value)}
        />

        <input
          type="password"
          value={password}
          placeholder="Password"
          required
          className="w-full border p-3"
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button type="submit" disabled={loading} className="w-full border p-3">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
