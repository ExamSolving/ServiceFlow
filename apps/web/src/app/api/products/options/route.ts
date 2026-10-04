import { NextResponse, type NextRequest } from "next/server";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError } from "@/src/lib/http/json";
import { listProductOptions } from "@/src/features/products/repositories/product.repository";
import { productOptionsSchema } from "@/src/features/products/schemas/product.schema";
import { productMutationError } from "@/src/features/products/services/product-api";

export const dynamic = "force-dynamic";

// Active catalog items of the session's tenant for stock and billing pickers.
export async function GET(request: NextRequest) {
  const auth = await getApiSession();
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  const parsed = productOptionsSchema.safeParse({ q: params.get("q") ?? undefined, cursor: params.get("cursor") ?? undefined });
  if (!parsed.success) return jsonError("These search options are invalid.", 400);
  try {
    const result = await listProductOptions(auth.session, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return productMutationError(error);
  }
}
