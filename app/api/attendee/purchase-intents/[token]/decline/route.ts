/**
 * POST /api/attendee/purchase-intents/[token]/decline
 *
 * Marks a pending purchase QR as declined. Declining never moves money; it
 * only stops the staff device from waiting on this checkout.
 */

import { NextResponse } from "next/server";
import { jsonError, requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  const { token } = await context.params;
  if (!token) {
    return jsonError("Purchase QR not found.", 404);
  }

  try {
    const purchaseIntent = await prisma.purchaseIntent.findUnique({
      where: {
        token
      },
      select: {
        id: true,
        status: true,
        expiresAt: true
      }
    });

    if (!purchaseIntent) {
      return jsonError("Purchase QR not found.", 404);
    }
    if (purchaseIntent.status !== "PENDING") {
      return jsonError("Purchase is no longer pending.", 400);
    }
    if (purchaseIntent.expiresAt <= new Date()) {
      await prisma.purchaseIntent.update({
        where: {
          id: purchaseIntent.id
        },
        data: {
          status: "EXPIRED"
        }
      });
      return jsonError("Purchase QR expired.", 400);
    }

    await prisma.purchaseIntent.update({
      where: {
        id: purchaseIntent.id
      },
      data: {
        status: "DECLINED",
        declinedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: "Purchase declined."
    });
  } catch {
    return jsonError("Could not decline purchase.", 500);
  }
}
