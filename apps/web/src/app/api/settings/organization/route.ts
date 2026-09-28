import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/src/lib/auth/authorization";
import { updateOrganizationSettings } from "@/src/features/organization-settings/repositories/organization-settings.repository";
import { organizationSettingsFormSchema } from "@/src/features/organization-settings/schemas/organization-settings.schema";

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Request could not be verified." }, { status: 403 });
  }

  // Keep framework auth failures outside the database error boundary so an
  // unauthorized caller receives the normal protected response.
  const session = await requirePermission("manageOrganization");

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Enter valid organization settings and try again." },
      { status: 400 },
    );
  }

  const parsed = organizationSettingsFormSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Check the highlighted fields and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const result = await updateOrganizationSettings(session, parsed.data);
    return NextResponse.json({
      success: true,
      changedFields: result.changedFields,
    });
  } catch (error) {
    console.error("[ORGANIZATION_SETTINGS] Update failed", error);
    return NextResponse.json(
      { message: "We couldn’t save your organization settings. Please try again." },
      { status: 500 },
    );
  }
}
