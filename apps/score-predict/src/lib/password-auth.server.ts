import "server-only";

import bcrypt from "bcryptjs";

import { normalizeCaseInsensitivePassword } from "@/lib/credential-policy";

export type PasswordVerification = {
  valid: boolean;
  needsUpgrade: boolean;
};

export async function hashPassword(password: string, rounds = 12): Promise<string> {
  return bcrypt.hash(normalizeCaseInsensitivePassword(password), rounds);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<PasswordVerification> {
  const normalized = normalizeCaseInsensitivePassword(password);

  if (await bcrypt.compare(normalized, passwordHash)) {
    return { valid: true, needsUpgrade: false };
  }

  // Existing hashes may have been created before passwords became case-insensitive.
  // Accept the exact legacy password once, then replace its hash with the normalized form.
  if (normalized !== password.trim() && (await bcrypt.compare(password.trim(), passwordHash))) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}
