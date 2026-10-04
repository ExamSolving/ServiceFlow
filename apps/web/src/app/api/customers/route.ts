import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getApiSession } from "@/src/lib/http/api-session";
import { createCustomer } from "@/src/features/customers/repositories/customer.repository";
import { customerCreateSchema } from "@/src/features/customers/schemas/customer.schema";
import { customerJsonError, customerMutationError, isCustomerRequestSameOrigin, parseCustomerRequest } from "@/src/features/customers/services/customer-api";

export async function POST(request: NextRequest) {
  if (!isCustomerRequestSameOrigin(request)) return customerJsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageCustomers", "You don’t have permission to manage customers.");
  if (!auth.ok) return auth.response;
  const parsed = await parseCustomerRequest(request, customerCreateSchema);
  if (!parsed.success) return parsed.response;
  try {
    const customer = await createCustomer(auth.session, parsed.data);
    revalidatePath("/protected/customers");
    return NextResponse.json({ customer }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return customerMutationError(error);
  }
}
