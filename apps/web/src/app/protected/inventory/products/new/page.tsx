import type { Metadata } from "next";

import { ProductForm } from "@/src/features/products/components/product-form";
import { requirePermission } from "@/src/lib/auth/authorization";
import { readWorkspaceDefaults } from "@/src/features/workspace-settings/repositories/workspace-settings.repository";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const session = await requirePermission("manageInventory");
  const defaults = await readWorkspaceDefaults(session.organizationId);
  return <ProductForm currency={defaults.currency} defaultTaxRatePercent={defaults.defaultTaxRatePercent} />;
}
