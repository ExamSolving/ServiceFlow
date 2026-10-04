import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JobForm } from "@/src/features/jobs/components/job-form";
import { getJob } from "@/src/features/jobs/services/job.service";
import { canEditJob } from "@/src/features/jobs/utils/job-workflow";
export const metadata: Metadata = { title: "Edit job" };
export default async function EditJobPage({ params }: { params: Promise<{ jobId: string }> }) {
 const job = await getJob((await params).jobId);
 if (!canEditJob(job.status)) redirect(`/jobs/${job.id}`);
 return <JobForm key={`${job.id}:${job.version}`} job={job} />;
}
