import { AbsenceCategory } from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

export type AbsencePolicyInput = {
  name: string;
  absenceCategory: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

function normalizeAbsencePolicyInput(input: AbsencePolicyInput) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("정책 이름을 입력하세요.");
  }

  if (input.absenceCategory === AbsenceCategory.MILITARY) {
    return {
      name,
      absenceCategory: input.absenceCategory,
      attendCountsAsAttendance: true,
      attendGrantsPerfectAttendance: true,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  const attendGrantsPerfectAttendance = Boolean(input.attendGrantsPerfectAttendance);
  const attendCountsAsAttendance = Boolean(
    input.attendCountsAsAttendance || attendGrantsPerfectAttendance,
  );

  return {
    name,
    absenceCategory: input.absenceCategory,
    attendCountsAsAttendance,
    attendGrantsPerfectAttendance,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}

async function ensureUniquePolicyName(input: {
  name: string;
  absenceCategory: AbsenceCategory;
  excludeId?: number;
}) {
  const existing = await getPrisma().absencePolicy.findFirst({
    where: {
      name: input.name,
      absenceCategory: input.absenceCategory,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new Error("같은 사유 유형에 동일한 정책 이름이 이미 있습니다.");
  }
}

export async function listAbsencePolicies(options?: { activeOnly?: boolean }) {
  return getPrisma().absencePolicy.findMany({
    where: options?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

export async function createAbsencePolicy(input: {
  adminId: string;
  payload: AbsencePolicyInput;
  ipAddress?: string | null;
}) {
  const payload = normalizeAbsencePolicyInput(input.payload);
  await ensureUniquePolicyName({
    name: payload.name,
    absenceCategory: payload.absenceCategory,
  });

  const policy = await getPrisma().absencePolicy.create({
    data: payload,
  });

  await getPrisma().auditLog.create({
    data: {
      adminId: input.adminId,
      action: "ABSENCE_POLICY_CREATE",
      targetType: "AbsencePolicy",
      targetId: String(policy.id),
      before: toAuditJson(null),
      after: toAuditJson(policy),
      ipAddress: input.ipAddress ?? null,
    },
  });

  return policy;
}

export async function updateAbsencePolicy(input: {
  adminId: string;
  policyId: number;
  payload: AbsencePolicyInput;
  ipAddress?: string | null;
}) {
  const payload = normalizeAbsencePolicyInput(input.payload);
  await ensureUniquePolicyName({
    name: payload.name,
    absenceCategory: payload.absenceCategory,
    excludeId: input.policyId,
  });

  const before = await getPrisma().absencePolicy.findUniqueOrThrow({
    where: {
      id: input.policyId,
    },
  });

  const policy = await getPrisma().absencePolicy.update({
    where: {
      id: input.policyId,
    },
    data: payload,
  });

  await getPrisma().auditLog.create({
    data: {
      adminId: input.adminId,
      action: "ABSENCE_POLICY_UPDATE",
      targetType: "AbsencePolicy",
      targetId: String(policy.id),
      before: toAuditJson(before),
      after: toAuditJson(policy),
      ipAddress: input.ipAddress ?? null,
    },
  });

  return policy;
}

export async function deleteAbsencePolicy(input: {
  adminId: string;
  policyId: number;
  ipAddress?: string | null;
}) {
  const before = await getPrisma().absencePolicy.findUniqueOrThrow({
    where: {
      id: input.policyId,
    },
  });

  await getPrisma().absencePolicy.delete({
    where: {
      id: input.policyId,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      adminId: input.adminId,
      action: "ABSENCE_POLICY_DELETE",
      targetType: "AbsencePolicy",
      targetId: String(input.policyId),
      before: toAuditJson(before),
      after: toAuditJson(null),
      ipAddress: input.ipAddress ?? null,
    },
  });

  return { id: input.policyId };
}