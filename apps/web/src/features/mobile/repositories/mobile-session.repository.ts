import "server-only";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { technicianStatusSchema } from "@/src/features/technicians/schemas/technician.schema";
import { adminDb } from "@/src/lib/firebase/admin";
import type { MobileSessionPayload, MobileTechnician } from "../types/mobile-session";

export class MobileIdentityError extends Error {
  constructor(message: string) { super(message); this.name = "MobileIdentityError"; }
}

function validTimezone(value: unknown): string {
  if (typeof value !== "string" || !value) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/** Account summary for the mobile app, including whether the technician app is available. */
export async function readMobileSession(session: AppSession): Promise<MobileSessionPayload> {
  const isTechnician = session.role === "TECHNICIAN";
  const [settings, profiles] = await Promise.all([
    adminDb.collection("organizationSettings").doc(session.organizationId).get(),
    isTechnician
      ? adminDb.collection("technicians").where("organizationId", "==", session.organizationId).where("userId", "==", session.uid).limit(2).get()
      : Promise.resolve(null),
  ]);
  const settingsData = settings.exists ? settings.data() : undefined;
  if (settingsData && settingsData.organizationId !== session.organizationId) throw new MobileIdentityError("Organization settings ownership mismatch");

  const base = {
    user: { uid: session.uid, email: session.email, displayName: session.displayName },
    organization: { id: session.organizationId, name: session.organizationName, timezone: validTimezone(settingsData?.timezone) },
    role: session.role,
  };
  if (!isTechnician) return { ...base, access: "ROLE_NOT_SUPPORTED", technician: null };
  if (!profiles || profiles.empty) return { ...base, access: "PROFILE_MISSING", technician: null };
  if (profiles.size > 1) throw new MobileIdentityError("More than one technician profile is linked to this user");

  const document = profiles.docs[0];
  const data = document.data();
  const status = technicianStatusSchema.safeParse(data.status);
  if (data.organizationId !== session.organizationId || data.userId !== session.uid) throw new MobileIdentityError("Technician identity mismatch");
  if (!status.success || typeof data.displayName !== "string" || !data.displayName.trim() || typeof data.employeeNumber !== "string") {
    throw new MobileIdentityError("Invalid technician profile");
  }
  const technician: MobileTechnician = { id: document.id, displayName: data.displayName, employeeNumber: data.employeeNumber, status: status.data };
  return { ...base, access: status.data === "INACTIVE" ? "PROFILE_INACTIVE" : "ALLOWED", technician };
}
