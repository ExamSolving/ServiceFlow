import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { updateTechnician } from "@/src/features/technicians/repositories/technician.repository";
import { technicianIdSchema, technicianUpdateSchema } from "@/src/features/technicians/schemas/technician.schema";
import { isTechnicianRequestSameOrigin, parseTechnicianRequest, technicianJsonError, technicianMutationError } from "@/src/features/technicians/services/technician-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ technicianId: string }> }) {
  if (!isTechnicianRequestSameOrigin(request)) return technicianJsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageTechnicians", "You don’t have permission to manage technicians.");
  if (!auth.ok) return auth.response;
  const { technicianId } = await context.params;
  if (!technicianIdSchema.safeParse(technicianId).success) return technicianJsonError("This technician could not be found.", 404);
  const parsed = await parseTechnicianRequest(request, technicianUpdateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const technician = await updateTechnician(auth.session, technicianId, parsed.data);
    revalidatePath("/protected/technicians");
    revalidatePath(`/protected/technicians/${technician.id}`);
    revalidatePath(`/protected/technicians/${technician.id}/edit`);
    revalidatePath("/protected/dashboard");
    return NextResponse.json({ technician }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return technicianMutationError(error);
  }
}
