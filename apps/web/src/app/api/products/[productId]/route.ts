import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { updateProduct } from "@/src/features/products/repositories/product.repository";
import { productUpdateSchema } from "@/src/features/products/schemas/product.schema";
import { productMutationError } from "@/src/features/products/services/product-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ productId: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageInventory", "You don’t have permission to manage inventory.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, productUpdateSchema, { maxBytes: 16_384, resource: "product" });
  if (!parsed.success) return parsed.response;
  const { productId } = await context.params;
  try {
    const product = await updateProduct(auth.session, productId, parsed.data);
    for (const path of ["/protected/inventory/products", `/protected/inventory/products/${product.id}`, `/protected/inventory/products/${product.id}/edit`, "/protected/inventory/stock"]) revalidatePath(path);
    return NextResponse.json({ product }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return productMutationError(error);
  }
}
