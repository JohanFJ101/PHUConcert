export function calculateAge(dob: Date | null | undefined, at = new Date()) {
  if (!dob) {
    return null;
  }

  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = at.getUTCMonth() - dob.getUTCMonth();
  const dayDelta = at.getUTCDate() - dob.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}
