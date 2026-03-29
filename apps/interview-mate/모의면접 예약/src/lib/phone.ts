export function normalizePhone(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");

  if (digits.length === 11 && digits.startsWith("010")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return phone.trim();
}

export function maskPhone(phone: string) {
  const normalized = normalizePhone(phone);

  if (!/^010-\d{4}-\d{4}$/.test(normalized)) {
    return normalized;
  }

  return `${normalized.slice(0, 8)}-****`;
}
