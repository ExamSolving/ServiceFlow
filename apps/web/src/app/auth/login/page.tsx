"use client";

import { FormEvent, useState } from "react";

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

      setError("Invalid email or password.");
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
