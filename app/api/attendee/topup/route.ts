/**
 * POST /api/attendee/topup
 *
 * Mock top-up: increases the attendee's wristband balance by an arbitrary
 * positive integer of credits and writes a `TOPUP` transaction. A real
 * payment gateway would sit in front of this endpoint to actually charge
 * the user; until then the credits are free.
 *
 * Request body: { wristbandId: string; amountCredits: number }
 * Response on success: { success: true, wristband: { id, qrToken, status,
 *                        balanceCredits } }
 * Response on failure: `{ success: false, message }` with 400/401/404/500.
 *
 * Auth: ATTENDEE session required.
 *
 * The update + insert are wrapped in a single Prisma transaction so a
 * crash mid-flight cannot leave the balance updated without a matching
 * ledger row (or vice versa).
 */

import { NextResponse } from "next/server";
import { jsonError, readJsonObject, requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

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

  // Whole positive integers only. The UI also enforces this, but server
  // validation is the source of truth.
  if (!Number.isInteger(amountCredits) || amountCredits <= 0) {
    return jsonError("Invalid top-up amount", 400);
  }

  try {
    const updatedWristband = await prisma.$transaction(async (tx) => {
      // The `userId` filter is the ownership check: an attendee cannot
      // top up someone else's wristband even if they know its id.
      const wristband = await tx.wristband.findFirst({
        where: {
          id: wristbandId,
          userId: session.userId
        }
      });

      if (!wristband) {
        return null;
      }

      // Using `increment` lets Postgres compute the new balance, which is
      // safer than read-modify-write at higher isolation levels.
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
