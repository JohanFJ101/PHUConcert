/**
 * POST /api/admin/attendees
 *
 * Admin-only manual attendee creation. Mirrors one CSV row: full name, DOB,
 * email, and Unique id number. Creates the attendee and their active
 * wristband in a single transaction.
 */

import { NextResponse } from "next/server";
import { parseAttendeeDob } from "@/lib/attendee-import";
import { isGmailAddress, normalizeAttendeeEmail, normalizeEmailAddress } from "@/lib/email";
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
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId.trim() : "";
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
  if (!ticketId) {
    return jsonError("Unique id number is required.", 400);
  }

  try {
    const [existingEmailUser, existingTicketUser, existingWristband] = await Promise.all([
      findUserByNormalizedEmail(email),
      prisma.user.findFirst({
        where: {
          ticketId: {
            equals: ticketId,
            mode: "insensitive"
          }
        },
        select: {
          email: true
        }
      }),
      prisma.wristband.findFirst({
        where: {
          qrToken: {
            equals: ticketId,
            mode: "insensitive"
          }
        },
        select: {
          user: {
            select: {
              email: true
            }
          }
        }
      })
    ]);

    if (existingEmailUser) {
      return jsonError(`Email already belongs to ${existingEmailUser.email}.`, 409);
    }
    if (existingTicketUser) {
      return jsonError(`Unique id number already belongs to ${existingTicketUser.email}.`, 409);
    }
    if (existingWristband) {
      return jsonError(`Wristband token already belongs to ${existingWristband.user.email}.`, 409);
    }

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
          name: true
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
  } catch {
    return jsonError("Could not add attendee. Check database setup.", 500);
  }
}
