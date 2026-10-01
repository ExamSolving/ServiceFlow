import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ServiceRequestNotFound() {
  return (
    <Card className="p-5 sm:p-8">
      <EmptyState icon={Inbox} title="Service request unavailable"
        description="This service request could not be found in your workspace, or you don’t have access." />
      <div className="flex justify-center">
        <Link href="/service-requests" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft aria-hidden="true" /> Back to service requests
        </Link>
      </div>
    </Card>
  );
}
