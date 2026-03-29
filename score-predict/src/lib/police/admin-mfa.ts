import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const TOTP_TIME_STEP_SEC = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeCode(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function decodeBase32Secret(rawSecret: string): Buffer {
  const normalized = rawSecret.toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  if (!normalized) {
    throw new Error("ADMIN_TOTP_SECRET must be a valid base32 string.");
  }

  let bits = "";
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("ADMIN_TOTP_SECRET must be a valid base32 string.");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }

  return Buffer.from(bytes);
}

function readTotpSecret(): Buffer | null {
  const secret = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!secret) {
    return null;
  }

  return decodeBase32Secret(secret);
}

const cachedAdminTotpSecret = readTotpSecret();

function getCounterBuffer(counter: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  return buffer;
}

function generateTotp(secret: Buffer, counter: number): string {
  const digest = createHmac("sha1", secret).update(getCounterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const code = binary % 10 ** TOTP_DIGITS;
  return code.toString().padStart(TOTP_DIGITS, "0");
}

function constantTimeMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminMfaEnabled(): boolean {
  return cachedAdminTotpSecret !== null;
}

export function verifyAdminTotp(inputCode: string, nowMs = Date.now()): boolean {
  const normalizedCode = normalizeCode(inputCode);
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  if (!cachedAdminTotpSecret) {
    return true;
  }

  const currentCounter = Math.floor(nowMs / 1000 / TOTP_TIME_STEP_SEC);
  for (let delta = -1; delta <= 1; delta += 1) {
    const expected = generateTotp(cachedAdminTotpSecret, currentCounter + delta);
    if (constantTimeMatches(expected, normalizedCode)) {
      return true;
    }
  }

  return false;
}
