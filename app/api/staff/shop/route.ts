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
        shop: {
          select: {
            id: true,
            name: true,
            category: true,
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

    if (!staff) {
      return NextResponse.json(
        {
          success: false,
          message: "Staff account not found"
        },
        { status: 401 }
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
