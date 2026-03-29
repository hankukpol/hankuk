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
  operatingDays: unknown;
  studyTracks: unknown;
  featureFlags: unknown;
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: number;
  expirationWarningDays: number;
  updatedAt: Date;
};

type RawDivisionSettingsRecord = RawDbDivisionSettingsRecord | MockDivisionSettingsRecord;

type LegacyDivisionSettingsRow = {
  divisionId: string;
  warnLevel1: number | null;
  warnLevel2: number | null;
  warnInterview: number | null;
  warnWithdraw: number | null;
  tardyMinutes: number | null;
  holidayLimit: number | null;
  halfDayLimit: number | null;
  healthLimit: number | null;
  holidayUnusedPts: number | null;
  halfDayUnusedPts: number | null;
  operatingDays: unknown;
  updatedAt: Date | null;
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
  perfectAttendancePtsEnabled: false,
  perfectAttendancePts: 0,
  expirationWarningDays: 14,
};

const DIVISION_NOT_FOUND_ERROR = "지점 정보를 찾을 수 없습니다.";

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
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: number;
  expirationWarningDays: number;
  operatingDays: OperatingDays;
  studyTracks: StudyTrackList;
  featureFlags: DivisionFeatureFlags;
  updatedAt: string;
};

export type DivisionRuleSettings = Omit<
  DivisionSettingsRecord,
  "divisionId" | "operatingDays" | "studyTracks" | "featureFlags"
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
    perfectAttendancePtsEnabled: record.perfectAttendancePtsEnabled ?? false,
    perfectAttendancePts: record.perfectAttendancePts ?? 0,
    expirationWarningDays: (record as { expirationWarningDays?: number }).expirationWarningDays ?? 14,
    operatingDays: normalizeOperatingDays(record.operatingDays),
    studyTracks: normalizeStudyTracks(record.studyTracks),
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
    warnMsgLevel1: null,
    warnMsgLevel2: null,
    warnMsgInterview: null,
    warnMsgWithdraw: null,
    tardyMinutes: record.tardyMinutes ?? DEFAULT_RULE_VALUES.tardyMinutes,
    assistantPastEditAllowed: DEFAULT_RULE_VALUES.assistantPastEditAllowed,
    assistantPastEditDays: DEFAULT_RULE_VALUES.assistantPastEditDays,
    holidayLimit: record.holidayLimit ?? DEFAULT_RULE_VALUES.holidayLimit,
    halfDayLimit: record.halfDayLimit ?? DEFAULT_RULE_VALUES.halfDayLimit,
    healthLimit: record.healthLimit ?? DEFAULT_RULE_VALUES.healthLimit,
    holidayUnusedPts: record.holidayUnusedPts ?? DEFAULT_RULE_VALUES.holidayUnusedPts,
    halfDayUnusedPts: record.halfDayUnusedPts ?? DEFAULT_RULE_VALUES.halfDayUnusedPts,
    perfectAttendancePtsEnabled: DEFAULT_RULE_VALUES.perfectAttendancePtsEnabled,
    perfectAttendancePts: DEFAULT_RULE_VALUES.perfectAttendancePts,
    expirationWarningDays: DEFAULT_RULE_VALUES.expirationWarningDays,
    operatingDays: record.operatingDays ?? normalizeOperatingDays(undefined),
    studyTracks: normalizeStudyTracks(undefined),
    featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
    updatedAt: record.updatedAt ?? new Date(),
  });
}

async function readLegacyDivisionSettings(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
): Promise<DivisionSettingsRecord> {
  const rows = await prisma.$queryRaw<LegacyDivisionSettingsRow[]>`
    SELECT
      division_id AS "divisionId",
      warn_level1 AS "warnLevel1",
      warn_level2 AS "warnLevel2",
      warn_interview AS "warnInterview",
      warn_withdraw AS "warnWithdraw",
      tardy_minutes AS "tardyMinutes",
      holiday_limit AS "holidayLimit",
      half_day_limit AS "halfDayLimit",
      health_limit AS "healthLimit",
      holiday_unused_pts AS "holidayUnusedPts",
      half_day_unused_pts AS "halfDayUnusedPts",
      operating_days AS "operatingDays",
      updated_at AS "updatedAt"
    FROM division_settings
    WHERE division_id = ${divisionId}
    LIMIT 1
  `;

  return rows[0] ? serializeLegacySettingsRecord(rows[0]) : createDefaultSettingsRecord(divisionId);
}

async function upsertLegacyDivisionRuleSettings(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
  input: RulesSettingsInput,
) {
  await prisma.$executeRaw`
    INSERT INTO division_settings (
      division_id,
      warn_level1,
      warn_level2,
      warn_interview,
      warn_withdraw,
      tardy_minutes,
      holiday_limit,
      half_day_limit,
      health_limit,
      holiday_unused_pts,
      half_day_unused_pts
    ) VALUES (
      ${divisionId},
      ${input.warnLevel1},
      ${input.warnLevel2},
      ${input.warnInterview},
      ${input.warnWithdraw},
      ${input.tardyMinutes},
      ${input.holidayLimit},
      ${input.halfDayLimit},
      ${input.healthLimit},
      ${input.holidayUnusedPts},
      ${input.halfDayUnusedPts}
    )
    ON CONFLICT (division_id) DO UPDATE SET
      warn_level1 = EXCLUDED.warn_level1,
      warn_level2 = EXCLUDED.warn_level2,
      warn_interview = EXCLUDED.warn_interview,
      warn_withdraw = EXCLUDED.warn_withdraw,
      tardy_minutes = EXCLUDED.tardy_minutes,
      holiday_limit = EXCLUDED.holiday_limit,
      half_day_limit = EXCLUDED.half_day_limit,
      health_limit = EXCLUDED.health_limit,
      holiday_unused_pts = EXCLUDED.holiday_unused_pts,
      half_day_unused_pts = EXCLUDED.half_day_unused_pts
  `;
}

async function upsertLegacyDivisionGeneralSettings(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
  input: GeneralSettingsInput,
) {
  await prisma.$executeRaw`
    INSERT INTO division_settings (
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
        "feature_flags",
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

export async function getDivisionFeatureSettings(
  divisionSlug: string,
): Promise<DivisionFeatureSettings> {
  const settings = await getDivisionSettings(divisionSlug);

  return {
    featureFlags: settings.featureFlags,
    updatedAt: settings.updatedAt,
  };
}

export async function updateDivisionRuleSettings(
  divisionSlug: string,
  input: RulesSettingsInput,
): Promise<DivisionRuleSettings> {
  validateWarningThresholdOrder(input);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division =
        state.divisions.find((item) => item.slug === divisionSlug) ?? getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound(DIVISION_NOT_FOUND_ERROR);
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
        "feature_flags",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("division-settings:write-rules", error);
    await upsertLegacyDivisionRuleSettings(prisma, division.id, input);
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
    if (!isPrismaSchemaMismatchError(error, ["division_settings", "feature_flags"])) {
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
