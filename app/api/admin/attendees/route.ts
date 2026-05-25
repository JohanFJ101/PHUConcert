/**
 * POST /api/admin/attendees
 *
 * Admin-only manual attendee creation. Admins enter full name, DOB, and
 * email; the server generates the 8-digit unique ID used for both
 * `User.ticketId` and the attendee's active wristband token.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { parseAttendeeDob } from "@/lib/attendee-import";
import { isGmailAddress, normalizeAttendeeEmail, normalizeEmailAddress } from "@/lib/email";
import { generateUniqueAttendeeTicketId } from "@/lib/generated-ids";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

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
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? normalizeAttendeeEmail(body.email) : "";
  const dobValue = typeof body?.dob === "string" ? body.dob.trim() : "";
  const dob = parseAttendeeDob(dobValue);

  if (!fullName) {
    return jsonError("Full name is required.", 400);
  }
  if (!dob) {
    return jsonError("DOB must be YYYY-MM-DD or DD/MM/YYYY.", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Email is invalid.", 400);
  }

  try {
    const existingEmailUser = await findUserByNormalizedEmail(email);

    if (existingEmailUser) {
      return jsonError(`Email already belongs to ${existingEmailUser.email}.`, 409);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ticketId = await generateUniqueAttendeeTicketId();

      try {
        const attendee = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              name: fullName,
              dob,
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
