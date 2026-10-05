import type { NextRequest } from "next/server";

import { addTechnicianJobNote } from "@/src/features/mobile/repositories/mobile-jobs.repository";
import { mobileJobError, requireMobileTechnician, revalidateTechnicianJob } from "@/src/features/mobile/services/mobile-api";
import { jobNoteSchema } from "@/src/features/jobs/schemas/job.schema";
import { jsonOk, parseJsonBody } from "@/src/lib/http/json";

export const dynamic = "force-dynamic";

// A note from the technician app, saved with the job's notes on the web.
export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const auth = await requireMobileTechnician(request);
    if (!auth.ok) return auth.response;
    const { jobId } = await context.params;
    const parsed = await parseJsonBody(request, jobNoteSchema, { resource: "note" });
    if (!parsed.success) return parsed.response;
    const note = await addTechnicianJobNote(auth.session, auth.technician, jobId, parsed.data);
    revalidateTechnicianJob(jobId);
    return jsonOk({ note }, 201);
  } catch (error) {
    return mobileJobError(error, "We couldn’t save your note. Please try again.");
  }
}
