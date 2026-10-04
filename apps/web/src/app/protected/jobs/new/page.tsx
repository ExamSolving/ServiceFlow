import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { JobForm } from "@/src/features/jobs/components/job-form";
import { getServiceRequest } from "@/src/features/service-requests/services/service-request.service";
import { canEditServiceRequest } from "@/src/features/service-requests/utils/request-workflow";
import { jobIdSchema } from "@/src/features/jobs/schemas/job.schema";
export const metadata: Metadata = { title: "New job" };
export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("dispatchJobs");
  const params = await searchParams;
  if (params.serviceRequestId !== undefined) {
    const id = jobIdSchema.safeParse(params.serviceRequestId);
    if (!id.success) redirect("/service-requests");
    const source = await getServiceRequest(id.data);
    if (!canEditServiceRequest(source.status)) redirect(`/service-requests/${source.id}`);
    return <JobForm key={`${source.id}:${source.version}`} source={source} />;
  }
  return <JobForm />;
}
