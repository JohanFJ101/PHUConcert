/**
 * PATCH /api/admin/wristbands/[id]
 *
 * Soft-toggles a wristband between ACTIVE and INACTIVE status. Inactive
 * wristbands cannot be scanned by attendees and cannot be charged by
 * staff, but their transaction history remains intact.
 *
 * Body: `{ status: "ACTIVE" | "INACTIVE" }`.
 */

import { NextResponse } from "next/server";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const { id } = await context.params;
  if (!id) {
    return jsonError("Wristband id is required.", 400);
  }

  const body = await readJsonObject(request);
  const status = typeof body?.status === "string" ? body.status.toUpperCase() : "";

  if (status !== "ACTIVE" && status !== "INACTIVE") {
    return jsonError("Status must be ACTIVE or INACTIVE.", 400);
  }

  try {
    const existing = await prisma.wristband.findUnique({
      where: {
        id
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return jsonError("Wristband not found.", 404);
    }

    const updated = await prisma.wristband.update({
      where: {
        id
      },
      data: {
        status
      },
      select: {
        id: true,
        qrToken: true,
        status: true,
        balanceCredits: true
      }
    });

    return NextResponse.json({
      success: true,
      wristband: updated
    });
  } catch {
    return jsonError("Could not update wristband.", 500);
  }
}
