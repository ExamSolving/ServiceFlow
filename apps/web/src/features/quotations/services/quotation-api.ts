import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { BillingReferenceError } from "@/src/features/billing/repositories/billing-references";
import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { QuotationAccessError, QuotationConflictError, QuotationNotFoundError, QuotationRuleError, QuotationStateError } from "../repositories/quotation-errors";
import type { QuotationDetail } from "../types/quotation";

export function quotationMutationError(error: unknown) {
  if (error instanceof QuotationAccessError) return jsonError("You don’t have permission to manage quotations.", 403);
  if (error instanceof QuotationNotFoundError) return jsonError("This quotation is unavailable in your workspace.", 404);
  if (error instanceof QuotationConflictError) return jsonError("This quotation changed or was already saved. Review the latest version before trying again.", 409, { code: "CONFLICT" });
  if (error instanceof QuotationStateError) return jsonError("This quotation’s status no longer allows this action. Refresh to view its latest state.", 409, { code: "STATE" });
  if (error instanceof QuotationRuleError) return jsonError(error.rule === "JOB_HAS_ACTIVE_QUOTATION" ? "This job already has a sent or approved quotation. Reject or expire it before sending another." : "This quotation has already been converted to an invoice.", 409, { code: "RULE", rule: error.rule });
  if (error instanceof BillingReferenceError) return jsonError(error.reference === "CUSTOMER_MISMATCH" ? "The linked job belongs to a different customer." : error.reference === "JOB" ? "The linked job could not be found in your workspace." : "Choose an active customer from your workspace.", 409, { code: "INVALID_REFERENCE" });
  logger.error("QUOTATIONS", "Mutation failed", error);
  return jsonError("We couldn’t save the quotation. Please try again.", 500);
}

export function revalidateQuotation(quotation: Pick<QuotationDetail, "id" | "jobId">) {
  for (const path of ["/protected/quotations", `/protected/quotations/${quotation.id}`, `/protected/quotations/${quotation.id}/edit`, "/protected/dashboard"]) revalidatePath(path);
  if (quotation.jobId) revalidatePath(`/protected/jobs/${quotation.jobId}`);
}

export async function mutateQuotation<T>(request: NextRequest, schema: z.ZodType<T>, save: (session: AppSession, data: T) => Promise<QuotationDetail>, status = 200) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageQuotations", "You don’t have permission to manage quotations.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, schema, { maxBytes: 65_536, resource: "quotation" });
  if (!parsed.success) return parsed.response;
  try {
    const quotation = await save(auth.session, parsed.data);
    revalidateQuotation(quotation);
    return NextResponse.json({ quotation }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return quotationMutationError(error);
  }
}
