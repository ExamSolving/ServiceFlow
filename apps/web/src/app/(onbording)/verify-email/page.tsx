import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="sf-auth-page sf-success">
      <div className="sf-state-icon">
        <MailCheck size={27} aria-hidden="true" />
      </div>
      <div className="sf-form-heading">
        <p className="sf-eyebrow">ONE LAST STEP</p>
        <h1>Make it official.</h1>
        <p>
          We&apos;ve sent a verification link
          {email ? (
            <>
              {" "}
              to <strong className="sf-email-value">{email}</strong>
            </>
          ) : (
            " to your email"
          )}
          . Open it to verify your address and get your workspace started.
        </p>
      </div>
      <ol className="sf-onboarding-steps" aria-label="Account setup progress">
        <li>
          <span>✓</span> Account created
        </li>
        <li aria-current="step">
          <span>02</span> Verify email
        </li>
      </ol>
      <div className="sf-info-panel">
        <Mail size={18} aria-hidden="true" />
        <p>
          Can&apos;t find the email? Check your spam folder and allow a few
          minutes for it to arrive.
        </p>
      </div>
      <Link href="/login" className="sf-primary-button sf-button-link">
        Continue to sign in
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <p className="sf-form-note">Verify your email before signing in.</p>
    </div>
  );
}
