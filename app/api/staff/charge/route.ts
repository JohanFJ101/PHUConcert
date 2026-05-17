/**
 * POST /api/staff/charge
 *
 * Direct staff-initiated wristband debits are intentionally disabled.
 * Purchases now flow through staff-generated purchase QR codes and require
 * attendee approval before money moves.
 */

import { jsonError, requireStaffSession } from "@/lib/http";

export async function POST() {
  const { error } = await requireStaffSession();
  if (error) {
    return error;
  }

  return jsonError("Direct staff charging is disabled. Generate a purchase QR.", 410);
}
