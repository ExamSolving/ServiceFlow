import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { addJobNote } from "@/src/features/jobs/repositories/job.repository";
import { jobIdSchema, jobNoteSchema } from "@/src/features/jobs/schemas/job.schema";
import { jobMutationError } from "@/src/features/jobs/services/job-api";

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("dispatchJobs", "You don’t have permission to manage jobs.");
  if (!auth.ok) return auth.response;
  const { jobId } = await context.params;
  if (!jobIdSchema.safeParse(jobId).success) return jsonError("This job could not be found.", 404);
  const parsed = await parseJsonBody(request, jobNoteSchema, { resource: "note" });
  if (!parsed.success) return parsed.response;
  try {
    const note = await addJobNote(auth.session, jobId, parsed.data);
    revalidatePath(`/protected/jobs/${jobId}`);
    return NextResponse.json({ note }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jobMutationError(error);
  }
}
