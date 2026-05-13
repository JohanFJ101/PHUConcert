/**
 * POST /api/onboarding
 *
 * Lets a logged-in attendee update their profile (name, date of birth,
 * gender, phone). The current MVP UI calls this from `/onboarding`, but
 * the endpoint is also designed to be reused once real OAuth lands and a
 * new user needs to finish their profile after the first sign-in.
 *
 * Request body: { name: string; dob?: string (YYYY-MM-DD); gender?: string;
 *                 phone?: string }
 * Response: { success: true } on success;
 *           `{ success: false, message }` with 400/401/500 on failure.
 *
 * Auth: ATTENDEE session required.
 */

import { NextResponse } from "next/server";
import { jsonError, readJsonObject, requireAttendeeSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { session, error } = await requireAttendeeSession();
  if (error) {
    return error;
  }

  const body = await readJsonObject(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const gender = typeof body?.gender === "string" ? body.gender.trim() : null;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const dobValue = typeof body?.dob === "string" ? body.dob.trim() : "";

  if (!name) {
    return jsonError("Name is required", 400);
  }

  // Treat an empty DOB as "leave it unset". Otherwise force UTC midnight
  // so the value matches how `lib/age.ts` reads it.
  const dob = dobValue ? new Date(`${dobValue}T00:00:00.000Z`) : null;
  if (dobValue && Number.isNaN(dob?.getTime())) {
    return jsonError("Invalid date of birth", 400);
  }

  try {
    await prisma.user.update({
      where: {
        id: session.userId
      },
      data: {
        name,
        dob,
        gender,
        phone
      }
    });
  } catch {
    return jsonError("Profile update failed. Check database setup.", 500);
  }

  return NextResponse.json({ success: true });
}
