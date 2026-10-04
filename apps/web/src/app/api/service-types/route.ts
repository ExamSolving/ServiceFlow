import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { createServiceType } from "@/src/features/service-types/repositories/service-type.repository";
import { serviceTypeCreateSchema } from "@/src/features/service-types/schemas/service-type.schema";
import { isServiceTypeRequestSameOrigin, parseServiceTypeRequest, serviceTypeJsonError, serviceTypeMutationError } from "@/src/features/service-types/services/service-type-api";

export async function POST(request: NextRequest) {
  if (!isServiceTypeRequestSameOrigin(request)) return serviceTypeJsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageServiceTypes", "You don’t have permission to manage service types.");
  if (!auth.ok) return auth.response;
  const parsed = await parseServiceTypeRequest(request, serviceTypeCreateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const serviceType = await createServiceType(auth.session, parsed.data);
    revalidatePath("/protected/service-types");
    return NextResponse.json({ serviceType }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceTypeMutationError(error);
  }
}
