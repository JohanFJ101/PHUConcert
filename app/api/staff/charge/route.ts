import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { calculateAge } from "@/lib/age";
import { jsonError, readJsonObject, requireStaffSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

class ChargeFailure extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireStaffSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const qrToken = typeof body?.qrToken === "string" ? body.qrToken.trim() : "";
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";

  if (!qrToken) {
    return jsonError("Invalid wristband", 400);
  }

  if (!itemId) {
    return jsonError("Select an item", 400);
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const staff = await tx.staff.findUnique({
          where: {
            id: session.staffId
          },
          include: {
            shop: true
          }
        });

        if (!staff) {
          throw new ChargeFailure("Staff account not found", 401);
        }

        if (staff.role !== "STAFF" || !staff.shopId || !staff.shop) {
          throw new ChargeFailure("Staff shop not found", 403);
        }

        const item = await tx.item.findUnique({
          where: {
            id: itemId
          }
        });

        if (!item || !item.active || item.shopId !== staff.shopId) {
          throw new ChargeFailure("Item does not belong to this shop", 400);
        }

        const wristband = await tx.wristband.findUnique({
          where: {
            qrToken
          },
          include: {
            user: true
          }
        });

        if (!wristband) {
          throw new ChargeFailure("Invalid wristband", 400);
        }

        if (wristband.status !== "ACTIVE") {
          throw new ChargeFailure("Inactive wristband", 400);
        }

        if (item.ageRestricted) {
          const attendeeAge = calculateAge(wristband.user.dob);
          if (attendeeAge === null || attendeeAge < 21) {
            throw new ChargeFailure("Underage attendee", 400);
          }
        }

        if (wristband.balanceCredits < item.priceCredits) {
          throw new ChargeFailure("Insufficient balance", 400);
        }

        // TODO: For production-scale charging, add explicit row locks or retry logic around serializable conflicts.
        const updatedWristband = await tx.wristband.update({
          where: {
            id: wristband.id
          },
          data: {
            balanceCredits: {
              decrement: item.priceCredits
            }
          },
          select: {
            balanceCredits: true
          }
        });

        await tx.transaction.create({
          data: {
            wristbandId: wristband.id,
            staffId: staff.id,
            shopId: staff.shopId,
            itemId: item.id,
            amountCredits: -item.priceCredits,
            type: "PURCHASE",
            description: `${item.name} at ${staff.shop.name}`
          }
        });

        return {
          itemName: item.name,
          newBalance: updatedWristband.balanceCredits
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    return NextResponse.json({
      success: true,
      message: `Charged ${result.itemName}. New balance: ${result.newBalance} credits`,
      newBalance: result.newBalance
    });
  } catch (error) {
    if (error instanceof ChargeFailure) {
      return jsonError(error.message, error.status);
    }

    return jsonError("Charge failed. Please try again.", 500);
  }
}
