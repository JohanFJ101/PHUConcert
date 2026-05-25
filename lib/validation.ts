/**
 * Shared input validators for attendee registration and admin edits.
 *
 * The same rules apply whether a value reaches us from the public
 * registration form, the admin manual-add form, or the CSV import, so
 * keeping them in one file means the messages stay consistent.
 */

/** RFC-5322 lite: at least one local part, "@", and a dotted domain. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 10-15 digit phone with optional leading "+", spaces, dashes, or parens. */
const PHONE_RE = /^\+?[0-9 ()\-]{10,20}$/;

/** YYYY-MM-DD format (also accepts DD/MM/YYYY for the CSV path). */
const ISO_DOB_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export function normaliseEmail(input: string) {
  return input.trim().toLowerCase();
}

export function validateFullName(input: string) {
  const value = input.trim();
  if (value.length < 2 || value.length > 80) {
    return { ok: false as const, message: "Full name must be 2-80 characters." };
  }
  return { ok: true as const, value };
}

export function validateEmail(input: string) {
  const value = normaliseEmail(input);
  if (!EMAIL_RE.test(value)) {
    return { ok: false as const, message: "Email format is invalid." };
  }
  return { ok: true as const, value };
}

export function validatePhone(input: string) {
  const value = input.trim();
  if (!PHONE_RE.test(value)) {
    return { ok: false as const, message: "Phone must be 10-15 digits." };
  }
  // Strip everything but digits and an optional leading "+" so all stored
  // phones look the same.
  const normalised = value.startsWith("+")
    ? "+" + value.replace(/[^0-9]/g, "")
    : value.replace(/[^0-9]/g, "");
  return { ok: true as const, value: normalised };
}

export function validateDob(input: string) {
  const value = input.trim();
  const match = ISO_DOB_RE.exec(value);
  if (!match) {
    return { ok: false as const, message: "Date of birth must be YYYY-MM-DD." };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return { ok: false as const, message: "Date of birth is not a real date." };
  }

  if (candidate.getTime() > Date.now()) {
    return { ok: false as const, message: "Date of birth cannot be in the future." };
  }

  const minYear = new Date().getUTCFullYear() - 130;
  if (year < minYear) {
    return { ok: false as const, message: "Date of birth is too far in the past." };
  }

  return { ok: true as const, value: candidate };
}
