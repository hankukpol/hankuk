import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const PASSWORD_HASH_VERSION = "scrypt";
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_BYTES = 16;

async function derivePasswordKey(password: string, salt: string) {
  return (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
}

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("base64url");
  const derivedKey = await derivePasswordKey(password, salt);

  return `${PASSWORD_HASH_VERSION}:${salt}:${derivedKey.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, passwordHash: string) {
  const [version, salt, encodedHash] = passwordHash.split(":");

  if (
    version !== PASSWORD_HASH_VERSION ||
    !salt ||
    !encodedHash
  ) {
    return false;
  }

  const derivedKey = await derivePasswordKey(password, salt);
  const storedHash = Buffer.from(encodedHash, "base64url");

  if (storedHash.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedHash, derivedKey);
}
