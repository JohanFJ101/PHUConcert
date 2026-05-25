/**
 * GET /api/staff/shop
 *
 * Returns the shop assigned to the currently-logged-in staff member,
 * together with the active menu (inactive items are filtered out). The
 * staff shop page hydrates from this endpoint on mount so the operator
 * sees only the items they are authorised to sell.
 *
 * Response: { staff: { id, username },
 *             shop: { id, name, category, items: [...] } }
 *           Returns 403 if the staff row has no shop (e.g. an admin
 *           reaching this endpoint by mistake).
 *
 * Auth: STAFF session required.
 */

import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, error } = await requireStaffSession();
  if (error) {
    return error;
  }

  try {
    const staff = await prisma.staff.findUnique({
      where: {
        id: session.staffId
      },
      select: {
        id: true,
        username: true,
        role: true,
        active: true,
        shop: {
          select: {
            id: true,
            name: true,
            category: true,
            // Only return active items: a soft-disabled item should
            // disappear from the operator's menu without being deleted.
            items: {
              where: {
                active: true
              },
              select: {
                id: true,
                name: true,
                priceCredits: true,
                category: true,
                ageRestricted: true
              },
              orderBy: {
                name: "asc"
              }
            }
          }
        }
      }
    });

    // Defensive check: the session guard already confirmed the role, but
    // a STAFF row without a shop should not be usable on this page.
    if (!staff || staff.role !== "STAFF" || !staff.active || !staff.shop) {
      return NextResponse.json(
        {
          success: false,
          message: "Staff shop not found"
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      staff: {
        id: staff.id,
        username: staff.username
      },
      shop: staff.shop
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not load shop"
      },
      { status: 500 }
    );
  }
}
