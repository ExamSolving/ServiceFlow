import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import {
  ServiceRequestAccessError, ServiceRequestConflictError, ServiceRequestCursorError, ServiceRequestNotFoundError,
  ServiceRequestReferenceError, ServiceRequestTransitionError,
} from "../repositories/service-request-errors";

export function isServiceRequestRequestSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (!origin && site === "same-site")) return false;
  if (!origin) return true;
  // Next may normalize nextUrl to localhost behind a proxy. Compare against the
  // incoming host and forwarded scheme so same-origin browser saves still work.
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);
  return Boolean(host && (protocol === "https" || protocol === "http") && origin === `${protocol}://${host}`);
}

export function serviceRequestJsonError(message: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json({ message, ...(extra ?? {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseServiceRequestRequest<T>(request: NextRequest, schema: z.ZodType<T>, resource = "service request") {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { success: false as const, response: serviceRequestJsonError(`Send ${resource} details as JSON.`, 415) };
  }
  const maxBytes = 32_768;
  if (Number(request.headers.get("content-length")) > maxBytes) return { success: false as const, response: serviceRequestJsonError("The submitted details are too large.", 413) };
  let json: unknown;
  try {
    // Limit actual bytes while streaming, including when Content-Length is absent.
    const reader = request.body?.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let body = "";
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            return { success: false as const, response: serviceRequestJsonError("The submitted details are too large.", 413) };
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    json = JSON.parse(body);
  } catch {
    return { success: false as const, response: serviceRequestJsonError(`Enter valid ${resource} details and try again.`, 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false as const,
      response: NextResponse.json({ message: "Check the highlighted fields and try again.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400, headers: { "Cache-Control": "no-store" } }),
    };
  }
  return { success: true as const, data: parsed.data };
}

export function serviceRequestMutationError(error: unknown) {
  if (error instanceof ServiceRequestAccessError) return serviceRequestJsonError("You don’t have permission to manage service requests.", 403);
  if (error instanceof ServiceRequestNotFoundError) return serviceRequestJsonError("This service request could not be found.", 404);
  if (error instanceof ServiceRequestReferenceError) {
    return serviceRequestJsonError(error.field === "customerId"
      ? "Choose an active customer from your workspace."
      : "Choose an active service type from your catalog.", 409, { code: "INVALID_REFERENCE", field: error.field });
  }
  if (error instanceof ServiceRequestTransitionError) return serviceRequestJsonError("This service request can no longer be changed in its current status. Reload the page to see the latest status.", 409, { code: "TRANSITION" });
  if (error instanceof ServiceRequestConflictError) return serviceRequestJsonError("This service request or request has changed. Reload the page before trying again.", 409, { code: "CONFLICT" });
  console.error("[SERVICE REQUESTS] Save failed", error);
  return serviceRequestJsonError("We couldn’t save this service request. Please try again.", 500);
}

export function serviceRequestOptionsError(error: unknown) {
  if (error instanceof ServiceRequestAccessError) return serviceRequestJsonError("You don’t have permission to manage service requests.", 403);
  if (error instanceof ServiceRequestCursorError) return serviceRequestJsonError("This page of options is no longer available. Search again.", 400, { code: "CURSOR" });
  console.error("[SERVICE REQUESTS] Options failed", error);
  return serviceRequestJsonError("We couldn’t load options. Please try again.", 500);
}
