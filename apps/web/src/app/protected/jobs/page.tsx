import type { Metadata } from "next";
import { JobsView } from "@/src/features/jobs/components/jobs-view";
import { getJobsPage } from "@/src/features/jobs/services/job.service";
import type { JobSearchParams } from "@/src/features/jobs/types/job";
export const metadata: Metadata = { title: "Jobs" };
export default async function JobsPage({ searchParams }: { searchParams: Promise<JobSearchParams> }) { return <JobsView data={await getJobsPage(await searchParams)} />; }
