import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import {
  TechnicianAccessError, TechnicianAlreadyLinkedError, TechnicianConflictError,
  TechnicianIneligibleMemberError, TechnicianNotFoundError,
} from "../repositories/technician-errors";

export const isTechnicianRequestSameOrigin = isSameOrigin;

export function technicianJsonError(message: string, status: number, code?: string) {
  return jsonError(message, status, code ? { code } : undefined);
}

export function parseTechnicianRequest<T>(request: NextRequest, schema: z.ZodType<T>) {
  return parseJsonBody(request, schema, { maxBytes: 16_384, resource: "technician" });
}

export function technicianMutationError(error: unknown) {
  if (error instanceof TechnicianAccessError) return technicianJsonError("You don’t have permission to manage technicians.", 403);
  if (error instanceof TechnicianNotFoundError) return technicianJsonError("This technician could not be found.", 404);
  if (error instanceof TechnicianAlreadyLinkedError) return technicianJsonError("This member already has a technician profile. Open the existing profile to make changes.", 409, "ALREADY_LINKED");
  if (error instanceof TechnicianIneligibleMemberError) return technicianJsonError("This member is no longer eligible. They need an active technician membership and an active account. You can still mark an existing profile inactive.", 409, "INELIGIBLE_MEMBER");
  if (error instanceof TechnicianConflictError) return technicianJsonError("This technician or request has changed. Reload the page before trying again.", 409, "CONFLICT");
  logger.error("TECHNICIANS", "Save failed", error);
  return technicianJsonError("We couldn’t save this technician. Please try again.", 500);
}
