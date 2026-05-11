import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      message
    },
    { status }
  );
}

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
