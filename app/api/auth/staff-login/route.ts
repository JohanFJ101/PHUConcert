/**
 * POST /api/auth/staff-login
 *
 * Username/password sign-in for STAFF accounts only. ADMIN credentials are
 * rejected here even if the password is correct, forcing admins to use
 * `/api/auth/admin-login`. This separation keeps the two surfaces distinct
 * so that compromising one login form cannot grant the other role.
 *
 * Request body: { username: string; password: string }
 * Response: { success: true } on success; `phu_session` cookie is set.
 *           `{ success: false, message }` with 400/401/500 on failure.
 */

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { jsonError, readJsonObject } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return jsonError("Username and password are required", 400);
  }

  try {
    const staff = await prisma.staff.findUnique({
      where: {
        username
      },
      // Hash is needed for bcrypt.compare; never include it in the response.
      select: {
        id: true,
        passwordHash: true,
        role: true,
        active: true
      }
    });

    // One generic message for all three failure modes (no such user, wrong
    // password, wrong role) so attackers cannot probe which usernames exist.
    if (
      !staff ||
      staff.role !== "STAFF" ||
      !staff.active ||
      !(await bcrypt.compare(password, staff.passwordHash))
    ) {
      return jsonError("Invalid username or password", 401);
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, {
      role: "STAFF",
      staffId: staff.id
    });
    return response;
  } catch {
    return jsonError("Staff login failed. Check database setup.", 500);
  }
}
