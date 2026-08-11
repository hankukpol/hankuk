/**
 * 비정상 답안 패턴 탐지 라이브러리
 *
 * 답안 모양처럼 신뢰도가 높은 신호는 통계에서 자동 제외하고,
 * 제출 시간과 저점처럼 오탐 가능성이 있는 신호는 관리자 검토 대상으로만 분류한다.
 */

export type AnswerSuspicionStatus = "CLEAR" | "REVIEW" | "EXCLUDED";

export interface AnswerValidationInput {
  /** 전체 선택 답안 배열 (1~4), 과목 구분 없이 평탄화 */
  answers: number[];
  /** 채점 결과 총점. 채점 대기 상태에서는 null */
  totalScore?: number | null;
  /** 현재 직렬의 활성 과목 maxScore 합계 */
  maxScore: number;
  /** 페이지 로드 후 최초 제출까지 소요시간. 수정 제출에서는 전달하지 않는다. */
  submitDurationMs?: number | null;
}

export interface AnswerValidationResult {
  status: AnswerSuspicionStatus;
  /** 기존 통계 필터와의 호환용. EXCLUDED일 때만 true다. */
  isSuspicious: boolean;
  needsReview: boolean;
  reasons: string[];
  exclusionReasons: string[];
  reviewReasons: string[];
}

export function buildAutomaticSuspicionData(result: AnswerValidationResult) {
  const reason = result.reasons.length > 0 ? result.reasons.join("; ") : null;

  return {
    suspicionStatus: result.status,
    isSuspicious: result.isSuspicious,
    suspiciousReason: reason,
    suspicionAutoReason: reason,
    suspicionManualDecision: false,
    suspicionReviewNote: null,
    suspicionReviewedAt: null,
  } as const;
}

const SINGLE_ANSWER_THRESHOLD = 0.85;
const CYCLE_MATCH_THRESHOLD = 0.8;
const MIN_CYCLE_LENGTH = 2;
const MAX_CYCLE_LENGTH = 5;
const ENTROPY_THRESHOLD = 0.8;
const UNREALISTIC_SCORE_THRESHOLD = 0.1;
const MIN_MS_PER_ANSWER = 1_200;

function checkSingleAnswerDominance(answers: number[]): string | null {
  if (answers.length === 0) return null;

  const freq = new Map<number, number>();
  for (const answer of answers) {
    freq.set(answer, (freq.get(answer) ?? 0) + 1);
  }

  for (const [answer, count] of freq) {
    const ratio = count / answers.length;
    if (ratio >= SINGLE_ANSWER_THRESHOLD) {
      return `단일 답 편중: ${answer}번 답이 ${(ratio * 100).toFixed(0)}% 선택됨`;
    }
  }

  return null;
}

function checkRepeatingCycle(answers: number[]): string | null {
  if (answers.length < MAX_CYCLE_LENGTH * 2) return null;

  for (let length = MIN_CYCLE_LENGTH; length <= MAX_CYCLE_LENGTH; length += 1) {
    const pattern = answers.slice(0, length);
    let matchCount = 0;

    for (let index = 0; index < answers.length; index += 1) {
      if (answers[index] === pattern[index % length]) {
        matchCount += 1;
      }
    }

    const ratio = matchCount / answers.length;
    if (ratio >= CYCLE_MATCH_THRESHOLD) {
      return `반복 패턴 감지: ${pattern.join("-")} 패턴 ${(ratio * 100).toFixed(0)}% 일치`;
    }
  }

  return null;
}

function checkLowEntropy(answers: number[]): string | null {
  if (answers.length === 0) return null;

  const freq = new Map<number, number>();
  for (const answer of answers) {
    freq.set(answer, (freq.get(answer) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const probability = count / answers.length;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  if (entropy < ENTROPY_THRESHOLD) {
    return `답안 분포 엔트로피 낮음: H=${entropy.toFixed(2)} (기준: ${ENTROPY_THRESHOLD})`;
  }

  return null;
}

function checkUnrealisticallyLowScore(
  totalScore: number | null | undefined,
  maxScore: number
): string | null {
  if (totalScore == null || maxScore <= 0) return null;

  const ratio = totalScore / maxScore;
  if (ratio < UNREALISTIC_SCORE_THRESHOLD) {
    return `저점 검토 필요: ${totalScore}점 (만점의 ${(ratio * 100).toFixed(1)}%)`;
  }

  return null;
}

function checkSuspiciouslyFastSubmit(
  durationMs: number | null | undefined,
  answerCount: number
): string | null {
  if (durationMs == null || durationMs <= 0 || answerCount < 1) return null;

  const minimumDurationMs = answerCount * MIN_MS_PER_ANSWER;
  if (durationMs < minimumDurationMs) {
    const seconds = Math.floor(durationMs / 1000);
    return `빠른 제출 검토 필요: ${seconds}초 (${answerCount}문항 참고 기준 ${Math.ceil(minimumDurationMs / 1000)}초)`;
  }

  return null;
}

export function validateAnswerPattern(input: AnswerValidationInput): AnswerValidationResult {
  const exclusionReasons = [
    checkSingleAnswerDominance(input.answers),
    checkRepeatingCycle(input.answers),
    checkLowEntropy(input.answers),
  ].filter((reason): reason is string => Boolean(reason));

  const reviewReasons = [
    checkUnrealisticallyLowScore(input.totalScore, input.maxScore),
    checkSuspiciouslyFastSubmit(input.submitDurationMs, input.answers.length),
  ].filter((reason): reason is string => Boolean(reason));

  const status: AnswerSuspicionStatus =
    exclusionReasons.length > 0
      ? "EXCLUDED"
      : reviewReasons.length > 0
        ? "REVIEW"
        : "CLEAR";
  const reasons = [...exclusionReasons, ...reviewReasons];

  return {
    status,
    isSuspicious: status === "EXCLUDED",
    needsReview: status === "REVIEW",
    reasons,
    exclusionReasons,
    reviewReasons,
  };
}
