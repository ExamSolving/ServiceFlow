/**
 * Same-origin guard for mutating Route Handlers.
 *
 * Browsers send `Origin` on cross-origin and same-origin POST/PATCH/DELETE
 * requests and `Sec-Fetch-Site` on every request. The expected origin is built
 * from the forwarded host and scheme so the check keeps working behind a
 * TLS-terminating proxy, where Next may normalize `nextUrl` to localhost.
 * This assumes the proxy in front of the app sets or overwrites
 * `X-Forwarded-Host` / `X-Forwarded-Proto`; `nextUrl.origin` is accepted too.
 */
import type { NextRequest } from "next/server";

export type OriginRequest = Pick<NextRequest, "headers" | "nextUrl">;

export function expectedOrigins(request: OriginRequest): string[] {
  const origins = new Set<string>();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.slice(0, -1);
  if (host && (protocol === "https" || protocol === "http")) origins.add(`${protocol}://${host}`);
  origins.add(request.nextUrl.origin);
  return [...origins];
}

// Reject cross-site callers; browser requests without an Origin are allowed
// only when the browser did not mark them as coming from another site.
export function isSameOrigin(request: OriginRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site !== "same-site";
  return expectedOrigins(request).includes(origin);
}
