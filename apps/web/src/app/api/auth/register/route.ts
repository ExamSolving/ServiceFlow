import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { provisionOwnerSchema } from "@/src/features/auth/schemas/register.schema";
import { adminAuth, adminDb } from "@/src/lib/firebase/admin";
import { jsonError } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";

export const runtime = "nodejs";

/**
 * Provision a new workspace for a freshly registered Firebase user: profile,
 * organization, OWNER membership, settings and an audit entry, in one
 * transaction so a double submit can never create two organizations.
 */
export async function POST(request: NextRequest) {
  let stage = "START";

  try {
    if (!isSameOrigin(request)) {
      return jsonError("Request could not be verified.", 403);
    }

    stage = "READ_AUTHORIZATION_HEADER";
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonError("Authentication required.", 401);
    }
    const idToken = authorization.substring(7);

    stage = "VERIFY_ID_TOKEN";
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    if (!email) {
      return jsonError("Authenticated user has no email address.", 400);
    }

    stage = "READ_REQUEST_BODY";
    const json = await request.json();

    stage = "VALIDATE_REQUEST";
    const result = provisionOwnerSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { message: "Invalid registration data.", errors: result.error.flatten() },
        { status: 400 },
      );
    }
    const { fullName, companyName } = result.data;

    stage = "PROVISION";
    const userRef = adminDb.collection("users").doc(uid);
    const organizationRef = adminDb.collection("organizations").doc();
    const organizationId = organizationRef.id;
    const membershipRef = adminDb.collection("memberships").doc(`${organizationId}_${uid}`);
    const settingsRef = adminDb.collection("organizationSettings").doc(organizationId);
    const auditRef = adminDb.collection("auditLogs").doc();
    const slugBase = companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const organizationSlug = `${slugBase}-${organizationId.slice(0, 6).toLowerCase()}`;

    const outcome = await adminDb.runTransaction(async (transaction) => {
      const existingUser = await transaction.get(userRef);
      const existing = existingUser.data();
      if (existingUser.exists && typeof existing?.defaultOrganizationId === "string" && existing.defaultOrganizationId) {
        return { organizationId: existing.defaultOrganizationId as string, alreadyProvisioned: true };
      }

      transaction.set(
        userRef,
        {
          email,
          displayName: fullName,
          phone: existing?.phone ?? null,
          photoUrl: existing?.photoUrl ?? null,
          isActive: true,
          defaultOrganizationId: organizationId,
          ...(existingUser.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.create(organizationRef, {
        name: companyName,
        slug: organizationSlug,
        ownerUserId: uid,
        status: "ACTIVE",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(membershipRef, {
        userId: uid,
        organizationId,
        role: "OWNER",
        status: "ACTIVE",
        displayName: fullName,
        email,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(settingsRef, {
        organizationId,
        timezone: "UTC",
        jobNumberPrefix: "JOB",
        invoiceNumberPrefix: "INV",
        quotationNumberPrefix: "QUO",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef, {
        organizationId,
        actorUserId: uid,
        action: "ORGANIZATION_CREATED",
        entityType: "ORGANIZATION",
        entityId: organizationId,
        metadata: { registration: true },
        createdAt: FieldValue.serverTimestamp(),
      });
      return { organizationId, alreadyProvisioned: false };
    });

    if (outcome.alreadyProvisioned) {
      return NextResponse.json({ success: true, organizationId: outcome.organizationId, alreadyProvisioned: true });
    }
    logger.info("REGISTER", "Organization created", { organizationId: outcome.organizationId });
    return NextResponse.json({ success: true, organizationId: outcome.organizationId }, { status: 201 });
  } catch (error) {
    logger.error("REGISTER", `Failed at stage ${stage}`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        message:
          process.env.NODE_ENV === "development"
            ? `Registration failed at ${stage}: ${errorMessage}`
            : "Unable to complete registration.",
      },
      { status: 500 },
    );
  }
}
