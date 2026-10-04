import type { NextRequest } from "next/server";

import { transitionQuotation } from "@/src/features/quotations/repositories/quotation.repository";
import { quotationActionSchema } from "@/src/features/quotations/schemas/quotation.schema";
import { mutateQuotation } from "@/src/features/quotations/services/quotation-api";

export async function POST(request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  return mutateQuotation(request, quotationActionSchema, (session, data) => transitionQuotation(session, quotationId, data));
}
