const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function parseOptionalEmail(value: unknown, fieldLabel = "이메일"): string | null {
  const email = normalizeEmail(value);
  if (!email) {
    return null;
  }

  if (!isValidEmailAddress(email)) {
    throw new Error(`${fieldLabel} 형식이 올바르지 않습니다.`);
  }

  return email;
}
