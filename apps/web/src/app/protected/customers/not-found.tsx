import Link from "next/link";
import { ArrowLeft, UsersRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function CustomerNotFound() {
  return (
    <Card className="p-5 sm:p-8">
      <EmptyState
        icon={UsersRound}
        title="Customer unavailable"
        description="This customer could not be found in your workspace, or you don’t have access."
      />
      <div className="flex justify-center">
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft aria-hidden="true" /> Back to workspace
        </Link>
      </div>
    </Card>
  );
}
