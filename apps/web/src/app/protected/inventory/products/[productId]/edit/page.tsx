import type { Metadata } from "next";

import { ProductForm } from "@/src/features/products/components/product-form";
import { getProductContext } from "@/src/features/products/services/product.service";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const context = await getProductContext((await params).productId);
  return <ProductForm key={`${context.product.id}:${context.product.version}`} product={context.product} currency={context.currency} defaultTaxRatePercent={context.defaultTaxRatePercent} />;
}
