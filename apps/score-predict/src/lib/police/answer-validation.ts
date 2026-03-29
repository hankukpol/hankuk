/**
 * 비정상 답안 패턴 탐지 라이브러리
 *
 * 모든 답을 1번으로 밀거나, 반복 패턴으로 입력하는 등
 * 실제 시험을 치르지 않은 비정상 제출을 탐지하여 통계 왜곡을 방지한다.
 */

interface AnswerValidationInput {
  /** 전체 선택 답안 배열 (1~4), 과목 구분 없이 평탄화 */
  answers: number[];
  /** 채점 결과 총점 (원점수 합계) */
  totalScore: number;
  /** 시험 만점 (경찰 250) */
  maxScore: number;
  /** 페이지 로드 → 제출까지 소요시간 (밀리초), 없으면 검사 생략 */
  submitDurationMs?: number | null;
}

interface AnswerValidationResult {
  isSuspicious: boolean;
  reasons: string[];
}

// ── 규칙 1: 단일 답 편중 ──────────────────────────────────
// 한 번호가 전체의 85% 이상 선택되면 의심
const SINGLE_ANSWER_THRESHOLD = 0.85;

function checkSingleAnswerDominance(answers: number[]): string | null {
  if (answers.length === 0) return null;

  const freq = new Map<number, number>();
  for (const a of answers) {
    freq.set(a, (freq.get(a) ?? 0) + 1);
  }

  for (const [answer, count] of freq) {
    const ratio = count / answers.length;
    if (ratio >= SINGLE_ANSWER_THRESHOLD) {
      return `단일 답 편중: ${answer}번 답이 ${(ratio * 100).toFixed(0)}% 선택됨`;
    }
  }

  return null;
}

// ── 규칙 2: 반복 패턴 ──────────────────────────────────
// 길이 2~5의 짧은 패턴이 전체의 80% 이상 반복되면 의심
const CYCLE_MATCH_THRESHOLD = 0.8;
const MIN_CYCLE_LENGTH = 2;
const MAX_CYCLE_LENGTH = 5;

function checkRepeatingCycle(answers: number[]): string | null {
  if (answers.length < MAX_CYCLE_LENGTH * 2) return null;

  for (let len = MIN_CYCLE_LENGTH; len <= MAX_CYCLE_LENGTH; len++) {
    const pattern = answers.slice(0, len);
    let matchCount = 0;

    for (let i = 0; i < answers.length; i++) {
      if (answers[i] === pattern[i % len]) {
        matchCount++;
      }
    }

    const ratio = matchCount / answers.length;
    if (ratio >= CYCLE_MATCH_THRESHOLD) {
      const patternStr = pattern.join("-");
      return `반복 패턴 감지: ${patternStr} 패턴 ${(ratio * 100).toFixed(0)}% 일치`;
    }
  }

  return null;
}

// ── 규칙 3: 낮은 엔트로피 ──────────────────────────────────
// Shannon entropy가 0.8 미만이면 의심 (균등 분포 시 H ≈ 2.0)
const ENTROPY_THRESHOLD = 0.8;

function checkLowEntropy(answers: number[]): string | null {
  if (answers.length === 0) return null;

  const freq = new Map<number, number>();
  for (const a of answers) {
    freq.set(a, (freq.get(a) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / answers.length;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  if (entropy < ENTROPY_THRESHOLD) {
    return `답안 분포 엔트로피 낮음: H=${entropy.toFixed(2)} (기준: ${ENTROPY_THRESHOLD})`;
  }

  return null;
}

// ── 규칙 4: 비현실적 저점 ──────────────────────────────────
// 총점이 만점의 10% 미만이면 의심 (랜덤 찍기 기대값 ~25%)
const UNREALISTIC_SCORE_THRESHOLD = 0.1;

function checkUnrealisticallyLowScore(
  totalScore: number,
  maxScore: number,
): string | null {
  if (maxScore <= 0) return null;

  const ratio = totalScore / maxScore;
  if (ratio < UNREALISTIC_SCORE_THRESHOLD) {
    return `비현실적 저점: ${totalScore}점 (만점의 ${(ratio * 100).toFixed(1)}%)`;
  }

  return null;
}

// ── 규칙 5: 비정상적으로 빠른 제출 ──────────────────────────────────
// 100문항을 2분(120초) 미만에 제출하면 의심
const MIN_SUBMIT_DURATION_MS = 120_000;

function checkSuspiciouslyFastSubmit(
  durationMs: number | null | undefined,
): string | null {
  if (durationMs == null || durationMs <= 0) return null;

  if (durationMs < MIN_SUBMIT_DURATION_MS) {
    const seconds = Math.round(durationMs / 1000);
    return `비정상적으로 빠른 제출: ${seconds}초 (기준: ${MIN_SUBMIT_DURATION_MS / 1000}초)`;
  }

  return null;
}

// ── 메인 함수 ──────────────────────────────────

export function validateAnswerPattern(
  input: AnswerValidationInput,
): AnswerValidationResult {
  const reasons: string[] = [];

  const r1 = checkSingleAnswerDominance(input.answers);
  if (r1) reasons.push(r1);

  const r2 = checkRepeatingCycle(input.answers);
  if (r2) reasons.push(r2);

  const r3 = checkLowEntropy(input.answers);
  if (r3) reasons.push(r3);

  const r4 = checkUnrealisticallyLowScore(input.totalScore, input.maxScore);
  if (r4) reasons.push(r4);

  const r5 = checkSuspiciouslyFastSubmit(input.submitDurationMs);
  if (r5) reasons.push(r5);

  // 규칙 1~4 중 하나라도 해당되거나, 규칙 5에 해당되면 의심
  const isSuspicious = reasons.length > 0;

  return { isSuspicious, reasons };
}
