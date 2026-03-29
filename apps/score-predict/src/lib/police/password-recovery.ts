import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { normalizeResetCode } from "@/lib/validations";

const RESET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RESET_CODE_LENGTH = 8;

function getHashPepper(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for password reset.");
  }
  return secret;
}

export function hashSecret(value: string): string {
  return createHash("sha256")
    .update(`${getHashPepper()}:${value}`)
    .digest("hex");
}

function formatResetCode(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function generateResetCodeRaw(): string {
  let out = "";
  while (out.length < RESET_CODE_LENGTH) {
    const byte = randomBytes(1)[0];
    out += RESET_CODE_ALPHABET[byte % RESET_CODE_ALPHABET.length];
  }
  return out;
}

export function createPasswordResetCode(expireMinutes = 15): {
  code: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const normalizedCode = generateResetCodeRaw();
  const code = formatResetCode(normalizedCode);
  const tokenHash = hashSecret(normalizeResetCode(normalizedCode));
  const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
  return { code, tokenHash, expiresAt };
}
