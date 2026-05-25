/**
 * PATCH /api/admin/attendees/[id]
 *
 * Admin-only attendee profile edit. Allows updating full name, DOB,
 * email, and phone. Email uniqueness is enforced; the same email cannot
 * belong to two attendees.
 *
 * No DELETE endpoint by design: deleting an attendee would also drop
 * their wristbands and transactions. Use the wristband INACTIVE toggle
 * to soft-disable a wristband instead.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { jsonError, readJsonObject, requireAdminSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  validateDob,
  validateEmail,
  validateFullName,
  validatePhone
} from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { error } = await requireAdminSession();
  if (error) {
    return error;
  }

  const { id } = await context.params;
  if (!id) {
    return jsonError("Attendee id is required.", 400);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return jsonError("Body is required.", 400);
  }

  const updates: {
    name?: string;
    email?: string;
    dob?: Date;
    phone?: string;
  } = {};

  if (typeof body.fullName === "string") {
    const check = validateFullName(body.fullName);
    if (!check.ok) {
      return jsonError(check.message, 400);
    }
    updates.name = check.value;
  }

  if (typeof body.dob === "string") {
    const check = validateDob(body.dob);
    if (!check.ok) {
      return jsonError(check.message, 400);
    }
    updates.dob = check.value;
  }

  if (typeof body.email === "string") {
    const check = validateEmail(body.email);
    if (!check.ok) {
      return jsonError(check.message, 400);
    }
    updates.email = check.value;
  }

  if (typeof body.phone === "string") {
    const check = validatePhone(body.phone);
    if (!check.ok) {
      return jsonError(check.message, 400);
    }
    updates.phone = check.value;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("Nothing to update.", 400);
  }

  try {
    const existing = await prisma.user.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        email: true
      }
    });

    if (!existing) {
      return jsonError("Attendee not found.", 404);
    }

    if (updates.email && updates.email !== existing.email) {
      const collision = await prisma.user.findUnique({
        where: {
          email: updates.email
        },
        select: {
          id: true
        }
      });
      if (collision && collision.id !== id) {
        return jsonError("Email already belongs to another attendee.", 409);
      }
    }

    const attendee = await prisma.user.update({
      where: {
        id
      },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        dob: true,
        phone: true
      }
    });

    return NextResponse.json({
      success: true,
      attendee
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError("Email is already taken.", 409);
    }
    return jsonError("Could not update attendee.", 500);
  }
}
