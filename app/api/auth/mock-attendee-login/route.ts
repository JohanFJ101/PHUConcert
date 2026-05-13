/**
 * POST /api/auth/mock-attendee-login
 *
 * MVP-only attendee sign-in. Looks up the seeded demo user by hard-coded
 * email and issues an `ATTENDEE` session cookie. Real Google OAuth will
 * replace this endpoint later, but the cookie contract (`phu_session`)
 * will stay the same so the rest of the app does not need to change.
 *
 * Failure cases:
 *   - The demo user is missing (seed never ran) -> 500 with a hint.
 *   - The database is unreachable -> 500 generic.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { jsonError } from "@/lib/http";

export async function POST() {
  try {
    // We only need the user's id to mint the session; selecting just `id`
    // keeps the query cheap and avoids accidentally leaking other fields.
    const user = await prisma.user.findUnique({
      where: {
        email: "demo@example.com"
      },
      select: {
        id: true
      }
    });

    if (!user) {
      return jsonError("Demo attendee not found. Run the seed script first.", 500);
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, {
      role: "ATTENDEE",
      userId: user.id
    });
    return response;
  } catch {
    return jsonError("Attendee login failed. Check database setup.", 500);
  }
}
