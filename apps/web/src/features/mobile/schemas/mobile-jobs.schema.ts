import { z } from "zod";

import { jobStatusSchema } from "@/src/features/jobs/schemas/job.schema";

// Same text rules as the web job page: trimmed, well-formed, no control characters except line breaks.
const words = z.string().trim().max(500, "Use 500 characters or fewer.")
  .refine((value) => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported characters.");

/** A status move from the technician app. Whether a reason is required depends on the move, so the repository checks it. */
export const mobileJobMoveSchema = z.object({
  to: jobStatusSchema,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  requestId: z.uuid().transform((value) => value.toLowerCase()),
  reason: words.optional(),
  note: words.optional(),
}).strict();

export type MobileJobMoveRequest = z.infer<typeof mobileJobMoveSchema>;
