import { ExamType } from "@prisma/client";
import type { TenantType } from "@/lib/tenant";

export const POLICE_EXAM_TYPES = [ExamType.PUBLIC, ExamType.CAREER] as const;
export type PoliceExamType = (typeof POLICE_EXAM_TYPES)[number];

export const FIRE_EXAM_TYPES = [
  ExamType.PUBLIC,
  ExamType.CAREER_RESCUE,
  ExamType.CAREER_ACADEMIC,
  ExamType.CAREER_EMT,
] as const;
export type FireExamType = (typeof FIRE_EXAM_TYPES)[number];

export const TENANT_EXAM_TYPES: Record<TenantType, readonly ExamType[]> = {
  police: POLICE_EXAM_TYPES,
  fire: FIRE_EXAM_TYPES,
};

const SUBJECT_ORDER_BY_TENANT: Record<
  TenantType,
  Partial<Record<ExamType, readonly string[]>>
> = {
  police: {
    [ExamType.PUBLIC]: ["헌법", "형사법", "경찰학"],
    [ExamType.CAREER]: ["범죄학", "형사법", "경찰학"],
  },
  fire: {
    [ExamType.PUBLIC]: ["소방학개론", "소방관계법규", "행정법총론"],
    [ExamType.CAREER_RESCUE]: ["소방학개론", "소방관계법규"],
    [ExamType.CAREER_ACADEMIC]: ["소방학개론", "소방관계법규"],
    [ExamType.CAREER_EMT]: ["소방학개론", "응급처치학개론"],
  },
};

export function isExamTypeForTenant(
  tenantType: TenantType,
  value: unknown
): value is ExamType {
  return TENANT_EXAM_TYPES[tenantType].includes(value as ExamType);
}

export function isPoliceExamType(value: unknown): value is PoliceExamType {
  return POLICE_EXAM_TYPES.includes(value as PoliceExamType);
}

export function isFireExamType(value: unknown): value is FireExamType {
  return FIRE_EXAM_TYPES.includes(value as FireExamType);
}

export function assertExamTypeForTenant(
  tenantType: TenantType,
  value: unknown
): asserts value is ExamType {
  if (!isExamTypeForTenant(tenantType, value)) {
    throw new Error(
      `${tenantType === "police" ? "경찰" : "소방"} 서비스에서 사용할 수 없는 채용유형입니다.`
    );
  }
}

export function getTenantSubjectOrder(
  tenantType: TenantType,
  examType: ExamType
): readonly string[] {
  return SUBJECT_ORDER_BY_TENANT[tenantType][examType] ?? [];
}

export function isCareerExamTypeForTenant(
  tenantType: TenantType,
  examType: ExamType
): boolean {
  return tenantType === "police"
    ? examType === ExamType.CAREER
    : examType === ExamType.CAREER_RESCUE ||
        examType === ExamType.CAREER_ACADEMIC ||
        examType === ExamType.CAREER_EMT;
}

export function getTenantExamTypeErrorMessage(tenantType: TenantType): string {
  return tenantType === "police"
    ? "채용유형은 PUBLIC 또는 CAREER만 가능합니다."
    : "채용유형은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT만 가능합니다.";
}
