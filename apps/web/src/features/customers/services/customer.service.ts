import "server-only";

import { notFound } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { CustomerCursorError, CustomerNotFoundError } from "../repositories/customer-errors";
import { listCustomers, readCustomer } from "../repositories/customer.repository";
import { customerListFiltersSchema } from "../schemas/customer.schema";
import type { CustomerDetail, CustomerListData, CustomerSearchParams } from "../types/customer";

export async function getCustomersPage(rawSearchParams: CustomerSearchParams = {}): Promise<CustomerListData> {
  const session = await requirePermission("manageCustomers");
  const parsed = customerListFiltersSchema.safeParse({ q: rawSearchParams.q, status: rawSearchParams.status, cursor: rawSearchParams.cursor });
  if (!parsed.success) {
    return { customers: [], filters: { q: "", status: "ALL" }, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  }
  try {
    return await listCustomers(session, parsed.data);
  } catch (error) {
    if (error instanceof CustomerCursorError) {
      return { customers: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page to continue." };
    }
    console.error("[CUSTOMERS] List failed", error);
    throw new Error("We couldn’t load customers. Please try again.");
  }
}

export async function getCustomer(customerId: string): Promise<CustomerDetail> {
  const session = await requirePermission("manageCustomers");
  try {
    return await readCustomer(session, customerId);
  } catch (error) {
    if (error instanceof CustomerNotFoundError) notFound();
    console.error("[CUSTOMERS] Detail failed", error);
    throw new Error("We couldn’t load this customer. Please try again.");
  }
}

export async function getCustomerFormContext(): Promise<void> {
  await requirePermission("manageCustomers");
}
