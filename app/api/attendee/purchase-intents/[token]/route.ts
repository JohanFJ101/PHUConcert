/**
 * GET /api/attendee/purchase-intents/[token]
 *
 * Returns the basket encoded by a staff-generated QR code so the attendee
 * can review all line items and the balance impact before approving.
 */

import { NextResponse } from "next/server";
import { jsonError, requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

async function expireIfNeeded(intent: {
  id: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED";
  expiresAt: Date;
}) {
  if (intent.status !== "PENDING" || intent.expiresAt > new Date()) {
    return intent.status;
  }

  await prisma.purchaseIntent.update({
    where: {
      id: intent.id
    },
    data: {
      status: "EXPIRED"
    }
  });
  return "EXPIRED" as const;
}

export async function GET(_request: Request, context: RouteContext) {
  const { session, error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  const { token } = await context.params;
  if (!token) {
    return jsonError("Purchase QR not found.", 404);
  }

  try {
    const [purchaseIntent, wristband] = await Promise.all([
      prisma.purchaseIntent.findUnique({
        where: {
          token
        },
        include: {
          shop: {
            select: {
              name: true,
              category: true
            }
          },
          lines: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      }),
      prisma.wristband.findFirst({
        where: {
          userId: session.userId,
          status: "ACTIVE"
        },
        select: {
          id: true,
          qrToken: true,
          status: true,
          balanceCredits: true
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    ]);

    if (!purchaseIntent) {
      return jsonError("Purchase QR not found.", 404);
    }

    const status = await expireIfNeeded(purchaseIntent);

    return NextResponse.json({
      purchaseIntent: {
        token: purchaseIntent.token,
        status,
        shopName: purchaseIntent.shop?.name ?? "Shop",
        shopCategory: purchaseIntent.shop?.category ?? null,
        totalCredits: purchaseIntent.totalCredits,
        expiresAt: purchaseIntent.expiresAt,
        approvedAt: purchaseIntent.approvedAt,
        declinedAt: purchaseIntent.declinedAt,
        lines: purchaseIntent.lines.map((line) => ({
          id: line.id,
          itemName: line.itemName,
          unitPriceCredits: line.unitPriceCredits,
          quantity: line.quantity,
          lineTotalCredits: line.lineTotalCredits,
          ageRestricted: line.ageRestricted
        }))
      },
      wristband,
      balanceAfterCredits: wristband
        ? wristband.balanceCredits - purchaseIntent.totalCredits
        : null
    });
  } catch {
    return jsonError("Could not load purchase.", 500);
  }
}
