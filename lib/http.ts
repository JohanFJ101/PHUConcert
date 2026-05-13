/**
 * Reusable HTTP helpers for Route Handlers.
 *
 * Centralises three concerns that almost every API route needs:
 *   1. A consistent JSON shape for errors (`{ success: false, message }`).
 *   2. Role-based guards that return an early 401/403 response when the
 *      caller is not the expected role.
 *   3. A tolerant JSON body reader that never throws.
 *
 * Keeping these in one file avoids duplicating the same boilerplate across
 * every route and makes the error envelope easy to evolve later.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Build a uniform JSON error response.
 *
 * Frontend code can rely on `{ success: false, message }` for every error,
 * which simplifies UI rendering (just show `message`).
 */
export function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      message
    },
    { status }
  );
}

/**
 * Guard that requires an ATTENDEE session.
 *
 * Returns `{ session, error: null }` on success, or `{ session: null, error }`
 * where `error` is the response to return directly. The 401/403 split
 * distinguishes "you are not logged in" from "you are logged in as the
 * wrong role" so the frontend can react appropriately.
 */
export async function requireAttendeeSession() {
  const session = await getSession();
  if (!session) {
    return { session: null, error: jsonError("Not authenticated", 401) };
  }
  if (session.role !== "ATTENDEE") {
    return { session: null, error: jsonError("Forbidden", 403) };
  }
  return { session, error: null };
}

/** Guard that requires a STAFF session. See `requireAttendeeSession`. */
export async function requireStaffSession() {
  const session = await getSession();
  if (!session) {
    return { session: null, error: jsonError("Not authenticated", 401) };
  }
  if (session.role !== "STAFF") {
    return { session: null, error: jsonError("Forbidden", 403) };
  }
  return { session, error: null };
}

/** Guard that requires an ADMIN session. See `requireAttendeeSession`. */
export async function requireAdminSession() {
  const session = await getSession();
  if (!session) {
    return { session: null, error: jsonError("Not authenticated", 401) };
  }
  if (session.role !== "ADMIN") {
    return { session: null, error: jsonError("Forbidden", 403) };
  }
  return { session, error: null };
}

/**
 * Parse a request body that is expected to be a JSON object.
 *
 * Returns `null` (rather than throwing) when:
 *   - the body is not valid JSON,
 *   - the body is `null`, `undefined`, or a primitive,
 *   - the body is an array.
 *
 * Callers should treat `null` as "no usable body" and respond with a 400.
 * The return type is `Record<string, unknown>` so each field must be
 * narrowed with `typeof` checks before use.
 */
export async function readJsonObject(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
