/**
 * POST /api/admin/attendees
 *
 * Admin-only manual attendee creation. Admins enter full name, DOB,
 * email, and phone; the server generates a unique 8-digit token used as
 * both `User.ticketId` and the new wristband's `qrToken`.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { isGmailAddress, normalizeAttendeeEmail, normalizeEmailAddress } from "@/lib/email";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  validateDob,
  validateEmail,
  validateFullName,
  validatePhone
} from "@/lib/validation";
import { generateUniqueWristbandToken } from "@/lib/wristband-tokens";

async function findUserByNormalizedEmail(email: string) {
  const rawEmail = normalizeEmailAddress(email);
  const attendeeEmail = normalizeAttendeeEmail(email);
  const exactEmailCandidates = Array.from(new Set([rawEmail, attendeeEmail]));

  const candidates = await prisma.user.findMany({
    where: isGmailAddress(email)
      ? {
          OR: [
            {
              email: {
                in: exactEmailCandidates
              }
            },
            {
              email: {
                endsWith: "@gmail.com"
              }
            },
            {
              email: {
                endsWith: "@googlemail.com"
              }
            }
          ]
        }
      : {
          email: {
            in: exactEmailCandidates
          }
        },
    select: {
      id: true,
      email: true
    }
  });

  return (
    candidates.find((candidate) => normalizeAttendeeEmail(candidate.email) === attendeeEmail) ??
    null
  );
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const nameCheck = validateFullName(typeof body?.fullName === "string" ? body.fullName : "");
  if (!nameCheck.ok) {
    return jsonError(nameCheck.message, 400);
  }
  const dobCheck = validateDob(typeof body?.dob === "string" ? body.dob : "");
  if (!dobCheck.ok) {
    return jsonError(dobCheck.message, 400);
  }
  const emailCheck = validateEmail(typeof body?.email === "string" ? body.email : "");
  if (!emailCheck.ok) {
    return jsonError(emailCheck.message, 400);
  }
  const phoneCheck = validatePhone(typeof body?.phone === "string" ? body.phone : "");
  if (!phoneCheck.ok) {
    return jsonError(phoneCheck.message, 400);
  }

  try {
    const existingEmailUser = await findUserByNormalizedEmail(emailCheck.value);

    if (existingEmailUser) {
      return jsonError(`Email already belongs to ${existingEmailUser.email}.`, 409);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ticketId = await generateUniqueWristbandToken();

      try {
        const attendee = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: emailCheck.value,
              name: nameCheck.value,
              dob: dobCheck.value,
              phone: phoneCheck.value,
              ticketId
            },
            select: {
              id: true,
              email: true,
              name: true,
              ticketId: true
            }
          });

          await tx.wristband.create({
            data: {
              qrToken: ticketId,
              userId: user.id,
              status: "ACTIVE"
            }
          });

          return user;
        });

        return NextResponse.json({
          success: true,
          attendee
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          attempt < 4
        ) {
          continue;
        }

        throw error;
      }
    }

    return jsonError("Could not generate a unique attendee ID.", 500);
  } catch {
    return jsonError("Could not add attendee. Check database setup.", 500);
  }
}
