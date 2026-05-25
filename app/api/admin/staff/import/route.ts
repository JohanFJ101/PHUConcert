/**
 * POST /api/admin/staff/import
 *
 * CSV import for staff/shop/menu rows. The whole file is validated before
 * writes. Existing STAFF rows are matched by username and merged; missing
 * menu items are left untouched.
 */

import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  generateShortStaffPassword,
  hashStaffPassword,
  parseStaffCsv,
  type StaffCsvItem
} from "@/lib/staff-management";
import { jsonError, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type PrismaTransaction = Prisma.TransactionClient;

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "function"
  );
}

async function upsertCsvItems(
  tx: PrismaTransaction,
  shopId: string,
  items: StaffCsvItem[]
) {
  let itemsCreated = 0;
  let itemsUpdated = 0;

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

  for (const item of items) {
    const existingId = existingByName.get(item.name.trim().toLowerCase());
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
      itemsUpdated += 1;
    } else {
      const created = await tx.item.create({
        data: {
          shopId,
          name: item.name,
          priceCredits: item.priceCredits,
          category: item.category,
          ageRestricted: item.ageRestricted,
          active: item.active
        },
        select: {
          id: true
        }
      });
      existingByName.set(item.name.trim().toLowerCase(), created.id);
      itemsCreated += 1;
    }
  }

  return {
    itemsCreated,
    itemsUpdated
  };
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Upload a CSV file using multipart/form-data.", 400);
  }

  const file = formData.get("file");
  if (!isUploadedFile(file)) {
    return jsonError("CSV file is required.", 400);
  }

  const parsed = parseStaffCsv(await file.text());
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        message: "CSV validation failed.",
        errors: parsed.errors
      },
      { status: 400 }
    );
  }

  if (parsed.staff.length === 0) {
    return jsonError("CSV has no staff rows.", 400);
  }

  const usernames = parsed.staff.map((staff) => staff.username);

  try {
    const existingOperators = await prisma.staff.findMany({
      where: {
        username: {
          in: usernames
        }
      },
      select: {
        username: true,
        role: true
      }
    });
    const conflicts = existingOperators
      .filter((operator) => operator.role !== "STAFF")
      .map((operator) => `${operator.username} is an admin username.`);

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "CSV conflicts with existing operators.",
          errors: conflicts
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let staffCreated = 0;
      let staffUpdated = 0;
      let itemsCreated = 0;
      let itemsUpdated = 0;
      const generatedCredentials: { username: string; password: string }[] = [];

      for (const csvStaff of parsed.staff) {
        const existingStaff = await tx.staff.findUnique({
          where: {
            username: csvStaff.username
          },
          select: {
            id: true,
            role: true,
            shopId: true
          }
        });

        let staffId = existingStaff?.id ?? "";
        let shopId = existingStaff?.shopId ?? "";

        if (existingStaff) {
          if (existingStaff.role !== "STAFF") {
            throw new Error("CSV username belongs to a non-staff operator.");
          }

          if (shopId) {
            await tx.shop.update({
              where: {
                id: shopId
              },
              data: {
                name: csvStaff.shopName,
                category: csvStaff.shopCategory
              }
            });
          } else {
            const shop = await tx.shop.create({
              data: {
                name: csvStaff.shopName,
                category: csvStaff.shopCategory
              },
              select: {
                id: true
              }
            });
            shopId = shop.id;
          }

          await tx.staff.update({
            where: {
              id: existingStaff.id
            },
            data: {
              active: true,
              shopId
            }
          });
          staffUpdated += 1;
        } else {
          const password = generateShortStaffPassword();
          const shop = await tx.shop.create({
            data: {
              name: csvStaff.shopName,
              category: csvStaff.shopCategory
            },
            select: {
              id: true
            }
          });

          const staff = await tx.staff.create({
            data: {
              username: csvStaff.username,
              passwordHash: await hashStaffPassword(password),
              role: "STAFF",
              active: true,
              shopId: shop.id
            },
            select: {
              id: true
            }
          });

          staffId = staff.id;
          shopId = shop.id;
          staffCreated += 1;
          generatedCredentials.push({
            username: csvStaff.username,
            password
          });
        }

        if (!staffId || !shopId) {
          throw new Error("Staff import did not create a usable shop assignment.");
        }

        const itemResult = await upsertCsvItems(tx, shopId, csvStaff.items);
        itemsCreated += itemResult.itemsCreated;
        itemsUpdated += itemResult.itemsUpdated;
      }

      return {
        staffCreated,
        staffUpdated,
        itemsCreated,
        itemsUpdated,
        generatedCredentials
      };
    });

    return NextResponse.json({
      success: true,
      imported: parsed.rowCount,
      staffImported: parsed.staff.length,
      ...result
    });
  } catch {
    return jsonError("Staff import failed. Check database setup.", 500);
  }
}
