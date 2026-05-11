import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { jsonError } from "@/lib/http";

export async function POST() {
  try {
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
