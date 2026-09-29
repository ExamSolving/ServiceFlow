import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/src/lib/auth/require-auth";
import { hasPermission } from "@/src/lib/auth/permissions";
import { updateCustomer } from "@/src/features/customers/repositories/customer.repository";
import { customerIdSchema, customerUpdateSchema } from "@/src/features/customers/schemas/customer.schema";
import { customerJsonError, customerMutationError, isCustomerRequestSameOrigin, parseCustomerRequest } from "@/src/features/customers/services/customer-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ customerId: string }> }) {
  if (!isCustomerRequestSameOrigin(request)) return customerJsonError("Request could not be verified.", 403);
  const session = await requireAuth();
  if (!hasPermission(session.role, "manageCustomers")) return customerJsonError("You don’t have permission to manage customers.", 403);
  const { customerId } = await context.params;
  if (!customerIdSchema.safeParse(customerId).success) return customerJsonError("This customer could not be found.", 404);
  const parsed = await parseCustomerRequest(request, customerUpdateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const customer = await updateCustomer(session, customerId, parsed.data);
    revalidatePath("/protected/customers");
    revalidatePath(`/protected/customers/${customer.id}`);
    revalidatePath(`/protected/customers/${customer.id}/edit`);
    return NextResponse.json({ customer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return customerMutationError(error);
  }
}
