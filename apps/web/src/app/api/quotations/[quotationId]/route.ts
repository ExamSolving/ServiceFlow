import type { NextRequest } from "next/server";

import { updateQuotation } from "@/src/features/quotations/repositories/quotation.repository";
import { quotationUpdateSchema } from "@/src/features/quotations/schemas/quotation.schema";
import { mutateQuotation } from "@/src/features/quotations/services/quotation-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  return mutateQuotation(request, quotationUpdateSchema, (session, data) => updateQuotation(session, quotationId, data));
}
