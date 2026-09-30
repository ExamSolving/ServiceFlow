import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import {
  TechnicianAccessError, TechnicianAlreadyLinkedError, TechnicianConflictError,
  TechnicianIneligibleMemberError, TechnicianNotFoundError,
} from "../repositories/technician-errors";

export function isTechnicianRequestSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || !origin && site === "same-site") return false;
  if (!origin) return true;
  // Next may normalize nextUrl to localhost behind a proxy. Compare against the
  // incoming host and forwarded scheme so same-origin browser saves still work.
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);
  return Boolean(host && (protocol === "https" || protocol === "http") && origin === `${protocol}://${host}`);
}

export function technicianJsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ message, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseTechnicianRequest<T>(request: NextRequest, schema: z.ZodType<T>) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { success: false as const, response: technicianJsonError("Send technician details as JSON.", 415) };
  }
  const maxBytes = 16_384;
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { success: false as const, response: technicianJsonError("Technician details are too large.", 413) };
  }
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
            return { success: false as const, response: technicianJsonError("Technician details are too large.", 413) };
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    json = JSON.parse(body);
  } catch {
    return { success: false as const, response: technicianJsonError("Enter valid technician details and try again.", 400) };
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

export function technicianMutationError(error: unknown) {
  if (error instanceof TechnicianAccessError) return technicianJsonError("You don’t have permission to manage technicians.", 403);
  if (error instanceof TechnicianNotFoundError) return technicianJsonError("This technician could not be found.", 404);
  if (error instanceof TechnicianAlreadyLinkedError) return technicianJsonError("This member already has a technician profile. Open the existing profile to make changes.", 409, "ALREADY_LINKED");
  if (error instanceof TechnicianIneligibleMemberError) return technicianJsonError("This member is no longer eligible. They need an active technician membership and an active account. You can still mark an existing profile inactive.", 409, "INELIGIBLE_MEMBER");
  if (error instanceof TechnicianConflictError) return technicianJsonError("This technician or request has changed. Reload the page before trying again.", 409, "CONFLICT");
  console.error("[TECHNICIANS] Save failed", error);
  return technicianJsonError("We couldn’t save this technician. Please try again.", 500);
}
