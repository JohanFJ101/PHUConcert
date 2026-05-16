export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export function isGmailAddress(email: string) {
  const normalized = normalizeEmailAddress(email);
  const domain = normalized.split("@")[1] ?? "";
  return domain === "gmail.com" || domain === "googlemail.com";
}

export function normalizeAttendeeEmail(email: string) {
  const normalized = normalizeEmailAddress(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return normalized;
  }

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${localPart.replace(/\./g, "")}@gmail.com`;
  }

  return normalized;
}
