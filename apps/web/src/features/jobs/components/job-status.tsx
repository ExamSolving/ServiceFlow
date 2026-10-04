import { Badge } from "@/components/ui/badge";
import { jobStatusLabel, jobStatusVariant } from "@/src/features/dashboard/components/dashboard-format";
import { jobStatusSchema } from "../schemas/job.schema";
import type { JobStatus as Status } from "../types/job";
export { ServiceRequestPriority as JobPriority, serviceRequestPriorityOptions as jobPriorityOptions, formatRequestDate as formatJobDate } from "@/src/features/service-requests/components/service-request-status";
export const jobStatusOptions = jobStatusSchema.options.map(value => ({ value, label: jobStatusLabel(value) }));
export function JobStatus({ status }: { status: Status }) { return <Badge variant={jobStatusVariant(status)}>{jobStatusLabel(status)}</Badge>; }
