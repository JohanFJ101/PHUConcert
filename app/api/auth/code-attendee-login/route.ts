/**
 * POST /api/auth/code-attendee-login
 *
 * Basic attendee fallback login using the imported Unique id number. The
 * admin CSV/manual add flow stores that value on `User.ticketId` and also
 * creates a wristband with the same `qrToken`, so either field can resolve
 * the attendee.
 */

import { NextResponse } from "next/server";
import { jsonError, readJsonObject } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!code) {
    return jsonError("Code is required.", 400);
  }

  try {
    const attendee = await prisma.user.findFirst({
      where: {
        OR: [
          {
            ticketId: {
              equals: code,
              mode: "insensitive"
            }
          },
          {
            wristbands: {
              some: {
                qrToken: {
                  equals: code,
                  mode: "insensitive"
                },
                status: "ACTIVE"
              }
            }
          }
        ]
      },
      select: {
        id: true
      }
    });

    if (!attendee) {
      return jsonError("No attendee found for that code.", 401);
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, {
      role: "ATTENDEE",
      userId: attendee.id
    });
    return response;
  } catch {
    return jsonError("Code login failed. Check database setup.", 500);
  }
}
