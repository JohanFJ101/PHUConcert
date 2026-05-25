/**
 * GET /api/admin/staff
 * POST /api/admin/staff
 *
 * Admin-only staff management. Staff accounts are generated with a username
 * and short password, then attached to a shop whose menu can be edited from
 * the admin dashboard. Plaintext passwords are returned only on create/reset.
 */

import { NextResponse } from "next/server";
import {
  buildStaffUsernameBase,
  generateShortStaffPassword,
  generateUniqueStaffUsername,
  hashStaffPassword,
  parseMenuItemsFromJson
} from "@/lib/staff-management";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function selectAdminStaff() {
  return {
    id: true,
    username: true,
    role: true,
    active: true,
    createdAt: true,
    shop: {
      select: {
        id: true,
        name: true,
        category: true,
        items: {
          select: {
            id: true,
            name: true,
            priceCredits: true,
            category: true,
            ageRestricted: true,
            active: true
          },
          orderBy: {
            name: "asc" as const
          }
        }
      }
    }
  } as const;
}

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  try {
    const staff = await prisma.staff.findMany({
      where: {
        role: "STAFF",
        active: true
      },
      select: selectAdminStaff(),
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({
      success: true,
      staff
    });
  } catch {
    return jsonError("Could not load staff.", 500);
  }
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const shopName = typeof body?.shopName === "string" ? body.shopName.trim() : "";
  const shopCategory =
    typeof body?.shopCategory === "string" ? body.shopCategory.trim().toUpperCase() : "";
  const parsedItems = parseMenuItemsFromJson(body?.items, shopCategory);

  if (!shopName) {
    return jsonError("Shop name is required.", 400);
  }
  if (!shopCategory) {
    return jsonError("Shop category is required.", 400);
  }
  if (parsedItems.errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        message: "Menu validation failed.",
        errors: parsedItems.errors
      },
      { status: 400 }
    );
  }

  try {
    const username = await generateUniqueStaffUsername(
      buildStaffUsernameBase(shopName, shopCategory)
    );
    const password = generateShortStaffPassword();
    const passwordHash = await hashStaffPassword(password);

    const staff = await prisma.staff.create({
      data: {
        username,
        passwordHash,
        role: "STAFF",
        active: true,
        shop: {
          create: {
            name: shopName,
            category: shopCategory,
            items:
              parsedItems.items.length > 0
                ? {
                    create: parsedItems.items.map((item) => ({
                      name: item.name,
                      priceCredits: item.priceCredits,
                      category: item.category,
                      ageRestricted: item.ageRestricted,
                      active: item.active
                    }))
                  }
                : undefined
          }
        }
      },
      select: selectAdminStaff()
    });

    return NextResponse.json({
      success: true,
      staff,
      credentials: {
        username,
        password
      }
    });
  } catch {
    return jsonError("Could not create staff. Check database setup.", 500);
  }
}
