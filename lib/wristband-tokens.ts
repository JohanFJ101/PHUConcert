/**
 * Wristband token helpers.
 *
 * Tokens are short numeric strings (8 digits) that double as:
 *   - the value printed inside the QR code on the physical wristband,
 *   - the attendee's ticketId for CSV imports,
 *   - the manual-entry fallback when scanning fails.
 *
 * Generation is collision-checked against both `User.ticketId` and
 * `Wristband.qrToken` so the same string never appears in either table.
 */

import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

const MIN_TOKEN_VALUE = 10_000_000;
const MAX_TOKEN_VALUE = 100_000_000;

/** Try a handful of times to find an unused 8-digit token. */
export async function generateUniqueWristbandToken() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = randomInt(MIN_TOKEN_VALUE, MAX_TOKEN_VALUE).toString();
    const [existingUser, existingWristband] = await Promise.all([
      prisma.user.findUnique({
        where: {
          ticketId: candidate
        },
        select: {
          id: true
        }
      }),
      prisma.wristband.findUnique({
        where: {
          qrToken: candidate
        },
        select: {
          id: true
        }
      })
    ]);

    if (!existingUser && !existingWristband) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique wristband token.");
}

/**
 * Generate N distinct unused tokens. Tries to amortise the round-trip cost
 * by checking candidates in one query, but still falls back to single
 * generation if the bulk attempt has collisions.
 */
export async function generateUniqueWristbandTokens(count: number) {
  if (!Number.isInteger(count) || count <= 0) {
    return [] as string[];
  }

  const generated = new Set<string>();
  while (generated.size < count) {
    const token = await generateUniqueWristbandToken();
    generated.add(token);
  }

  return Array.from(generated);
}

/** Accept the bare token or a URL whose path ends with a token. */
export function extractTokenFromScan(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{6,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const lastSegment = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (/^\d{6,}$/.test(lastSegment)) {
      return lastSegment;
    }
  } catch {
    /* not a URL; fall through */
  }

  return trimmed;
}
