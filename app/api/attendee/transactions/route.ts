/**
 * GET /api/attendee/transactions
 *
 * Returns the logged-in attendee's full transaction history in reverse
 * chronological order. Includes item and shop names so the UI does not
 * need a second round-trip to resolve foreign keys.
 *
 * Response: { transactions: [{ id, wristbandToken, amountCredits, type,
 *             description, itemName, shopName, createdAt }] }
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
    // Filter through `wristband.userId` so attendees can only see their
    // own transactions even if they somehow learned another user's
    // wristband id.
    const transactions = await prisma.transaction.findMany({
      where: {
        wristband: {
          userId: session.userId
        }
      },
      include: {
        item: {
          select: {
            name: true
          }
        },
        shop: {
          select: {
            name: true
          }
        },
        wristband: {
          select: {
            qrToken: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({
      // Flatten the nested Prisma result into a UI-friendly shape so the
      // frontend does not have to dig through `transaction.wristband.qrToken`.
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        wristbandToken: transaction.wristband.qrToken,
        amountCredits: transaction.amountCredits,
        type: transaction.type,
        description: transaction.description,
        itemName: transaction.item?.name ?? null,
        shopName: transaction.shop?.name ?? null,
        createdAt: transaction.createdAt
      }))
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not load transactions"
      },
      { status: 500 }
    );
  }
}
