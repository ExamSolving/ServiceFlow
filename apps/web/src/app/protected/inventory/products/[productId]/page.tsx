import type { Metadata } from "next";

import { ProductDetailView } from "@/src/features/products/components/product-detail-view";
import { getProductContext } from "@/src/features/products/services/product.service";

export const metadata: Metadata = { title: "Product details" };

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const context = await getProductContext((await params).productId);
  return <ProductDetailView context={context} />;
}
