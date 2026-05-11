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
      select: {
        id: true,
        passwordHash: true
      }
    });

    if (!staff || !(await bcrypt.compare(password, staff.passwordHash))) {
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
