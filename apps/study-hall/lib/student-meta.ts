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
      return "border-admin-success-line bg-admin-success-soft text-admin-success";
    case "ON_LEAVE":
      return "border-admin-warning-line bg-admin-warning-soft text-admin-warning";
    case "WITHDRAWN":
      return "border-admin-danger-line bg-admin-danger-soft text-admin-danger";
    case "GRADUATED":
      return "border-admin-line bg-admin-surface-muted text-admin-text-secondary";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export function toDemeritPoints(points: number | null | undefined) {
  return Math.abs(Math.min(points ?? 0, 0));
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

export type NextWarningStage = {
  stage: WarningStageValue;
  /** 관리규정이 단계 이름을 덮어쓸 수 있어 라벨을 함께 돌려준다. */
  label: string;
  threshold: number;
  pointsRemaining: number;
};

/**
 * 지금 점수에서 다음 경고 단계까지 몇 점 남았는지. 최고 단계에 도달했으면 null.
 *
 * 현재 단계만 보여주면 억제 효과의 절반이 빠진다. 임계값은 화면에서 다시 비교하지 않고
 * `division_settings` 에서 읽은 값을 그대로 넘겨 이 한 곳에서만 계산한다.
 */
export function getNextWarningStage(
  demeritPoints: number,
  thresholds: WarningThresholds,
  stageLabels?: Record<string, string>,
): NextWarningStage | null {
  const stages = [
    { stage: "WARNING_1", threshold: thresholds.warnLevel1 },
    { stage: "WARNING_2", threshold: thresholds.warnLevel2 },
    { stage: "INTERVIEW", threshold: thresholds.warnInterview },
    { stage: "WITHDRAWAL", threshold: thresholds.warnWithdraw },
  ] as const satisfies ReadonlyArray<{ stage: WarningStageValue; threshold: number }>;

  const next = stages.find((entry) => demeritPoints < entry.threshold);

  if (!next) {
    return null;
  }

  return {
    stage: next.stage,
    label: stageLabels?.[next.stage] ?? getWarningStageLabel(next.stage),
    threshold: next.threshold,
    pointsRemaining: next.threshold - demeritPoints,
  };
}

/** 상자 없이 글자색만 쓸 때. 배지가 필요한 곳은 getStudentStatusClasses 를 쓴다. */
export function getStudentStatusToneClass(status: string | null | undefined) {
  switch (status) {
    case "ACTIVE":
      return "text-admin-success";
    case "ON_LEAVE":
      return "text-admin-warning";
    case "WITHDRAWN":
      return "text-admin-danger";
    case "GRADUATED":
      return "text-admin-text-secondary";
    default:
      return "text-admin-text-secondary";
  }
}

/** 상자 없이 글자색만 쓸 때. 배지가 필요한 곳은 getWarningStageClasses 를 쓴다. */
export function getWarningStageToneClass(stage: string | null | undefined) {
  switch (stage) {
    case "WARNING_1":
      return "text-warn-1";
    case "WARNING_2":
      return "text-warn-2";
    case "INTERVIEW":
      return "text-warn-interview";
    case "WITHDRAWAL":
      return "text-warn-withdraw";
    default:
      return "text-admin-success";
  }
}

export function getWarningStageClasses(stage: string | null | undefined) {
  switch (stage) {
    case "WARNING_1":
      return "border-warn-1-line bg-warn-1-soft text-warn-1";
    case "WARNING_2":
      return "border-warn-2-line bg-warn-2-soft text-warn-2";
    case "INTERVIEW":
      return "border-warn-interview-line bg-warn-interview-soft text-warn-interview";
    case "WITHDRAWAL":
      return "border-warn-withdraw-line bg-warn-withdraw-soft text-warn-withdraw";
    default:
      return "border-admin-success-line bg-admin-success-soft text-admin-success";
  }
}
