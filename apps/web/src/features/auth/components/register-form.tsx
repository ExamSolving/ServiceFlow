"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  Loader2,
  Mail,
  User,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/src/features/auth/schemas/register.schema";
import { registerOwner } from "@/src/features/auth/services/auth.client";
import { getAuthErrorMessage } from "@/src/lib/utils/firebase-error";
import { PasswordField } from "./password-field";

export function RegisterForm() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      companyName: "",
      email: "",
      password: "",
      confirmPassword: "",
      termsAccepted: false,
    },
  });
  const password = useWatch({ control, name: "password" });
  const termsAccepted = useWatch({ control, name: "termsAccepted" });
  const isBusy = isSubmitting || isNavigating;

  async function onSubmit(values: RegisterFormValues) {
    try {
      setServerError(null);
      const result = await registerOwner({
        fullName: values.fullName,
        companyName: values.companyName,
        email: values.email,
        password: values.password,
      });
      startTransition(() => {
        router.replace(
          `/verify-email?email=${encodeURIComponent(result.email ?? "")}`,
        );
      });
    } catch (error) {
      console.error("Registration failed:", error);
      setServerError(getAuthErrorMessage(error));
    }
  }

  return (
    <div className="sf-auth-page sf-register-page">
      <div className="sf-form-heading">
        <p className="sf-eyebrow">A BETTER WAY TO WORK</p>
        <h1>Make room for more.</h1>
        <p>Create your workspace. Bring your business together.</p>
      </div>
      <ol className="sf-onboarding-steps" aria-label="Account setup progress">
        <li aria-current="step">
          <span>01</span> Create account
        </li>
        <li>
          <span>02</span> Verify email
        </li>
      </ol>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="sf-form"
        noValidate
        aria-busy={isBusy}
      >
        <div className="sf-field-grid">
          {(
            [
              {
                name: "fullName",
                label: "Full name",
                placeholder: "Alex Morgan",
                autoComplete: "name",
                icon: User,
              },
              {
                name: "companyName",
                label: "Company name",
                placeholder: "Your company",
                autoComplete: "organization",
                icon: Building2,
              },
            ] as const
          ).map(({ name, label, placeholder, autoComplete, icon: Icon }) => (
            <div className="sf-field" key={name}>
              <Label htmlFor={name}>{label}</Label>
              <div className="sf-input-wrap">
                <Icon size={18} className="sf-input-icon" aria-hidden="true" />
                <Input
                  id={name}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  className="sf-input"
                  disabled={isBusy}
                  aria-invalid={!!errors[name]}
                  aria-describedby={errors[name] ? `${name}-error` : undefined}
                  {...register(name)}
                />
              </div>
              {errors[name] && (
                <p id={`${name}-error`} className="sf-field-error" role="alert">
                  {errors[name]?.message}
                </p>
              )}
            </div>
          ))}
        </div>
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
          autoComplete="new-password"
          placeholder="Create a password"
          disabled={isBusy}
          error={errors.password?.message}
          hint={
            <span className={password.length >= 8 ? "sf-requirement-met" : ""}>
              <Check size={13} aria-hidden="true" /> Use at least 8 characters
            </span>
          }
          {...register("password")}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Enter your password again"
          disabled={isBusy}
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <div className="sf-terms">
          <div>
            <Checkbox
              id="terms"
              checked={termsAccepted}
              disabled={isBusy}
              aria-invalid={!!errors.termsAccepted}
              aria-describedby={
                errors.termsAccepted ? "terms-error" : undefined
              }
              onCheckedChange={(checked) =>
                setValue("termsAccepted", checked === true, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            />
            <Label htmlFor="terms">
              I agree to the Terms of Service and Privacy Policy.
            </Label>
          </div>
          {errors.termsAccepted && (
            <p id="terms-error" className="sf-field-error" role="alert">
              {errors.termsAccepted.message}
            </p>
          )}
        </div>
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
              {isNavigating ? "One more step…" : "Creating workspace…"}
            </>
          ) : (
            <>
              Create your workspace
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </Button>
        <p className="sf-switch">
          Already part of a team? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
