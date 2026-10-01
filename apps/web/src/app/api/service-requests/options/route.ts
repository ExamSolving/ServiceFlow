import { NextResponse, type NextRequest } from "next/server";

import { requireAuth } from "@/src/lib/auth/require-auth";
import { hasPermission } from "@/src/lib/auth/permissions";
import { listServiceRequestOptions } from "@/src/features/service-requests/repositories/service-request.repository";
import { serviceRequestOptionsSchema } from "@/src/features/service-requests/schemas/service-request.schema";
import { serviceRequestJsonError, serviceRequestOptionsError } from "@/src/features/service-requests/services/service-request-api";

export const dynamic = "force-dynamic";

// Active customers or service types for the request form pickers. Read-only and
// tenant-scoped through the session; query parameters never carry tenant context.
export async function GET(request: NextRequest) {
  const session = await requireAuth();
  if (!hasPermission(session.role, "manageServiceRequests")) return serviceRequestJsonError("You don’t have permission to manage service requests.", 403);
  const params = request.nextUrl.searchParams;
  const parsed = serviceRequestOptionsSchema.safeParse({
    kind: params.get("kind") ?? undefined,
    q: params.get("q") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });
  if (!parsed.success) return serviceRequestJsonError("These search options are invalid.", 400);
  try {
    const result = await listServiceRequestOptions(session, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceRequestOptionsError(error);
  }
}
