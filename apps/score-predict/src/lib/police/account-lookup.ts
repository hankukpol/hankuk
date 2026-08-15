import "server-only";

import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password-auth.server";
import {
  formatPoliceContactPhone,
  isValidPoliceContactPhone,
  resolvePoliceContactPhone,
} from "@/lib/police/contact-phone";
import { normalizeContactPhone } from "@/lib/police/validations";
import {
  findPoliceUsersByContactPhone,
  getPreferredPoliceUsername,
  userOwnsPoliceContactPhone,
} from "@/lib/police/account-identity";

export function normalizeAccountLookupName(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeAccountLookupPhone(value: string): string {
  return normalizeContactPhone(value).replace(/\D/g, "");
}

export function isValidAccountLookupInput(name: string, contactPhone: string): boolean {
  return /^[가-힣]{2,20}$/.test(normalizeAccountLookupName(name)) && isValidPoliceContactPhone(contactPhone);
}

export async function findAccountsForLookup(name: string, contactPhone: string) {
  const normalizedName = normalizeAccountLookupName(name);
  const normalizedPhone = normalizeAccountLookupPhone(contactPhone);
  const candidates = await findPoliceUsersByContactPhone(normalizedPhone);

  return candidates.filter(
    (candidate) =>
      normalizeAccountLookupName(candidate.name) === normalizedName &&
      userOwnsPoliceContactPhone(candidate, normalizedPhone)
  );
}

type LegacyContactRegistrationResult =
  | { status: "success"; username: string }
  | { status: "contact_exists" }
  | { status: "ambiguous" }
  | { status: "not_found" };

/**
 * 연락처를 수집하기 전에 가입한 경찰 회원의 본인 확인용 흐름이다.
 * 이름만으로는 계정을 연결하지 않고, 저장된 비밀번호까지 일치하는 계정이
 * 정확히 하나일 때만 새 연락처를 등록한다.
 */
export async function registerLegacyAccountContact(params: {
  name: string;
  contactPhone: string;
  password: string;
}): Promise<LegacyContactRegistrationResult> {
  const normalizedName = normalizeAccountLookupName(params.name);
  const normalizedPhone = normalizeAccountLookupPhone(params.contactPhone);
  const legacyCandidates = await prisma.user.findMany({
    where: { contactPhone: "" },
    select: {
      id: true,
      name: true,
      phone: true,
      contactPhone: true,
      password: true,
    },
  });
  const sameNameCandidates = legacyCandidates.filter(
    (candidate) =>
      normalizeAccountLookupName(candidate.name) === normalizedName &&
      resolvePoliceContactPhone(candidate) === ""
  );

  const verifiedCandidates = (
    await Promise.all(
      sameNameCandidates.map(async (candidate) => ({
        candidate,
        verification: await verifyPassword(params.password, candidate.password),
      }))
    )
  ).filter((result) => result.verification.valid);

  if (verifiedCandidates.length === 0) return { status: "not_found" };
  if (verifiedCandidates.length > 1) return { status: "ambiguous" };

  const { candidate, verification } = verifiedCandidates[0];
  const upgradedPassword = verification.needsUpgrade
    ? await hashPassword(params.password)
    : null;
  const [knownContactOwners, preferredUsername] = await Promise.all([
    findPoliceUsersByContactPhone(normalizedPhone),
    getPreferredPoliceUsername(candidate.id, candidate.phone),
  ]);

  return prisma.$transaction(async (tx) => {
    // 같은 연락처를 동시에 등록하는 요청도 한 계정에만 반영되도록 직렬화한다.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedPhone}))`;

    const currentConflict = await tx.user.findFirst({
      where: {
        id: { not: candidate.id },
        OR: [
          { contactPhone: normalizedPhone },
          { contactPhone: formatPoliceContactPhone(normalizedPhone) },
          { phone: normalizedPhone },
          { phone: formatPoliceContactPhone(normalizedPhone) },
        ],
      },
      select: { id: true },
    });
    if (
      currentConflict ||
      knownContactOwners.some((conflict) => conflict.id !== candidate.id)
    ) {
      return { status: "contact_exists" } as const;
    }

    const current = await tx.user.findUnique({
      where: { id: candidate.id },
      select: { phone: true, contactPhone: true },
    });
    if (!current) return { status: "not_found" } as const;

    const currentContact = resolvePoliceContactPhone(current);
    if (currentContact) {
      return currentContact === normalizedPhone
        ? ({
            status: "success",
            username: preferredUsername,
          } as const)
        : ({ status: "ambiguous" } as const);
    }

    await tx.user.update({
      where: { id: candidate.id },
      data: {
        contactPhone: normalizedPhone,
        ...(upgradedPassword
          ? { password: upgradedPassword, credentialVersion: { increment: 1 } }
          : {}),
      },
    });

    return {
      status: "success",
      username: preferredUsername,
    } as const;
  });
}
