import type { NextRequest } from "next/server";

import { createQuotation } from "@/src/features/quotations/repositories/quotation.repository";
import { quotationCreateSchema } from "@/src/features/quotations/schemas/quotation.schema";
import { mutateQuotation } from "@/src/features/quotations/services/quotation-api";

export async function POST(request: NextRequest) {
  return mutateQuotation(request, quotationCreateSchema, (session, data) => createQuotation(session, data), 201);
}
