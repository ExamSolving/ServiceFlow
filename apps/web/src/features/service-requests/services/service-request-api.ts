import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import {
  ServiceRequestAccessError, ServiceRequestConflictError, ServiceRequestCursorError, ServiceRequestNotFoundError,
  ServiceRequestReferenceError, ServiceRequestTransitionError,
} from "../repositories/service-request-errors";

export const isServiceRequestRequestSameOrigin = isSameOrigin;
export const serviceRequestJsonError = jsonError;

export function parseServiceRequestRequest<T>(request: NextRequest, schema: z.ZodType<T>, resource = "service request") {
  return parseJsonBody(request, schema, { maxBytes: 32_768, resource });
}

export function serviceRequestMutationError(error: unknown) {
  if (error instanceof ServiceRequestAccessError) return jsonError("You don’t have permission to manage service requests.", 403);
  if (error instanceof ServiceRequestNotFoundError) return jsonError("This service request could not be found.", 404);
  if (error instanceof ServiceRequestReferenceError) {
    return jsonError(error.field === "customerId"
      ? "Choose an active customer from your workspace."
      : "Choose an active service type from your catalog.", 409, { code: "INVALID_REFERENCE", field: error.field });
  }
  if (error instanceof ServiceRequestTransitionError) return jsonError("This service request can no longer be changed in its current status. Reload the page to see the latest status.", 409, { code: "TRANSITION" });
  if (error instanceof ServiceRequestConflictError) return jsonError("This service request or request has changed. Reload the page before trying again.", 409, { code: "CONFLICT" });
  logger.error("SERVICE REQUESTS", "Save failed", error);
  return jsonError("We couldn’t save this service request. Please try again.", 500);
}

export function serviceRequestOptionsError(error: unknown) {
  if (error instanceof ServiceRequestAccessError) return jsonError("You don’t have permission to manage service requests.", 403);
  if (error instanceof ServiceRequestCursorError) return jsonError("This page of options is no longer available. Search again.", 400, { code: "CURSOR" });
  logger.error("SERVICE REQUESTS", "Options failed", error);
  return jsonError("We couldn’t load options. Please try again.", 500);
}
