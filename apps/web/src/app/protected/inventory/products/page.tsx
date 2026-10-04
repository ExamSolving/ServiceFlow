import type { Metadata } from "next";

import { ProductsView } from "@/src/features/products/components/products-view";
import { getProductsPage } from "@/src/features/products/services/product.service";
import { requirePermission } from "@/src/lib/auth/authorization";
import { readWorkspaceDefaults } from "@/src/features/workspace-settings/repositories/workspace-settings.repository";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("manageInventory");
  const [data, defaults] = await Promise.all([getProductsPage(await searchParams), readWorkspaceDefaults(session.organizationId)]);
  return <ProductsView data={data} currency={defaults.currency} />;
}
