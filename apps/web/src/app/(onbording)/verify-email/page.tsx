import Link from "next/link";

import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

interface VerifyEmailPageProps {
  searchParams: Promise<{
    email?: string;
  }>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;

  return (
    <div className="text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <MailCheck className="size-7 text-primary" />
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">
        Verify your email
      </h1>

      <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
        We sent a verification link to
      </p>

      {params.email && <p className="mt-1 font-medium">{params.email}</p>}

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Verify your email address before signing in to your ServiceFlow
        workspace.
      </p>

      <Button asChild className="mt-8 h-12 w-full rounded-xl">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </div>
  );
}
