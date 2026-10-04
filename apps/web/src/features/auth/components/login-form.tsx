"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginSchema,
  type LoginFormValues,
} from "@/src/features/auth/schemas/login.schema";
import { loginWithEmail } from "@/src/features/auth/services/auth.client";
import { useLogout } from "@/src/features/auth/hooks/use-logout";
import { getAuthErrorMessage } from "@/src/lib/utils/firebase-error";
import { PasswordField } from "./password-field";

function AccountUnavailableNotice() {
  const { signOut, loading, error } = useLogout();
  return (
    <div className="sf-alert" role="alert">
      <UserX size={18} aria-hidden="true" />
      <div>
        <p>
          <strong>Your account isn’t active in a ServiceFlow workspace.</strong>{" "}
          Ask your workspace owner for an invitation, or sign in below with a
          different account. Signing out clears this browser’s session.
        </p>
        <button
          type="button"
          className="sf-text-link"
          onClick={signOut}
          disabled={loading}
          style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: 0, padding: 0, cursor: "pointer" }}
        >
          <LogOut size={14} aria-hidden="true" />
          {loading ? "Signing out…" : "Sign out of this browser"}
        </button>
        {error && <p className="sf-field-error">{error}</p>}
      </div>
    </div>
  );
}

export function LoginForm({ accountUnavailable = false }: { accountUnavailable?: boolean }) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const isBusy = isSubmitting || isNavigating;

  async function onSubmit(values: LoginFormValues) {
    try {
      setServerError(null);
      await loginWithEmail(values);
      startTransition(() => {
        router.replace("/dashboard");
      });
    } catch (error) {
      console.error("Login failed:", error);
      setServerError(getAuthErrorMessage(error));
    }
  }

  return (
    <div className="sf-auth-page">
      <div className="sf-form-heading">
        <p className="sf-eyebrow">WELCOME TO YOUR WORKSPACE</p>
        <h1>Good to have you back.</h1>
        <p>Sign in and pick up where your team left off.</p>
      </div>
      {accountUnavailable && <AccountUnavailableNotice />}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="sf-form"
        noValidate
        aria-busy={isBusy}
      >
        <div className="sf-field">
          <Label htmlFor="email">Work email</Label>
          <div className="sf-input-wrap">
            <Mail size={18} className="sf-input-icon" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@company.com"
              className="sf-input"
              disabled={isBusy}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p id="email-error" className="sf-field-error" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          disabled={isBusy}
          error={errors.password?.message}
          action={
            <Link href="/forgot-password" className="sf-text-link">
              Forgot password?
            </Link>
          }
          {...register("password")}
        />
        {serverError && (
          <div className="sf-alert" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}
        <Button type="submit" className="sf-primary-button" disabled={isBusy}>
          {isBusy ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              {isNavigating ? "Opening dashboard…" : "Signing in…"}
            </>
          ) : (
            <>
              Sign in to workspace
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </Button>
        <p className="sf-switch">
          New to ServiceFlow?{" "}
          <Link href="/register">
            Create a workspace <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      </form>
      <div className="sf-form-note">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>Your team&apos;s next great work starts here.</span>
      </div>
    </div>
  );
}
