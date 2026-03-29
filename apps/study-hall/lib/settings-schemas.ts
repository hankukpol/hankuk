import { z } from "zod";

import { DEFAULT_DIVISION_FEATURE_FLAGS } from "@/lib/division-features";

const hexColorPattern = /^#([0-9a-fA-F]{6})$/;

export const OPERATING_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type OperatingDayKey = (typeof OPERATING_DAY_KEYS)[number];
export type OperatingDays = Record<OperatingDayKey, boolean>;
export type StudyTrackList = string[];
export type WarningTemplateValue = {
  warnMsgLevel1: string;
  warnMsgLevel2: string;
  warnMsgInterview: string;
  warnMsgWithdraw: string;
};

export const OPERATING_DAY_LABELS: Record<OperatingDayKey, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
};

export const DEFAULT_OPERATING_DAYS: OperatingDays = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: false,
};

export const operatingDaysSchema = z.object({
  mon: z.boolean(),
  tue: z.boolean(),
  wed: z.boolean(),
  thu: z.boolean(),
  fri: z.boolean(),
  sat: z.boolean(),
  sun: z.boolean(),
});

export const studyTracksSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "직렬 이름을 입력해 주세요.")
      .max(40, "직렬 이름은 40자 이하여야 합니다."),
  )
  .max(30, "직렬은 최대 30개까지 등록할 수 있습니다.");

export const generalSettingsSchema = z.object({
  name: z.string().trim().min(1, "지점 이름을 입력해 주세요."),
  fullName: z.string().trim().min(1, "학원 이름을 입력해 주세요."),
  color: z.string().trim().regex(hexColorPattern, "HEX 색상 형식이어야 합니다."),
  isActive: z.boolean().default(true),
  operatingDays: operatingDaysSchema,
  studyTracks: studyTracksSchema,
});

export const divisionFeatureFlagsSchema = z.object({
  attendanceManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.attendanceManagement),
  announcements: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.announcements),
  phoneSubmissions: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.phoneSubmissions),
  studentManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.studentManagement),
  seatManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.seatManagement),
  pointManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.pointManagement),
  leaveManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.leaveManagement),
  warningManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.warningManagement),
  interviewManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.interviewManagement),
  examManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.examManagement),
  examScheduleManagement: z
    .boolean()
    .default(DEFAULT_DIVISION_FEATURE_FLAGS.examScheduleManagement),
  paymentManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.paymentManagement),
  reporting: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.reporting),
  staffManagement: z.boolean().default(DEFAULT_DIVISION_FEATURE_FLAGS.staffManagement),
});

export const featureSettingsSchema = z.object({
  featureFlags: divisionFeatureFlagsSchema,
});

export const rulesSettingsSchema = z
  .object({
    tardyMinutes: z.coerce.number().int().min(0, "지각 기준은 0분 이상이어야 합니다.").max(180),
    assistantPastEditAllowed: z.boolean().default(false),
    assistantPastEditDays: z.coerce.number().int().min(0, "허용 일수는 0 이상이어야 합니다.").max(30),
    warnLevel1: z.coerce.number().int().min(0, "1차 경고 기준은 0 이상이어야 합니다."),
    warnLevel2: z.coerce.number().int().min(0, "2차 경고 기준은 0 이상이어야 합니다."),
    warnInterview: z.coerce.number().int().min(0, "면담 기준은 0 이상이어야 합니다."),
    warnWithdraw: z.coerce.number().int().min(0, "퇴원 기준은 0 이상이어야 합니다."),
    holidayLimit: z.coerce.number().int().min(0, "외출권 한도는 0 이상이어야 합니다.").max(31),
    halfDayLimit: z.coerce.number().int().min(0, "반휴권 한도는 0 이상이어야 합니다.").max(31),
    healthLimit: z.coerce.number().int().min(0, "병가권 한도는 0 이상이어야 합니다.").max(31),
    holidayUnusedPts: z.coerce.number().int().min(0, "외출권 미사용 차감 점수는 0 이상이어야 합니다.").max(100),
    halfDayUnusedPts: z.coerce.number().int().min(0, "반휴권 미사용 차감 점수는 0 이상이어야 합니다.").max(100),
    warnMsgLevel1: z.string().trim().min(1, "1차 경고 문자 템플릿을 입력해 주세요.").max(1000),
    warnMsgLevel2: z.string().trim().min(1, "2차 경고 문자 템플릿을 입력해 주세요.").max(1000),
    warnMsgInterview: z.string().trim().min(1, "면담 문자 템플릿을 입력해 주세요.").max(1000),
    warnMsgWithdraw: z.string().trim().min(1, "퇴원 문자 템플릿을 입력해 주세요.").max(1000),
    perfectAttendancePtsEnabled: z.boolean().default(false),
    perfectAttendancePts: z.coerce.number().int().min(0, "개근 점수는 0 이상이어야 합니다.").max(100),
    expirationWarningDays: z.coerce.number().int().min(1, "만료 알림 일수는 1일 이상이어야 합니다.").max(90, "만료 알림 일수는 90일 이하여야 합니다."),
  })
  .superRefine((value, ctx) => {
    if (value.warnLevel1 >= value.warnLevel2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "1차 경고 기준은 2차 경고 기준보다 작아야 합니다.",
        path: ["warnLevel1"],
      });
    }

    if (value.warnLevel2 >= value.warnInterview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "2차 경고 기준은 면담 기준보다 작아야 합니다.",
        path: ["warnLevel2"],
      });
    }

    if (value.warnInterview >= value.warnWithdraw) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "면담 기준은 퇴원 기준보다 작아야 합니다.",
        path: ["warnInterview"],
      });
    }

    if (!value.assistantPastEditAllowed && value.assistantPastEditDays !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "과거 출결 수정을 허용하지 않으면 허용 일수는 0일이어야 합니다.",
        path: ["assistantPastEditDays"],
      });
    }
  });

export function normalizeOperatingDays(value: unknown): OperatingDays {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_OPERATING_DAYS;
  }

  const incoming = value as Record<string, unknown>;

  return {
    mon: typeof incoming.mon === "boolean" ? incoming.mon : DEFAULT_OPERATING_DAYS.mon,
    tue: typeof incoming.tue === "boolean" ? incoming.tue : DEFAULT_OPERATING_DAYS.tue,
    wed: typeof incoming.wed === "boolean" ? incoming.wed : DEFAULT_OPERATING_DAYS.wed,
    thu: typeof incoming.thu === "boolean" ? incoming.thu : DEFAULT_OPERATING_DAYS.thu,
    fri: typeof incoming.fri === "boolean" ? incoming.fri : DEFAULT_OPERATING_DAYS.fri,
    sat: typeof incoming.sat === "boolean" ? incoming.sat : DEFAULT_OPERATING_DAYS.sat,
    sun: typeof incoming.sun === "boolean" ? incoming.sun : DEFAULT_OPERATING_DAYS.sun,
  };
}

export function normalizeStudyTracks(value: unknown): StudyTrackList {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();

    if (!trimmed) {
      continue;
    }

    deduped.add(trimmed);
  }

  return Array.from(deduped).slice(0, 30);
}

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
export type DivisionFeatureSettingsInput = z.infer<typeof featureSettingsSchema>;
export type RulesSettingsInput = z.infer<typeof rulesSettingsSchema>;
