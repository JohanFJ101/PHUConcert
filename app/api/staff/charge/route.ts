/**
 * POST /api/staff/charge
 *
 * Direct wristband debit after a staff member scans an attendee's
 * wristband. All checks and the balance decrement happen inside a single
 * Prisma `$transaction` at `Serializable` isolation so two staff devices
 * cannot race the same wristband into a negative balance.
 *
 * Body: `{ token: string, lines: [{ itemId: string, quantity: number }] }`.
 *
 * Checks performed before writing:
 *   - Staff session is active and has a shop.
 *   - Wristband exists, is ACTIVE, and is registered to a user.
 *   - Every requested item belongs to the staff's shop and is active.
 *   - For any age-restricted item, the attendee is 21+ (based on DOB).
 *   - The wristband balance covers the basket total.
 *
 * Writes on success:
 *   - Decrements `Wristband.balanceCredits` by the basket total.
 *   - Inserts one `Transaction` row per basket line with type "PURCHASE".
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { calculateAge } from "@/lib/age";
import { jsonError, readJsonObject, requireStaffSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { extractTokenFromScan } from "@/lib/wristband-tokens";

class ChargeFailure extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type RequestedLine = { itemId: string; quantity: number };

function parseRequestedLines(body: Record<string, unknown> | null): RequestedLine[] {
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const merged = new Map<string, number>();

  for (const rawLine of rawLines) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      continue;
    }
    const line = rawLine as Record<string, unknown>;
    const itemId = typeof line.itemId === "string" ? line.itemId : "";
    const quantity = typeof line.quantity === "number" ? line.quantity : 0;
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }
    merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
  }

  return Array.from(merged, ([itemId, quantity]) => ({ itemId, quantity }));
}

export async function POST(request: Request) {
  const { session, error } = await requireStaffSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const token = extractTokenFromScan(
    typeof body?.token === "string" ? body.token : ""
  );
  if (!token) {
    return jsonError("Wristband code is required.", 400);
  }

  const lines = parseRequestedLines(body);
  if (lines.length === 0) {
    return jsonError("Add at least one item to the basket.", 400);
  }

  try {
    const staff = await prisma.staff.findUnique({
      where: {
        id: session.staffId
      },
      select: {
        id: true,
        role: true,
        active: true,
        shopId: true
      }
    });

    if (!staff || staff.role !== "STAFF" || !staff.active || !staff.shopId) {
      return jsonError("Staff account is not active for this shop.", 403);
    }

    // Narrow `shopId` for use inside the transaction closure (TS does
    // not propagate the truthy guard through the inner async scope).
    const shopId = staff.shopId;

    const result = await prisma.$transaction(
      async (tx) => {
        const wristband = await tx.wristband.findUnique({
          where: {
            qrToken: token
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                dob: true
              }
            }
          }
        });

        if (!wristband) {
          throw new ChargeFailure("Wristband not recognised.", 404);
        }
        if (wristband.status !== "ACTIVE") {
          throw new ChargeFailure("Wristband is inactive.", 410);
        }
        if (!wristband.userId || !wristband.user) {
          throw new ChargeFailure(
            "Wristband isn't registered. Ask the attendee to scan and register on their phone first.",
            409
          );
        }

        const items = await tx.item.findMany({
          where: {
            id: {
              in: lines.map((line) => line.itemId)
            },
            shopId,
            active: true
          },
          select: {
            id: true,
            name: true,
            priceCredits: true,
            ageRestricted: true
          }
        });

        if (items.length !== lines.length) {
          throw new ChargeFailure("One or more items are unavailable for this shop.", 400);
        }

        const itemsById = new Map(items.map((item) => [item.id, item]));
        const expanded = lines.map((line) => {
          const item = itemsById.get(line.itemId);
          if (!item) {
            throw new ChargeFailure("Item lookup failed.", 500);
          }
          return {
            item,
            quantity: line.quantity,
            lineTotal: item.priceCredits * line.quantity
          };
        });

        const total = expanded.reduce((sum, line) => sum + line.lineTotal, 0);
        if (total <= 0) {
          throw new ChargeFailure("Basket total must be greater than 0.", 400);
        }

        if (expanded.some((line) => line.item.ageRestricted)) {
          const age = calculateAge(wristband.user.dob);
          if (age === null || age < 21) {
            throw new ChargeFailure(
              "Attendee is under 21 - age-restricted items cannot be sold.",
              403
            );
          }
        }

        if (wristband.balanceCredits < total) {
          throw new ChargeFailure(
            `Insufficient balance (${wristband.balanceCredits} credits, need ${total}).`,
            402
          );
        }

        const updatedWristband = await tx.wristband.update({
          where: {
            id: wristband.id
          },
          data: {
            balanceCredits: {
              decrement: total
            }
          },
          select: {
            balanceCredits: true,
            qrToken: true
          }
        });

        await tx.transaction.createMany({
          data: expanded.map((line) => ({
            wristbandId: wristband.id,
            staffId: staff.id,
            shopId,
            itemId: line.item.id,
            amountCredits: -line.lineTotal,
            type: "PURCHASE",
            description: `${line.quantity} x ${line.item.name}`
          }))
        });

        return {
          attendeeName: wristband.user.name,
          wristbandToken: updatedWristband.qrToken,
          newBalance: updatedWristband.balanceCredits,
          totalCredits: total,
          lines: expanded.map((line) => ({
            itemId: line.item.id,
            itemName: line.item.name,
            quantity: line.quantity,
            lineTotalCredits: line.lineTotal
          }))
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    return NextResponse.json({
      success: true,
      message: `Charged ${result.totalCredits} credits.`,
      charge: result
    });
  } catch (error) {
    if (error instanceof ChargeFailure) {
      return jsonError(error.message, error.status);
    }

    return jsonError("Charge failed. Please try again.", 500);
  }
}
