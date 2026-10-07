import { getHistoricalAcademyConfiguration } from "@/lib/services/academy-configuration-history.service";
import { examAnalysisSettingsSchema, normalizeExamAnalysisSettings, type ExamAnalysisSettings } from "@/lib/exam-analysis-settings";
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
  normalizeOptionalText,
} from "@/lib/service-helpers";

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

type RawDbDivisionSettingsRecord = {
  examAnalysis?: unknown;
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
  perfectAttendanceWeeklyPts: number;
  perfectAttendanceMonthlyPts: number;
  expirationWarningDays: number;
  updatedAt: Date;
};

type RawDivisionSettingsRecord = RawDbDivisionSettingsRecord | MockDivisionSettingsRecord;

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
  perfectAttendanceWeeklyPts: number;
  perfectAttendanceMonthlyPts: number;
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
  perfectAttendanceWeeklyPts: 0,
  perfectAttendanceMonthlyPts: 0,
  expirationWarningDays: 14,
};

const DIVISION_NOT_FOUND_ERROR = "지점 정보를 찾을 수 없습니다.";

export type WarningTemplateKey =
  | "warnMsgLevel1"
  | "warnMsgLevel2"
  | "warnMsgInterview"
  | "warnMsgWithdraw";

export type DivisionSettingsRecord = {
  examAnalysis: ExamAnalysisSettings;
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
  perfectAttendanceWeeklyPts: number;
  perfectAttendanceMonthlyPts: number;
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

export function serializeSettingsRecord(record: RawDivisionSettingsRecord): DivisionSettingsRecord {
  const templates = getDefaultWarningTemplates();

  return {
    examAnalysis: normalizeExamAnalysisSettings((record as { examAnalysis?: unknown }).examAnalysis),
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
    perfectAttendanceWeeklyPts: record.perfectAttendanceWeeklyPts ?? 0,
    perfectAttendanceMonthlyPts: record.perfectAttendanceMonthlyPts ?? 0,
    expirationWarningDays: (record as { expirationWarningDays?: number }).expirationWarningDays ?? 14,
    operatingDays: normalizeOperatingDays(record.operatingDays),
    studyTracks: normalizeStudyTracks(record.studyTracks),
    pointCategories: normalizePointCategories((record as { pointCategories?: unknown }).pointCategories),
    featureFlags: normalizeDivisionFeatureFlags((record as { featureFlags?: unknown }).featureFlags),
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : record.updatedAt.toISOString(),
  };
}

function getDivisionRuleSettingsFromRecord(
  settings: DivisionSettingsRecord,
): DivisionRuleSettings {
  return {
    examAnalysis: settings.examAnalysis,
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
    perfectAttendanceWeeklyPts: settings.perfectAttendanceWeeklyPts,
    perfectAttendanceMonthlyPts: settings.perfectAttendanceMonthlyPts,
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

  const settings = await prisma.divisionSettings.findUnique({
    where: { divisionId: division.id },
  });

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
  onDate?: string,
): Promise<DivisionSettingsRecord> {
  const current = await (isMockMode() ? getDivisionSettingsUncached(divisionSlug) : getDivisionSettingsCached(divisionSlug));
  const historical = onDate ? await getHistoricalAcademyConfiguration(divisionSlug, onDate) : null;
  return historical ? serializeSettingsRecord({ ...current, ...historical.settings }) : current;
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

/** Both loaders use the existing settings normalization. */
export async function getExamAnalysisSettings(
  divisionSlug: string,
): Promise<ExamAnalysisSettings> {
  if (isMockMode()) {
    const { settings } = await ensureMockDivisionSettings(divisionSlug);
    return settings.examAnalysis;
  }
  return (await getDivisionRuleSettings(divisionSlug)).examAnalysis;
}

/** Replace only analysis settings; never replay a stale snapshot of other rules. */
export async function updateExamAnalysisSettings(
  divisionSlug: string,
  input: ExamAnalysisSettings,
): Promise<ExamAnalysisSettings> {
  const examAnalysis = examAnalysisSettingsSchema.parse(input);
  if (isMockMode()) {
    return updateMockState((state) => {
      const division = state.divisions.find((item) => item.slug === divisionSlug)
        ?? getMockDivisionBySlug(divisionSlug);
      if (!division) throw notFound(DIVISION_NOT_FOUND_ERROR);
      const current = state.divisionSettingsByDivision[divisionSlug]
        ?? createMockDefaultSettingsRecord(division.id);
      state.divisionSettingsByDivision[divisionSlug] = {
        ...current, examAnalysis, updatedAt: new Date().toISOString(),
      };
      return normalizeExamAnalysisSettings(examAnalysis);
    });
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug }, select: { id: true },
  });
  if (!division) throw notFound(DIVISION_NOT_FOUND_ERROR);
  // A narrow update also preserves rule changes committed while resolving the division.
  // Missing schema must fail rather than silently discard an analysis settings write.
  const saved = await prisma.divisionSettings.upsert({
    where: { divisionId: division.id },
    update: { examAnalysis },
    create: { ...createDbDefaultSettingsCreateInput(division.id), examAnalysis },
    select: { examAnalysis: true },
  });
  revalidateDivisionRuleSettings(divisionSlug);
  return normalizeExamAnalysisSettings(saved.examAnalysis);
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
  onDate?: string,
): Promise<DivisionFeatureSettings> {
  const settings = await getDivisionSettings(divisionSlug, onDate);

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

export type RuleSettingsActor = {
  id: string;
  name: string;
};

function revalidateDivisionRuleSettings(divisionSlug: string) {
  revalidateTag(`exam-analysis:${divisionSlug}`);
  revalidateTag(`division-settings:${divisionSlug}`);
  revalidateTag("admin-dashboard");
  revalidateDivisionRuntimePaths(divisionSlug);
  revalidateSuperAdminOverviewData();
  revalidateDivisionReportData(divisionSlug);
}

export async function updateDivisionRuleSettings(
  divisionSlug: string,
  input: RulesSettingsInput,
  actor?: RuleSettingsActor | null,
): Promise<DivisionRuleSettings> {
  validateWarningThresholdOrder(input);
  const analysisUpdate = input.examAnalysis === undefined ? {} : { examAnalysis: examAnalysisSettingsSchema.parse(input.examAnalysis) };
  const attendancePointRuleSettings = normalizeAttendancePointRuleSettings(input);
  // 저장 전 값을 떠 둔다. 저장 후에 읽으면 무엇이 바뀌었는지 알 수 없다.
  const previousSettings = await getDivisionRuleSettings(divisionSlug).catch(() => null);

  if (isMockMode()) {
    const nextSettings = await updateMockState(async (state) => {
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
        ...analysisUpdate,
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
        perfectAttendanceWeeklyPts: input.perfectAttendanceWeeklyPts,
        perfectAttendanceMonthlyPts: input.perfectAttendanceMonthlyPts,
        expirationWarningDays: input.expirationWarningDays,
        updatedAt: new Date().toISOString(),
      };

      return getDivisionRuleSettingsFromRecord(
        serializeSettingsRecord(state.divisionSettingsByDivision[divisionSlug]),
      );
    });

    await recordRuleSettingsChange(divisionSlug, actor, previousSettings, nextSettings);
    return nextSettings;
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


  await prisma.divisionSettings.upsert({
    where: { divisionId: division.id },
    update: {
      ...analysisUpdate,
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
      perfectAttendanceWeeklyPts: input.perfectAttendanceWeeklyPts,
      perfectAttendanceMonthlyPts: input.perfectAttendanceMonthlyPts,
      expirationWarningDays: input.expirationWarningDays,
    },
    create: {
      ...createDbDefaultSettingsCreateInput(division.id),
      ...analysisUpdate,
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
      perfectAttendanceWeeklyPts: input.perfectAttendanceWeeklyPts,
      perfectAttendanceMonthlyPts: input.perfectAttendanceMonthlyPts,
      expirationWarningDays: input.expirationWarningDays,
    },
  });

  revalidateDivisionRuleSettings(divisionSlug);

  const nextSettings = await getDivisionRuleSettings(divisionSlug);
  await recordRuleSettingsChange(divisionSlug, actor, previousSettings, nextSettings);
  return nextSettings;
}

async function recordRuleSettingsChange(
  divisionSlug: string,
  actor: RuleSettingsActor | null | undefined,
  previousSettings: DivisionRuleSettings | null,
  nextSettings: DivisionRuleSettings,
) {
  if (!previousSettings) {
    return;
  }

  const { diffRuleSettings, recordDivisionSettingsChange } = await import(
    "@/lib/services/settings-history.service"
  );

  await recordDivisionSettingsChange(
    divisionSlug,
    actor ?? null,
    diffRuleSettings(previousSettings, nextSettings),
  );
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

  // 저장이 실패하면 그대로 오류로 알린다. 예전에는 '스키마 불일치'로 판정되면 저장 없이 기본값을 성공처럼 돌려줬다.
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

  revalidateTag(`division-settings:${divisionSlug}`);
  revalidateTag(`division-theme:${divisionSlug}`);
  revalidateTag("admin-dashboard");
  revalidateSuperAdminOverviewData();
  revalidateDivisionReportData(divisionSlug);
  return getDivisionGeneralSettings(divisionSlug);
}
