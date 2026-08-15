import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  formatPoliceContactPhone,
  normalizePoliceContactPhone,
  resolvePoliceContactPhone,
} from "@/lib/police/contact-phone";
import { normalizeUsername } from "@/lib/police/validations";

export const LEGACY_USERNAME_KIND = "USERNAME";
export const LEGACY_CONTACT_PHONE_KIND = "CONTACT_PHONE";

type IdentityDatabase = PrismaClient | Prisma.TransactionClient;

const policeIdentityUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  phone: true,
  contactPhone: true,
  password: true,
  role: true,
  credentialVersion: true,
  legacyAccountIdentities: {
    select: {
      kind: true,
      value: true,
      normalizedValue: true,
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.UserSelect;

export type PoliceIdentityUser = Prisma.UserGetPayload<{
  select: typeof policeIdentityUserSelect;
}>;

export type LegacyIdentitySummary = {
  userId: number;
  kind: string;
  value: string;
  normalizedValue: string;
};

function isMissingLegacyIdentityTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" ||
      (error.code === "P2022" && String(error.meta?.column ?? "").includes("LegacyAccountIdentity")))
  );
}

function withoutLegacyIdentities(
  user: Omit<PoliceIdentityUser, "legacyAccountIdentities">
): PoliceIdentityUser {
  return { ...user, legacyAccountIdentities: [] };
}

export function resolvePreferredPoliceUsername(
  user: Pick<PoliceIdentityUser, "phone" | "legacyAccountIdentities">
): string {
  const legacyUsername = user.legacyAccountIdentities.find(
    (identity) => identity.kind === LEGACY_USERNAME_KIND
  );
  return legacyUsername?.value ?? user.phone;
}

export function hasExactPoliceUsername(
  user: Pick<PoliceIdentityUser, "phone" | "legacyAccountIdentities">,
  rawUsername: string
) {
  const trimmed = rawUsername.trim();
  return (
    user.phone === trimmed ||
    user.legacyAccountIdentities.some(
      (identity) => identity.kind === LEGACY_USERNAME_KIND && identity.value === trimmed
    )
  );
}

export async function findPoliceUsersByUsername(
  rawUsername: string,
  db: IdentityDatabase = prisma
): Promise<PoliceIdentityUser[]> {
  const normalizedUsername = normalizeUsername(rawUsername);
  if (!normalizedUsername) return [];

  try {
    return await db.user.findMany({
      where: {
        OR: [
          { phone: { equals: normalizedUsername, mode: "insensitive" } },
          {
            legacyAccountIdentities: {
              some: {
                kind: LEGACY_USERNAME_KIND,
                normalizedValue: normalizedUsername,
              },
            },
          },
        ],
      },
      select: policeIdentityUserSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
  } catch (error) {
    if (!isMissingLegacyIdentityTableError(error)) throw error;
    const users = await db.user.findMany({
      where: { phone: { equals: normalizedUsername, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        contactPhone: true,
        password: true,
        role: true,
        credentialVersion: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    return users.map(withoutLegacyIdentities);
  }
}

export async function findPoliceUsersByContactPhone(
  rawContactPhone: string,
  db: IdentityDatabase = prisma
): Promise<PoliceIdentityUser[]> {
  const normalizedPhone = normalizePoliceContactPhone(rawContactPhone);
  if (!normalizedPhone) return [];
  const formattedPhone = formatPoliceContactPhone(normalizedPhone);

  try {
    return await db.user.findMany({
      where: {
        OR: [
          { contactPhone: normalizedPhone },
          { contactPhone: formattedPhone },
          { phone: normalizedPhone },
          { phone: formattedPhone },
          {
            legacyAccountIdentities: {
              some: {
                kind: LEGACY_CONTACT_PHONE_KIND,
                normalizedValue: normalizedPhone,
              },
            },
          },
        ],
      },
      select: policeIdentityUserSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 50,
    });
  } catch (error) {
    if (!isMissingLegacyIdentityTableError(error)) throw error;
    const users = await db.user.findMany({
      where: {
        OR: [
          { contactPhone: normalizedPhone },
          { contactPhone: formattedPhone },
          { phone: normalizedPhone },
          { phone: formattedPhone },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        contactPhone: true,
        password: true,
        role: true,
        credentialVersion: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 50,
    });
    return users.map(withoutLegacyIdentities);
  }
}

export function userOwnsPoliceContactPhone(
  user: Pick<PoliceIdentityUser, "phone" | "contactPhone" | "legacyAccountIdentities">,
  rawContactPhone: string
) {
  const normalizedPhone = normalizePoliceContactPhone(rawContactPhone);
  return (
    resolvePoliceContactPhone(user) === normalizedPhone ||
    user.legacyAccountIdentities.some(
      (identity) =>
        identity.kind === LEGACY_CONTACT_PHONE_KIND &&
        identity.normalizedValue === normalizedPhone
    )
  );
}

export async function getPreferredPoliceUsername(
  userId: number,
  currentUsername: string,
  db: IdentityDatabase = prisma
) {
  try {
    const identity = await db.legacyAccountIdentity.findFirst({
      where: { userId, kind: LEGACY_USERNAME_KIND },
      orderBy: { id: "asc" },
      select: { value: true },
    });
    return identity?.value ?? currentUsername;
  } catch (error) {
    if (!isMissingLegacyIdentityTableError(error)) throw error;
    return currentUsername;
  }
}

export async function findLegacyIdentityUserIdsBySearch(search: string): Promise<number[]> {
  const normalizedPhone = normalizePoliceContactPhone(search);
  try {
    const identities = await prisma.legacyAccountIdentity.findMany({
      where: {
        OR: [
          { value: { contains: search, mode: "insensitive" } },
          ...(normalizedPhone ? [{ normalizedValue: { contains: normalizedPhone } }] : []),
        ],
      },
      distinct: ["userId"],
      select: { userId: true },
      take: 200,
    });
    return identities.map((identity) => identity.userId);
  } catch (error) {
    if (!isMissingLegacyIdentityTableError(error)) throw error;
    return [];
  }
}

export async function getLegacyIdentitySummaries(
  userIds: number[]
): Promise<LegacyIdentitySummary[]> {
  if (userIds.length === 0) return [];
  try {
    return await prisma.legacyAccountIdentity.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ userId: "asc" }, { id: "asc" }],
      select: {
        userId: true,
        kind: true,
        value: true,
        normalizedValue: true,
      },
    });
  } catch (error) {
    if (!isMissingLegacyIdentityTableError(error)) throw error;
    return [];
  }
}

export async function countLegacyIdentityUsers(kind: string): Promise<number> {
  try {
    const identities = await prisma.legacyAccountIdentity.findMany({
      where: { kind },
      distinct: ["userId"],
      select: { userId: true },
    });
    return identities.length;
  } catch (error) {
    if (!isMissingLegacyIdentityTableError(error)) throw error;
    return 0;
  }
}
