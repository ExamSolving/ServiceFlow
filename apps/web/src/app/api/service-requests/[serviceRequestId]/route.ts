import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/src/lib/auth/require-auth";
import { hasPermission } from "@/src/lib/auth/permissions";
import { updateServiceRequest } from "@/src/features/service-requests/repositories/service-request.repository";
import { serviceRequestIdSchema, serviceRequestUpdateSchema } from "@/src/features/service-requests/schemas/service-request.schema";
import { isServiceRequestRequestSameOrigin, parseServiceRequestRequest, serviceRequestJsonError, serviceRequestMutationError } from "@/src/features/service-requests/services/service-request-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ serviceRequestId: string }> }) {
  if (!isServiceRequestRequestSameOrigin(request)) return serviceRequestJsonError("Request could not be verified.", 403);
  const session = await requireAuth();
  if (!hasPermission(session.role, "manageServiceRequests")) return serviceRequestJsonError("You don’t have permission to manage service requests.", 403);
  const { serviceRequestId } = await context.params;
  if (!serviceRequestIdSchema.safeParse(serviceRequestId).success) return serviceRequestJsonError("This service request could not be found.", 404);
  const parsed = await parseServiceRequestRequest(request, serviceRequestUpdateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const serviceRequest = await updateServiceRequest(session, serviceRequestId, parsed.data);
    revalidatePath("/protected/service-requests");
    revalidatePath(`/protected/service-requests/${serviceRequest.id}`);
    revalidatePath(`/protected/service-requests/${serviceRequest.id}/edit`);
    return NextResponse.json({ serviceRequest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceRequestMutationError(error);
  }
}
