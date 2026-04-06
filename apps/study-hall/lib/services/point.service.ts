import { revalidatePath, revalidateTag } from "next/cache";
import { cache } from "react";
import { Prisma } from "@prisma/client";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { parseUtcDateFromYmd } from "@/lib/date-utils";
import { badRequest, notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockPointRecordRecord,
  type MockPointRuleRecord,
} from "@/lib/mock-store";
import { getPointCategoryLabel } from "@/lib/point-meta";
import {
  getPrismaClient,
  normalizeOptionalText,
} from "@/lib/service-helpers";
import { getPeriods } from "@/lib/services/period.service";
import { getWarningStage, getWarningStageLabel, toDemeritPoints } from "@/lib/student-meta";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listStudents, type StudentListItem } from "@/lib/services/student.service";

type PointActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

type LegacyPointCategoryDbValue =
  | "ATTENDANCE"
  | "BEHAVIOR"
  | "EXAM"
  | "LIFE"
  | "OTHER";

type PointRuleRow = {
  id: string;
  divisionId: string;
  category: string;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PointRuleItem = {
  id: string;
  divisionId: string;
  category: string;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PointRuleInput = {
  category: string;
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
  displayName: string | null;
  category: string;
  categoryLabel: string;
  points: number;
  notes: string | null;
  recordedById: string;
  recordedByName: string;
  createdAt: string;
  date: string;
  displayDateTime: string;
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

type PointDisplayContext = {
  perfectAttendanceEndTime: string | null;
};

const DAILY_PERFECT_ATTENDANCE_LABEL = "일일 개근 상점";
const DAILY_PERFECT_ATTENDANCE_NOTE_PREFIX = "[자동] 개근 상점 (";

function normalizeText(value: string) {
  return value.trim();
}

function normalizeCategoryName(value: string) {
  return value.trim();
}

function normalizeCategoryKey(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function isSameCategoryName(left: string, right: string) {
  return normalizeCategoryKey(left) === normalizeCategoryKey(right);
}

function toLegacyPointCategoryLabel(category: string | null | undefined) {
  switch ((category ?? "").trim()) {
    case "ATTENDANCE":
      return "출결";
    case "BEHAVIOR":
      return "생활";
    case "EXAM":
      return "시험";
    case "LIFE":
      return "자습";
    case "OTHER":
      return "기타";
    default:
      return category?.trim() || "기타";
  }
}

function toLegacyPointCategoryDbValue(category: string): LegacyPointCategoryDbValue | null {
  if (isSameCategoryName(category, "출결")) {
    return "ATTENDANCE";
  }

  if (isSameCategoryName(category, "생활")) {
    return "BEHAVIOR";
  }

  if (isSameCategoryName(category, "시험")) {
    return "EXAM";
  }

  if (isSameCategoryName(category, "자습")) {
    return "LIFE";
  }

  if (isSameCategoryName(category, "기타")) {
    return "OTHER";
  }

  return null;
}

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "상벌점 날짜");
}

function getPointRecordDateValue(date?: string | null) {
  return date ? parseDateString(date) : new Date();
}

function isDailyPerfectAttendanceRecord(record: {
  ruleId: string | null;
  notes: string | null;
}) {
  return record.ruleId === null && Boolean(record.notes?.startsWith(DAILY_PERFECT_ATTENDANCE_NOTE_PREFIX));
}

function getLatestMandatoryPeriodEndTime(
  periods: Array<{
    endTime: string;
    isMandatory: boolean;
    isActive: boolean;
  }>,
) {
  return periods
    .filter((period) => period.isActive && period.isMandatory)
    .reduce<string | null>(
      (latest, period) => (!latest || period.endTime > latest ? period.endTime : latest),
      null,
    );
}

function getPointDisplayContext(
  periods: Array<{
    endTime: string;
    isMandatory: boolean;
    isActive: boolean;
  }>,
): PointDisplayContext {
  return {
    perfectAttendanceEndTime: getLatestMandatoryPeriodEndTime(periods),
  };
}

function buildKstDateTimeIso(dateValue: string | Date, time: string) {
  const dateKey = (typeof dateValue === "string" ? dateValue : dateValue.toISOString()).slice(0, 10);
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
}

function getPointRecordDisplayName(record: {
  ruleId: string | null;
  ruleName: string | null;
  notes: string | null;
}) {
  if (isDailyPerfectAttendanceRecord(record)) {
    return DAILY_PERFECT_ATTENDANCE_LABEL;
  }

  return record.ruleName;
}

function getPointRecordDisplayDateTime(
  record: {
    ruleId: string | null;
    notes: string | null;
    date: string | Date;
  },
  context: PointDisplayContext,
) {
  if (isDailyPerfectAttendanceRecord(record) && context.perfectAttendanceEndTime) {
    return buildKstDateTimeIso(record.date, context.perfectAttendanceEndTime);
  }

  return typeof record.date === "string" ? record.date : record.date.toISOString();
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
  category: string;
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
    category: toLegacyPointCategoryLabel(rule.category),
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

function isPointRuleCategoryCompatibilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('Error converting field "category"') ||
    (message.includes('expected non-nullable type "String"') && message.includes("category")) ||
    message.includes('invalid input value for enum "PointCategory"')
  );
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

async function getPointRuleCategoryMode() {
  if (isMockMode()) {
    return "text" as const;
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.$queryRaw<Array<{ dataType: string; udtName: string }>>`
    SELECT
      data_type AS "dataType",
      udt_name AS "udtName"
    FROM information_schema.columns
    WHERE table_name = 'point_rules'
      AND column_name = 'category'
    ORDER BY
      CASE WHEN table_schema = ANY(current_schemas(false)) THEN 0 ELSE 1 END,
      table_schema ASC
    LIMIT 1
  `;

  if (!rows[0]) {
    return "text" as const;
  }

  return rows[0].udtName === "text" ? ("text" as const) : ("legacy-enum" as const);
}

export async function supportsPointCategoryCustomization() {
  if (isMockMode()) {
    return true;
  }

  if ((await getPointRuleCategoryMode()) === "legacy-enum") {
    return false;
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'division_settings'
        AND column_name = 'point_categories'
        AND table_schema = ANY(current_schemas(false))
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function listLegacyPointRuleRows(
  divisionId: string,
  options?: { activeOnly?: boolean },
) {
  const prisma = await getPrismaClient();

  if (options?.activeOnly) {
    return prisma.$queryRaw<PointRuleRow[]>`
      SELECT
        id,
        division_id AS "divisionId",
        category::text AS category,
        name,
        points,
        description,
        is_active AS "isActive",
        display_order AS "displayOrder",
        created_at AS "createdAt",
        created_at AS "updatedAt"
      FROM study_hall.point_rules
      WHERE division_id = ${divisionId}
        AND is_active = true
      ORDER BY display_order ASC
    `;
  }

  return prisma.$queryRaw<PointRuleRow[]>`
    SELECT
      id,
      division_id AS "divisionId",
      category::text AS category,
      name,
      points,
      description,
      is_active AS "isActive",
      display_order AS "displayOrder",
      created_at AS "createdAt",
      created_at AS "updatedAt"
    FROM study_hall.point_rules
    WHERE division_id = ${divisionId}
    ORDER BY display_order ASC
  `;
}

async function getLegacyPointRuleRow(divisionId: string, ruleId: string) {
  const prisma = await getPrismaClient();
  const rows = await prisma.$queryRaw<PointRuleRow[]>`
    SELECT
      id,
      division_id AS "divisionId",
      category::text AS category,
      name,
      points,
      description,
      is_active AS "isActive",
      display_order AS "displayOrder",
      created_at AS "createdAt",
      created_at AS "updatedAt"
    FROM study_hall.point_rules
    WHERE division_id = ${divisionId}
      AND id = ${ruleId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getLegacyPointRuleCategoryMap(ruleIds: string[]) {
  if (ruleIds.length === 0) {
    return new Map<string, string>();
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.$queryRaw<Array<{ id: string; category: string }>>`
    SELECT
      id,
      category::text AS category
    FROM study_hall.point_rules
    WHERE id IN (${Prisma.join(ruleIds)})
  `;

  return new Map(rows.map((row) => [row.id, toLegacyPointCategoryLabel(row.category)]));
}

function assertLegacyPointCategorySupported(category: string) {
  const legacyValue = toLegacyPointCategoryDbValue(category);

  if (!legacyValue) {
    throw badRequest("현재 운영 DB에서는 기본 카테고리(출결, 생활, 시험, 자습, 기타)만 사용할 수 있습니다.");
  }

  return legacyValue;
}

async function getMockRuleMap(divisionSlug: string) {
  const state = await readMockState();
  return new Map((state.pointRulesByDivision[divisionSlug] ?? []).map((rule) => [rule.id, rule]));
}

function serializePointRecordFromMock(
  record: MockPointRecordRecord,
  students: Map<string, StudentListItem>,
  rules: Map<string, MockPointRuleRecord>,
  divisionSlug: string,
  displayContext: PointDisplayContext,
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
    ruleName: getPointRecordDisplayName({
      ruleId: record.ruleId,
      ruleName: rule?.name ?? null,
      notes: record.notes,
    }),
    displayName: getPointRecordDisplayName({
      ruleId: record.ruleId,
      ruleName: rule?.name ?? null,
      notes: record.notes,
    }),
    category: toLegacyPointCategoryLabel(rule?.category),
    categoryLabel: getPointCategoryLabel(toLegacyPointCategoryLabel(rule?.category)),
    points: record.points,
    notes: record.notes,
    recordedById: record.recordedById,
    recordedByName: getMockAdminSession(divisionSlug).name,
    createdAt: record.createdAt,
    date: getPointRecordDisplayDateTime(
      {
        ruleId: record.ruleId,
        notes: record.notes,
        date: record.date,
      },
      displayContext,
    ),
    displayDateTime: getPointRecordDisplayDateTime(
      {
        ruleId: record.ruleId,
        notes: record.notes,
        date: record.date,
      },
      displayContext,
    ),
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

function normalizeRulePoints(points: number) {
  return points;
}

function revalidatePointRulePaths(divisionSlug: string) {
  revalidateTag(`division-settings:${divisionSlug}`);
  revalidatePath(`/${divisionSlug}/admin/points`);
  revalidatePath(`/${divisionSlug}/admin/points/rules`);
}

export async function listPointCategories(divisionSlug: string) {
  const settings = await getDivisionSettings(divisionSlug);
  return settings.pointCategories;
}

async function assertPointCategoryExists(divisionSlug: string, category: string) {
  const normalizedCategory = normalizeCategoryName(category);
  const categories = await listPointCategories(divisionSlug);

  if (!categories.some((item) => isSameCategoryName(item, normalizedCategory))) {
    throw badRequest("먼저 등록된 카테고리 중에서 선택해 주세요.");
  }

  return normalizedCategory;
}

export async function createPointCategory(divisionSlug: string, categoryName: string) {
  if (!(await supportsPointCategoryCustomization())) {
    throw badRequest("현재 운영 DB에서는 카테고리 사용자 지정이 아직 지원되지 않습니다.");
  }

  const normalizedName = normalizeCategoryName(categoryName);
  const currentCategories = await listPointCategories(divisionSlug);

  if (currentCategories.some((category) => isSameCategoryName(category, normalizedName))) {
    throw badRequest("이미 같은 이름의 카테고리가 있습니다.");
  }

  const nextCategories = [...currentCategories, normalizedName];

  if (isMockMode()) {
    await updateMockState((state) => {
      const currentSettings = state.divisionSettingsByDivision[divisionSlug];

      if (!currentSettings) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      state.divisionSettingsByDivision[divisionSlug] = {
        ...currentSettings,
        pointCategories: nextCategories,
        updatedAt: new Date().toISOString(),
      };
    });

    return nextCategories;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  await prisma.divisionSettings.upsert({
    where: { divisionId: division.id },
    update: {
      pointCategories: nextCategories,
    },
    create: {
      divisionId: division.id,
      pointCategories: nextCategories,
    },
  });

  revalidatePointRulePaths(divisionSlug);
  return nextCategories;
}

export async function renamePointCategory(
  divisionSlug: string,
  currentName: string,
  nextName: string,
) {
  if (!(await supportsPointCategoryCustomization())) {
    throw badRequest("현재 운영 DB에서는 카테고리 사용자 지정이 아직 지원되지 않습니다.");
  }

  const normalizedCurrentName = normalizeCategoryName(currentName);
  const normalizedNextName = normalizeCategoryName(nextName);
  const currentCategories = await listPointCategories(divisionSlug);
  const currentIndex = currentCategories.findIndex((category) =>
    isSameCategoryName(category, normalizedCurrentName),
  );

  if (currentIndex < 0) {
    throw notFound("카테고리를 찾을 수 없습니다.");
  }

  if (
    currentCategories.some(
      (category, index) =>
        index !== currentIndex && isSameCategoryName(category, normalizedNextName),
    )
  ) {
    throw badRequest("이미 같은 이름의 카테고리가 있습니다.");
  }

  const previousStoredName = currentCategories[currentIndex];
  const nextCategories = currentCategories.map((category, index) =>
    index === currentIndex ? normalizedNextName : category,
  );

  if (isMockMode()) {
    await updateMockState((state) => {
      const settings = state.divisionSettingsByDivision[divisionSlug];

      if (!settings) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      state.divisionSettingsByDivision[divisionSlug] = {
        ...settings,
        pointCategories: nextCategories,
        updatedAt: new Date().toISOString(),
      };
      state.pointRulesByDivision[divisionSlug] = (state.pointRulesByDivision[divisionSlug] ?? []).map(
        (rule) =>
          isSameCategoryName(rule.category, previousStoredName)
            ? {
                ...rule,
                category: normalizedNextName,
                updatedAt: new Date().toISOString(),
              }
            : rule,
      );
    });

    return nextCategories;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  await prisma.$transaction([
    prisma.divisionSettings.upsert({
      where: { divisionId: division.id },
      update: {
        pointCategories: nextCategories,
      },
      create: {
        divisionId: division.id,
        pointCategories: nextCategories,
      },
    }),
    prisma.pointRule.updateMany({
      where: {
        divisionId: division.id,
        category: previousStoredName,
      },
      data: {
        category: normalizedNextName,
      },
    }),
  ]);

  revalidatePointRulePaths(divisionSlug);
  return nextCategories;
}

export async function deletePointCategory(divisionSlug: string, categoryName: string) {
  if (!(await supportsPointCategoryCustomization())) {
    throw badRequest("현재 운영 DB에서는 카테고리 사용자 지정이 아직 지원되지 않습니다.");
  }

  const normalizedName = normalizeCategoryName(categoryName);
  const currentCategories = await listPointCategories(divisionSlug);
  const matchedCategory = currentCategories.find((category) =>
    isSameCategoryName(category, normalizedName),
  );

  if (!matchedCategory) {
    throw notFound("카테고리를 찾을 수 없습니다.");
  }

  if (currentCategories.length <= 1) {
    throw badRequest("카테고리는 최소 1개 이상 유지해야 합니다.");
  }

  if (isMockMode()) {
    const state = await readMockState();
    const activeRuleCount = (state.pointRulesByDivision[divisionSlug] ?? []).filter((rule) =>
      isSameCategoryName(rule.category, matchedCategory),
    ).length;

    if (activeRuleCount > 0) {
      throw badRequest("이 카테고리를 사용하는 규칙이 있어 삭제할 수 없습니다.");
    }

    await updateMockState((draft) => {
      const settings = draft.divisionSettingsByDivision[divisionSlug];

      if (!settings) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      draft.divisionSettingsByDivision[divisionSlug] = {
        ...settings,
        pointCategories: currentCategories.filter((category) => !isSameCategoryName(category, matchedCategory)),
        updatedAt: new Date().toISOString(),
      };
    });

    return currentCategories.filter((category) => !isSameCategoryName(category, matchedCategory));
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const ruleCount = await prisma.pointRule.count({
    where: {
      divisionId: division.id,
      category: matchedCategory,
    },
  });

  if (ruleCount > 0) {
    throw badRequest("이 카테고리를 사용하는 규칙이 있어 삭제할 수 없습니다.");
  }

  const nextCategories = currentCategories.filter((category) => !isSameCategoryName(category, matchedCategory));

  await prisma.divisionSettings.upsert({
    where: { divisionId: division.id },
    update: {
      pointCategories: nextCategories,
    },
    create: {
      divisionId: division.id,
      pointCategories: nextCategories,
    },
  });

  revalidatePointRulePaths(divisionSlug);
  return nextCategories;
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
  const mode = await getPointRuleCategoryMode();
  let rules: Array<Parameters<typeof toPointRuleItem>[0]>;

  if (mode === "legacy-enum") {
    rules = await listLegacyPointRuleRows(division.id, options);
  } else {
    try {
      rules = await (await getPrismaClient()).pointRule.findMany({
        where: {
          divisionId: division.id,
          ...(options?.activeOnly ? { isActive: true } : {}),
        },
        orderBy: {
          displayOrder: "asc",
        },
      });
    } catch (error) {
      if (!isPointRuleCategoryCompatibilityError(error)) {
        throw error;
      }

      rules = await listLegacyPointRuleRows(division.id, options);
    }
  }

  return rules.map((rule) => toPointRuleItem(rule));
}

export async function createPointRule(divisionSlug: string, input: PointRuleInput) {
  const name = normalizeText(input.name);
  const category = await assertPointCategoryExists(divisionSlug, input.category);
  const description = normalizeOptionalText(input.description);
  const normalizedPoints = normalizeRulePoints(input.points);

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
        category,
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
  const mode = await getPointRuleCategoryMode();

  if (mode === "legacy-enum") {
    const legacyCategory = assertLegacyPointCategorySupported(category);
    const current = await listLegacyPointRuleRows(division.id);
    const displayOrder = current.length;
    const rows = await prisma.$queryRawUnsafe<PointRuleRow[]>(
      `
        INSERT INTO study_hall.point_rules (
          division_id,
          category,
          name,
          points,
          description,
          is_active,
          display_order
        ) VALUES (
          $1,
          '${legacyCategory}',
          $2,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING
          id,
          division_id AS "divisionId",
          category::text AS category,
          name,
          points,
          description,
          is_active AS "isActive",
          display_order AS "displayOrder",
          created_at AS "createdAt",
          created_at AS "updatedAt"
      `,
      division.id,
      name,
      normalizedPoints,
      description,
      input.isActive ?? true,
      displayOrder,
    );

    if (!rows[0]) {
      throw new Error("상벌점 규칙 저장에 실패했습니다.");
    }

    return toPointRuleItem(rows[0]);
  }

  const count = await prisma.pointRule.count({
    where: {
      divisionId: division.id,
    },
  });

  try {
    const rule = await prisma.pointRule.create({
      data: {
        divisionId: division.id,
        category,
        name,
        points: normalizedPoints,
        description,
        isActive: input.isActive ?? true,
        displayOrder: count,
      },
    });

    return toPointRuleItem(rule);
  } catch (error) {
    if (!isPointRuleCategoryCompatibilityError(error)) {
      throw error;
    }

    const legacyCategory = assertLegacyPointCategorySupported(category);
    const current = await listLegacyPointRuleRows(division.id);
    const displayOrder = current.length;
    const rows = await prisma.$queryRawUnsafe<PointRuleRow[]>(
      `
        INSERT INTO study_hall.point_rules (
          division_id,
          category,
          name,
          points,
          description,
          is_active,
          display_order
        ) VALUES (
          $1,
          '${legacyCategory}',
          $2,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING
          id,
          division_id AS "divisionId",
          category::text AS category,
          name,
          points,
          description,
          is_active AS "isActive",
          display_order AS "displayOrder",
          created_at AS "createdAt",
          created_at AS "updatedAt"
      `,
      division.id,
      name,
      normalizedPoints,
      description,
      input.isActive ?? true,
      displayOrder,
    );

    if (!rows[0]) {
      throw new Error("상벌점 규칙 저장에 실패했습니다.");
    }

    return toPointRuleItem(rows[0]);
  }
}

export async function updatePointRule(
  divisionSlug: string,
  ruleId: string,
  input: Partial<PointRuleInput>,
) {
  const normalizedCategory = input.category
    ? await assertPointCategoryExists(divisionSlug, input.category)
    : undefined;

  if (isMockMode()) {
    const updated = await updateMockState((state) => {
      const current = state.pointRulesByDivision[divisionSlug] ?? [];
      const target = current.find((rule) => rule.id === ruleId);

      if (!target) {
        throw notFound("상벌점 규칙을 찾을 수 없습니다.");
      }

      const nextCategory = normalizedCategory ?? target.category;
      const nextPoints = normalizeRulePoints(input.points ?? target.points);

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
  const mode = await getPointRuleCategoryMode();

  if (mode === "legacy-enum") {
    const rule = await getLegacyPointRuleRow(division.id, ruleId);

    if (!rule) {
      throw notFound("상벌점 규칙을 찾을 수 없습니다.");
    }

    const nextPoints = input.points === undefined ? rule.points : normalizeRulePoints(input.points);
    const nextCategory = normalizedCategory ?? toLegacyPointCategoryLabel(rule.category);
    const legacyCategory = assertLegacyPointCategorySupported(nextCategory);
    const rows = await prisma.$queryRawUnsafe<PointRuleRow[]>(
      `
        UPDATE study_hall.point_rules
        SET
          category = '${legacyCategory}',
          name = $2,
          points = $3,
          description = $4,
          is_active = $5
        WHERE id = $1
          AND division_id = $6
        RETURNING
          id,
          division_id AS "divisionId",
          category::text AS category,
          name,
          points,
          description,
          is_active AS "isActive",
          display_order AS "displayOrder",
          created_at AS "createdAt",
          created_at AS "updatedAt"
      `,
      ruleId,
      input.name ? normalizeText(input.name) : rule.name,
      nextPoints,
      input.description === undefined ? rule.description : normalizeOptionalText(input.description),
      input.isActive ?? rule.isActive,
      division.id,
    );

    if (!rows[0]) {
      throw notFound("상벌점 규칙을 찾을 수 없습니다.");
    }

    return toPointRuleItem(rows[0]);
  }

  const rule = await prisma.pointRule.findFirst({
    where: {
      id: ruleId,
      divisionId: division.id,
    },
    select: {
      id: true,
      divisionId: true,
      name: true,
      points: true,
      description: true,
      isActive: true,
      displayOrder: true,
      createdAt: true,
    },
  });

  if (!rule) {
    throw notFound("상벌점 규칙을 찾을 수 없습니다.");
  }

  const nextPoints =
    input.points === undefined ? undefined : normalizeRulePoints(input.points);

  try {
    const updated = await prisma.pointRule.update({
      where: {
        id: ruleId,
      },
      data: {
        category: normalizedCategory ?? undefined,
        name: input.name ? normalizeText(input.name) : undefined,
        points: nextPoints,
        description:
          input.description === undefined ? undefined : normalizeOptionalText(input.description),
        isActive: input.isActive ?? undefined,
      },
    });

    return toPointRuleItem(updated);
  } catch (error) {
    if (!isPointRuleCategoryCompatibilityError(error)) {
      throw error;
    }

    const legacyRule = await getLegacyPointRuleRow(division.id, ruleId);

    if (!legacyRule) {
      throw notFound("상벌점 규칙을 찾을 수 없습니다.");
    }

    const legacyNextPoints =
      input.points === undefined ? legacyRule.points : normalizeRulePoints(input.points);
    const legacyNextCategory = normalizedCategory ?? toLegacyPointCategoryLabel(legacyRule.category);
    const legacyCategory = assertLegacyPointCategorySupported(legacyNextCategory);
    const rows = await prisma.$queryRawUnsafe<PointRuleRow[]>(
      `
        UPDATE study_hall.point_rules
        SET
          category = '${legacyCategory}',
          name = $2,
          points = $3,
          description = $4,
          is_active = $5
        WHERE id = $1
          AND division_id = $6
        RETURNING
          id,
          division_id AS "divisionId",
          category::text AS category,
          name,
          points,
          description,
          is_active AS "isActive",
          display_order AS "displayOrder",
          created_at AS "createdAt",
          created_at AS "updatedAt"
      `,
      ruleId,
      input.name ? normalizeText(input.name) : legacyRule.name,
      legacyNextPoints,
      input.description === undefined ? legacyRule.description : normalizeOptionalText(input.description),
      input.isActive ?? legacyRule.isActive,
      division.id,
    );

    if (!rows[0]) {
      throw notFound("상벌점 규칙을 찾을 수 없습니다.");
    }

    return toPointRuleItem(rows[0]);
  }
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
    const [state, rules, periods] = await Promise.all([
      readMockState(),
      getMockRuleMap(divisionSlug),
      getPeriods(divisionSlug),
    ]);
    const displayContext = getPointDisplayContext(periods);
    const filtered = (state.pointRecordsByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .filter((record) => !options?.dateFrom || record.date.slice(0, 10) >= options.dateFrom)
      .filter((record) => !options?.dateTo || record.date.slice(0, 10) <= options.dateTo)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

    const records = filtered
      .map((record) =>
        serializePointRecordFromMock(record, studentMap, rules, divisionSlug, displayContext),
      )
      .filter(Boolean) as PointRecordItem[];

    return options?.limit ? records.slice(0, options.limit) : records;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const periodsPromise = getPeriods(divisionSlug);
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

  const categoryMap = await getLegacyPointRuleCategoryMap(
    records.map((record) => record.ruleId).filter((ruleId): ruleId is string => Boolean(ruleId)),
  );
  const displayContext = getPointDisplayContext(await periodsPromise);

  return records.map((record) => ({
    id: record.id,
    studentId: record.student.id,
    studentName: record.student.name,
    studentNumber: record.student.studentNumber,
    ruleId: record.ruleId,
    ruleName: getPointRecordDisplayName({
      ruleId: record.ruleId,
      ruleName: record.rule?.name ?? null,
      notes: record.notes,
    }),
    displayName: getPointRecordDisplayName({
      ruleId: record.ruleId,
      ruleName: record.rule?.name ?? null,
      notes: record.notes,
    }),
    category: record.ruleId ? categoryMap.get(record.ruleId) ?? "기타" : "기타",
    categoryLabel: getPointCategoryLabel(record.ruleId ? categoryMap.get(record.ruleId) ?? "기타" : "기타"),
    points: record.points,
    notes: record.notes,
    recordedById: record.recordedBy.id,
    recordedByName: record.recordedBy.name,
    createdAt: record.createdAt.toISOString(),
    date: getPointRecordDisplayDateTime(
      {
        ruleId: record.ruleId,
        notes: record.notes,
        date: record.date,
      },
      displayContext,
    ),
    displayDateTime: getPointRecordDisplayDateTime(
      {
        ruleId: record.ruleId,
        notes: record.notes,
        date: record.date,
      },
      displayContext,
    ),
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
    const [rules, periods] = await Promise.all([getMockRuleMap(divisionSlug), getPeriods(divisionSlug)]);
    return serializePointRecordFromMock(
      record,
      studentMap,
      rules,
      divisionSlug,
      getPointDisplayContext(periods),
    );
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const periodsPromise = getPeriods(divisionSlug);
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
      rule: { select: { id: true, name: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });
  const categoryMap = await getLegacyPointRuleCategoryMap(
    record.ruleId ? [record.ruleId] : [],
  );
  const recordCategory = record.ruleId ? categoryMap.get(record.ruleId) ?? "기타" : "기타";

  const displayContext = getPointDisplayContext(await periodsPromise);
  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return {
    id: record.id,
    studentId: record.student.id,
    studentName: record.student.name,
    studentNumber: record.student.studentNumber,
    ruleId: record.ruleId,
    ruleName: getPointRecordDisplayName({
      ruleId: record.ruleId,
      ruleName: record.rule?.name ?? null,
      notes: record.notes,
    }),
    displayName: getPointRecordDisplayName({
      ruleId: record.ruleId,
      ruleName: record.rule?.name ?? null,
      notes: record.notes,
    }),
    category: recordCategory,
    categoryLabel: getPointCategoryLabel(recordCategory),
    points: record.points,
    notes: record.notes,
    recordedById: record.recordedBy.id,
    recordedByName: record.recordedBy.name,
    createdAt: record.createdAt.toISOString(),
    date: getPointRecordDisplayDateTime(
      {
        ruleId: record.ruleId,
        notes: record.notes,
        date: record.date,
      },
      displayContext,
    ),
    displayDateTime: getPointRecordDisplayDateTime(
      {
        ruleId: record.ruleId,
        notes: record.notes,
        date: record.date,
      },
      displayContext,
    ),
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

  revalidateDivisionOperationalViews(divisionSlug, { studentIds });
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
      studentId: true,
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

  revalidateDivisionOperationalViews(divisionSlug, { studentId: record.studentId });
  return true;
}

export async function listWarningStudents(divisionSlug: string) {
  const settings = await getDivisionSettings(divisionSlug);
  const students = await listStudents(divisionSlug);

  return students
    .map((student) => ({
      student,
      demeritPoints: toDemeritPoints(student.netPoints),
    }))
    .filter(
      ({ student, demeritPoints }) =>
        (student.status === "ACTIVE" || student.status === "ON_LEAVE") &&
        demeritPoints >= settings.warnLevel1,
    )
    .sort(
      (left, right) =>
        right.demeritPoints - left.demeritPoints ||
        left.student.name.localeCompare(right.student.name, "ko"),
    )
    .map(({ student, demeritPoints }) => {
      const warningStage = getWarningStage(demeritPoints, settings);

      return {
        ...student,
        netPoints: demeritPoints,
        warningStage,
        warningStageLabel: getWarningStageLabel(warningStage),
      };
    }) satisfies WarningStudentItem[];
}
