/**
 * Helpers for preserving the attendee destination through login.
 *
 * The value is deliberately limited to same-origin attendee paths so a
 * crafted QR URL cannot turn login into an open redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/session";

export const ATTENDEE_LOGIN_NEXT_COOKIE = "phu_attendee_login_next";
export const DEFAULT_ATTENDEE_NEXT_PATH = "/attendee/dashboard";

export function sanitizeAttendeeNextPath(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_ATTENDEE_NEXT_PATH;
  }

  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/attendee/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\r\n]/.test(trimmed)
  ) {
    return DEFAULT_ATTENDEE_NEXT_PATH;
  }

  return trimmed;
}

export function getAttendeeLoginNextFromRequest(request: NextRequest) {
  return sanitizeAttendeeNextPath(request.cookies.get(ATTENDEE_LOGIN_NEXT_COOKIE)?.value);
}

export function setAttendeeLoginNextCookie(response: NextResponse, nextPath: string) {
  response.cookies.set({
    name: ATTENDEE_LOGIN_NEXT_COOKIE,
    value: sanitizeAttendeeNextPath(nextPath),
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 10
  });
}

export function clearAttendeeLoginNextCookie(response: NextResponse) {
  response.cookies.set({
    name: ATTENDEE_LOGIN_NEXT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 0
  });
}
