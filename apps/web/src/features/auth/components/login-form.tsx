"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

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

import { getFirebaseAuthError } from "@/src/lib/utils/firebase-error";

export function LoginForm() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  const [showPassword, setShowPassword] = useState(false);

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),

    defaultValues: {
      email: "",
      password: "",
    },
  });

  const isBusy = isSubmitting || isNavigating;

  async function onSubmit(values: LoginFormValues) {
    try {
      setServerError(null);

      await loginWithEmail({
        email: values.email,
        password: values.password,
      });

      startTransition(() => {
        router.replace("/dashboard");
      });
    } catch (error) {
      console.error("Login failed:", error);

      setServerError(getFirebaseAuthError(error));
    }
  }

  return (
    <div className="w-full">
      {/* Header */}

      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">Welcome back</p>

        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Sign in to ServiceFlow
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Access your workspace and manage customers, jobs, technicians and
          operations.
        </p>
      </div>

      {/* Form */}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Email */}

        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>

          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />

            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="h-11 pl-10"
              disabled={isBusy}
              aria-invalid={!!errors.email}
              {...register("email")}
            />
          </div>

          {errors.email && (
            <p className="text-sm text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>

            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              Forgot password?
            </Link>
          </div>

          <div className="relative">
            <LockKeyhole
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />

            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-11 px-10"
              disabled={isBusy}
              aria-invalid={!!errors.password}
              {...register("password")}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              disabled={isBusy}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          {errors.password && (
            <p className="text-sm text-destructive" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Server error */}

        {serverError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {serverError}
          </div>
        )}

        {/* Submit */}

        <Button type="submit" className="h-11 w-full" disabled={isBusy}>
          {isBusy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {isNavigating ? "Opening dashboard..." : "Signing in..."}
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        {/* Register */}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have a ServiceFlow workspace?{" "}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Create account
          </Link>
        </p>
      </form>
    </div>
  );
}
