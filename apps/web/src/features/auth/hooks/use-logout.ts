"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "../services/auth.api";

export function useLogout() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("We couldn’t sign you out. Please try again.");
      setLoading(false);
    }
  }
  return { signOut, loading, error };
}
