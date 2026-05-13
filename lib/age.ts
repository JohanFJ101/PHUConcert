/**
 * Age calculation helpers.
 *
 * Used by the staff charge route to enforce age-restricted items
 * (for example beer requires the attendee to be 21+).
 */

/**
 * Return the attendee's whole-year age in UTC.
 *
 * UTC math is intentional: dates of birth are stored as UTC midnight in the
 * database, so comparing in UTC avoids off-by-one errors caused by the
 * staff device's local time zone.
 *
 * @param dob The attendee's date of birth. `null`/`undefined` means unknown.
 * @param at  The reference moment to compare against. Defaults to "now"
 *            and is parameterised so tests can pin a clock.
 * @returns Whole-year age, or `null` when DOB is unknown. Callers should
 *          treat `null` as "cannot verify age" and refuse age-restricted
 *          purchases.
 */
export function calculateAge(dob: Date | null | undefined, at = new Date()) {
  if (!dob) {
    return null;
  }

  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = at.getUTCMonth() - dob.getUTCMonth();
  const dayDelta = at.getUTCDate() - dob.getUTCDate();

  // The birthday for this year has not happened yet, so subtract one year.
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}
