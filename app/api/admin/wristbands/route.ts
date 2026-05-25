/**
 * GET /api/admin/wristbands
 *
 * Returns every wristband row, used by the admin dashboard to:
 *   - show "blank" (unregistered) wristbands separately from attendee rows
 *   - render the full list of issued QR codes for re-printing / audit.
 *
 * Auth: ADMIN session required.
 */

import { NextResponse } from "next/server";
import { jsonError, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  try {
    const wristbands = await prisma.wristband.findMany({
      select: {
        id: true,
        qrToken: true,
        status: true,
        balanceCredits: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({
      success: true,
      wristbands
    });
  } catch {
    return jsonError("Could not load wristbands.", 500);
  }
}
