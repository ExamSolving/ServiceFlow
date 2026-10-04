import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { recordStockMovement } from "@/src/features/products/repositories/product.repository";
import { stockMovementSchema } from "@/src/features/products/schemas/product.schema";
import { productMutationError } from "@/src/features/products/services/product-api";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageInventory", "You don’t have permission to manage inventory.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, stockMovementSchema, { maxBytes: 16_384, resource: "stock movement" });
  if (!parsed.success) return parsed.response;
  try {
    const result = await recordStockMovement(auth.session, parsed.data);
    for (const path of ["/protected/inventory/products", `/protected/inventory/products/${result.product.id}`, "/protected/inventory/stock", "/protected/dashboard"]) revalidatePath(path);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return productMutationError(error);
  }
}
