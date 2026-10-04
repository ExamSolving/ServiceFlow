"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2, CircleAlert, KeyRound, Loader2, LogOut, MailCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/src/features/auth/components/password-field";
import { useLogout } from "@/src/features/auth/hooks/use-logout";
import { isAuthError } from "@/src/features/auth/services/auth-error";
import { acceptInvitationWithPassword, registerForInvitation } from "@/src/features/auth/services/auth.client";
import { ROLE_LABELS } from "@/src/lib/auth/permissions";
import { getAuthErrorMessage } from "@/src/lib/utils/firebase-error";
import type { InvitationPreview } from "../types/member";

const signInSchema = z.object({ password: z.string().min(1, "Password is required") });
const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must contain at least 2 characters").max(80, "Full name is too long"),
  password: z.string().min(8, "Password must contain at least 8 characters").max(128, "Password is too long"),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

type Mode = "signin" | "register";

function InvalidInvitation() {
  return (
    <div className="sf-auth-page">
      <div className="sf-state-icon"><KeyRound size={26} aria-hidden="true" /></div>
      <div className="sf-form-heading">
        <p className="sf-eyebrow">INVITATION</p>
        <h1>This link isn’t valid anymore.</h1>
        <p>The invitation may have expired, been used already, or been revoked. Ask your workspace administrator for a new link.</p>
      </div>
      <Link href="/login" className="sf-primary-button sf-button-link">Go to sign in<ArrowRight size={18} aria-hidden="true" /></Link>
    </div>
  );
}

function SignedInNotice({ signedInAs }: { signedInAs: { email: string; organizationName: string } }) {
  const { signOut, loading, error } = useLogout();
  return (
    <div className="sf-auth-page">
      <div className="sf-state-icon"><Building2 size={26} aria-hidden="true" /></div>
      <div className="sf-form-heading">
        <p className="sf-eyebrow">ALREADY SIGNED IN</p>
        <h1>You’re already in a workspace.</h1>
        <p>This browser is signed in as <strong className="sf-email-value">{signedInAs.email}</strong> in {signedInAs.organizationName || "another workspace"}. Sign out first to accept this invitation with the invited account.</p>
      </div>
      <Button type="button" className="sf-primary-button" onClick={signOut} disabled={loading}>{loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}{loading ? "Signing out…" : "Sign out and continue"}</Button>
      {error && <p className="sf-field-error" role="alert">{error}</p>}
    </div>
  );
}

export function InviteAcceptView({ token, preview, signedInAs }: { token: string; preview: InvitationPreview | null; signedInAs: { email: string; organizationName: string } | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const signIn = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema), defaultValues: { password: "" } });
  const register = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema), defaultValues: { fullName: "", password: "", confirmPassword: "" } });
  const busy = signIn.formState.isSubmitting || register.formState.isSubmitting || isNavigating;

  if (!preview) return <InvalidInvitation />;
  if (signedInAs) return <SignedInNotice signedInAs={signedInAs} />;

  async function onSignIn(values: z.infer<typeof signInSchema>) {
    try {
      setServerError(null);
      await acceptInvitationWithPassword({ token, email: preview!.email, password: values.password });
      startTransition(() => router.replace("/dashboard"));
    } catch (error) {
      console.error("Invitation accept failed:", error);
      setServerError(getAuthErrorMessage(error));
    }
  }

  async function onRegister(values: z.infer<typeof registerSchema>) {
    try {
      setServerError(null);
      await registerForInvitation({ token, email: preview!.email, fullName: values.fullName, password: values.password });
      setVerificationSent(true);
    } catch (error) {
      console.error("Invitation registration failed:", error);
      if (isAuthError(error) && error.code === "EMAIL_NOT_VERIFIED") setVerificationSent(true);
      else setServerError(getAuthErrorMessage(error));
    }
  }

  if (verificationSent) {
    return (
      <div className="sf-auth-page sf-success" role="status">
        <div className="sf-state-icon"><MailCheck size={27} aria-hidden="true" /></div>
        <div className="sf-form-heading">
          <p className="sf-eyebrow">ONE LAST STEP</p>
          <h1>Verify your email.</h1>
          <p>We’ve sent a verification link to <strong className="sf-email-value">{preview.email}</strong>. Open it, then return to this invitation and sign in to join {preview.organizationName}.</p>
        </div>
        <button type="button" className="sf-back-link sf-success-back" onClick={() => { setVerificationSent(false); setMode("signin"); }}>Already verified? Sign in to accept</button>
      </div>
    );
  }

  return (
    <div className="sf-auth-page">
      <div className="sf-form-heading">
        <p className="sf-eyebrow">YOU’VE BEEN INVITED</p>
        <h1>Join {preview.organizationName}.</h1>
        <p>You’re invited as <strong>{ROLE_LABELS[preview.role]}</strong> using <strong className="sf-email-value">{preview.email}</strong>. This link works until <time dateTime={preview.expiresAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(preview.expiresAt))}</time>.</p>
      </div>
      <div className="sf-onboarding-steps" role="tablist" aria-label="Account type">
        <button type="button" role="tab" aria-selected={mode === "signin"} aria-current={mode === "signin" ? "step" : undefined} className="sf-text-link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => { setMode("signin"); setServerError(null); }}><span>01</span> I have an account</button>
        <button type="button" role="tab" aria-selected={mode === "register"} aria-current={mode === "register" ? "step" : undefined} className="sf-text-link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => { setMode("register"); setServerError(null); }}><span>02</span> Create an account</button>
      </div>
      {mode === "signin" ? (
        <form onSubmit={signIn.handleSubmit(onSignIn)} className="sf-form" noValidate aria-busy={busy}>
          <div className="sf-field">
            <Label htmlFor="invite-email">Work email</Label>
            <div className="sf-input-wrap"><Input id="invite-email" type="email" value={preview.email} readOnly disabled className="sf-input" /></div>
          </div>
          <PasswordField id="invite-password" label="Password" autoComplete="current-password" placeholder="Enter your password" disabled={busy} error={signIn.formState.errors.password?.message} action={<Link href="/forgot-password" className="sf-text-link">Forgot password?</Link>} {...signIn.register("password")} />
          {serverError && <div className="sf-alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{serverError}</span></div>}
          <Button type="submit" className="sf-primary-button" disabled={busy}>{busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" />{isNavigating ? "Opening workspace…" : "Joining…"}</> : <>Accept and sign in<ArrowRight size={18} aria-hidden="true" /></>}</Button>
        </form>
      ) : (
        <form onSubmit={register.handleSubmit(onRegister)} className="sf-form" noValidate aria-busy={busy}>
          <div className="sf-field">
            <Label htmlFor="invite-register-email">Work email</Label>
            <div className="sf-input-wrap"><Input id="invite-register-email" type="email" value={preview.email} readOnly disabled className="sf-input" /></div>
          </div>
          <div className="sf-field">
            <Label htmlFor="invite-fullName">Full name</Label>
            <div className="sf-input-wrap"><UserPlus size={18} className="sf-input-icon" aria-hidden="true" /><Input id="invite-fullName" autoComplete="name" placeholder="Alex Morgan" className="sf-input" disabled={busy} aria-invalid={!!register.formState.errors.fullName} aria-describedby={register.formState.errors.fullName ? "invite-fullName-error" : undefined} {...register.register("fullName")} /></div>
            {register.formState.errors.fullName && <p id="invite-fullName-error" className="sf-field-error" role="alert">{register.formState.errors.fullName.message}</p>}
          </div>
          <PasswordField id="invite-new-password" label="Password" autoComplete="new-password" placeholder="Create a password" disabled={busy} error={register.formState.errors.password?.message} {...register.register("password")} />
          <PasswordField id="invite-confirm-password" label="Confirm password" autoComplete="new-password" placeholder="Enter your password again" disabled={busy} error={register.formState.errors.confirmPassword?.message} {...register.register("confirmPassword")} />
          {serverError && <div className="sf-alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{serverError}</span></div>}
          <Button type="submit" className="sf-primary-button" disabled={busy}>{busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" />Creating account…</> : <>Create account<ArrowRight size={18} aria-hidden="true" /></>}</Button>
        </form>
      )}
      <p className="sf-form-note">After verifying your email, you’ll sign in from this link to join the workspace.</p>
    </div>
  );
}
