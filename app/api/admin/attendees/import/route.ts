/**
 * POST /api/admin/attendees/import
 *
 * Admin-only CSV import for ticketing/BookMyShow attendee rows. Expected
 * columns are FULL NAME, dob, email used for registering, phone, and
 * Unique id number. Header matching is case-insensitive and tolerant of
 * spaces and punctuation so exports like `full_name` or `Date of Birth`
 * still work.
 *
 * Import policy:
 *   - Validate the whole CSV before writing anything.
 *   - Upsert attendees by normalized email.
 *   - Store the ticketing unique id on `User.ticketId`.
 *   - Create/update an active wristband whose QR token is that unique id
 *     for the current MVP, so staff can charge imported attendees.
 */

import { NextResponse } from "next/server";
import { parseAttendeeCsv } from "@/lib/attendee-import";
import { isGmailAddress, normalizeAttendeeEmail } from "@/lib/email";
import { jsonError, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "function"
  );
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

  const parsed = parseAttendeeCsv(await file.text());
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

  if (parsed.attendees.length === 0) {
    return jsonError("CSV has no attendee rows.", 400);
  }

  const ticketIds = parsed.attendees.map((attendee) => attendee.ticketId);
  const rowsByTicketId = new Map(
    parsed.attendees.map((attendee) => [attendee.ticketId, attendee])
  );

  try {
    const [usersWithTicketIds, wristbandsWithTicketIds] = await Promise.all([
      prisma.user.findMany({
        where: {
          ticketId: {
            in: ticketIds
          }
        },
        select: {
          email: true,
          ticketId: true
        }
      }),
      prisma.wristband.findMany({
        where: {
          qrToken: {
            in: ticketIds
          }
        },
        select: {
          qrToken: true,
          user: {
            select: {
              email: true
            }
          }
        }
      })
    ]);

    const databaseErrors: string[] = [];
    usersWithTicketIds.forEach((user) => {
      if (!user.ticketId) {
        return;
      }
      const row = rowsByTicketId.get(user.ticketId);
      if (row && normalizeAttendeeEmail(user.email) !== row.email) {
        databaseErrors.push(
          `Row ${row.rowNumber}: Unique id number already belongs to ${user.email}.`
        );
      }
    });

    wristbandsWithTicketIds.forEach((wristband) => {
      const row = rowsByTicketId.get(wristband.qrToken);
      if (!row) {
        return;
      }
      if (wristband.user && normalizeAttendeeEmail(wristband.user.email) !== row.email) {
        databaseErrors.push(
          `Row ${row.rowNumber}: wristband token already belongs to ${wristband.user.email}.`
        );
      }
    });

    if (databaseErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "CSV conflicts with existing attendees.",
          errors: databaseErrors
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let attendeesCreated = 0;
      let attendeesUpdated = 0;
      let wristbandsCreated = 0;
      let wristbandsUpdated = 0;

      for (const attendee of parsed.attendees) {
        const existingUsers = await tx.user.findMany({
          where: {
            OR: isGmailAddress(attendee.email)
              ? [
                  {
                    email: attendee.email
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
              : [
                  {
                    email: attendee.email
                  }
                ]
          },
          select: {
            id: true,
            email: true
          }
        });
        const normalizedExistingUser =
          existingUsers.find((user) => normalizeAttendeeEmail(user.email) === attendee.email) ??
          null;

        const user = normalizedExistingUser
          ? await tx.user.update({
              where: {
                id: normalizedExistingUser.id
              },
              data: {
                email: attendee.email,
                name: attendee.fullName,
                dob: attendee.dob,
                phone: attendee.phone,
                ticketId: attendee.ticketId
              },
              select: {
                id: true
              }
            })
          : await tx.user.create({
              data: {
                email: attendee.email,
                name: attendee.fullName,
                dob: attendee.dob,
                phone: attendee.phone,
                ticketId: attendee.ticketId
              },
              select: {
                id: true
              }
            });

        if (normalizedExistingUser) {
          attendeesUpdated += 1;
        } else {
          attendeesCreated += 1;
        }

        const existingWristband = await tx.wristband.findUnique({
          where: {
            qrToken: attendee.ticketId
          },
          select: {
            id: true,
            userId: true
          }
        });

        if (existingWristband) {
          if (existingWristband.userId && existingWristband.userId !== user.id) {
            throw new Error("Wristband belongs to a different attendee.");
          }
          await tx.wristband.update({
            where: {
              id: existingWristband.id
            },
            data: {
              status: "ACTIVE",
              userId: user.id
            }
          });
          wristbandsUpdated += 1;
        } else {
          await tx.wristband.create({
            data: {
              qrToken: attendee.ticketId,
              userId: user.id,
              status: "ACTIVE"
            }
          });
          wristbandsCreated += 1;
        }
      }

      return {
        attendeesCreated,
        attendeesUpdated,
        wristbandsCreated,
        wristbandsUpdated
      };
    });

    return NextResponse.json({
      success: true,
      imported: parsed.attendees.length,
      ...result
    });
  } catch {
    return jsonError("Attendee import failed. Check database setup.", 500);
  }
}
