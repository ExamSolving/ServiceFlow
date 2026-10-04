import { NextResponse, type NextRequest } from "next/server";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { revalidateInvoice } from "@/src/features/invoices/services/invoice-api";
import { recordPayment } from "@/src/features/payments/repositories/payment.repository";
import { paymentCreateSchema } from "@/src/features/payments/schemas/payment.schema";
import { paymentMutationError } from "@/src/features/payments/services/payment-api";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("recordPayments", "You don’t have permission to record payments.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, paymentCreateSchema, { maxBytes: 16_384, resource: "payment" });
  if (!parsed.success) return parsed.response;
  try {
    const result = await recordPayment(auth.session, parsed.data);
    revalidateInvoice(result.invoice);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentMutationError(error);
  }
}
