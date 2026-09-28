"use client";

import { useState } from "react";

import Link from "next/link";

import { useRouter } from "next/navigation";

import {
  Building2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  User,
} from "lucide-react";

import { zodResolver } from "@hookform/resolvers/zod";

import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {
  registerSchema,
  type RegisterFormValues,
} from "@/src/features/auth/schemas/register.schema";

import { registerOwner } from "@/src/features/auth/services/auth.client";

import { getFirebaseAuthError } from "@/src/lib/utils/firebase-error";

export function RegisterForm() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,

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

  async function onSubmit(values: RegisterFormValues) {
    try {
      setServerError(null);

      const result = await registerOwner({
        fullName: values.fullName,

        companyName: values.companyName,

        email: values.email,

        password: values.password,
      });

      router.replace(
        `/verify-email?email=${encodeURIComponent(result.email ?? "")}`,
      );
    } catch (error) {
      console.error("Registration failed:", error);

      setServerError(getFirebaseAuthError(error));
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">
          Start your workspace
        </p>

        <h1 className="text-3xl font-semibold tracking-[-0.03em]">
          Create your ServiceFlow account
        </h1>

        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          Create your company workspace and start managing field service
          operations.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>

          <div className="relative">
            <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="fullName"
              className="h-12 rounded-xl pl-10"
              placeholder="John Smith"
              {...register("fullName")}
            />
          </div>

          {errors.fullName && (
            <p className="text-sm text-destructive">
              {errors.fullName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="companyName">Company name</Label>

          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="companyName"
              className="h-12 rounded-xl pl-10"
              placeholder="ABC Services"
              {...register("companyName")}
            />
          </div>

          {errors.companyName && (
            <p className="text-sm text-destructive">
              {errors.companyName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="h-12 rounded-xl pl-10"
              placeholder="you@company.com"
              {...register("email")}
            />
          </div>

          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>

          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="h-12 rounded-xl px-10"
              placeholder="Password"
              {...register("password")}
            />

            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          {errors.password && (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="h-12 rounded-xl px-10"
              placeholder="Confirm Password"
              {...register("confirmPassword")}
            />
          </div>

          {errors.confirmPassword && (
            <p className="text-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              onCheckedChange={(checked) =>
                setValue("termsAccepted", checked === true, {
                  shouldValidate: true,
                })
              }
            />

            <Label
              htmlFor="terms"
              className="font-normal leading-5 text-muted-foreground"
            >
              I agree to the Terms of Service and Privacy Policy.
            </Label>
          </div>

          {errors.termsAccepted && (
            <p className="mt-2 text-sm text-destructive">
              {errors.termsAccepted.message}
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
              Creating workspace...
            </>
          ) : (
            "Create workspace"
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
