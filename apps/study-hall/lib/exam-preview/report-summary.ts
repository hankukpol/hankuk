/**
 * 성적 보고서 첫 화면의 판정과 한 줄 결론.
 * 새 통계를 만들지 않는다 — 이미 계산된 점수·석차·등급·오답 수를 읽어 문장과 판정으로만 바꾼다.
 * 같은 입력이면 같은 문장이 나오므로 학생과 관리자가 같은 결론을 본다.
 */

export type SubjectGrade = "우수" | "보통" | "취약";
export type SubjectVerdict = "과락" | SubjectGrade | "판정 불가";
export type HeadlineTone = "danger" | "warning" | "info";

const one = (value: number) => Number(value.toFixed(1));
// 40.000000001 같은 부동소수 오차로 경계 점수가 과락으로 떨어지지 않게 한다.
const EPSILON = 1e-9;

/** 과락이면 true, 아니면 false. 만점을 모르면 판정할 수 없으므로 null. 기준 0 은 과락을 쓰지 않는다는 뜻이다. */
export function isBelowFailCutoff(score: number, fullScore: number, cutoffPercent: number): boolean | null {
  if (!Number.isFinite(score) || !Number.isFinite(fullScore) || fullScore <= 0) return null;
  if (!Number.isFinite(cutoffPercent) || cutoffPercent <= 0) return false;
  return score + EPSILON < fullScore * cutoffPercent / 100;
}

/** 과락이 먼저이고, 아니면 기존 과목 등급(gradeSubject)을 그대로 쓴다. */
export function subjectVerdict(subject: { my: number; fullScore: number; grade: SubjectGrade }, cutoffPercent: number): SubjectVerdict {
  const below = isBelowFailCutoff(subject.my, subject.fullScore, cutoffPercent);
  if (below === null) return "판정 불가";
  return below ? "과락" : subject.grade;
}

export type RegularHeadlineInput = {
  total: number;
  fullScore: number;
  isPartial: boolean;
  /** 시험 전체(가져온 파일 응시자) 기준 석차 */
  rank: number | null;
  count: number;
  topPercent: number | null;
  /** 응시한 과목만. 순서는 화면의 과목 순서 */
  subjects: Array<{ name: string; my: number; fullScore: number; grade: SubjectGrade }>;
  failCutoffPercent: number;
  /** 많이 맞힌(쉬운) 문제 중 답을 고르고 틀린 수 */
  easyWrong: number;
  /** 반복 오답 진도 이름. 진도 연결이 없으면 null */
  repeatedTopic: string | null;
  /** 채점 기록이 있는 오답 수(답안 미선택 포함) */
  wrong: number;
  /** 기존 하락 진단이 하나라도 있으면 true */
  declining: boolean;
};

export type Headline = { text: string; tone: HeadlineTone; failed: string[] };

export function regularHeadline(input: RegularHeadlineInput): Headline {
  const failed = input.subjects.filter((s) => isBelowFailCutoff(s.my, s.fullScore, input.failCutoffPercent) === true).map((s) => s.name);
  const facts: string[] = [`총점 ${one(input.total)}/${one(input.fullScore)}점${input.isPartial ? "(부분 응시)" : ""}`];
  if (input.rank !== null && input.count > 0) {
    facts.push(`${input.count}명 중 ${input.rank}위${input.topPercent === null ? "" : `(상위 ${one(input.topPercent)}%)`}`);
  }
  if (input.failCutoffPercent > 0) facts.push(failed.length ? `과락 ${failed.join(", ")}` : "과락 없음");
  // 같은 손실이면 화면 과목 순서가 앞선 과목을 고른다.
  let loss: { name: string; value: number } | null = null;
  for (const subject of input.subjects) {
    const value = subject.fullScore - subject.my;
    if (Number.isFinite(value) && value > 0 && (loss === null || value > loss.value + EPSILON)) loss = { name: subject.name, value };
  }
  if (loss) facts.push(`${loss.name}에서 ${one(loss.value)}점을 가장 많이 잃었습니다`);
  const action = input.easyWrong > 0 ? `많이 맞힌 문제 중 틀린 ${input.easyWrong}문항부터 다시 보세요.`
    : input.repeatedTopic ? `${input.repeatedTopic} 반복 오답을 복습하세요.`
      : input.wrong > 0 ? `틀린 ${input.wrong}문항을 다시 풀어 보세요.` : "";
  const text = [`${facts.join(" · ")}.`, action].filter(Boolean).join(" ");
  return { text, tone: failed.length ? "danger" : input.declining ? "warning" : "info", failed };
}

// ── 관리자 반 분석: 학생별 취약점 표 ────────────────────────────────────────
// 누가 어느 과목이 약한지 한 표로 본다. 기본 정렬은 위험 순(과락·과락선 미만 → 하락 → 점수 낮은 순).

export type CohortCell = { value: number | null; below: number };
export type CohortStudent = {
  studentId: string; name: string; studentNumber: string;
  cells: Record<string, CohortCell>;
  failed: string[]; declining: string[];
  score: number | null; rank: number | null; partial: boolean; summary: string;
};
type CohortSubject = { id: string; name: string; fullScore: number };

const byRisk = (a: CohortStudent, b: CohortStudent) =>
  b.failed.length - a.failed.length || b.declining.length - a.declining.length
  || (a.score ?? Infinity) - (b.score ?? Infinity) || a.name.localeCompare(b.name);

export function regularCohortRisk(
  ranking: Array<{ studentId: string; name: string; studentNumber: string; totalScore: number; subjectScores: Record<string, number>; isPartial: boolean; internalRank: number; flags: Array<{ kind: string }> }>,
  subjects: CohortSubject[], cutoffPercent: number,
): CohortStudent[] {
  return ranking.map((row) => {
    const cells: Record<string, CohortCell> = {};
    const failed: string[] = [];
    let loss: { name: string; value: number } | null = null;
    for (const subject of subjects) {
      const raw = row.subjectScores[subject.id];
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      const below = value !== null && isBelowFailCutoff(value, subject.fullScore, cutoffPercent) === true;
      cells[subject.id] = { value, below: below ? 1 : 0 };
      if (below) failed.push(subject.name);
      if (value !== null && subject.fullScore - value > (loss?.value ?? 0) + EPSILON) loss = { name: subject.name, value: subject.fullScore - value };
    }
    // 하락 경고는 총점·석차 하락만(목표 미달·취약 과목은 하락이 아니다).
    const declining = row.flags.flatMap((f) => (f.kind === "totalDrop" ? ["총점 하락"] : f.kind === "rankDrop" ? ["석차 하락"] : []));
    const summary = [cutoffPercent > 0 ? (failed.length ? `과락 ${failed.join(", ")}` : "과락 없음") : null,
      loss ? `최대 손실 ${loss.name} ${one(loss.value)}점` : null, ...declining].filter(Boolean).join(" · ");
    return { studentId: row.studentId, name: row.name, studentNumber: row.studentNumber, cells, failed, declining,
      score: row.totalScore, rank: row.internalRank, partial: row.isPartial, summary };
  }).sort(byRisk);
}

export function morningCohortRisk(
  rows: Array<{ studentId: string; name: string; studentNumber: string; subjectId: string; subjectName: string; average: number | null; attended: number; expected: number; flags: Array<{ kind: string }>; series: Array<{ score: number }> }>,
  subjects: CohortSubject[], cutoffPercent: number,
): CohortStudent[] {
  const students = new Map<string, typeof rows>();
  for (const row of rows) students.set(row.studentId, [...(students.get(row.studentId) ?? []), row]);
  return Array.from(students.values()).map((mine) => {
    const cells: Record<string, CohortCell> = {};
    const failed: string[] = [], declining: string[] = [], averages: number[] = [];
    for (const subject of subjects) {
      const row = mine.find((r) => r.subjectId === subject.id);
      const below = row ? row.series.filter((p) => isBelowFailCutoff(p.score, subject.fullScore, cutoffPercent) === true).length : 0;
      cells[subject.id] = { value: row?.average ?? null, below };
      if (below) failed.push(`${subject.name}(${below}회)`);
      if (row?.average !== null && row?.average !== undefined) averages.push(row.average);
      if (row?.flags.some((f) => f.kind === "consecutiveDrops" || f.kind === "ownAverageDrop" || f.kind === "classGap")) declining.push(subject.name);
    }
    const summary = [cutoffPercent > 0 ? (failed.length ? `과락선 미만 ${failed.join(", ")}` : "과락선 미만 없음") : null,
      declining.length ? `하락 ${declining.join(", ")}` : null].filter(Boolean).join(" · ");
    return { studentId: mine[0].studentId, name: mine[0].name, studentNumber: mine[0].studentNumber, cells, failed, declining,
      score: averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null, rank: null, partial: false, summary };
  }).sort(byRisk);
}

// ── 아침 모의고사 ─────────────────────────────────────────────────────────
// 학원은 매주 과목을 순서대로 한 번씩 치른다(순서는 시험 템플릿 displayOrder). 그래서 주 단위로 묶어 보여 준다.

type ScoreRow = { date: string; subjectId: string; my: number | null; fullScore: number | null; external: number | null };

/** 날짜(YYYY-MM-DD)가 속한 주의 월요일. 시험일은 이미 한국 날짜 문자열이다. */
export function weekStart(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`), day = new Date(t).getUTCDay();
  return new Date(t - ((day + 6) % 7) * 86400000).toISOString().slice(0, 10);
}
export const weekLabel = (monday: string) => `${Number(monday.slice(5, 7))}/${Number(monday.slice(8, 10))} 주`;

export type WeeklyCell = { my: number | null; fullScore: number | null; below: boolean };
export type WeeklyGrid = {
  weeks: string[];
  rows: Array<{ subjectId: string; name: string; cells: Array<WeeklyCell | null>; average: number | null; gap: number | null; attended: number; expected: number }>;
};

/**
 * 행 = 과목(주어진 순서), 열 = 최근 maxWeeks 주. 칸 = 그 주 그 과목 시험의 내 점수(같은 주에 두 번이면 늦은 날).
 * 시험이 없으면 null(빈칸), 시험은 있었는데 내 점수가 없으면 my=null(결시). 평균·대비는 조회 기간 전체의 응시 회차로 낸다.
 */
export function weeklyScoreGrid(rows: ScoreRow[], subjects: Array<{ id: string; name: string }>, cutoffPercent: number, maxWeeks = 4): WeeklyGrid {
  const weeks = Array.from(new Set(rows.map((r) => weekStart(r.date)))).sort().slice(-maxWeeks);
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return {
    weeks,
    rows: subjects.map((subject) => {
      const mine = rows.filter((r) => r.subjectId === subject.id).sort((a, b) => a.date.localeCompare(b.date));
      const taken = mine.filter((r) => r.my !== null && Number.isFinite(r.my));
      const paired = taken.filter((r) => r.external !== null && Number.isFinite(r.external));
      return {
        subjectId: subject.id, name: subject.name,
        cells: weeks.map((week) => {
          const hit = mine.filter((r) => weekStart(r.date) === week).at(-1);
          if (!hit) return null;
          return { my: hit.my, fullScore: hit.fullScore, below: hit.my !== null && hit.fullScore !== null && isBelowFailCutoff(hit.my, hit.fullScore, cutoffPercent) === true };
        }),
        average: mean(taken.map((r) => r.my as number)),
        gap: mean(paired.map((r) => (r.my as number) - (r.external as number))),
        attended: taken.length, expected: mine.length,
      };
    }),
  };
}

export type MorningHeadlineInput = {
  rows: Array<ScoreRow & { subjectName: string }>;
  failCutoffPercent: number;
  /** 기존 하락 진단(consecutiveDrops, ownAverageDrop)이 있는 과목 이름 */
  declining: string[];
  easyWrong: number;
  wrong: number;
};

export function morningHeadline(input: MorningHeadlineInput): Headline {
  const latest = input.rows.map((r) => weekStart(r.date)).sort().at(-1);
  if (!latest) return { text: "조회 기간에 가져온 아침 모의고사 성적이 없습니다.", tone: "info", failed: [] };
  const week = input.rows.filter((r) => weekStart(r.date) === latest);
  const taken = week.filter((r) => r.my !== null && Number.isFinite(r.my));
  const facts: string[] = [];
  if (!taken.length) facts.push(`최근 주(${weekLabel(latest)}) 응시 기록이 없습니다`);
  else {
    const sameFull = new Set(taken.map((r) => r.fullScore)).size === 1 && taken[0].fullScore !== null;
    const avg = sameFull ? taken.reduce((sum, r) => sum + (r.my as number), 0) / taken.length
      : taken.reduce((sum, r) => sum + (r.fullScore ? (r.my as number) / r.fullScore * 100 : 0), 0) / taken.length;
    const paired = taken.filter((r) => r.external !== null);
    const gap = sameFull && paired.length ? paired.reduce((sum, r) => sum + (r.my as number) - (r.external as number), 0) / paired.length : null;
    facts.push(`최근 주(${weekLabel(latest)}) ${taken.length}회 평균 ${sameFull ? `${one(avg)}점` : `득점률 ${one(avg)}%`}${gap === null ? "" : `(시험 응시자 평균 대비 ${gap >= 0 ? "+" : ""}${one(gap)}점)`}`);
  }
  if (input.declining.length) facts.push(`${input.declining.join(", ")} 하락 추세`);
  const below = input.rows.filter((r) => r.my !== null && r.fullScore !== null && isBelowFailCutoff(r.my, r.fullScore, input.failCutoffPercent) === true);
  if (below.length) facts.push(`과락선 미만 ${below.length}회(${Array.from(new Set(below.map((r) => r.subjectName))).join(", ")})`);
  const action = input.easyWrong > 0 ? `많이 맞힌 문제 중 틀린 ${input.easyWrong}문항부터 다시 보세요.`
    : input.wrong > 0 ? `틀린 ${input.wrong}문항을 다시 풀어 보세요.` : "";
  const failedThisWeek = Array.from(new Set(below.filter((r) => weekStart(r.date) === latest).map((r) => r.subjectName)));
  return { text: [`${facts.join(" · ")}.`, action].filter(Boolean).join(" "), tone: failedThisWeek.length ? "danger" : input.declining.length ? "warning" : "info", failed: failedThisWeek };
}
