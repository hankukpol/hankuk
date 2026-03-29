import { getCurrentAdminContext } from "@/lib/auth";

export type AdminAcademyScope = {
  academyId: number | null;
  activeAcademyId: number | null;
  isSuperAdmin: boolean;
};

export async function getAdminAcademyScope(): Promise<AdminAcademyScope> {
  const context = await getCurrentAdminContext();

  if (!context) {
    throw new Error("관리자 인증이 필요합니다.");
  }

  return {
    academyId: context.academyId ?? null,
    activeAcademyId: context.activeAcademyId,
    isSuperAdmin: context.isSuperAdmin,
  };
}

export function resolveAdminScopedAcademyId(scope: AdminAcademyScope) {
  if (scope.isSuperAdmin && scope.activeAcademyId === null) {
    return null;
  }

  return scope.activeAcademyId ?? scope.academyId ?? null;
}

export function requireAdminScopedAcademyId(scope: AdminAcademyScope) {
  const academyId = resolveAdminScopedAcademyId(scope);

  if (academyId === null) {
    throw new Error("전체 보기 상태에서는 지점을 먼저 선택해 주세요.");
  }

  return academyId;
}

export function resolveVisibleAcademyId(context: AdminAcademyScope) {
  return resolveAdminScopedAcademyId(context);
}

export function requireVisibleAcademyId(context: AdminAcademyScope) {
  const academyId = resolveVisibleAcademyId(context);

  if (academyId === null) {
    throw new Error("전체 보기 상태에서는 지점을 먼저 선택해 주세요.");
  }

  return academyId;
}

export function applyAcademyScope<T extends Record<string, unknown>>(
  where: T,
  academyId: number | null,
) {
  if (academyId === null) {
    return where;
  }

  return {
    ...where,
    academyId,
  };
}
