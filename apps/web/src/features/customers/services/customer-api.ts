import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { CustomerAccessError, CustomerConflictError, CustomerNotFoundError } from "../repositories/customer-errors";

export function isCustomerRequestSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return site !== "cross-site" && (!origin || origin === request.nextUrl.origin);
}

export function customerJsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseCustomerRequest<T>(request: NextRequest, schema: z.ZodType<T>) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { success: false as const, response: customerJsonError("Send customer details as JSON.", 415) };
  }
  let json: unknown;
  try {
    const body = await request.text();
    if (body.length > 16_384) return { success: false as const, response: customerJsonError("Customer details are too large.", 413) };
    json = JSON.parse(body);
  } catch {
    return { success: false as const, response: customerJsonError("Enter valid customer details and try again.", 400) };
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

export function customerMutationError(error: unknown) {
  if (error instanceof CustomerAccessError) return customerJsonError("You don’t have permission to manage customers.", 403);
  if (error instanceof CustomerNotFoundError) return customerJsonError("This customer could not be found.", 404);
  if (error instanceof CustomerConflictError) return customerJsonError("This customer or request has changed. Reload the page before trying again.", 409);
  console.error("[CUSTOMERS] Save failed", error);
  return customerJsonError("We couldn’t save this customer. Please try again.", 500);
}
