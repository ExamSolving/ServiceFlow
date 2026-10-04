import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { createServiceRequest } from "@/src/features/service-requests/repositories/service-request.repository";
import { serviceRequestCreateSchema } from "@/src/features/service-requests/schemas/service-request.schema";
import { isServiceRequestRequestSameOrigin, parseServiceRequestRequest, serviceRequestJsonError, serviceRequestMutationError } from "@/src/features/service-requests/services/service-request-api";

export async function POST(request: NextRequest) {
  if (!isServiceRequestRequestSameOrigin(request)) return serviceRequestJsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageServiceRequests", "You don’t have permission to manage service requests.");
  if (!auth.ok) return auth.response;
  const parsed = await parseServiceRequestRequest(request, serviceRequestCreateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const serviceRequest = await createServiceRequest(auth.session, parsed.data);
    revalidatePath("/protected/service-requests");
    revalidatePath("/protected/dashboard");
    return NextResponse.json({ serviceRequest }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceRequestMutationError(error);
  }
}
