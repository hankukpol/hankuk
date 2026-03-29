export const STUDENT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "재원" },
  { value: "ON_LEAVE", label: "일시중단" },
  { value: "WITHDRAWN", label: "퇴실" },
  { value: "GRADUATED", label: "수료" },
] as const;

export const WARNING_STAGE_OPTIONS = [
  { value: "NORMAL", label: "정상" },
  { value: "WARNING_1", label: "1차 경고" },
  { value: "WARNING_2", label: "2차 경고" },
  { value: "INTERVIEW", label: "면담 대상" },
  { value: "WITHDRAWAL", label: "퇴실 대상" },
] as const;

export type StudentStatusValue = (typeof STUDENT_STATUS_OPTIONS)[number]["value"];
export type WarningStageValue = (typeof WARNING_STAGE_OPTIONS)[number]["value"];

export type WarningThresholds = {
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
};

export function getStudentStatusLabel(status: string | null | undefined) {
  return STUDENT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "미정";
}

export function getStudentStatusClasses(status: string | null | undefined) {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "ON_LEAVE":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "WITHDRAWN":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "GRADUATED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export function getWarningStage(points: number, thresholds: WarningThresholds): WarningStageValue {
  if (points >= thresholds.warnWithdraw) {
    return "WITHDRAWAL";
  }

  if (points >= thresholds.warnInterview) {
    return "INTERVIEW";
  }

  if (points >= thresholds.warnLevel2) {
    return "WARNING_2";
  }

  if (points >= thresholds.warnLevel1) {
    return "WARNING_1";
  }

  return "NORMAL";
}

export function getWarningStageLabel(stage: string | null | undefined) {
  return WARNING_STAGE_OPTIONS.find((option) => option.value === stage)?.label ?? "정상";
}

export function getWarningStageClasses(stage: string | null | undefined) {
  switch (stage) {
    case "WARNING_1":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    case "WARNING_2":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "INTERVIEW":
      return "border-red-200 bg-red-50 text-red-700";
    case "WITHDRAWAL":
      return "border-rose-300 bg-rose-100 text-rose-900";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}
