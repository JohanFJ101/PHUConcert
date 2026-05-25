/**
 * POST /api/auth/attendee-register
 *
 * Second step of the wristband-scan login flow. Called only when the
 * preceding scan returned status "NEEDS_REGISTRATION".
 *
 * Body: `{ token, fullName, dob, email, phone }` - all required and
 * validated strictly. Email must not already belong to another attendee.
 *
 * Side effects on success:
 *   - Creates a `User` row.
 *   - Links the existing wristband (matched by `token`) to the new user.
 *   - Issues an ATTENDEE session cookie.
 *
 * The whole thing runs inside a Prisma transaction so that a wristband
 * can never end up half-registered if either write fails.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { jsonError, readJsonObject } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import {
  validateDob,
  validateEmail,
  validateFullName,
  validatePhone
} from "@/lib/validation";
import { extractTokenFromScan } from "@/lib/wristband-tokens";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const rawToken = typeof body?.token === "string" ? body.token : "";
  const token = extractTokenFromScan(rawToken);

  const nameInput = typeof body?.fullName === "string" ? body.fullName : "";
  const dobInput = typeof body?.dob === "string" ? body.dob : "";
  const emailInput = typeof body?.email === "string" ? body.email : "";
  const phoneInput = typeof body?.phone === "string" ? body.phone : "";

  if (!token) {
    return jsonError("Wristband code is required.", 400);
  }

  const nameCheck = validateFullName(nameInput);
  if (!nameCheck.ok) {
    return jsonError(nameCheck.message, 400);
  }

  const dobCheck = validateDob(dobInput);
  if (!dobCheck.ok) {
    return jsonError(dobCheck.message, 400);
  }

  const emailCheck = validateEmail(emailInput);
  if (!emailCheck.ok) {
    return jsonError(emailCheck.message, 400);
  }

  const phoneCheck = validatePhone(phoneInput);
  if (!phoneCheck.ok) {
    return jsonError(phoneCheck.message, 400);
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

    if (wristband.userId) {
      // Already registered: treat as login to avoid leaking that a
      // wristband is unregistered to people who guess tokens.
      const response = NextResponse.json({ success: true });
      setSessionCookie(response, {
        role: "ATTENDEE",
        userId: wristband.userId
      });
      return response;
    }

    const emailTaken = await prisma.user.findUnique({
      where: {
        email: emailCheck.value
      },
      select: {
        id: true
      }
    });

    if (emailTaken) {
      return jsonError("That email is already registered to another wristband.", 409);
    }

    const newUserId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailCheck.value,
          name: nameCheck.value,
          dob: dobCheck.value,
          phone: phoneCheck.value,
          ticketId: token
        },
        select: {
          id: true
        }
      });

      await tx.wristband.update({
        where: {
          id: wristband.id
        },
        data: {
          userId: user.id
        }
      });

      return user.id;
    });

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, {
      role: "ATTENDEE",
      userId: newUserId
    });
    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError("That email or ticket id is already in use.", 409);
    }

    return jsonError("Could not finish registration. Please try again.", 500);
  }
}
