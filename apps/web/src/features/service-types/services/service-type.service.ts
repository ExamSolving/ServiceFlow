import "server-only";

import { notFound } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { ServiceTypeCursorError, ServiceTypeNotFoundError } from "../repositories/service-type-errors";
import { listServiceTypes, readServiceType } from "../repositories/service-type.repository";
import { serviceTypeListFiltersSchema } from "../schemas/service-type.schema";
import type { ServiceTypeDetail, ServiceTypeListData, ServiceTypeSearchParams } from "../types/service-type";

export async function getServiceTypesPage(rawSearchParams: ServiceTypeSearchParams = {}): Promise<ServiceTypeListData> {
  const session = await requirePermission("manageServiceTypes");
  const parsed = serviceTypeListFiltersSchema.safeParse({
    q: rawSearchParams.q, status: rawSearchParams.status, cursor: rawSearchParams.cursor,
  });
  if (!parsed.success) {
    return { serviceTypes: [], filters: { q: "", status: "ALL" }, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  }
  try {
    return await listServiceTypes(session, parsed.data);
  } catch (error) {
    if (error instanceof ServiceTypeCursorError) {
      return { serviceTypes: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page to continue." };
    }
    console.error("[SERVICE TYPES] List failed", error);
    throw new Error("We couldn’t load service types. Please try again.");
  }
}

export async function getServiceType(serviceTypeId: string): Promise<ServiceTypeDetail> {
  const session = await requirePermission("manageServiceTypes");
  try {
    return await readServiceType(session, serviceTypeId);
  } catch (error) {
    if (error instanceof ServiceTypeNotFoundError) notFound();
    console.error("[SERVICE TYPES] Detail failed", error);
    throw new Error("We couldn’t load this service type. Please try again.");
  }
}
