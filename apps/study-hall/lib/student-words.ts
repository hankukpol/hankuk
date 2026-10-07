/**
 * 학생에게 보이는 말을 한곳에 모은다(운영자 요청 2026-10-07: 중학생도 바로 이해할 수 있게).
 *
 * - 계산은 바꾸지 않는다. 이미 계산된 값과 판정을 쉬운 말로만 옮긴다.
 * - 면담 때 선생님과 학생이 같은 성적표를 함께 보므로, 판정 말(VERDICT_WORDS)은 관리자 화면에도 같은 말을 쓴다.
 * - 화면에서 어려운 말을 고칠 때는 화면 파일이 아니라 이 파일을 고친다.
 */
import type { SubjectVerdict } from "@/lib/exam-preview/report-summary";

const one = (value: number) => Number(value.toFixed(1));

/** 정기 모의고사 과목 판정. 값(과락·우수·보통·취약·판정 불가)은 그대로 두고 화면 말만 바꾼다. */
export const VERDICT_WORDS: Record<SubjectVerdict, string> = {
  "과락": "과락",
  "우수": "잘하고 있음",
  "보통": "보통",
  "취약": "복습 필요",
  "판정 불가": "점수 정보 부족",
};

/** 상위 12.3% → "100명 중 약 12등". 비율을 모르면 null. */
export function aboutRankOf100(topPercent: number | null | undefined): string | null {
  if (topPercent === null || topPercent === undefined || !Number.isFinite(topPercent)) return null;
  return `100명 중 약 ${Math.max(1, Math.round(topPercent))}등`;
}

export type RegularFlag = { kind: string; detail: string; amount?: number; subject?: string };

/**
 * 정기 모의고사 점수 변화 경고를 학생 말로. 관리자 화면은 원래 detail 문장을 그대로 쓴다.
 * 기준값(몇 점·몇 % 이상이면 경고)은 학원 설정이 정하고, 여기서는 결과만 옮긴다.
 */
export function regularFlagWords(flag: RegularFlag): string {
  const amount = typeof flag.amount === "number" && Number.isFinite(flag.amount) ? one(flag.amount) : null;
  switch (flag.kind) {
    case "totalDrop":
      return amount === null ? "지난 시험보다 총점이 많이 내려갔어요." : `지난 시험보다 총점이 ${amount}점 내려갔어요.`;
    case "rankDrop":
      return amount === null ? "지난 시험보다 학원 석차가 많이 내려갔어요." : `지난 시험보다 학원 석차가 ${amount}계단 내려갔어요.`;
    case "targetGap":
      return amount === null ? "목표 점수까지 아직 거리가 있어요." : `목표 점수까지 ${amount}점 남았어요.`;
    case "weakSubject":
      return flag.subject
        ? `${flag.subject} 점수가 낮아요${amount === null ? "" : `(만점의 ${amount}%)`}. 이 과목을 먼저 복습하세요.`
        : "점수가 낮은 과목이 있어요. 그 과목을 먼저 복습하세요.";
    default:
      return flag.detail;
  }
}

/** 문항 표·공부할 것에서 쓰는 말. */
export const EXAM_WORDS = {
  overallRate: "전체 정답률",
  lostPoints: "틀려서 놓친 점수",
  mostCommonWrong: "가장 많이 고른 오답",
  academyRank: "학원 석차",
  overallRank: "전체 석차",
} as const;

/** 출결 범례. 짧은 말은 표 칸, 긴 말은 범례 설명이다. 색은 업무 의미가 있어 기존 상태색을 그대로 쓴다. */
export const ATTENDANCE_LEGEND = [
  { short: "출석", long: "제시간에 왔어요", className: "text-attend-present" },
  { short: "수업", long: "학원 수업을 들었어요(출석으로 셈)", className: "text-[var(--admin-attendance-class)]" },
  { short: "지각", long: "늦게 왔어요", className: "text-attend-tardy" },
  { short: "결석", long: "오지 않았어요", className: "text-attend-absent" },
  { short: "사유결석", long: "사유가 인정된 결석(벌점 없음)", className: "text-attend-excused" },
  { short: "휴무", long: "승인받은 하루 휴무", className: "text-admin-text-muted" },
  { short: "반휴", long: "승인받은 반나절 휴무", className: "text-admin-text-muted" },
  { short: "제외", long: "이 교시는 대상이 아니에요", className: "text-admin-text-muted" },
  { short: "쉬는 날", long: "학원이 쉬는 날이에요", className: "text-admin-text-muted" },
  { short: "예정", long: "아직 시작 전이에요", className: "text-admin-text-muted" },
  { short: "확인 전", long: "선생님이 아직 확인하지 않았어요", className: "text-attend-unprocessed" },
] as const;

/** 출결 칸의 학생용 짧은 말. 관리자 말(미처리·해당없음)만 바꾸고 나머지는 그대로 둔다. */
export function studentAttendanceWord(label: string): string {
  if (label === "미처리") return "확인 전";
  if (label === "해당없음") return "제외";
  if (label === "사유") return "사유결석";
  return label;
}

/** 상벌점 화면 말. */
export const POINT_WORDS = {
  merit: "상점",
  demerit: "벌점",
  /** 상점만큼 벌점을 줄여서 세는 학원 */
  offset: "상점만큼 줄어든 벌점",
  /** 상점과 벌점을 따로 세는 학원 */
  separate: "상점은 벌점을 줄이지 않아요",
  nextStage: (label: string, points: number) => `${label}까지 ${points}점 남았어요`,
  topStage: "가장 높은 경고 단계예요",
} as const;

/**
 * 학습 진단의 원인별 말(lib/study-diagnosis.ts). 원인은 규칙이 정하고, 말은 여기서 고친다.
 * - reason: 왜 이 원인으로 봤는지(근거) · method: 학생이 할 일 · question: 면담 때 선생님이 확인할 것
 * 점수만으로 원인을 단정하지 않는다 — 면담에서 학생 설명을 듣고 선생님이 원인을 바꿀 수 있다.
 */
export type StudyCause = "MISTAKE" | "TIME" | "CONCEPT" | "HARD" | "ABSENCE" | "OTHER";

export const STUDY_CAUSE_WORDS: Record<StudyCause, { label: string; reason: string; method: string; question: string }> = {
  MISTAKE: {
    label: "실수·문제 읽기",
    reason: "다른 응시생 대부분이 맞힌 문제를 틀렸어요.",
    method: "틀린 문제를 다시 풀면서 문제를 끝까지 읽고, 고른 보기가 왜 틀렸는지 한 줄로 적기",
    question: "문제를 끝까지 읽고 풀었나요? 헷갈린 보기는 무엇이었나요?",
  },
  TIME: {
    label: "시간 부족",
    reason: "답을 쓰지 못한 문제가 있어요.",
    method: "시간을 재고 같은 범위 문제를 풀기. 막히는 문제는 표시하고 넘어갔다가 돌아오기",
    question: "시간이 모자랐나요? 어느 문제에서 오래 걸렸나요?",
  },
  CONCEPT: {
    label: "개념 부족",
    reason: "전체 평균보다 많이 낮거나 맞힌 비율이 낮아요.",
    method: "시험 범위를 교재에서 다시 읽고 핵심 개념을 정리한 뒤 틀린 문제 다시 풀기",
    question: "이 범위 교재를 끝까지 봤나요? 이해가 안 된 부분은 어디인가요?",
  },
  HARD: {
    label: "어려운 문제",
    reason: "다른 응시생도 많이 틀린 어려운 문제를 틀렸어요.",
    method: "해설을 보며 풀이 과정을 따라 써 보기. 쉬운 문제부터 확실히 맞히기",
    question: "어려운 문제에 시간을 너무 쓰지 않았나요? 나중에 풀었나요?",
  },
  ABSENCE: {
    label: "결시",
    reason: "시험을 보지 않은 날이 많아요.",
    method: "아침 시험에 빠지지 않고 응시하기",
    question: "시험을 못 본 날은 왜 그랬나요?",
  },
  OTHER: {
    label: "기타",
    reason: "",
    method: "",
    question: "",
  },
};

/** 할 일 상태(InterviewTask.status)의 학생·관리자 말. */
export const TASK_STATUS_WORDS: Record<string, string> = {
  PLANNED: "할 일",
  DONE: "했음",
  PARTIAL: "일부 했음",
  NOT_DONE: "못 했음",
  CANCELLED: "취소",
};
