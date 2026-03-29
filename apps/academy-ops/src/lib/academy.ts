import { AdminRole } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";

export const ACTIVE_ACADEMY_COOKIE_NAME = "activeAcademyId";
export const ALL_ACADEMIES_COOKIE_VALUE = "all";

const ACADEMY_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  hostname: true,
  themeColor: true,
  isActive: true,
} as const;

type AdminAcademyUser = Pick<{ role: AdminRole; academyId: number | null }, "role" | "academyId">;

export function isSuperAdminRole(role: AdminRole) {
  return role === AdminRole.SUPER_ADMIN;
}

export function parseActiveAcademyCookieValue(value: string | undefined) {
  if (!value || value === ALL_ACADEMIES_COOKIE_VALUE) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * 현재 요청의 hostname으로부터 Academy를 결정합니다.
 * Academy.hostname 필드와 매칭하며, 매칭되지 않으면 첫 번째 활성 학원을 반환합니다.
 */
export async function resolveAcademyByHostname(): Promise<number | null> {
  const host = headers().get("host") ?? headers().get("x-forwarded-host");

  if (!host) {
    return getFirstActiveAcademyId();
  }

  // 포트 번호 제거 (localhost:3000 → localhost)
  const hostname = host.split(":")[0].toLowerCase();

  // localhost/개발환경이면 첫 번째 활성 학원 반환
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return getFirstActiveAcademyId();
  }

  const academy = await getPrisma().academy.findFirst({
    where: { hostname, isActive: true },
    select: { id: true },
  });

  if (academy) {
    return academy.id;
  }

  // hostname 매칭 실패 시 첫 번째 활성 학원 반환
  return getFirstActiveAcademyId();
}

async function getFirstActiveAcademyId(): Promise<number | null> {
  const first = await getPrisma().academy.findFirst({
    where: { isActive: true },
    orderBy: [{ id: "asc" }],
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function listActiveAcademies() {
  return getPrisma().academy.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: ACADEMY_SELECT,
  });
}

export async function getAcademyById(id: number) {
  return getPrisma().academy.findUnique({
    where: { id },
    select: ACADEMY_SELECT,
  });
}

export async function resolveActiveAcademyIdForAdmin(adminUser: AdminAcademyUser) {
  if (!isSuperAdminRole(adminUser.role)) {
    const academyId = adminUser.academyId ?? (await resolveAcademyByHostname());
    if (academyId === null) return null;
    const academy = await getAcademyById(academyId);
    return academy?.isActive ? academy.id : null;
  }

  const cookieValue = cookies().get(ACTIVE_ACADEMY_COOKIE_NAME)?.value;
  const selectedAcademyId = parseActiveAcademyCookieValue(cookieValue);

  if (selectedAcademyId === null) {
    return null;
  }

  const academy = await getAcademyById(selectedAcademyId);
  if (academy?.isActive) {
    return academy.id;
  }

  return resolveAcademyByHostname();
}

export async function listAccessibleAcademiesForAdmin(adminUser: AdminAcademyUser) {
  if (isSuperAdminRole(adminUser.role)) {
    return listActiveAcademies();
  }

  const academyId = adminUser.academyId ?? (await resolveAcademyByHostname());
  if (academyId === null) return [];
  const academy = await getAcademyById(academyId);
  return academy?.isActive ? [academy] : [];
}

export function getAcademyLabel(academy: Pick<{ name: string }, "name"> | null | undefined) {
  return academy?.name?.trim() || "기본 지점";
}

/**
 * hostname 기반으로 현재 학원의 브랜딩 정보를 가져옵니다.
 */
export async function getAcademyBranding() {
  const academyId = await resolveAcademyByHostname();
  if (academyId === null) {
    return { name: "학원 관리시스템", themeColor: "#C55A11" };
  }

  const academy = await getAcademyById(academyId);
  return {
    name: academy?.name ?? "학원 관리시스템",
    themeColor: academy?.themeColor ?? "#C55A11",
  };
}
