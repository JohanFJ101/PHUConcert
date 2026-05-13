/**
 * POST /api/staff/charge
 *
 * Core money-moving endpoint. A staff member charges a wristband for an
 * item from their own shop. The whole flow runs inside a single
 * `prisma.$transaction` at SERIALIZABLE isolation so two concurrent
 * charges on the same wristband cannot both succeed when only one has
 * sufficient balance.
 *
 * Checks performed inside the transaction (in order):
 *   1. The staff row exists, has role STAFF, and is bound to a shop.
 *   2. The item exists, is active, and belongs to that shop.
 *   3. The wristband exists and is ACTIVE.
 *   4. If the item is age-restricted, the attendee is 21+.
 *   5. The balance is sufficient.
 *
 * On success the wristband balance is decremented and a `PURCHASE`
 * transaction row is written; the new balance is returned.
 *
 * Request body: { qrToken: string; itemId: string }
 * Response on success: { success: true, message, newBalance }
 * Response on failure: `{ success: false, message }` with 400/401/403/500.
 *
 * Auth: STAFF session required.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { calculateAge } from "@/lib/age";
import { jsonError, readJsonObject, requireStaffSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Internal error type used to bubble a structured failure out of the
 * Prisma transaction callback. Throwing rolls back the transaction; the
 * outer try/catch then maps `status` onto the HTTP response code.
 */
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
        // ---- 1. Operator identity ---------------------------------------
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

        // ---- 2. Item belongs to this shop and is active -----------------
        const item = await tx.item.findUnique({
          where: {
            id: itemId
          }
        });

        if (!item || !item.active || item.shopId !== staff.shopId) {
          throw new ChargeFailure("Item does not belong to this shop", 400);
        }

        // ---- 3. Wristband lookup and status check -----------------------
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

        // ---- 4. Age gate for restricted items ---------------------------
        if (item.ageRestricted) {
          const attendeeAge = calculateAge(wristband.user.dob);
          // `null` age means we cannot prove the attendee is old enough,
          // so we treat it the same as underage.
          if (attendeeAge === null || attendeeAge < 21) {
            throw new ChargeFailure("Underage attendee", 400);
          }
        }

        // ---- 5. Balance check -------------------------------------------
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

        // Negative amount marks this as a debit in the ledger so the
        // attendee dashboard can render it with a minus sign.
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
        // Serializable isolation rejects any interleaving that could not
        // have happened sequentially. The cost is occasional retry on
        // conflict; the benefit is double-spend protection without manual
        // row locks.
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    return NextResponse.json({
      success: true,
      message: `Charged ${result.itemName}. New balance: ${result.newBalance} credits`,
      newBalance: result.newBalance
    });
  } catch (error) {
    // Surface structured failures with their carried status code; any
    // other thrown error becomes a generic 500 so internals do not leak.
    if (error instanceof ChargeFailure) {
      return jsonError(error.message, error.status);
    }

    return jsonError("Charge failed. Please try again.", 500);
  }
}
