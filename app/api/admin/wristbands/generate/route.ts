/**
 * POST /api/admin/wristbands/generate
 *
 * Pre-generates a batch of "blank" wristbands (rows with `userId = null`).
 * The admin UI renders each returned token as a QR code so they can be
 * printed/exported, then physically attached to wristbands and handed
 * out at the gate. The first attendee to scan one fills in the
 * registration form which links a new User to that wristband.
 *
 * Body: `{ count: number }` - 1 to 200 inclusive.
 *
 * Response: `{ success: true, wristbands: [{ id, qrToken, ... }] }`.
 */

import { NextResponse } from "next/server";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { generateUniqueWristbandTokens } from "@/lib/wristband-tokens";

const MAX_BATCH = 200;

export async function POST(request: Request) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const count = typeof body?.count === "number" ? body.count : NaN;

  if (!Number.isInteger(count) || count <= 0) {
    return jsonError("Count must be a positive integer.", 400);
  }
  if (count > MAX_BATCH) {
    return jsonError(`Generate at most ${MAX_BATCH} wristbands at a time.`, 400);
  }

  try {
    const tokens = await generateUniqueWristbandTokens(count);

    await prisma.wristband.createMany({
      data: tokens.map((token) => ({
        qrToken: token,
        balanceCredits: 0,
        status: "ACTIVE"
      }))
    });

    const wristbands = await prisma.wristband.findMany({
      where: {
        qrToken: {
          in: tokens
        }
      },
      select: {
        id: true,
        qrToken: true,
        status: true,
        balanceCredits: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return NextResponse.json({
      success: true,
      wristbands
    });
  } catch {
    return jsonError("Could not generate wristbands. Check database setup.", 500);
  }
}
