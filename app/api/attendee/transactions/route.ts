import { NextResponse } from "next/server";
import { requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  try {
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
