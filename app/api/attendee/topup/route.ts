import { NextResponse } from "next/server";
import { jsonError, readJsonObject, requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ALLOWED_TOPUPS = new Set([100, 250, 500]);

export async function POST(request: Request) {
  const { session, error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const wristbandId = typeof body?.wristbandId === "string" ? body.wristbandId : "";
  const amountCredits = typeof body?.amountCredits === "number" ? body.amountCredits : 0;

  if (!wristbandId) {
    return jsonError("Wristband is required", 400);
  }

  if (!Number.isInteger(amountCredits) || !ALLOWED_TOPUPS.has(amountCredits)) {
    return jsonError("Invalid top-up amount", 400);
  }

  try {
    const updatedWristband = await prisma.$transaction(async (tx) => {
      const wristband = await tx.wristband.findFirst({
        where: {
          id: wristbandId,
          userId: session.userId
        }
      });

      if (!wristband) {
        return null;
      }

      const updated = await tx.wristband.update({
        where: {
          id: wristband.id
        },
        data: {
          balanceCredits: {
            increment: amountCredits
          }
        },
        select: {
          id: true,
          qrToken: true,
          status: true,
          balanceCredits: true
        }
      });

      await tx.transaction.create({
        data: {
          wristbandId: wristband.id,
          amountCredits,
          type: "TOPUP",
          description: `Top-up +${amountCredits} credits`
        }
      });

      return updated;
    });

    if (!updatedWristband) {
      return jsonError("Wristband not found", 404);
    }

    return NextResponse.json({
      success: true,
      wristband: updatedWristband
    });
  } catch {
    return jsonError("Top-up failed. Check database setup.", 500);
  }
}
