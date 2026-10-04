import { NextResponse, type NextRequest } from "next/server";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { createProduct } from "@/src/features/products/repositories/product.repository";
import { productCreateSchema } from "@/src/features/products/schemas/product.schema";
import { productMutationError } from "@/src/features/products/services/product-api";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageInventory", "You don’t have permission to manage inventory.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, productCreateSchema, { maxBytes: 16_384, resource: "product" });
  if (!parsed.success) return parsed.response;
  try {
    const product = await createProduct(auth.session, parsed.data);
    return NextResponse.json({ product }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return productMutationError(error);
  }
}
