import "server-only";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import type { ScheduleTechnician } from "../types/schedule";

const ACTIVE_STATUSES = ["AVAILABLE", "BUSY", "OFFLINE", "ON_LEAVE"];

/** Technicians who can appear as schedule lanes. */
export async function listScheduleTechnicians(session: AppSession): Promise<ScheduleTechnician[]> {
  if (!session.organizationId || !hasPermission(session.role, "dispatchJobs")) throw new Error("Schedule access denied");
  const snapshot = await adminDb.collection("technicians").where("organizationId", "==", session.organizationId)
    .where("status", "in", ACTIVE_STATUSES).orderBy("displayName", "asc").limit(50).get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    if (data.organizationId !== session.organizationId) throw new Error("Tenant ownership mismatch");
    return { id: document.id, displayName: String(data.displayName ?? "Technician"), status: String(data.status ?? "OFFLINE") };
  });
}
