import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { ServiceTypeAccessError, ServiceTypeConflictError, ServiceTypeDuplicateNameError, ServiceTypeNotFoundError } from "../repositories/service-type-errors";

export function isServiceTypeRequestSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (!origin && site === "same-site")) return false;
  if (!origin) return true;
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);
  return Boolean(host && (protocol === "https" || protocol === "http") && origin === `${protocol}://${host}`);
}

export function serviceTypeJsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ message, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseServiceTypeRequest<T>(request: NextRequest, schema: z.ZodType<T>) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return { success: false as const, response: serviceTypeJsonError("Send service type details as JSON.", 415) };
  const maxBytes = 16_384;
  if (Number(request.headers.get("content-length")) > maxBytes) return { success: false as const, response: serviceTypeJsonError("Service type details are too large.", 413) };
  let json: unknown;
  try {
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
            return { success: false as const, response: serviceTypeJsonError("Service type details are too large.", 413) };
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    json = JSON.parse(body);
  } catch {
    return { success: false as const, response: serviceTypeJsonError("Enter valid service type details and try again.", 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { success: false as const, response: NextResponse.json({ message: "Check the highlighted fields and try again.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400, headers: { "Cache-Control": "no-store" } }) };
  return { success: true as const, data: parsed.data };
}

export function serviceTypeMutationError(error: unknown) {
  if (error instanceof ServiceTypeAccessError) return serviceTypeJsonError("You don’t have permission to manage service types.", 403);
  if (error instanceof ServiceTypeNotFoundError) return serviceTypeJsonError("This service type could not be found.", 404);
  if (error instanceof ServiceTypeDuplicateNameError) return serviceTypeJsonError("This name is already used by a service type in your workspace. Choose another name or edit the existing service type.", 409, "DUPLICATE_NAME");
  if (error instanceof ServiceTypeConflictError) return serviceTypeJsonError("This service type or request has changed. Review the latest version before trying again.", 409, "CONFLICT");
  console.error("[SERVICE TYPES] Save failed", error);
  return serviceTypeJsonError("We couldn’t save this service type. Please try again.", 500);
}
