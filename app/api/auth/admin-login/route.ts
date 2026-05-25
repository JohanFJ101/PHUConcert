/**
 * POST /api/auth/admin-login
 *
 * Username/password sign-in for ADMIN accounts only. Mirrors the staff
 * login endpoint but only accepts rows where `role === "ADMIN"`, so a
 * staff member who knows their own password cannot unlock the admin
 * console here.
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
    const admin = await prisma.staff.findUnique({
      where: {
        username
      },
      select: {
        id: true,
        passwordHash: true,
        role: true,
        active: true
      }
    });

    // One generic message: do not reveal whether the username exists or
    // whether the password is wrong.
    if (
      !admin ||
      admin.role !== "ADMIN" ||
      !admin.active ||
      !(await bcrypt.compare(password, admin.passwordHash))
    ) {
      return jsonError("Invalid username or password", 401);
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response, {
      role: "ADMIN",
      staffId: admin.id
    });
    return response;
  } catch {
    return jsonError("Admin login failed. Check database setup.", 500);
  }
}
