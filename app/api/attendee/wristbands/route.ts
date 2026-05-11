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
          orderBy: {
            createdAt: "asc"
          }
        },
      }
    });

    if (!attendee) {
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
