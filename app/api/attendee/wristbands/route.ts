/**
 * GET /api/attendee/wristbands
 *
 * Returns the logged-in attendee's profile plus the wristbands linked to
 * their account. Used by `/attendee/dashboard` (called every 2 seconds to
 * keep the visible balance fresh) and by `/onboarding` for prefilling the
 * profile form.
 *
 * Response: { attendee: { id, email, name, dob, gender, phone },
 *             wristbands: [{ id, qrToken, status, balanceCredits }] }
 *           or `{ wristbands: [] }` when the user record was just deleted.
 *
 * Auth: ATTENDEE session required.
 */

import { NextResponse } from "next/server";
import { requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  try {
    const attendee = await prisma.user.findUnique({
      where: {
        id: session.userId
      },
      // Explicit select so we never accidentally return new sensitive fields.
      select: {
        id: true,
        email: true,
        name: true,
        dob: true,
        gender: true,
        phone: true,
        wristbands: {
          select: {
            id: true,
            qrToken: true,
            status: true,
            balanceCredits: true
          },
          // Stable order so the dashboard's "primary wristband" is
          // deterministic across polls.
          orderBy: {
            createdAt: "asc"
          }
        },
      }
    });

    if (!attendee) {
      // The cookie pointed at a user that no longer exists. Return an
      // empty list so the dashboard can render gracefully; the next
      // request will get a 401 once the user re-logs.
      return NextResponse.json({ wristbands: [] });
    }

    return NextResponse.json({
      attendee: {
        id: attendee.id,
        email: attendee.email,
        name: attendee.name,
        dob: attendee.dob,
        gender: attendee.gender,
        phone: attendee.phone
      },
      wristbands: attendee.wristbands
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not load wristbands"
      },
      { status: 500 }
    );
  }
}
