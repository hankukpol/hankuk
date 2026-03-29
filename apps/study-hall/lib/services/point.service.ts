import { cache } from "react";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { parseUtcDateFromYmd } from "@/lib/date-utils";
import { badRequest, notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockPointRecordRecord,
  type MockPointRuleRecord,
} from "@/lib/mock-store";
import { getPointCategoryLabel, type PointCategoryValue } from "@/lib/point-meta";
import {
  getPrismaClient,
  normalizeOptionalText,
} from "@/lib/service-helpers";
import { getWarningStage, getWarningStageLabel } from "@/lib/student-meta";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listStudents, type StudentListItem } from "@/lib/services/student.service";

type PointActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

export type PointRuleItem = {
  id: string;
  divisionId: string;
  category: PointCategoryValue;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PointRuleInput = {
  category: PointCategoryValue;
  name: string;
  points: number;
  description?: string | null;
  isActive?: boolean;
};

export type PointRecordItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  ruleId: string | null;
  ruleName: string | null;
  category: PointCategoryValue;
  categoryLabel: string;
  points: number;
  notes: string | null;
  recordedById: string;
  recordedByName: string;
  createdAt: string;
  date: string;
};

export type PointGrantInput = {
  studentId: string;
  ruleId?: string | null;
  points?: number | null;
  notes?: string | null;
  date?: string | null;
};

export type PointBatchGrantInput = {
  studentIds: string[];
  ruleId?: string | null;
  points?: number | null;
  notes?: string | null;
  date: string;
};

export type PointBatchGrantResult = {
  createdCount: number;
  date: string;
  points: number;
};

export type WarningStudentItem = StudentListItem & {
  warningStageLabel: string;
};

function normalizeText(value: string) {
  return value.trim();
}

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "상벌점 날짜");
}

function getPointRecordDateValue(date?: string | null) {
  return date ? parseDateString(date) : new Date();
}

function toUtcRange(dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? parseDateString(dateFrom) : null;
  const to = dateTo ? parseDateString(dateTo) : null;

  if (to) {
    to.setUTCDate(to.getUTCDate() + 1);
  }

  return { from, to };
}

function normalizeStudentIds(studentIds: string[]) {
  return Array.from(new Set(studentIds.map((studentId) => studentId.trim()).filter(Boolean)));
}

function assertGrantableStudentStatus(status: string) {
  if (status !== "ACTIVE" && status !== "ON_LEAVE") {
    throw badRequest("재원 또는 일시중단 학생에게만 상벌점을 부여할 수 있습니다.");
  }
}

function toPointRuleItem(rule: {
  id: string;
  divisionId: string;
  category: PointCategoryValue;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
}) {
  return {
    id: rule.id,
    divisionId: rule.divisionId,
    category: rule.category,
    name: rule.name,
    points: rule.points,
    description: rule.description,
    isActive: rule.isActive,
    displayOrder: rule.displayOrder,
    createdAt: typeof rule.createdAt === "string" ? rule.createdAt : rule.createdAt.toISOString(),
    updatedAt:
      typeof rule.updatedAt === "string"
        ? rule.updatedAt
        : rule.updatedAt instanceof Date
          ? rule.updatedAt.toISOString()
          : typeof rule.createdAt === "string"
            ? rule.createdAt
            : rule.createdAt.toISOString(),
  } satisfies PointRuleItem;
}

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
});

async function getMockRuleMap(divisionSlug: string) {
  const state = await readMockState();
  return new Map((state.pointRulesByDivision[divisionSlug] ?? []).map((rule) => [rule.id, rule]));
}

function serializePointRecordFromMock(
  record: MockPointRecordRecord,
  students: Map<string, StudentListItem>,
  rules: Map<string, MockPointRuleRecord>,
  divisionSlug: string,
) {
  const student = students.get(record.studentId);

  if (!student) {
    return null;
  }

  const rule = record.ruleId ? rules.get(record.ruleId) ?? null : null;

  return {
    id: record.id,
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.studentNumber,
    ruleId: record.ruleId,
    ruleName: rule?.name ?? null,
    category: rule?.category ?? "OTHER",
    categoryLabel: getPointCategoryLabel(rule?.category ?? "OTHER"),
    points: record.points,
    notes: record.notes,
    recordedById: record.recordedById,
    recordedByName: getMockAdminSession(divisionSlug).name,
    createdAt: record.createdAt,
    date: record.date,
  } satisfies PointRecordItem;
}

function resolvePointsValue(
  input: {
    ruleId?: string | null;
    points?: number | null;
  },
  rule: { points: number } | null,
) {
  const points = rule?.points ?? input.points;

  if (typeof points !== "number" || Number.isNaN(points)) {
    throw badRequest("점수를 확인해주세요.");
  }

  return points;
}

function normalizeRulePoints(category: PointCategoryValue, points: number) {
  if (category === "OTHER") {
    return points;
  }

  return points > 0 ? -Math.abs(points) : points;
}

export async function listPointRules(divisionSlug: string, options?: { activeOnly?: boolean }) {
  if (isMockMode()) {
    const state = await readMockState();
    let rules = [...(state.pointRulesByDivision[divisionSlug] ?? [])]
      .sort((left, right) => left.displayOrder - right.displayOrder);
    if (options?.activeOnly) {
      rules = rules.filter((rule) => rule.isActive);
    }
    return rules.map((rule) => toPointRuleItem(rule));
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const rules = await prisma.pointRule.findMany({
    where: {
      divisionId: division.id,
      ...(options?.activeOnly ? { isActive: true } : {}),
    },
    orderBy: {
      displayOrder: "asc",
    },
  });

  return rules.map((rule) => toPointRuleItem(rule));
}

export async function createPointRule(divisionSlug: string, input: PointRuleInput) {
  const name = normalizeText(input.name);
  const description = normalizeOptionalText(input.description);
  const normalizedPoints = normalizeRulePoints(input.category, input.points);

  if (isMockMode()) {
    const rule = await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const current = state.pointRulesByDivision[divisionSlug] ?? [];
      const now = new Date().toISOString();
      const nextRule: MockPointRuleRecord = {
        id: `mock-point-rule-${divisionSlug}-${Date.now()}`,
        divisionId: division.id,
        category: input.category,
        name,
        points: normalizedPoints,
        description,
        isActive: input.isActive ?? true,
        displayOrder: current.length,
        createdAt: now,
        updatedAt: now,
      };

      state.pointRulesByDivision[divisionSlug] = [...current, nextRule];
      return nextRule;
    });
    return toPointRuleItem(rule);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const count = await prisma.pointRule.count({
    where: {
      divisionId: division.id,
    },
  });

  const rule = await prisma.pointRule.create({
    data: {
      divisionId: division.id,
      category: input.category,
      name,
      points: normalizedPoints,
      description,
      isActive: input.isActive ?? true,
      displayOrder: count,
    },
  });

  return toPointRuleItem(rule);
}

export async function updatePointRule(
  divisionSlug: string,
  ruleId: string,
  input: Partial<PointRuleInput>,
) {
  if (isMockMode()) {
    const updated = await updateMockState((state) => {
      const current = state.pointRulesByDivision[divisionSlug] ?? [];
      const target = current.find((rule) => rule.id === ruleId);

      if (!target) {
        throw notFound("상벌점 규칙을 찾을 수 없습니다.");
      }

      const nextCategory = input.category ?? target.category;
      const nextPoints = normalizeRulePoints(nextCategory, input.points ?? target.points);

      state.pointRulesByDivision[divisionSlug] = current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              category: nextCategory,
              name: input.name ? normalizeText(input.name) : rule.name,
              points: nextPoints,
              description:
                input.description === undefined
                  ? rule.description
                  : normalizeOptionalText(input.description),
              isActive: input.isActive ?? rule.isActive,
              updatedAt: new Date().toISOString(),
            }
          : rule,
      );

      const next = state.pointRulesByDivision[divisionSlug].find((rule) => rule.id === ruleId);

      if (!next) {
        throw notFound("상벌점 규칙을 찾을 수 없습니다.");
      }

      return next;
    });
    return toPointRuleItem(updated);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const rule = await prisma.pointRule.findFirst({
    where: {
      id: ruleId,
      divisionId: division.id,
    },
  });

  if (!rule) {
    throw notFound("상벌점 규칙을 찾을 수 없습니다.");
  }

  const nextCategory = input.category ?? rule.category;
  const nextPoints =
    input.points === undefined ? undefined : normalizeRulePoints(nextCategory, input.points);

  const updated = await prisma.pointRule.update({
    where: {
      id: ruleId,
    },
    data: {
      category: input.category ?? undefined,
      name: input.name ? normalizeText(input.name) : undefined,
      points: nextPoints,
      description:
        input.description === undefined ? undefined : normalizeOptionalText(input.description),
      isActive: input.isActive ?? undefined,
    },
  });

  return toPointRuleItem(updated);
}

export async function deletePointRule(divisionSlug: string, ruleId: string) {
  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.pointRulesByDivision[divisionSlug] ?? [];

      if (!current.some((rule) => rule.id === ruleId)) {
        throw notFound("상벌점 규칙을 찾을 수 없습니다.");
      }

      state.pointRulesByDivision[divisionSlug] = current.filter((rule) => rule.id !== ruleId);
      state.pointRecordsByDivision[divisionSlug] = (state.pointRecordsByDivision[divisionSlug] ?? []).map(
        (record) =>
          record.ruleId === ruleId
            ? {
                ...record,
                ruleId: null,
              }
            : record,
      );
    });
    return true;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const rule = await prisma.pointRule.findFirst({
    where: {
      id: ruleId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!rule) {
    throw notFound("상벌점 규칙을 찾을 수 없습니다.");
  }

  // 이 규칙으로 부여된 상벌점 기록이 존재하면 삭제 차단 (기록에서 규칙 참조 유실 방지)
  const recordCount = await prisma.pointRecord.count({
    where: { ruleId },
  });
  if (recordCount > 0) {
    throw new Error(
      `이 규칙으로 부여된 상벌점 기록이 ${recordCount}건 존재합니다. 규칙을 삭제하면 기록의 사유가 유실됩니다. 대신 비활성화해 주세요.`,
    );
  }

  await prisma.pointRule.delete({
    where: {
      id: ruleId,
    },
  });

  return true;
}

export async function listPointRecords(
  divisionSlug: string,
  options?: {
    studentId?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  if (isMockMode()) {
    const students = await listStudents(divisionSlug);
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const [state, rules] = await Promise.all([readMockState(), getMockRuleMap(divisionSlug)]);
    const filtered = (state.pointRecordsByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .filter((record) => !options?.dateFrom || record.date.slice(0, 10) >= options.dateFrom)
      .filter((record) => !options?.dateTo || record.date.slice(0, 10) <= options.dateTo)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

    const records = filtered
      .map((record) => serializePointRecordFromMock(record, studentMap, rules, divisionSlug))
      .filter(Boolean) as PointRecordItem[];

    return options?.limit ? records.slice(0, options.limit) : records;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const { from, to } = toUtcRange(options?.dateFrom, options?.dateTo);
  const records = await prisma.pointRecord.findMany({
    where: {
      student: {
        divisionId: division.id,
      },
      ...(options?.studentId ? { studentId: options.studentId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: to } : {}),
            },
          }
        : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentNumber: true,
        },
      },
      rule: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      recordedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      date: "desc",
    },
    take: options?.limit,
  });

  return records.map((record) => ({
    id: record.id,
    studentId: record.student.id,
    studentName: record.student.name,
    studentNumber: record.student.studentNumber,
    ruleId: record.ruleId,
    ruleName: record.rule?.name ?? null,
    category: record.rule?.category ?? "OTHER",
    categoryLabel: getPointCategoryLabel(record.rule?.category ?? "OTHER"),
    points: record.points,
    notes: record.notes,
    recordedById: record.recordedBy.id,
    recordedByName: record.recordedBy.name,
    createdAt: record.createdAt.toISOString(),
    date: record.date.toISOString(),
  })) satisfies PointRecordItem[];
}

export async function createPointRecord(
  divisionSlug: string,
  actor: PointActor,
  input: PointGrantInput,
) {
  const notes = normalizeOptionalText(input.notes);
  const recordDate = getPointRecordDateValue(input.date);

  if (isMockMode()) {
    const record = await updateMockState((state) => {
      const students = state.studentsByDivision[divisionSlug] ?? [];
      const student = students.find((item) => item.id === input.studentId);

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      assertGrantableStudentStatus(student.status);

      const rule = input.ruleId
        ? (state.pointRulesByDivision[divisionSlug] ?? []).find((item) => item.id === input.ruleId) ?? null
        : null;

      if (input.ruleId && !rule) {
        throw notFound("상벌점 규칙을 찾을 수 없습니다.");
      }

      const points = resolvePointsValue(input, rule);
      const nextRecord: MockPointRecordRecord = {
        id: `mock-point-record-${divisionSlug}-${Date.now()}`,
        studentId: student.id,
        ruleId: rule?.id ?? null,
        points,
        date: recordDate.toISOString(),
        notes,
        recordedById: actor.id,
        createdAt: new Date().toISOString(),
      };

      state.pointRecordsByDivision[divisionSlug] = [
        nextRecord,
        ...(state.pointRecordsByDivision[divisionSlug] ?? []),
      ];

      return nextRecord;
    });
    const students = await listStudents(divisionSlug);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const rules = await getMockRuleMap(divisionSlug);
    return serializePointRecordFromMock(record, studentMap, rules, divisionSlug);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: input.studentId,
      divisionId: division.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  assertGrantableStudentStatus(student.status);

  const rule = input.ruleId
    ? await prisma.pointRule.findFirst({
        where: {
          id: input.ruleId,
          divisionId: division.id,
        },
        select: {
          id: true,
          points: true,
        },
      })
    : null;

  if (input.ruleId && !rule) {
    throw notFound("상벌점 규칙을 찾을 수 없습니다.");
  }

  const points = resolvePointsValue(input, rule);
  const record = await prisma.pointRecord.create({
    data: {
      studentId: student.id,
      ruleId: rule?.id ?? null,
      points,
      notes,
      date: recordDate,
      recordedById: actor.id,
    },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      rule: { select: { id: true, name: true, category: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });

  return {
    id: record.id,
    studentId: record.student.id,
    studentName: record.student.name,
    studentNumber: record.student.studentNumber,
    ruleId: record.ruleId,
    ruleName: record.rule?.name ?? null,
    category: record.rule?.category ?? "OTHER",
    categoryLabel: getPointCategoryLabel(record.rule?.category ?? "OTHER"),
    points: record.points,
    notes: record.notes,
    recordedById: record.recordedBy.id,
    recordedByName: record.recordedBy.name,
    createdAt: record.createdAt.toISOString(),
    date: record.date.toISOString(),
  } satisfies PointRecordItem;
}

export async function createPointRecordsBatch(
  divisionSlug: string,
  actor: PointActor,
  input: PointBatchGrantInput,
) {
  const notes = normalizeOptionalText(input.notes);
  const studentIds = normalizeStudentIds(input.studentIds);

  if (studentIds.length === 0) {
    throw badRequest("대상 학생을 한 명 이상 선택해주세요.");
  }

  const recordDate = parseDateString(input.date);

  if (isMockMode()) {
    const result = await updateMockState((state) => {
      const students = state.studentsByDivision[divisionSlug] ?? [];
      const selectedStudents = students.filter((student) => studentIds.includes(student.id));

      if (selectedStudents.length !== studentIds.length) {
        throw notFound("선택한 학생 정보를 모두 찾을 수 없습니다.");
      }

      selectedStudents.forEach((student) => assertGrantableStudentStatus(student.status));

      const rule = input.ruleId
        ? (state.pointRulesByDivision[divisionSlug] ?? []).find((item) => item.id === input.ruleId) ?? null
        : null;

      if (input.ruleId && !rule) {
        throw notFound("상벌점 규칙을 찾을 수 없습니다.");
      }

      const points = resolvePointsValue(input, rule);
      const now = new Date().toISOString();
      const records = selectedStudents.map(
        (student, index) =>
          ({
            id: `mock-point-record-${divisionSlug}-${Date.now()}-${index}`,
            studentId: student.id,
            ruleId: rule?.id ?? null,
            points,
            date: recordDate.toISOString(),
            notes,
            recordedById: actor.id,
            createdAt: now,
          }) satisfies MockPointRecordRecord,
      );

      state.pointRecordsByDivision[divisionSlug] = [
        ...records,
        ...(state.pointRecordsByDivision[divisionSlug] ?? []),
      ];

      return {
        createdCount: records.length,
        date: input.date,
        points,
      } satisfies PointBatchGrantResult;
    });
    return result;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const students = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      divisionId: division.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (students.length !== studentIds.length) {
    throw notFound("선택한 학생 정보를 일부 찾을 수 없습니다.");
  }

  students.forEach((student) => assertGrantableStudentStatus(student.status));

  const rule = input.ruleId
    ? await prisma.pointRule.findFirst({
        where: {
          id: input.ruleId,
          divisionId: division.id,
        },
        select: {
          id: true,
          points: true,
        },
      })
    : null;

  if (input.ruleId && !rule) {
    throw notFound("상벌점 규칙을 찾을 수 없습니다.");
  }

  const points = resolvePointsValue(input, rule);
  await prisma.pointRecord.createMany({
    data: students.map((student) => ({
      studentId: student.id,
      ruleId: rule?.id ?? null,
      points,
      notes,
      date: recordDate,
      recordedById: actor.id,
    })),
  });

  return {
    createdCount: students.length,
    date: input.date,
    points,
  } satisfies PointBatchGrantResult;
}

export async function deletePointRecord(divisionSlug: string, recordId: string) {
  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.pointRecordsByDivision[divisionSlug] ?? [];

      if (!current.some((record) => record.id === recordId)) {
        throw notFound("상벌점 기록을 찾을 수 없습니다.");
      }

      state.pointRecordsByDivision[divisionSlug] = current.filter((record) => record.id !== recordId);
    });
    return true;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const record = await prisma.pointRecord.findFirst({
    where: {
      id: recordId,
      student: {
        divisionId: division.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (!record) {
    throw notFound("상벌점 기록을 찾을 수 없습니다.");
  }

  await prisma.pointRecord.delete({
    where: {
      id: recordId,
    },
  });

  return true;
}

export async function listWarningStudents(divisionSlug: string) {
  const settings = await getDivisionSettings(divisionSlug);
  const students = await listStudents(divisionSlug);

  return students
    .filter(
      (student) =>
        (student.status === "ACTIVE" || student.status === "ON_LEAVE") &&
        student.netPoints >= settings.warnLevel1,
    )
    .sort((left, right) => right.netPoints - left.netPoints || left.name.localeCompare(right.name, "ko"))
    .map((student) => {
      const warningStage = getWarningStage(student.netPoints, settings);

      return {
        ...student,
        warningStage,
        warningStageLabel: getWarningStageLabel(warningStage),
      };
    }) satisfies WarningStudentItem[];
}
