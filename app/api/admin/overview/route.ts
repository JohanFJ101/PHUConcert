import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  try {
    const [attendees, staffMembers, transactions] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          dob: true,
          gender: true,
          phone: true,
          role: true,
          createdAt: true,
          wristbands: {
            select: {
              id: true,
              qrToken: true,
              status: true,
              balanceCredits: true
            },
            orderBy: {
              createdAt: "asc"
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.staff.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          shop: {
            select: {
              id: true,
              name: true,
              category: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.transaction.findMany({
        include: {
          wristband: {
            select: {
              qrToken: true,
              user: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          },
          staff: {
            select: {
              username: true,
              role: true
            }
          },
          shop: {
            select: {
              name: true,
              category: true
            }
          },
          item: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 100
      })
    ]);

    const totalBalance = attendees.reduce(
      (sum, attendee) =>
        sum +
        attendee.wristbands.reduce(
          (attendeeSum, wristband) => attendeeSum + wristband.balanceCredits,
          0
        ),
      0
    );
    const totalSpend = transactions
      .filter((transaction) => transaction.amountCredits < 0)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amountCredits), 0);
    const totalTopups = transactions
      .filter((transaction) => transaction.amountCredits > 0)
      .reduce((sum, transaction) => sum + transaction.amountCredits, 0);

    return NextResponse.json({
      totals: {
        attendees: attendees.length,
        staff: staffMembers.filter((staff) => staff.role === "STAFF").length,
        admins: staffMembers.filter((staff) => staff.role === "ADMIN").length,
        transactions: transactions.length,
        totalBalance,
        totalSpend,
        totalTopups
      },
      attendees,
      staff: staffMembers,
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        amountCredits: transaction.amountCredits,
        type: transaction.type,
        description: transaction.description,
        createdAt: transaction.createdAt,
        wristbandToken: transaction.wristband.qrToken,
        attendeeName: transaction.wristband.user.name,
        attendeeEmail: transaction.wristband.user.email,
        staffUsername: transaction.staff?.username ?? null,
        staffRole: transaction.staff?.role ?? null,
        shopName: transaction.shop?.name ?? null,
        shopCategory: transaction.shop?.category ?? null,
        itemName: transaction.item?.name ?? null
      }))
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not load admin data"
      },
      { status: 500 }
    );
  }
}
