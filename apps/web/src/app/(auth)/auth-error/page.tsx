import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";

export const metadata: Metadata = { title: "Account access" };

export default function AuthErrorPage() {
  return (
    <div className="sf-auth-page">
      <div className="sf-state-icon">
        <KeyRound size={26} aria-hidden="true" />
      </div>
      <div className="sf-form-heading">
        <p className="sf-eyebrow">LET’S TRY THAT AGAIN</p>
        <h1>A fresh start.</h1>
        <p>
          We couldn&apos;t complete your authentication request. Return to sign
          in and try again.
        </p>
      </div>
      <Link href="/login" className="sf-primary-button sf-button-link">
        Back to sign in
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <p className="sf-switch" style={{ marginTop: 24 }}>
        Need a new password? <Link href="/forgot-password">Reset it here</Link>
      </p>
    </div>
  );
}
