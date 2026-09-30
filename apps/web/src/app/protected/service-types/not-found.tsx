import Link from "next/link";
import { ArrowLeft, Shapes } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ServiceTypeNotFound() {
  return (
    <Card className="p-5 sm:p-8">
      <EmptyState icon={Shapes} title="Service type unavailable"
        description="This service type could not be found in your workspace, or you don’t have access." />
      <div className="flex justify-center">
        <Link href="/service-types" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft aria-hidden="true" /> Back to service types
        </Link>
      </div>
    </Card>
  );
}
