import { NextRequest, NextResponse } from "next/server";

import { adminAuth } from "@/src/lib/firebase/admin";

import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRES_IN,
} from "@/src/lib/auth/constants";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    /*
     * Basic same-origin protection.
     */
    const origin = request.headers.get("origin");

    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json(
        {
          message: "Invalid request origin.",
        },
        {
          status: 403,
        },
      );
    }

    const body = await request.json();

    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        {
          message: "Firebase ID token is required.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Verify token before creating
     * the server session.
     */
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (decodedToken.email_verified !== true) {
      return NextResponse.json(
        {
          message: "Email verification required.",
        },
        {
          status: 403,
        },
      );
    }

    /*
     * Require a recent login.
     *
     * Prevent an old stolen token from
     * being exchanged for a fresh session.
     */
    const nowInSeconds = Math.floor(Date.now() / 1000);

    const authenticatedAt = decodedToken.auth_time;

    if (!authenticatedAt || nowInSeconds - authenticatedAt > 5 * 60) {
      return NextResponse.json(
        {
          message: "Recent authentication is required.",
        },
        {
          status: 401,
        },
      );
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN,
    });

    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,

      value: sessionCookie,

      httpOnly: true,

      secure: process.env.NODE_ENV === "production",

      sameSite: "lax",

      path: "/",

      maxAge: SESSION_EXPIRES_IN / 1000,
    });

    return response;
  } catch (error) {
    console.error("Session creation failed:", error);

    return NextResponse.json(
      {
        message: "Unable to create session.",
      },
      {
        status: 401,
      },
    );
  }
}
