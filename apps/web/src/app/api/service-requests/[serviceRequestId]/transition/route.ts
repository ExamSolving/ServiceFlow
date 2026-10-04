import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { transitionServiceRequest } from "@/src/features/service-requests/repositories/service-request.repository";
import { serviceRequestIdSchema, serviceRequestTransitionSchema } from "@/src/features/service-requests/schemas/service-request.schema";
import { isServiceRequestRequestSameOrigin, parseServiceRequestRequest, serviceRequestJsonError, serviceRequestMutationError } from "@/src/features/service-requests/services/service-request-api";

// Status changes are a separate, versioned action so edits and workflow moves cannot race silently.
export async function POST(request: NextRequest, context: { params: Promise<{ serviceRequestId: string }> }) {
  if (!isServiceRequestRequestSameOrigin(request)) return serviceRequestJsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageServiceRequests", "You don’t have permission to manage service requests.");
  if (!auth.ok) return auth.response;
  const { serviceRequestId } = await context.params;
  if (!serviceRequestIdSchema.safeParse(serviceRequestId).success) return serviceRequestJsonError("This service request could not be found.", 404);
  const parsed = await parseServiceRequestRequest(request, serviceRequestTransitionSchema);
  if (!parsed.success) return parsed.response;
  try {
    const serviceRequest = await transitionServiceRequest(auth.session, serviceRequestId, parsed.data);
    revalidatePath("/protected/service-requests");
    revalidatePath(`/protected/service-requests/${serviceRequest.id}`);
    revalidatePath(`/protected/service-requests/${serviceRequest.id}/edit`);
    revalidatePath("/protected/dashboard");
    return NextResponse.json({ serviceRequest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceRequestMutationError(error);
  }
}
