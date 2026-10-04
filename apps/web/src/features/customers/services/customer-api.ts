import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { CustomerAccessError, CustomerConflictError, CustomerNotFoundError } from "../repositories/customer-errors";

export const isCustomerRequestSameOrigin = isSameOrigin;
export const customerJsonError = jsonError;

export function parseCustomerRequest<T>(request: NextRequest, schema: z.ZodType<T>) {
  return parseJsonBody(request, schema, { maxBytes: 16_384, resource: "customer" });
}

export function customerMutationError(error: unknown) {
  if (error instanceof CustomerAccessError) return jsonError("You don’t have permission to manage customers.", 403);
  if (error instanceof CustomerNotFoundError) return jsonError("This customer could not be found.", 404);
  if (error instanceof CustomerConflictError) return jsonError("This customer or request has changed. Reload the page before trying again.", 409);
  logger.error("CUSTOMERS", "Save failed", error);
  return jsonError("We couldn’t save this customer. Please try again.", 500);
}
