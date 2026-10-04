import { NextResponse, type NextRequest } from "next/server";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError } from "@/src/lib/http/json";
import { logger } from "@/src/lib/observability/logger";
import { BillingAccessError, BillingCursorError, listBillingCustomerOptions } from "@/src/features/billing/repositories/billing-customers";
import { billingCustomerOptionsSchema } from "@/src/features/billing/schemas/billing.schema";

export const dynamic = "force-dynamic";

// Customer picker for quotations and invoices. Products come from /api/products/options.
export async function GET(request: NextRequest) {
  const auth = await getApiSession();
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  if (params.get("kind") !== "customers") return jsonError("Unknown option kind.", 400);
  const parsed = billingCustomerOptionsSchema.safeParse({ q: params.get("q") ?? undefined, cursor: params.get("cursor") ?? undefined });
  if (!parsed.success) return jsonError("These search options are invalid.", 400);
  try {
    return NextResponse.json(await listBillingCustomerOptions(auth.session, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BillingAccessError) return jsonError("You don’t have permission to manage billing.", 403);
    if (error instanceof BillingCursorError) return jsonError("This page of options is no longer available. Search again.", 400, { code: "CURSOR" });
    logger.error("BILLING", "Customer options failed", error);
    return jsonError("We couldn’t load customers. Please try again.", 500);
  }
}
