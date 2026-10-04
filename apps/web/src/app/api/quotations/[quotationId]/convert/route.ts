import type { NextRequest } from "next/server";

import { createInvoiceFromQuotation } from "@/src/features/invoices/repositories/invoice.repository";
import { mutateInvoice } from "@/src/features/invoices/services/invoice-api";
import { quotationConvertSchema } from "@/src/features/quotations/schemas/quotation.schema";

// Converting needs invoice rights; the quotation's own page only offers it to such users.
export async function POST(request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  return mutateInvoice(request, quotationConvertSchema, (session, data) => createInvoiceFromQuotation(session, quotationId, data), 201);
}
