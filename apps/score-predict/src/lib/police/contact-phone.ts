const KOREAN_MOBILE_PHONE_PATTERN = /^01[016789]\d{7,8}$/;

export function normalizePoliceContactPhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidPoliceContactPhone(value: string | null | undefined): boolean {
  return KOREAN_MOBILE_PHONE_PATTERN.test(normalizePoliceContactPhone(value));
}

export function resolvePoliceContactPhone(user: {
  contactPhone?: string | null;
  phone?: string | null;
}): string {
  const storedContactPhone = normalizePoliceContactPhone(user.contactPhone);
  if (isValidPoliceContactPhone(storedContactPhone)) return storedContactPhone;

  const legacyPhoneLogin = normalizePoliceContactPhone(user.phone);
  return isValidPoliceContactPhone(legacyPhoneLogin) ? legacyPhoneLogin : "";
}

export function formatPoliceContactPhone(value: string | null | undefined): string {
  const digits = normalizePoliceContactPhone(value);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}
