/**
 * POST /api/auth/logout
 *
 * Clears the `phu_session` cookie. Same endpoint for attendee, staff, and
 * admin because the cookie name is shared across roles. Always returns
 * 200 so the client can blindly call it before redirecting to `/login`.
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
