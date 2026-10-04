import type { NextRequest } from "next/server";

import { transitionInvoice } from "@/src/features/invoices/repositories/invoice.repository";
import { invoiceActionSchema } from "@/src/features/invoices/schemas/invoice.schema";
import { mutateInvoice } from "@/src/features/invoices/services/invoice-api";

export async function POST(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;
  return mutateInvoice(request, invoiceActionSchema, (session, data) => transitionInvoice(session, invoiceId, data));
}
