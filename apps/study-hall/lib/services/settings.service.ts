import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";

import {
  DEFAULT_DIVISION_FEATURE_FLAGS,
  normalizeDivisionFeatureFlags,
  type DivisionFeatureFlags,
} from "@/lib/division-features";
import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockDivisionSettingsRecord,
} from "@/lib/mock-store";
import {
  DEFAULT_POINT_CATEGORIES,
  normalizePointCategories,
  type PointCategoryList,
} from "@/lib/point-meta";
import {
  type DivisionFeatureSettingsInput,
  normalizeOperatingDays,
  normalizeStudyTracks,
  type GeneralSettingsInput,
  type OperatingDays,
  type RulesSettingsInput,
  type StudyTrackList,
} from "@/lib/settings-schemas";
import {
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
  normalizeOptionalText,
} from "@/lib/service-helpers";

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

type RawDbDivisionSettingsRecord = {
  divisionId: string;
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
  warnMsgLevel1: string | null;
  warnMsgLevel2: string | null;
  warnMsgInterview: string | null;
  warnMsgWithdraw: string | null;
  tardyMinutes: number;
  assistantPastEditAllowed: boolean;
  assistantPastEditDays: number;
  holidayLimit: number;
  halfDayLimit: number;
  healthLimit: number;
  holidayUnusedPts: number;
  halfDayUnusedPts: number;
  tardyPointRuleId: string | null;
  absentPointRuleId: string | null;
  operatingDays: unknown;
  studyTracks: unknown;
  pointCategories: unknown;
  featureFlags: unknown;
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: number;
  expirationWarningDays: number;
  updatedAt: Date;
};

type RawDivisionSettingsRecord = RawDbDivisionSettingsRecord | MockDivisionSettingsRecord;

type LegacyDivisionSettingsRow = {
  divisionId: string;
  warnLevel1?: number | null;
  warnLevel2?: number | null;
  warnInterview?: number | null;
  warnWithdraw?: number | null;
  warnMsgLevel1?: string | null;
  warnMsgLevel2?: string | null;
  warnMsgInterview?: string | null;
  warnMsgWithdraw?: string | null;
  tardyMinutes?: number | null;
  assistantPastEditAllowed?: boolean | null;
  assistantPastEditDays?: number | null;
  holidayLimit?: number | null;
  halfDayLimit?: number | null;
  healthLimit?: number | null;
  holidayUnusedPts?: number | null;
  halfDayUnusedPts?: number | null;
  tardyPointRuleId?: string | null;
  absentPointRuleId?: string | null;
  operatingDays?: unknown;
  studyTracks?: unknown;
  pointCategories?: unknown;
  featureFlags?: unknown;
  perfectAttendancePtsEnabled?: boolean | null;
  perfectAttendancePts?: number | null;
  expirationWarningDays?: number | null;
  updatedAt?: Date | null;
};

type DivisionSettingsColumnRow = {
  columnName: string;
};

type DefaultRuleValues = {
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
  tardyMinutes: number;
  assistantPastEditAllowed: boolean;
  assistantPastEditDays: number;
  holidayLimit: number;
  halfDayLimit: number;
  healthLimit: number;
  holidayUnusedPts: number;
  halfDayUnusedPts: number;
  tardyPointRuleId: string | null;
  absentPointRuleId: string | null;
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: number;
  expirationWarningDays: number;
};

const DEFAULT_RULE_VALUES: DefaultRuleValues = {
  warnLevel1: 10,
  warnLevel2: 20,
  warnInterview: 25,
  warnWithdraw: 30,
  tardyMinutes: 20,
  assistantPastEditAllowed: false,
  assistantPastEditDays: 0,
  holidayLimit: 1,
  halfDayLimit: 2,
  healthLimit: 1,
  holidayUnusedPts: 5,
  halfDayUnusedPts: 2,
  tardyPointRuleId: null,
  absentPointRuleId: null,
  perfectAttendancePtsEnabled: false,
  perfectAttendancePts: 0,
  expirationWarningDays: 14,
};

const DIVISION_NOT_FOUND_ERROR = "지점 정보를 찾을 수 없습니다.";

const LEGACY_RULE_SELECT_COLUMNS = [
  { column: "warn_level1", alias: "warnLevel1" },
  { column: "warn_level2", alias: "warnLevel2" },
  { column: "warn_interview", alias: "warnInterview" },
  { column: "warn_withdraw", alias: "warnWithdraw" },
  { column: "warn_msg_level1", alias: "warnMsgLevel1" },
  { column: "warn_msg_level2", alias: "warnMsgLevel2" },
  { column: "warn_msg_interview", alias: "warnMsgInterview" },
  { column: "warn_msg_withdraw", alias: "warnMsgWithdraw" },
  { column: "tardy_minutes", alias: "tardyMinutes" },
  { column: "assistant_past_edit_allowed", alias: "assistantPastEditAllowed" },
  { column: "assistant_past_edit_days", alias: "assistantPastEditDays" },
  { column: "holiday_limit", alias: "holidayLimit" },
  { column: "half_day_limit", alias: "halfDayLimit" },
  { column: "health_limit", alias: "healthLimit" },
  { column: "holiday_unused_pts", alias: "holidayUnusedPts" },
  { column: "half_day_unused_pts", alias: "halfDayUnusedPts" },
  { column: "tardy_point_rule_id", alias: "tardyPointRuleId" },
  { column: "absent_point_rule_id", alias: "absentPointRuleId" },
  { column: "perfect_attendance_pts_enabled", alias: "perfectAttendancePtsEnabled" },
  { column: "perfect_attendance_pts", alias: "perfectAttendancePts" },
  { column: "expiration_warning_days", alias: "expirationWarningDays" },
] as const;

const LEGACY_DIVISION_SETTINGS_OPTIONAL_SELECT_COLUMNS = [
  { column: "operating_days", alias: "operatingDays" },
  { column: "study_tracks", alias: "studyTracks" },
  { column: "point_categories", alias: "pointCategories" },
  { column: "feature_flags", alias: "featureFlags" },
  { column: "updated_at", alias: "updatedAt" },
] as const;

export type WarningTemplateKey =
  | "warnMsgLevel1"
  | "warnMsgLevel2"
  | "warnMsgInterview"
  | "warnMsgWithdraw";

export type DivisionSettingsRecord = {
  divisionId: string;
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
  warnMsgLevel1: string;
  warnMsgLevel2: string;
  warnMsgInterview: string;
  warnMsgWithdraw: string;
  tardyMinutes: number;
  assistantPastEditAllowed: boolean;
  assistantPastEditDays: number;
  holidayLimit: number;
  halfDayLimit: number;
  healthLimit: number;
  holidayUnusedPts: number;
  halfDayUnusedPts: number;
  tardyPointRuleId: string | null;
  absentPointRuleId: string | null;
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: number;
  expirationWarningDays: number;
  operatingDays: OperatingDays;
  studyTracks: StudyTrackList;
  pointCategories: PointCategoryList;
  featureFlags: DivisionFeatureFlags;
  updatedAt: string;
};

export type DivisionRuleSettings = Omit<
  DivisionSettingsRecord,
  "divisionId" | "operatingDays" | "studyTracks" | "pointCategories" | "featureFlags"
>;

export type DivisionGeneralSettings = {
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  operatingDays: OperatingDays;
  studyTracks: StudyTrackList;
  updatedAt: string;
};

export type DivisionFeatureSettings = {
  featureFlags: DivisionFeatureFlags;
  updatedAt: string;
};

export function getDefaultWarningTemplate(stageLabel: string) {
  return `안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 ${stageLabel} 대상입니다.`;
}

function getDefaultWarningTemplates() {
  return {
    warnMsgLevel1: getDefaultWarningTemplate("1차 경고"),
    warnMsgLevel2: getDefaultWarningTemplate("2차 경고"),
    warnMsgInterview: getDefaultWarningTemplate("면담"),
    warnMsgWithdraw: getDefaultWarningTemplate("퇴실"),
  };
}

function createMockDefaultSettingsRecord(
  divisionId: string,
  studyTracks?: unknown,
): MockDivisionSettingsRecord {
  return {
    divisionId,
    ...DEFAULT_RULE_VALUES,
    ...getDefaultWarningTemplates(),
    operatingDays: normalizeOperatingDays(undefined),
    studyTracks: normalizeStudyTracks(studyTracks),
    pointCategories: [...DEFAULT_POINT_CATEGORIES],
    featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
    updatedAt: new Date().toISOString(),
  };
}

function createDbDefaultSettingsCreateInput(divisionId: string, studyTracks?: unknown) {
  const templates = getDefaultWarningTemplates();

  return {
    divisionId,
    warnMsgLevel1: templates.warnMsgLevel1,
    warnMsgLevel2: templates.warnMsgLevel2,
    warnMsgInterview: templates.warnMsgInterview,
    warnMsgWithdraw: templates.warnMsgWithdraw,
    operatingDays: normalizeOperatingDays(undefined),
    studyTracks: normalizeStudyTracks(studyTracks),
    pointCategories: [...DEFAULT_POINT_CATEGORIES],
    featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
  };
}

function createDefaultSettingsRecord(divisionId: string, studyTracks?: unknown) {
  return serializeSettingsRecord({
    divisionId,
    ...DEFAULT_RULE_VALUES,
    ...getDefaultWarningTemplates(),
    operatingDays: normalizeOperatingDays(undefined),
    studyTracks: normalizeStudyTracks(studyTracks),
    pointCategories: [...DEFAULT_POINT_CATEGORIES],
    featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
    updatedAt: new Date(),
  });
}

function validateWarningThresholdOrder(
  input: Pick<RulesSettingsInput, "warnLevel1" | "warnLevel2" | "warnInterview" | "warnWithdraw">,
) {
  if (
    !(
      input.warnLevel1 < input.warnLevel2 &&
      input.warnLevel2 < input.warnInterview &&
      input.warnInterview < input.warnWithdraw
    )
  ) {
    throw new Error("경고 단계 벌점은 1차 < 2차 < 면담 < 퇴실 순서로 설정되어야 합니다.");
  }
}

function normalizePointRuleId(value: string | null | undefined) {
  return normalizeOptionalText(value);
}

async function listDivisionSettingsColumns(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
) {
  const rows = await prisma.$queryRaw<DivisionSettingsColumnRow[]>`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'study_hall'
      AND table_name = 'division_settings'
  `;

  return new Set(rows.map((row) => row.columnName));
}

function getLegacyDivisionSettingsSelectColumns(availableColumns: Set<string>) {
  return [...LEGACY_RULE_SELECT_COLUMNS, ...LEGACY_DIVISION_SETTINGS_OPTIONAL_SELECT_COLUMNS].filter(
    ({ column }) => availableColumns.has(column),
  );
}

function getLegacyRuleColumnValues(
  input: RulesSettingsInput,
  attendancePointRuleSettings: ReturnType<typeof normalizeAttendancePointRuleSettings>,
) {
  return [
    { column: "warn_level1", value: input.warnLevel1 },
    { column: "warn_level2", value: input.warnLevel2 },
    { column: "warn_interview", value: input.warnInterview },
    { column: "warn_withdraw", value: input.warnWithdraw },
    { column: "warn_msg_level1", value: input.warnMsgLevel1.trim() },
    { column: "warn_msg_level2", value: input.warnMsgLevel2.trim() },
    { column: "warn_msg_interview", value: input.warnMsgInterview.trim() },
    { column: "warn_msg_withdraw", value: input.warnMsgWithdraw.trim() },
    { column: "tardy_minutes", value: input.tardyMinutes },
    { column: "assistant_past_edit_allowed", value: input.assistantPastEditAllowed },
    { column: "assistant_past_edit_days", value: input.assistantPastEditDays },
    { column: "holiday_limit", value: input.holidayLimit },
    { column: "half_day_limit", value: input.halfDayLimit },
    { column: "health_limit", value: input.healthLimit },
    { column: "holiday_unused_pts", value: input.holidayUnusedPts },
    { column: "half_day_unused_pts", value: input.halfDayUnusedPts },
    { column: "tardy_point_rule_id", value: attendancePointRuleSettings.tardyPointRuleId },
    { column: "absent_point_rule_id", value: attendancePointRuleSettings.absentPointRuleId },
    { column: "perfect_attendance_pts_enabled", value: input.perfectAttendancePtsEnabled },
    { column: "perfect_attendance_pts", value: input.perfectAttendancePts },
    { column: "expiration_warning_days", value: input.expirationWarningDays },
  ] as const;
}

function serializeSettingsRecord(record: RawDivisionSettingsRecord): DivisionSettingsRecord {
  const templates = getDefaultWarningTemplates();

  return {
    divisionId: record.divisionId,
    warnLevel1: record.warnLevel1,
    warnLevel2: record.warnLevel2,
    warnInterview: record.warnInterview,
    warnWithdraw: record.warnWithdraw,
    warnMsgLevel1: record.warnMsgLevel1?.trim() || templates.warnMsgLevel1,
    warnMsgLevel2: record.warnMsgLevel2?.trim() || templates.warnMsgLevel2,
    warnMsgInterview: record.warnMsgInterview?.trim() || templates.warnMsgInterview,
    warnMsgWithdraw: record.warnMsgWithdraw?.trim() || templates.warnMsgWithdraw,
    tardyMinutes: record.tardyMinutes,
    assistantPastEditAllowed: record.assistantPastEditAllowed ?? false,
    assistantPastEditDays: record.assistantPastEditDays ?? 0,
    holidayLimit: record.holidayLimit,
    halfDayLimit: record.halfDayLimit,
    healthLimit: record.healthLimit,
    holidayUnusedPts: record.holidayUnusedPts,
    halfDayUnusedPts: record.halfDayUnusedPts,
    tardyPointRuleId: normalizePointRuleId((record as { tardyPointRuleId?: string | null }).tardyPointRuleId),
    absentPointRuleId: normalizePointRuleId((record as { absentPointRuleId?: string | null }).absentPointRuleId),
    perfectAttendancePtsEnabled: record.perfectAttendancePtsEnabled ?? false,
    perfectAttendancePts: record.perfectAttendancePts ?? 0,
    expirationWarningDays: (record as { expirationWarningDays?: number }).expirationWarningDays ?? 14,
    operatingDays: normalizeOperatingDays(record.operatingDays),
    studyTracks: normalizeStudyTracks(record.studyTracks),
    pointCategories: normalizePointCategories((record as { pointCategories?: unknown }).pointCategories),
    featureFlags: normalizeDivisionFeatureFlags((record as { featureFlags?: unknown }).featureFlags),
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : record.updatedAt.toISOString(),
  };
}

function serializeLegacySettingsRecord(record: LegacyDivisionSettingsRow): DivisionSettingsRecord {
  return serializeSettingsRecord({
    divisionId: record.divisionId,
    warnLevel1: record.warnLevel1 ?? DEFAULT_RULE_VALUES.warnLevel1,
    warnLevel2: record.warnLevel2 ?? DEFAULT_RULE_VALUES.warnLevel2,
    warnInterview: record.warnInterview ?? DEFAULT_RULE_VALUES.warnInterview,
    warnWithdraw: record.warnWithdraw ?? DEFAULT_RULE_VALUES.warnWithdraw,
    warnMsgLevel1: record.warnMsgLevel1 ?? null,
    warnMsgLevel2: record.warnMsgLevel2 ?? null,
    warnMsgInterview: record.warnMsgInterview ?? null,
    warnMsgWithdraw: record.warnMsgWithdraw ?? null,
    tardyMinutes: record.tardyMinutes ?? DEFAULT_RULE_VALUES.tardyMinutes,
    assistantPastEditAllowed:
      record.assistantPastEditAllowed ?? DEFAULT_RULE_VALUES.assistantPastEditAllowed,
    assistantPastEditDays: record.assistantPastEditDays ?? DEFAULT_RULE_VALUES.assistantPastEditDays,
    holidayLimit: record.holidayLimit ?? DEFAULT_RULE_VALUES.holidayLimit,
    halfDayLimit: record.halfDayLimit ?? DEFAULT_RULE_VALUES.halfDayLimit,
    healthLimit: record.healthLimit ?? DEFAULT_RULE_VALUES.healthLimit,
    holidayUnusedPts: record.holidayUnusedPts ?? DEFAULT_RULE_VALUES.holidayUnusedPts,
    halfDayUnusedPts: record.halfDayUnusedPts ?? DEFAULT_RULE_VALUES.halfDayUnusedPts,
    tardyPointRuleId: record.tardyPointRuleId ?? DEFAULT_RULE_VALUES.tardyPointRuleId,
    absentPointRuleId: record.absentPointRuleId ?? DEFAULT_RULE_VALUES.absentPointRuleId,
    perfectAttendancePtsEnabled:
      record.perfectAttendancePtsEnabled ?? DEFAULT_RULE_VALUES.perfectAttendancePtsEnabled,
    perfectAttendancePts: record.perfectAttendancePts ?? DEFAULT_RULE_VALUES.perfectAttendancePts,
    expirationWarningDays:
      record.expirationWarningDays ?? DEFAULT_RULE_VALUES.expirationWarningDays,
    operatingDays: record.operatingDays ?? normalizeOperatingDays(undefined),
    studyTracks: normalizeStudyTracks(record.studyTracks),
    pointCategories: normalizePointCategories(record.pointCategories),
    featureFlags: normalizeDivisionFeatureFlags(record.featureFlags),
    updatedAt: record.updatedAt ?? new Date(),
  });
}

async function readLegacyDivisionSettings(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
): Promise<DivisionSettingsRecord> {
  const availableColumns = await listDivisionSettingsColumns(prisma);
  const selectColumns = getLegacyDivisionSettingsSelectColumns(availableColumns);
  const selectClause = selectColumns
    .map(({ column, alias }) => `,\n      "${column}" AS "${alias}"`)
    .join("");

  const rows = await prisma.$queryRawUnsafe<LegacyDivisionSettingsRow[]>(
    `SELECT
      division_id AS "divisionId"${selectClause}
    FROM study_hall.division_settings
    WHERE division_id = $1
    LIMIT 1`,
    divisionId,
  );

  return rows[0] ? serializeLegacySettingsRecord(rows[0]) : createDefaultSettingsRecord(divisionId);
}

async function upsertLegacyDivisionRuleSettings(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
  input: RulesSettingsInput,
  attendancePointRuleSettings: ReturnType<typeof normalizeAttendancePointRuleSettings>,
) {
  const availableColumns = await listDivisionSettingsColumns(prisma);
  const ruleColumnValues = getLegacyRuleColumnValues(input, attendancePointRuleSettings);
  const missingColumns = ruleColumnValues
    .map(({ column }) => column)
    .filter((column) => !availableColumns.has(column));

  if (missingColumns.length > 0) {
    throw new Error(
      `운영 규칙 저장에 필요한 DB 컬럼이 누락되어 있습니다: ${missingColumns.join(", ")}. 최신 마이그레이션을 적용한 뒤 다시 저장해 주세요.`,
    );
  }

  const insertColumns = ["division_id", ...ruleColumnValues.map(({ column }) => column)];
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(", ");
  const updateAssignments = [
    ...ruleColumnValues.map(({ column }) => `"${column}" = EXCLUDED."${column}"`),
    availableColumns.has("updated_at") ? `"updated_at" = CURRENT_TIMESTAMP` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(",\n      ");

  await prisma.$executeRawUnsafe(
    `INSERT INTO study_hall.division_settings (
      ${insertColumns.map((column) => `"${column}"`).join(",\n      ")}
    ) VALUES (
      ${placeholders}
    )
    ON CONFLICT (division_id) DO UPDATE SET
      ${updateAssignments}`,
    divisionId,
    ...ruleColumnValues.map(({ value }) => value),
  );
}

async function upsertLegacyDivisionGeneralSettings(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
  input: GeneralSettingsInput,
) {
  await prisma.$executeRaw`
    INSERT INTO study_hall.division_settings (
      division_id,
      operating_days
    ) VALUES (
      ${divisionId},
      ${JSON.stringify(normalizeOperatingDays(input.operatingDays))}::jsonb
    )
    ON CONFLICT (division_id) DO UPDATE SET
      operating_days = EXCLUDED.operating_days
  `;
}

function getDivisionRuleSettingsFromRecord(
  settings: DivisionSettingsRecord,
): DivisionRuleSettings {
  return {
    warnLevel1: settings.warnLevel1,
    warnLevel2: settings.warnLevel2,
    warnInterview: settings.warnInterview,
    warnWithdraw: settings.warnWithdraw,
    warnMsgLevel1: settings.warnMsgLevel1,
    warnMsgLevel2: settings.warnMsgLevel2,
    warnMsgInterview: settings.warnMsgInterview,
    warnMsgWithdraw: settings.warnMsgWithdraw,
    tardyMinutes: settings.tardyMinutes,
    assistantPastEditAllowed: settings.assistantPastEditAllowed,
    assistantPastEditDays: settings.assistantPastEditDays,
    holidayLimit: settings.holidayLimit,
    halfDayLimit: settings.halfDayLimit,
    healthLimit: settings.healthLimit,
    holidayUnusedPts: settings.holidayUnusedPts,
    halfDayUnusedPts: settings.halfDayUnusedPts,
    tardyPointRuleId: settings.tardyPointRuleId,
    absentPointRuleId: settings.absentPointRuleId,
    perfectAttendancePtsEnabled: settings.perfectAttendancePtsEnabled,
    perfectAttendancePts: settings.perfectAttendancePts,
    expirationWarningDays: settings.expirationWarningDays,
    updatedAt: settings.updatedAt,
  };
}

function revalidateDivisionRuntimePaths(divisionSlug: string) {
  revalidatePath(`/${divisionSlug}/admin`, "layout");
  revalidatePath(`/${divisionSlug}/assistant`, "layout");
  revalidatePath(`/${divisionSlug}/student`, "layout");
  revalidatePath(`/${divisionSlug}/admin`);
  revalidatePath(`/${divisionSlug}/assistant`);
  revalidatePath(`/${divisionSlug}/student`);
}

function revalidateSuperAdminOverviewData() {
  revalidateTag("super-admin-overview");
  revalidateTag("super-admin-student-trend");
  revalidateTag("super-admin-tuition-status");
  revalidatePath("/super-admin");
}

function revalidateDivisionReportData(divisionSlug: string) {
  revalidateTag("report-data");
  revalidatePath(`/${divisionSlug}/admin/reports`);
}

async function ensureMockDivisionSettings(divisionSlug: string) {
  const state = await readMockState();
  const division =
    state.divisions.find((item) => item.slug === divisionSlug) ?? getMockDivisionBySlug(divisionSlug);

  if (!division) {
    throw notFound(DIVISION_NOT_FOUND_ERROR);
  }

  if (state.divisionSettingsByDivision[divisionSlug]) {
    return {
      state,
      division,
      settings: serializeSettingsRecord(state.divisionSettingsByDivision[divisionSlug]),
    };
  }

  return updateMockState(async (draft) => {
    draft.divisionSettingsByDivision[divisionSlug] =
      draft.divisionSettingsByDivision[divisionSlug] ??
      createMockDefaultSettingsRecord(division.id);

    return {
      state: draft,
      division,
      settings: serializeSettingsRecord(draft.divisionSettingsByDivision[divisionSlug]),
    };
  });
}

async function ensureDbDivisionSettings(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: { id: true },
  });

  if (!division) {
    throw notFound(DIVISION_NOT_FOUND_ERROR);
  }

  let settings;

  try {
    settings = await prisma.divisionSettings.findUnique({
      where: { divisionId: division.id },
    });
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "division_settings",
        "assistant_past_edit",
        "warn_msg_",
        "study_tracks",
        "point_categories",
        "feature_flags",
        "tardy_point_rule_id",
        "absent_point_rule_id",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("division-settings:read", error);
    return {
      division,
      settings: await readLegacyDivisionSettings(prisma, division.id),
    };
  }

  return {
    division,
    settings: settings
      ? serializeSettingsRecord(settings)
      : createDefaultSettingsRecord(division.id),
  };
}

async function getDivisionSettingsUncached(divisionSlug: string): Promise<DivisionSettingsRecord> {
  if (isMockMode()) {
    const { settings } = await ensureMockDivisionSettings(divisionSlug);
    return settings;
  }

  const { settings } = await ensureDbDivisionSettings(divisionSlug);
  return settings;
}

function getDivisionSettingsCached(divisionSlug: string) {
  return unstable_cache(
    async () => getDivisionSettingsUncached(divisionSlug),
    ["division-settings", divisionSlug],
    {
      revalidate: 300,
      tags: [`division-settings:${divisionSlug}`],
    },
  )();
}

export async function getDivisionSettings(
  divisionSlug: string,
): Promise<DivisionSettingsRecord> {
  return isMockMode()
    ? getDivisionSettingsUncached(divisionSlug)
    : getDivisionSettingsCached(divisionSlug);
}

async function getDivisionThemeUncached(divisionSlug: string) {
  if (isMockMode()) {
    const state = await readMockState();
    const division =
      state.divisions.find((item) => item.slug === divisionSlug) ?? getMockDivisionBySlug(divisionSlug);

    if (!division) {
      throw notFound(DIVISION_NOT_FOUND_ERROR);
    }

    return {
      color: division.color,
      name: division.name,
      fullName: division.fullName,
    };
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: {
      color: true,
      name: true,
      fullName: true,
    },
  });

  if (!division) {
    throw notFound(DIVISION_NOT_FOUND_ERROR);
  }

  return division;
}

function getDivisionThemeCached(divisionSlug: string) {
  return unstable_cache(
    async () => getDivisionThemeUncached(divisionSlug),
    ["division-theme", divisionSlug],
    {
      revalidate: 300,
      tags: [`division-theme:${divisionSlug}`],
    },
  )();
}

export async function getDivisionTheme(divisionSlug: string) {
  return isMockMode()
    ? getDivisionThemeUncached(divisionSlug)
    : getDivisionThemeCached(divisionSlug);
}

export async function getDivisionRuleSettings(
  divisionSlug: string,
): Promise<DivisionRuleSettings> {
  return getDivisionRuleSettingsFromRecord(await getDivisionSettings(divisionSlug));
}

export async function getDivisionGeneralSettings(
  divisionSlug: string,
): Promise<DivisionGeneralSettings> {
  const settings = await getDivisionSettings(divisionSlug);

  if (isMockMode()) {
    const { state } = await ensureMockDivisionSettings(divisionSlug);
    const division =
      state.divisions.find((item) => item.slug === divisionSlug) ?? getMockDivisionBySlug(divisionSlug);

    if (!division) {
      throw notFound(DIVISION_NOT_FOUND_ERROR);
    }

    return {
      slug: division.slug,
      name: division.name,
      fullName: division.fullName,
      color: division.color,
      isActive: division.isActive,
      operatingDays: settings.operatingDays,
      studyTracks: settings.studyTracks,
      updatedAt: settings.updatedAt,
    };
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: {
      slug: true,
      name: true,
      fullName: true,
      color: true,
      isActive: true,
    },
  });

  if (!division) {
    throw notFound(DIVISION_NOT_FOUND_ERROR);
  }

  return {
    slug: division.slug,
    name: division.name,
    fullName: division.fullName,
    color: division.color,
    isActive: division.isActive,
    operatingDays: settings.operatingDays,
    studyTracks: settings.studyTracks,
    updatedAt: settings.updatedAt,
  };
}

export async function getDivisionPointCategories(
  divisionSlug: string,
): Promise<PointCategoryList> {
  const settings = await getDivisionSettings(divisionSlug);
  return settings.pointCategories;
}

export async function getDivisionPointCategoriesUncached(
  divisionSlug: string,
): Promise<PointCategoryList> {
  const settings = await getDivisionSettingsUncached(divisionSlug);
  return settings.pointCategories;
}

export async function getDivisionFeatureSettings(
  divisionSlug: string,
): Promise<DivisionFeatureSettings> {
  const settings = await getDivisionSettings(divisionSlug);

  return {
    featureFlags: settings.featureFlags,
    updatedAt: settings.updatedAt,
  };
}

function normalizeAttendancePointRuleSettings(
  input: Pick<RulesSettingsInput, "tardyPointRuleId" | "absentPointRuleId">,
) {
  return {
    tardyPointRuleId: normalizePointRuleId(input.tardyPointRuleId),
    absentPointRuleId: normalizePointRuleId(input.absentPointRuleId),
  };
}

export async function updateDivisionRuleSettings(
  divisionSlug: string,
  input: RulesSettingsInput,
): Promise<DivisionRuleSettings> {
  validateWarningThresholdOrder(input);
  const attendancePointRuleSettings = normalizeAttendancePointRuleSettings(input);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division =
        state.divisions.find((item) => item.slug === divisionSlug) ?? getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound(DIVISION_NOT_FOUND_ERROR);
      }

      const selectedRuleIds = Array.from(
        new Set(
          [
            attendancePointRuleSettings.tardyPointRuleId,
            attendancePointRuleSettings.absentPointRuleId,
          ].filter((ruleId): ruleId is string => Boolean(ruleId)),
        ),
      );
      const validRuleIds = new Set(
        (state.pointRulesByDivision[divisionSlug] ?? [])
          .filter((rule) => rule.isActive)
          .map((rule) => rule.id),
      );

      if (selectedRuleIds.some((ruleId) => !validRuleIds.has(ruleId))) {
        throw new Error("자동 출결 상벌점 규칙은 현재 지점의 활성 상벌점 규칙만 선택할 수 있습니다.");
      }

      const current =
        state.divisionSettingsByDivision[divisionSlug] ??
        createMockDefaultSettingsRecord(division.id);

      state.divisionSettingsByDivision[divisionSlug] = {
        ...current,
        warnLevel1: input.warnLevel1,
        warnLevel2: input.warnLevel2,
        warnInterview: input.warnInterview,
        warnWithdraw: input.warnWithdraw,
        warnMsgLevel1: input.warnMsgLevel1.trim(),
        warnMsgLevel2: input.warnMsgLevel2.trim(),
        warnMsgInterview: input.warnMsgInterview.trim(),
        warnMsgWithdraw: input.warnMsgWithdraw.trim(),
        tardyMinutes: input.tardyMinutes,
        assistantPastEditAllowed: input.assistantPastEditAllowed,
        assistantPastEditDays: input.assistantPastEditDays,
        holidayLimit: input.holidayLimit,
        halfDayLimit: input.halfDayLimit,
        healthLimit: input.healthLimit,
        holidayUnusedPts: input.holidayUnusedPts,
        halfDayUnusedPts: input.halfDayUnusedPts,
        tardyPointRuleId: attendancePointRuleSettings.tardyPointRuleId,
        absentPointRuleId: attendancePointRuleSettings.absentPointRuleId,
        perfectAttendancePtsEnabled: input.perfectAttendancePtsEnabled,
        perfectAttendancePts: input.perfectAttendancePts,
        expirationWarningDays: input.expirationWarningDays,
        updatedAt: new Date().toISOString(),
      };

      return getDivisionRuleSettingsFromRecord(
        serializeSettingsRecord(state.divisionSettingsByDivision[divisionSlug]),
      );
    });
  }

  const prisma = await getPrismaClient();
  const { division } = await ensureDbDivisionSettings(divisionSlug);
  const selectedRuleIds = Array.from(
    new Set(
      [
        attendancePointRuleSettings.tardyPointRuleId,
        attendancePointRuleSettings.absentPointRuleId,
      ].filter((ruleId): ruleId is string => Boolean(ruleId)),
    ),
  );

  if (selectedRuleIds.length > 0) {
    const validRuleCount = await prisma.pointRule.count({
      where: {
        divisionId: division.id,
        isActive: true,
        id: {
          in: selectedRuleIds,
        },
      },
    });

    if (validRuleCount !== selectedRuleIds.length) {
      throw new Error("자동 출결 상벌점 규칙은 현재 지점의 활성 상벌점 규칙만 선택할 수 있습니다.");
    }
  }

  try {
    await prisma.divisionSettings.upsert({
      where: { divisionId: division.id },
      update: {
        warnLevel1: input.warnLevel1,
        warnLevel2: input.warnLevel2,
        warnInterview: input.warnInterview,
        warnWithdraw: input.warnWithdraw,
        warnMsgLevel1: input.warnMsgLevel1.trim(),
        warnMsgLevel2: input.warnMsgLevel2.trim(),
        warnMsgInterview: input.warnMsgInterview.trim(),
        warnMsgWithdraw: input.warnMsgWithdraw.trim(),
        tardyMinutes: input.tardyMinutes,
        assistantPastEditAllowed: input.assistantPastEditAllowed,
        assistantPastEditDays: input.assistantPastEditDays,
        holidayLimit: input.holidayLimit,
        halfDayLimit: input.halfDayLimit,
        healthLimit: input.healthLimit,
        holidayUnusedPts: input.holidayUnusedPts,
        halfDayUnusedPts: input.halfDayUnusedPts,
        tardyPointRuleId: attendancePointRuleSettings.tardyPointRuleId,
        absentPointRuleId: attendancePointRuleSettings.absentPointRuleId,
        perfectAttendancePtsEnabled: input.perfectAttendancePtsEnabled,
        perfectAttendancePts: input.perfectAttendancePts,
        expirationWarningDays: input.expirationWarningDays,
      },
      create: {
        ...createDbDefaultSettingsCreateInput(division.id),
        warnLevel1: input.warnLevel1,
        warnLevel2: input.warnLevel2,
        warnInterview: input.warnInterview,
        warnWithdraw: input.warnWithdraw,
        warnMsgLevel1: input.warnMsgLevel1.trim(),
        warnMsgLevel2: input.warnMsgLevel2.trim(),
        warnMsgInterview: input.warnMsgInterview.trim(),
        warnMsgWithdraw: input.warnMsgWithdraw.trim(),
        tardyMinutes: input.tardyMinutes,
        assistantPastEditAllowed: input.assistantPastEditAllowed,
        assistantPastEditDays: input.assistantPastEditDays,
        holidayLimit: input.holidayLimit,
        halfDayLimit: input.halfDayLimit,
        healthLimit: input.healthLimit,
        holidayUnusedPts: input.holidayUnusedPts,
        halfDayUnusedPts: input.halfDayUnusedPts,
        tardyPointRuleId: attendancePointRuleSettings.tardyPointRuleId,
        absentPointRuleId: attendancePointRuleSettings.absentPointRuleId,
        perfectAttendancePtsEnabled: input.perfectAttendancePtsEnabled,
        perfectAttendancePts: input.perfectAttendancePts,
        expirationWarningDays: input.expirationWarningDays,
      },
    });
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "division_settings",
        "assistant_past_edit",
        "warn_msg_",
        "study_tracks",
        "point_categories",
        "feature_flags",
        "tardy_point_rule_id",
        "absent_point_rule_id",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("division-settings:write-rules", error);
    await upsertLegacyDivisionRuleSettings(
      prisma,
      division.id,
      input,
      attendancePointRuleSettings,
    );
  }

  revalidateTag(`division-settings:${divisionSlug}`);
  revalidateTag("admin-dashboard");
  revalidateDivisionRuntimePaths(divisionSlug);
  revalidateSuperAdminOverviewData();
  revalidateDivisionReportData(divisionSlug);
  return getDivisionRuleSettings(divisionSlug);
}

export async function updateDivisionFeatureSettings(
  divisionSlug: string,
  input: DivisionFeatureSettingsInput,
): Promise<DivisionFeatureSettings> {
  const nextFlags = normalizeDivisionFeatureFlags(input.featureFlags);

  if (isMockMode()) {
    await updateMockState((state) => {
      const division =
        state.divisions.find((item) => item.slug === divisionSlug) ?? getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound(DIVISION_NOT_FOUND_ERROR);
      }

      const settings =
        state.divisionSettingsByDivision[divisionSlug] ??
        createMockDefaultSettingsRecord(division.id);

      state.divisionSettingsByDivision[divisionSlug] = {
        ...settings,
        featureFlags: nextFlags,
        updatedAt: new Date().toISOString(),
      };
    });

    return getDivisionFeatureSettings(divisionSlug);
  }

  const prisma = await getPrismaClient();
  const { division } = await ensureDbDivisionSettings(divisionSlug);

  try {
    await prisma.divisionSettings.upsert({
      where: { divisionId: division.id },
      update: {
        featureFlags: nextFlags,
      },
      create: {
        ...createDbDefaultSettingsCreateInput(division.id),
        featureFlags: nextFlags,
      },
    });
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["division_settings", "feature_flags", "point_categories"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("division-settings:write-features", error);
    return {
      featureFlags: DEFAULT_DIVISION_FEATURE_FLAGS,
      updatedAt: new Date().toISOString(),
    };
  }

  revalidateTag(`division-settings:${divisionSlug}`);
  revalidateTag("admin-dashboard");
  revalidateDivisionRuntimePaths(divisionSlug);
  revalidateSuperAdminOverviewData();
  revalidateDivisionReportData(divisionSlug);
  return getDivisionFeatureSettings(divisionSlug);
}

export async function updateDivisionGeneralSettings(
  divisionSlug: string,
  input: GeneralSettingsInput,
): Promise<DivisionGeneralSettings> {
  if (isMockMode()) {
    await updateMockState((state) => {
      const division = state.divisions.find((item) => item.slug === divisionSlug);

      if (!division) {
        throw notFound(DIVISION_NOT_FOUND_ERROR);
      }

      const settings =
        state.divisionSettingsByDivision[divisionSlug] ??
        createMockDefaultSettingsRecord(division.id);

      state.divisions = state.divisions.map((item) =>
        item.slug === divisionSlug
          ? {
              ...item,
              name: input.name,
              fullName: input.fullName,
              color: input.color,
              isActive: input.isActive,
            }
          : item,
      );

      state.divisionSettingsByDivision[divisionSlug] = {
        ...settings,
        operatingDays: normalizeOperatingDays(input.operatingDays),
        studyTracks: normalizeStudyTracks(input.studyTracks),
        updatedAt: new Date().toISOString(),
      };
    });

    return getDivisionGeneralSettings(divisionSlug);
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: { id: true },
  });

  if (!division) {
    throw notFound(DIVISION_NOT_FOUND_ERROR);
  }

  try {
    await prisma.$transaction([
      prisma.division.update({
        where: { slug: divisionSlug },
        data: {
          name: input.name,
          fullName: input.fullName,
          color: input.color,
          isActive: input.isActive,
        },
      }),
      prisma.divisionSettings.upsert({
        where: { divisionId: division.id },
        update: {
          operatingDays: normalizeOperatingDays(input.operatingDays),
          studyTracks: normalizeStudyTracks(input.studyTracks),
        },
        create: {
          ...createDbDefaultSettingsCreateInput(division.id),
          operatingDays: normalizeOperatingDays(input.operatingDays),
          studyTracks: normalizeStudyTracks(input.studyTracks),
        },
      }),
    ]);
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "division_settings",
        "study_tracks",
        "assistant_past_edit",
        "point_categories",
        "feature_flags",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("division-settings:write-general", error);
    await prisma.division.update({
      where: { slug: divisionSlug },
      data: {
        name: input.name,
        fullName: input.fullName,
        color: input.color,
        isActive: input.isActive,
      },
    });
    await upsertLegacyDivisionGeneralSettings(prisma, division.id, input);
  }

  revalidateTag(`division-settings:${divisionSlug}`);
  revalidateTag(`division-theme:${divisionSlug}`);
  revalidateTag("admin-dashboard");
  revalidateSuperAdminOverviewData();
  revalidateDivisionReportData(divisionSlug);
  return getDivisionGeneralSettings(divisionSlug);
}
