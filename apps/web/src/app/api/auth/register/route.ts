import { FieldValue } from "firebase-admin/firestore";

import { NextRequest, NextResponse } from "next/server";

import { provisionOwnerSchema } from "@/src/features/auth/schemas/register.schema";

import { adminAuth, adminDb } from "@/src/lib/firebase/admin";
export async function POST(request: NextRequest) {
  let stage = "START";

  try {
    stage = "READ_AUTHORIZATION_HEADER";

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          message: "Authentication required.",
        },
        {
          status: 401,
        },
      );
    }

    const idToken = authorization.substring(7);

    stage = "VERIFY_ID_TOKEN";

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    console.log("[REGISTER] Firebase token verified:", decodedToken.uid);

    const uid = decodedToken.uid;
    const email = decodedToken.email;

    if (!email) {
      return NextResponse.json(
        {
          message: "Authenticated user has no email address.",
        },
        {
          status: 400,
        },
      );
    }

    stage = "READ_REQUEST_BODY";

    const json = await request.json();

    stage = "VALIDATE_REQUEST";

    const result = provisionOwnerSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        {
          message: "Invalid registration data.",
          errors: result.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    const { fullName, companyName } = result.data;

    stage = "READ_EXISTING_USER";

    const userRef = adminDb.collection("users").doc(uid);

    const existingUser = await userRef.get();

    console.log("[REGISTER] Firestore connection OK");

    if (existingUser.exists && existingUser.data()?.defaultOrganizationId) {
      return NextResponse.json({
        success: true,
        organizationId: existingUser.data()?.defaultOrganizationId,
        alreadyProvisioned: true,
      });
    }

    stage = "CREATE_DOCUMENT_REFERENCES";

    const organizationRef = adminDb.collection("organizations").doc();

    const organizationId = organizationRef.id;

    const membershipId = `${organizationId}_${uid}`;

    const membershipRef = adminDb.collection("memberships").doc(membershipId);

    const settingsRef = adminDb
      .collection("organizationSettings")
      .doc(organizationId);

    const auditRef = adminDb.collection("auditLogs").doc();

    const slugBase = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const organizationSlug = `${slugBase}-${organizationId
      .slice(0, 6)
      .toLowerCase()}`;

    stage = "BUILD_BATCH";

    const batch = adminDb.batch();

    batch.set(userRef, {
      email,
      displayName: fullName,
      phone: null,
      photoUrl: null,
      isActive: true,

      defaultOrganizationId: organizationId,

      createdAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(organizationRef, {
      name: companyName,

      slug: organizationSlug,

      ownerUserId: uid,

      status: "ACTIVE",

      createdAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(membershipRef, {
      userId: uid,

      organizationId,

      role: "OWNER",

      status: "ACTIVE",

      createdAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(settingsRef, {
      organizationId,

      jobNumberPrefix: "JOB",

      invoiceNumberPrefix: "INV",

      quotationNumberPrefix: "QUO",

      createdAt: FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(auditRef, {
      organizationId,

      actorUserId: uid,

      action: "ORGANIZATION_CREATED",

      entityType: "ORGANIZATION",

      entityId: organizationId,

      metadata: {
        registration: true,
      },

      createdAt: FieldValue.serverTimestamp(),
    });

    stage = "COMMIT_BATCH";

    await batch.commit();

    console.log("[REGISTER] Organization created:", organizationId);

    return NextResponse.json(
      {
        success: true,
        organizationId,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(`[REGISTER] Failed at stage: ${stage}`, error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      {
        message:
          process.env.NODE_ENV === "development"
            ? `Registration failed at ${stage}: ${errorMessage}`
            : "Unable to complete registration.",
      },
      {
        status: 500,
      },
    );
  }
}
