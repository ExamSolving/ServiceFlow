import type { Metadata } from "next";
import { ServiceTypeForm } from "@/src/features/service-types/components/service-type-form";
import { requirePermission } from "@/src/lib/auth/authorization";

export const metadata: Metadata = { title: "Add service type" };

export default async function NewServiceTypePage() {
  await requirePermission("manageServiceTypes");
  return <ServiceTypeForm />;
}
