import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/src/lib/auth/require-auth";
import { hasPermission } from "@/src/lib/auth/permissions";
import { updateServiceType } from "@/src/features/service-types/repositories/service-type.repository";
import { serviceTypeIdSchema, serviceTypeUpdateSchema } from "@/src/features/service-types/schemas/service-type.schema";
import { isServiceTypeRequestSameOrigin, parseServiceTypeRequest, serviceTypeJsonError, serviceTypeMutationError } from "@/src/features/service-types/services/service-type-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ serviceTypeId: string }> }) {
  if (!isServiceTypeRequestSameOrigin(request)) return serviceTypeJsonError("Request could not be verified.", 403);
  const session = await requireAuth();
  if (!hasPermission(session.role, "manageServiceTypes")) return serviceTypeJsonError("You don’t have permission to manage service types.", 403);
  const { serviceTypeId } = await context.params;
  if (!serviceTypeIdSchema.safeParse(serviceTypeId).success) return serviceTypeJsonError("This service type could not be found.", 404);
  const parsed = await parseServiceTypeRequest(request, serviceTypeUpdateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const serviceType = await updateServiceType(session, serviceTypeId, parsed.data);
    revalidatePath("/protected/service-types");
    revalidatePath(`/protected/service-types/${serviceType.id}`);
    revalidatePath(`/protected/service-types/${serviceType.id}/edit`);
    return NextResponse.json({ serviceType }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceTypeMutationError(error);
  }
}
