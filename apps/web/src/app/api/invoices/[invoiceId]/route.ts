import type { NextRequest } from "next/server";

import { updateInvoice } from "@/src/features/invoices/repositories/invoice.repository";
import { invoiceUpdateSchema } from "@/src/features/invoices/schemas/invoice.schema";
import { mutateInvoice } from "@/src/features/invoices/services/invoice-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;
  return mutateInvoice(request, invoiceUpdateSchema, (session, data) => updateInvoice(session, invoiceId, data));
}
