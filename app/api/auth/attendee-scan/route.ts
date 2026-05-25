/**
 * POST /api/auth/attendee-scan
 *
 * First step of the wristband-scan login flow.
 *
 * Body: `{ token: string }` - the value read from the QR code (or typed
 * into the manual entry fallback).
 *
 * Responses:
 *   - 200 `{ status: "REGISTERED" }`              -> session cookie set,
 *     client redirects to the attendee dashboard.
 *   - 200 `{ status: "NEEDS_REGISTRATION", token }`-> wristband exists but
 *     has no user attached. Client renders the registration form, then
 *     POSTs to /api/auth/attendee-register with that same token.
 *   - 404 `{ message }`                            -> token does not match
 *     any wristband.
 *   - 410 `{ message }`                            -> wristband is INACTIVE.
 */

import { NextResponse } from "next/server";
import { jsonError, readJsonObject } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { extractTokenFromScan } from "@/lib/wristband-tokens";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const rawToken = typeof body?.token === "string" ? body.token : "";
  const token = extractTokenFromScan(rawToken);

  if (!token) {
    return jsonError("Wristband code is required.", 400);
  }

  try {
    const wristband = await prisma.wristband.findUnique({
      where: {
        qrToken: token
      },
      select: {
        id: true,
        status: true,
        userId: true
      }
    });

    if (!wristband) {
      return jsonError("This wristband isn't recognised.", 404);
    }

    if (wristband.status !== "ACTIVE") {
      return jsonError("This wristband has been deactivated by staff.", 410);
    }

    if (!wristband.userId) {
      return NextResponse.json({
        success: true,
        status: "NEEDS_REGISTRATION" as const,
        token
      });
    }

    const response = NextResponse.json({
      success: true,
      status: "REGISTERED" as const
    });
    setSessionCookie(response, {
      role: "ATTENDEE",
      userId: wristband.userId
    });
    return response;
  } catch {
    return jsonError("Could not look up wristband. Check database setup.", 500);
  }
}
