import { customAlphabet } from "nanoid";

const createInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const createAccessToken = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789",
  12,
);
const createRoomPassword = customAlphabet("23456789", 4);

export function generateInviteCode() {
  return createInviteCode();
}

export function generateAccessToken() {
  return createAccessToken();
}

export function generateRoomPassword() {
  return createRoomPassword();
}
