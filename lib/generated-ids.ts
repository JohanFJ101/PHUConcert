import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export async function generateUniqueAttendeeTicketId() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const ticketId = randomInt(10_000_000, 100_000_000).toString();
    const [existingUser, existingWristband] = await Promise.all([
      prisma.user.findUnique({
        where: {
          ticketId
        },
        select: {
          id: true
        }
      }),
      prisma.wristband.findUnique({
        where: {
          qrToken: ticketId
        },
        select: {
          id: true
        }
      })
    ]);

    if (!existingUser && !existingWristband) {
      return ticketId;
    }
  }

  throw new Error("Could not generate a unique attendee ID.");
}
