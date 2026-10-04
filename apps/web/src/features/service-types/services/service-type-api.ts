import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { ServiceTypeAccessError, ServiceTypeConflictError, ServiceTypeDuplicateNameError, ServiceTypeNotFoundError } from "../repositories/service-type-errors";

export const isServiceTypeRequestSameOrigin = isSameOrigin;

export function serviceTypeJsonError(message: string, status: number, code?: string) {
  return jsonError(message, status, code ? { code } : undefined);
}

export function parseServiceTypeRequest<T>(request: NextRequest, schema: z.ZodType<T>) {
  return parseJsonBody(request, schema, { maxBytes: 16_384, resource: "service type" });
}

export function serviceTypeMutationError(error: unknown) {
  if (error instanceof ServiceTypeAccessError) return serviceTypeJsonError("You don’t have permission to manage service types.", 403);
  if (error instanceof ServiceTypeNotFoundError) return serviceTypeJsonError("This service type could not be found.", 404);
  if (error instanceof ServiceTypeDuplicateNameError) return serviceTypeJsonError("This name is already used by a service type in your workspace. Choose another name or edit the existing service type.", 409, "DUPLICATE_NAME");
  if (error instanceof ServiceTypeConflictError) return serviceTypeJsonError("This service type or request has changed. Review the latest version before trying again.", 409, "CONFLICT");
  logger.error("SERVICE TYPES", "Save failed", error);
  return serviceTypeJsonError("We couldn’t save this service type. Please try again.", 500);
}
