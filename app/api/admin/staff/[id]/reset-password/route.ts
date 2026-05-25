/**
 * POST /api/admin/staff/[id]/reset-password
 *
 * Generates a new short password for an active STAFF account. The plaintext
 * password is returned once so the admin can give it to the operator.
 */

import { NextResponse } from "next/server";
import { generateShortStaffPassword, hashStaffPassword } from "@/lib/staff-management";
import { jsonError, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
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
        id: true,
        username: true
      }
    });

    if (!staff) {
      return jsonError("Staff not found.", 404);
    }

    const password = generateShortStaffPassword();
    await prisma.staff.update({
      where: {
        id: staff.id
      },
      data: {
        passwordHash: await hashStaffPassword(password)
      }
    });

    return NextResponse.json({
      success: true,
      credentials: {
        username: staff.username,
        password
      }
    });
  } catch {
    return jsonError("Could not reset staff password.", 500);
  }
}
