import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/src/lib/auth/require-auth";
import { hasPermission } from "@/src/lib/auth/permissions";
import { createTechnician } from "@/src/features/technicians/repositories/technician.repository";
import { technicianCreateSchema } from "@/src/features/technicians/schemas/technician.schema";
import { isTechnicianRequestSameOrigin, parseTechnicianRequest, technicianJsonError, technicianMutationError } from "@/src/features/technicians/services/technician-api";

export async function POST(request: NextRequest) {
  if (!isTechnicianRequestSameOrigin(request)) return technicianJsonError("Request could not be verified.", 403);
  const session = await requireAuth();
  if (!hasPermission(session.role, "manageTechnicians")) return technicianJsonError("You don’t have permission to manage technicians.", 403);
  const parsed = await parseTechnicianRequest(request, technicianCreateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const technician = await createTechnician(session, parsed.data);
    revalidatePath("/protected/technicians");
    revalidatePath("/protected/technicians/new");
    revalidatePath("/protected/dashboard");
    return NextResponse.json({ technician }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return technicianMutationError(error);
  }
}
