import { NextResponse } from "next/server";

import { getAppSession } from "@/src/lib/auth/app-session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAppSession();

    if (!session) {
      return NextResponse.json(
        { message: "Authentication required." },
        { status: 401 },
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("[AUTH] Session lookup failed:", error);
    return NextResponse.json(
      { message: "Unable to load the current session." },
      { status: 500 },
    );
  }
}
