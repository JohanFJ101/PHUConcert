/**
 * Lightweight signed-cookie session implementation.
 *
 * We do NOT use a third-party session library because this is an MVP and the
 * surface area is intentionally tiny:
 *   - Encode the session payload (role + id) as base64url JSON.
 *   - HMAC-SHA256 sign it with `SESSION_SECRET` so the client cannot tamper.
 *   - Store the signed token in an httpOnly cookie called `phu_session`.
 *
 * Verification rejects tokens whose signature does not match, using
 * `timingSafeEqual` to avoid timing-based attacks.
 *
 * This file is the only place that knows about the cookie format. API
 * routes go through `getSession`, `setSessionCookie`, and
 * `clearSessionCookie` exclusively.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Name of the cookie that holds the signed session token. */
export const SESSION_COOKIE = "phu_session";

/**
 * Discriminated union of all possible logged-in sessions.
 *
 * `role` is the discriminant. Attendees are looked up by `userId` (the
 * `User` table), staff and admins by `staffId` (the `Staff` table). Keeping
 * the two id fields separate prevents accidental cross-role lookups.
 */
export type AppSession =
  | {
      role: "ATTENDEE";
      userId: string;
    }
  | {
      role: "STAFF";
      staffId: string;
    }
  | {
      role: "ADMIN";
      staffId: string;
    };

/**
 * Resolve the HMAC secret. The fallback string is only acceptable for local
 * development; deployments must set `SESSION_SECRET`.
 */
function getSessionSecret() {
  return process.env.SESSION_SECRET || "local-dev-session-secret-change-me";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** HMAC-SHA256 sign and base64url-encode the given payload. */
function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

/**
 * Build a signed cookie value: `<base64url(json)>.<base64url(hmac)>`.
 */
export function createSessionToken(session: AppSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a signed cookie value and return the parsed session.
 *
 * Returns `null` for:
 *   - missing tokens
 *   - malformed tokens (wrong shape, missing dot, bad base64, bad JSON)
 *   - tokens whose signature does not match `SESSION_SECRET`
 *   - tokens whose payload does not match a known role shape
 *
 * Callers must treat `null` as "not logged in".
 */
export function verifySessionToken(token: string | undefined): AppSession | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  // Use a constant-time comparison so an attacker cannot guess byte-by-byte
  // by measuring response timing. `timingSafeEqual` requires both buffers to
  // be the same length, hence the explicit length guard.
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as AppSession;
    // Defensive shape check: the signature only proves the payload was not
    // tampered with, not that the schema is still what we expect (e.g. an
    // old client with a stale cookie).
    if (parsed.role === "ATTENDEE" && typeof parsed.userId === "string") {
      return parsed;
    }
    if (
      (parsed.role === "STAFF" || parsed.role === "ADMIN") &&
      typeof parsed.staffId === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read and verify the current request's session cookie.
 *
 * Designed to be called from server components and Route Handlers. Returns
 * `null` when the user is not logged in.
 */
export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

/**
 * Attach a signed session cookie to the given response.
 *
 * Options chosen for safety:
 *   - `httpOnly`: hides the cookie from client-side JavaScript.
 *   - `sameSite: "lax"`: blocks most CSRF while still allowing top-level
 *     navigation from external sites.
 *   - `secure` in production: cookie only travels over HTTPS.
 *   - 7-day max age: balances "stay signed in for the festival" with not
 *     leaving sessions valid forever.
 */
export function setSessionCookie(response: NextResponse, session: AppSession) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

/**
 * Overwrite the session cookie with an empty, immediately-expired value.
 * Used by the logout endpoint.
 */
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
