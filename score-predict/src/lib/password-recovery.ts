import "server-only";
import { createHash, randomBytes } from "node:crypto";

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_LENGTH = 10;

function getHashPepper(): string {
  return process.env.NEXTAUTH_SECRET ?? "dev-recovery-secret";
}

export function hashSecret(value: string): string {
  return createHash("sha256")
    .update(`${getHashPepper()}:${value}`)
    .digest("hex");
}

export function normalizeRecoveryCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function formatRecoveryCode(normalized: string): string {
  if (normalized.length < 1) return "";
  if (normalized.length <= 5) return normalized;
  return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
}

function generateRecoveryCodeRaw(): string {
  let out = "";
  while (out.length < RECOVERY_CODE_LENGTH) {
    const byte = randomBytes(1)[0];
    out += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
  }
  return out;
}

export function generateRecoveryCodes(count = 8): string[] {
  const unique = new Set<string>();
  while (unique.size < count) {
    unique.add(formatRecoveryCode(generateRecoveryCodeRaw()));
  }
  return Array.from(unique);
}

export function hashRecoveryCode(code: string): string {
  return hashSecret(normalizeRecoveryCode(code));
}

export function createPasswordResetToken(expireMinutes = 15): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSecret(token);
  const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
  return { token, tokenHash, expiresAt };
}
