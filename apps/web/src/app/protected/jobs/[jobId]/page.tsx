import type { Metadata } from "next";
import { JobDetailView } from "@/src/features/jobs/components/job-detail-view";
import { getJob } from "@/src/features/jobs/services/job.service";
export const metadata: Metadata = { title: "Job details" };
export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) { return <JobDetailView job={await getJob((await params).jobId)} />; }
