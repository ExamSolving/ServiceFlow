import type { Metadata } from "next";
import { JobDetailView } from "@/src/features/jobs/components/job-detail-view";
import { getJobContext } from "@/src/features/jobs/services/job.service";
export const metadata: Metadata = { title: "Job details" };
export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const context = await getJobContext((await params).jobId);
  return <JobDetailView context={context} />;
}
