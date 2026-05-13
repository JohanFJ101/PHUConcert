/**
 * GET /api/admin/overview
 *
 * One-stop endpoint for the admin dashboard. Runs three reads in parallel
 * (attendees + their wristbands, staff + their shops, last 100
 * transactions with relations) and computes header totals on top.
 *
 * Response: { totals, attendees, staff, transactions } where:
 *   - totals: aggregate counts and credit sums for the header tiles.
 *   - attendees: user rows with their wristbands.
 *   - staff: staff rows with their shop relation.
 *   - transactions: flattened ledger rows (latest 100).
 *
 * Auth: ADMIN session required.
 */

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  try {
    // Three independent reads, kicked off together so the dashboard is
    // bounded by the slowest query rather than the sum of all three.
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
        // `passwordHash` is intentionally excluded so it can never leak
        // to the admin UI.
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
        // Cap to the latest 100 so the dashboard stays responsive even
        // after thousands of charges; pagination can be added later.
        take: 100
      })
    ]);

    // Header tile metrics. All three are derived locally rather than via
    // separate SQL aggregates: with the data already fetched above this
    // is cheap and avoids extra round-trips.
    const totalBalance = attendees.reduce(
      (sum, attendee) =>
        sum +
        attendee.wristbands.reduce(
          (attendeeSum, wristband) => attendeeSum + wristband.balanceCredits,
          0
        ),
      0
    );
    // Spend totals only look at the most recent 100 transactions. That is
    // a known caveat of the MVP; the admin UI labels these as "Recent
    // Transactions" to make the bound explicit.
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
      // Flatten the nested Prisma shape into the form the UI consumes,
      // so the frontend doesn't have to walk multiple levels of nullable
      // relations.
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
