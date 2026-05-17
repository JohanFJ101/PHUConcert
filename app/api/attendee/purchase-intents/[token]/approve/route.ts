/**
 * POST /api/attendee/purchase-intents/[token]/approve
 *
 * The only endpoint that can turn a staff-created basket into a purchase.
 * It re-checks status, expiry, attendee wristband, age restrictions, and
 * balance inside one serializable transaction before writing ledger rows.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { calculateAge } from "@/lib/age";
import { jsonError, requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

class ApprovalFailure extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function statusMessage(status: string) {
  if (status === "APPROVED") {
    return "Purchase already approved.";
  }
  if (status === "DECLINED") {
    return "Purchase was declined.";
  }
  if (status === "EXPIRED") {
    return "Purchase QR expired.";
  }
  return "Purchase is no longer pending.";
}

export async function POST(_request: Request, context: RouteContext) {
  const { session, error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  const { token } = await context.params;
  if (!token) {
    return jsonError("Purchase QR not found.", 404);
  }

  try {
    const precheck = await prisma.purchaseIntent.findUnique({
      where: {
        token
      },
      select: {
        id: true,
        status: true,
        expiresAt: true
      }
    });

    if (!precheck) {
      return jsonError("Purchase QR not found.", 404);
    }
    if (precheck.status !== "PENDING") {
      return jsonError(statusMessage(precheck.status), 400);
    }
    if (precheck.expiresAt <= new Date()) {
      await prisma.purchaseIntent.update({
        where: {
          id: precheck.id
        },
        data: {
          status: "EXPIRED"
        }
      });
      return jsonError("Purchase QR expired.", 400);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const purchaseIntent = await tx.purchaseIntent.findUnique({
          where: {
            token
          },
          include: {
            shop: {
              select: {
                name: true
              }
            },
            lines: {
              orderBy: {
                createdAt: "asc"
              }
            }
          }
        });

        if (!purchaseIntent) {
          throw new ApprovalFailure("Purchase QR not found.", 404);
        }
        if (purchaseIntent.status !== "PENDING") {
          throw new ApprovalFailure(statusMessage(purchaseIntent.status), 400);
        }
        if (purchaseIntent.expiresAt <= new Date()) {
          throw new ApprovalFailure("Purchase QR expired.", 400);
        }
        if (purchaseIntent.lines.length === 0 || purchaseIntent.totalCredits <= 0) {
          throw new ApprovalFailure("Purchase basket is empty.", 400);
        }

        const wristband = await tx.wristband.findFirst({
          where: {
            userId: session.userId,
            status: "ACTIVE"
          },
          include: {
            user: true
          },
          orderBy: {
            createdAt: "asc"
          }
        });

        if (!wristband) {
          throw new ApprovalFailure("No active wristband found.", 400);
        }

        if (purchaseIntent.lines.some((line) => line.ageRestricted)) {
          const attendeeAge = calculateAge(wristband.user.dob);
          if (attendeeAge === null || attendeeAge < 21) {
            throw new ApprovalFailure("Underage attendee.", 400);
          }
        }

        if (wristband.balanceCredits < purchaseIntent.totalCredits) {
          throw new ApprovalFailure("Insufficient balance.", 400);
        }

        const processedIntent = await tx.purchaseIntent.updateMany({
          where: {
            id: purchaseIntent.id,
            status: "PENDING"
          },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            approvedByUserId: session.userId,
            wristbandId: wristband.id
          }
        });

        if (processedIntent.count !== 1) {
          throw new ApprovalFailure("Purchase is no longer pending.", 409);
        }

        const updatedWristband = await tx.wristband.update({
          where: {
            id: wristband.id
          },
          data: {
            balanceCredits: {
              decrement: purchaseIntent.totalCredits
            }
          },
          select: {
            balanceCredits: true,
            qrToken: true
          }
        });

        await tx.transaction.createMany({
          data: purchaseIntent.lines.map((line) => ({
            wristbandId: wristband.id,
            staffId: purchaseIntent.staffId,
            shopId: purchaseIntent.shopId,
            itemId: line.itemId,
            amountCredits: -line.lineTotalCredits,
            type: "PURCHASE",
            description: `${line.quantity} x ${line.itemName} at ${
              purchaseIntent.shop?.name ?? "Shop"
            }`
          }))
        });

        return {
          newBalance: updatedWristband.balanceCredits,
          wristbandToken: updatedWristband.qrToken,
          totalCredits: purchaseIntent.totalCredits
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    return NextResponse.json({
      success: true,
      message: `Approved purchase for ${result.totalCredits} credits.`,
      newBalance: result.newBalance,
      wristbandToken: result.wristbandToken
    });
  } catch (error) {
    if (error instanceof ApprovalFailure) {
      return jsonError(error.message, error.status);
    }

    return jsonError("Purchase approval failed. Please try again.", 500);
  }
}
