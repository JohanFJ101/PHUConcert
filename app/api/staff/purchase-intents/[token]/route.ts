/**
 * GET /api/staff/purchase-intents/[token]
 *
 * Lets the staff device poll the checkout it generated. Only the staff
 * account that created the intent can read this status.
 */

import { NextResponse } from "next/server";
import { jsonError, requireStaffSession } from "@/lib/http";
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
  const { session, error } = await requireStaffSession();
  if (error) {
    return error;
  }

  const { token } = await context.params;
  if (!token) {
    return jsonError("Purchase QR not found.", 404);
  }

  try {
    const purchaseIntent = await prisma.purchaseIntent.findFirst({
      where: {
        token,
        staffId: session.staffId
      },
      include: {
        approvedByUser: {
          select: {
            name: true,
            email: true
          }
        },
        wristband: {
          select: {
            qrToken: true
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
      return jsonError("Purchase QR not found.", 404);
    }

    const status = await expireIfNeeded(purchaseIntent);

    return NextResponse.json({
      purchaseIntent: {
        token: purchaseIntent.token,
        status,
        totalCredits: purchaseIntent.totalCredits,
        expiresAt: purchaseIntent.expiresAt,
        approvedAt: purchaseIntent.approvedAt,
        declinedAt: purchaseIntent.declinedAt,
        approvedByName: purchaseIntent.approvedByUser?.name ?? null,
        approvedByEmail: purchaseIntent.approvedByUser?.email ?? null,
        wristbandToken: purchaseIntent.wristband?.qrToken ?? null,
        lines: purchaseIntent.lines.map((line) => ({
          id: line.id,
          itemName: line.itemName,
          unitPriceCredits: line.unitPriceCredits,
          quantity: line.quantity,
          lineTotalCredits: line.lineTotalCredits,
          ageRestricted: line.ageRestricted
        }))
      }
    });
  } catch {
    return jsonError("Could not load purchase QR status.", 500);
  }
}
