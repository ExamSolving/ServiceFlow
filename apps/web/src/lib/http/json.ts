import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonError(message: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json({ message, ...(extra ?? {}) }, { status, headers: NO_STORE_HEADERS });
}

export function jsonOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export type ParsedJsonBody<T> = { success: true; data: T } | { success: false; response: NextResponse };

export interface ParseJsonOptions {
  /** Maximum accepted body size in bytes. Defaults to 16 KiB. */
  maxBytes?: number;
  /** Noun used in user-facing messages, for example "customer". */
  resource?: string;
}

// Validate content type, stream the body with a hard byte limit (even without
// Content-Length), then validate the JSON against the schema.
export async function parseJsonBody<T>(request: NextRequest, schema: z.ZodType<T>, options: ParseJsonOptions = {}): Promise<ParsedJsonBody<T>> {
  const maxBytes = options.maxBytes ?? 16_384;
  const resource = options.resource ?? "request";
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return { success: false, response: jsonError(`Send ${resource} details as JSON.`, 415) };
  }
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return { success: false, response: jsonError("The submitted details are too large.", 413) };
  }
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
            return { success: false, response: jsonError("The submitted details are too large.", 413) };
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    json = JSON.parse(body);
  } catch {
    return { success: false, response: jsonError(`Enter valid ${resource} details and try again.`, 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json(
        { message: "Check the highlighted fields and try again.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
  }
  return { success: true, data: parsed.data };
}
