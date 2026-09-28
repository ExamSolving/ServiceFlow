"use client";

import { useState } from "react";

import Link from "next/link";

import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";

import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/src/features/auth/schemas/forgot-password.schema";

import { requestPasswordReset } from "@/src/features/auth/services/auth.client";

import { getFirebaseAuthError } from "@/src/lib/utils/firebase-error";

export function ForgotPasswordForm() {
  const [success, setSuccess] = useState(false);

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,

    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),

    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    try {
      setServerError(null);

      await requestPasswordReset({
        email: values.email,
      });

      /*
       * Always show success.
       *
       * This prevents account
       * enumeration.
       */
      setSuccess(true);
    } catch (error) {
      console.error("Password reset failed:", error);

      setServerError(getFirebaseAuthError(error));
    }
  }

  if (success) {
    return (
      <div className="w-full text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="size-7 text-emerald-600" />
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">
          Check your email
        </h1>

        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          If an account exists for that email address, we&apos;ve sent
          instructions to reset the password.
        </p>

        <Button asChild className="mt-8 h-12 w-full rounded-xl">
          <Link href="/login">Return to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">
          Password recovery
        </p>

        <h1 className="text-3xl font-semibold tracking-[-0.03em]">
          Forgot your password?
        </h1>

        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          Enter your work email and we&apos;ll send you instructions to reset
          your password.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
              className="h-12 rounded-xl pl-10"
              disabled={isSubmitting}
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

        {serverError && (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {serverError}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-12 w-full rounded-xl font-semibold"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send reset instructions"
          )}
        </Button>

        <Button asChild variant="ghost" className="h-11 w-full">
          <Link href="/login">
            <ArrowLeft className="mr-2 size-4" />
            Back to sign in
          </Link>
        </Button>
      </form>
    </div>
  );
}
