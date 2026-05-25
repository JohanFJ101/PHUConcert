/**
 * PATCH /api/admin/staff/[id]
 * DELETE /api/admin/staff/[id]
 *
 * Edits active STAFF accounts and their assigned shop/menu, or soft-disables
 * a staff account without deleting historical transaction relations.
 */

import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  isValidStaffUsername,
  parseMenuItemsFromJson,
  type StaffMenuItemInput
} from "@/lib/staff-management";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PrismaTransaction = Prisma.TransactionClient;

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

async function upsertMenuItems(
  tx: PrismaTransaction,
  shopId: string,
  items: StaffMenuItemInput[]
) {
  const existingItems = await tx.item.findMany({
    where: {
      shopId
    },
    select: {
      id: true,
      name: true
    }
  });
  const existingByName = new Map(
    existingItems.map((item) => [item.name.trim().toLowerCase(), item.id])
  );
  const existingIds = new Set(existingItems.map((item) => item.id));

  for (const item of items) {
    if (item.id && !existingIds.has(item.id)) {
      throw new Error("Menu item does not belong to this staff shop.");
    }

    const existingId = item.id ?? existingByName.get(item.name.trim().toLowerCase());
    if (existingId) {
      await tx.item.update({
        where: {
          id: existingId
        },
        data: {
          name: item.name,
          priceCredits: item.priceCredits,
          category: item.category,
          ageRestricted: item.ageRestricted,
          active: item.active
        }
      });
    } else {
      await tx.item.create({
        data: {
          shopId,
          name: item.name,
          priceCredits: item.priceCredits,
          category: item.category,
          ageRestricted: item.ageRestricted,
          active: item.active
        }
      });
    }
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const { id } = await context.params;
  const body = await readJsonObject(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const shopName = typeof body?.shopName === "string" ? body.shopName.trim() : "";
  const shopCategory =
    typeof body?.shopCategory === "string" ? body.shopCategory.trim().toUpperCase() : "";
  const parsedItems = parseMenuItemsFromJson(body?.items, shopCategory);

  if (!username || !isValidStaffUsername(username)) {
    return jsonError(
      "Username must be 3-40 letters, numbers, underscores, dashes, or periods.",
      400
    );
  }
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
    const staff = await prisma.staff.findFirst({
      where: {
        id,
        role: "STAFF",
        active: true
      },
      select: {
        id: true,
        shopId: true
      }
    });

    if (!staff) {
      return jsonError("Staff not found.", 404);
    }

    const usernameOwner = await prisma.staff.findUnique({
      where: {
        username
      },
      select: {
        id: true
      }
    });

    if (usernameOwner && usernameOwner.id !== staff.id) {
      return jsonError("Username already belongs to another operator.", 409);
    }

    const updatedStaff = await prisma.$transaction(async (tx) => {
      let shopId = staff.shopId;

      if (shopId) {
        await tx.shop.update({
          where: {
            id: shopId
          },
          data: {
            name: shopName,
            category: shopCategory
          }
        });
      } else {
        const shop = await tx.shop.create({
          data: {
            name: shopName,
            category: shopCategory
          },
          select: {
            id: true
          }
        });
        shopId = shop.id;
      }

      await tx.staff.update({
        where: {
          id: staff.id
        },
        data: {
          username,
          shopId
        }
      });

      await upsertMenuItems(tx, shopId, parsedItems.items);

      return tx.staff.findUniqueOrThrow({
        where: {
          id: staff.id
        },
        select: selectAdminStaff()
      });
    });

    return NextResponse.json({
      success: true,
      staff: updatedStaff
    });
  } catch {
    return jsonError("Could not update staff. Check the menu item details.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const { id } = await context.params;

  try {
    const staff = await prisma.staff.findFirst({
      where: {
        id,
        role: "STAFF",
        active: true
      },
      select: {
        id: true
      }
    });

    if (!staff) {
      return jsonError("Staff not found.", 404);
    }

    await prisma.staff.update({
      where: {
        id: staff.id
      },
      data: {
        active: false
      }
    });

    return NextResponse.json({
      success: true
    });
  } catch {
    return jsonError("Could not deactivate staff.", 500);
  }
}
