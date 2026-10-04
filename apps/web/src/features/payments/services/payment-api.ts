import "server-only";

import { BillingReferenceError } from "@/src/features/billing/repositories/billing-references";
import { InvoiceNotFoundError } from "@/src/features/invoices/repositories/invoice-errors";
import { jsonError } from "@/src/lib/http/json";
import { logger } from "@/src/lib/observability/logger";
import { PaymentAccessError, PaymentConflictError, PaymentCursorError, PaymentRuleError } from "../repositories/payment-errors";

export function paymentMutationError(error: unknown) {
  if (error instanceof PaymentAccessError) return jsonError("You don’t have permission to record payments.", 403);
  if (error instanceof InvoiceNotFoundError) return jsonError("This invoice is unavailable in your workspace.", 404);
  if (error instanceof PaymentConflictError) return jsonError("This payment was already recorded with different details. Refresh to review the invoice.", 409, { code: "CONFLICT" });
  if (error instanceof PaymentRuleError) return jsonError(error.rule === "EXCEEDS_BALANCE" ? "The amount is more than the balance due on this invoice." : "Payments can only be recorded against issued invoices with a balance due.", 409, { code: "RULE", rule: error.rule });
  if (error instanceof BillingReferenceError) return jsonError("The invoice’s linked job could not be verified. Refresh and try again.", 409, { code: "INVALID_REFERENCE" });
  if (error instanceof PaymentCursorError) return jsonError("This page is no longer available.", 400, { code: "CURSOR" });
  logger.error("PAYMENTS", "Mutation failed", error);
  return jsonError("We couldn’t record this payment. Please try again.", 500);
}
