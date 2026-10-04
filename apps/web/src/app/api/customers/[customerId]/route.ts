import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { updateCustomer } from "@/src/features/customers/repositories/customer.repository";
import { customerIdSchema, customerUpdateSchema } from "@/src/features/customers/schemas/customer.schema";
import { customerJsonError, customerMutationError, isCustomerRequestSameOrigin, parseCustomerRequest } from "@/src/features/customers/services/customer-api";

export async function PATCH(request: NextRequest, context: { params: Promise<{ customerId: string }> }) {
  if (!isCustomerRequestSameOrigin(request)) return customerJsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageCustomers", "You don’t have permission to manage customers.");
  if (!auth.ok) return auth.response;
  const { customerId } = await context.params;
  if (!customerIdSchema.safeParse(customerId).success) return customerJsonError("This customer could not be found.", 404);
  const parsed = await parseCustomerRequest(request, customerUpdateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const customer = await updateCustomer(auth.session, customerId, parsed.data);
    revalidatePath("/protected/customers");
    revalidatePath(`/protected/customers/${customer.id}`);
    revalidatePath(`/protected/customers/${customer.id}/edit`);
    return NextResponse.json({ customer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return customerMutationError(error);
  }
}
