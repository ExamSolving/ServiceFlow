"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
} from "lucide-react";
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
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    try {
      setServerError(null);
      await requestPasswordReset({ email: values.email });
      // Keep the same response whether or not this account exists.
      setSubmittedEmail(values.email.trim());
    } catch (error) {
      console.error("Password reset failed:", error);
      setServerError(getFirebaseAuthError(error));
    }
  }

  if (submittedEmail !== null) {
    return (
      <div className="sf-auth-page sf-success" role="status">
        <div className="sf-state-icon">
          <MailCheck size={27} aria-hidden="true" />
        </div>
        <div className="sf-form-heading">
          <p className="sf-eyebrow">YOUR NEXT STEP</p>
          <h1>Check your inbox.</h1>
          <p>
            If an account exists for{" "}
            <strong className="sf-email-value">{submittedEmail}</strong>,
            you&apos;ll receive a link to reset your password.
          </p>
        </div>
        <div className="sf-info-panel">
          <Mail size={18} aria-hidden="true" />
          <p>
            Give it a moment to arrive, and check your spam folder too. Follow
            the link in the email to choose a new password.
          </p>
        </div>
        <Link href="/login" className="sf-primary-button sf-button-link">
          Back to sign in
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="sf-back-link sf-success-back"
          onClick={() => setSubmittedEmail(null)}
        >
          Used a different email? Try again
        </button>
      </div>
    );
  }

  return (
    <div className="sf-auth-page">
      <Link href="/login" className="sf-back-link">
        <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
      </Link>
      <div className="sf-state-icon">
        <KeyRound size={26} aria-hidden="true" />
      </div>
      <div className="sf-form-heading">
        <p className="sf-eyebrow">LET’S GET YOU BACK IN</p>
        <h1>Forgot your password?</h1>
        <p>
          It happens. Enter your work email and we&apos;ll help you reset it.
        </p>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="sf-form"
        noValidate
        aria-busy={isSubmitting}
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
              disabled={isSubmitting}
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
        {serverError && (
          <div className="sf-alert" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}
        <Button
          type="submit"
          className="sf-primary-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Sending instructions…
            </>
          ) : (
            <>
              Send reset link
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
      <div className="sf-form-note">
        <Mail size={18} aria-hidden="true" />
        <span>We&apos;ll email you a link to set a new password.</span>
      </div>
    </div>
  );
}
