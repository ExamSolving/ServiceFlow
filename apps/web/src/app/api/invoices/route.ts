import type { NextRequest } from "next/server";

import { createInvoice } from "@/src/features/invoices/repositories/invoice.repository";
import { invoiceCreateSchema } from "@/src/features/invoices/schemas/invoice.schema";
import { mutateInvoice } from "@/src/features/invoices/services/invoice-api";

export async function POST(request: NextRequest) {
  return mutateInvoice(request, invoiceCreateSchema, (session, data) => createInvoice(session, data), 201);
}
