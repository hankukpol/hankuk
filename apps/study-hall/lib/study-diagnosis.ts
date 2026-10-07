/**
 * 학습 면담의 규칙 기반 진단(운영자 결정 2026-10-07: 외부 AI 없이 지금 있는 계산 규칙으로).
 *
 * 새 통계를 만들지 않는다. 개인 성적표가 이미 쓰는 값만 읽는다.
 * - 먼저 공부할 것의 순서는 '공부할 것' 탭과 같다(morningStudyRows: 전체 평균보다 많이 낮았던 시험부터).
 * - 틀린 문항을 나누는 기준은 학원 시험 분석 설정이다(쉬운 문항·고난도 정답률, 과락, 반 평균 격차, 최소 응시율).
 * - 제안 개수와 원인 판단 최소 오답 수도 학원 설정(examAnalysis.diagnosis)이다. 숫자를 코드에 두지 않는다.
 * 결과는 선생님이 면담에서 고쳐 쓰는 초안이다. 원인은 점수만으로 단정하지 않는다.
 */
import { morningPersonalSummary, morningStudyRows, subjectParticle, type StudyRow } from "@/lib/exam-preview/morning-personal";
import { isBelowFailCutoff, subjectVerdict } from "@/lib/exam-preview/report-summary";
import type { PreviewData, PreviewItem } from "@/lib/exam-preview/types";
import type { ExamAnalysisSettings } from "@/lib/exam-analysis-settings";
import { STUDY_CAUSE_WORDS, type StudyCause } from "@/lib/student-words";

export const STUDY_DIAGNOSIS_VERSION = 1;

export type DiagnosisPriority = {
  key: string;
  examCategory: "MORNING" | "REGULAR";
  examTypeId: string;
  sessionId: string;
  subjectId: string;
  subjectName: string;
  date: string;
  scope: string | null;
  itemNos: number[];
  /** 다른 응시생 대부분이 맞힌 문제 중 틀린 번호 */
  easyItemNos: number[];
  cause: StudyCause;
  /** 틀린 문항이 학원 기준보다 적어 원인을 단정하지 않았다 */
  reference: boolean;
  reason: string;
  method: string;
  /** 100점 기준 내 점수와 전체 평균. 다음 면담 때 점수 변화를 잴 기준이다. */
  baselineMy: number | null;
  baselineAverage: number | null;
  belowFailCutoff: boolean;
};

export type StudyDiagnosis = {
  version: number;
  ranges: { morning: { from: string; to: string } | null; regularDate: string | null };
  headline: { text: string; tone: "danger" | "warning" | "success" | "info" };
  strengths: string[];
  priorities: DiagnosisPriority[];
  questions: Array<{ cause: StudyCause | "DECLINE" | "ATTENDANCE" | "PREVIOUS"; text: string }>;
  cautions: string[];
  settingsUsed: { maxTasks: number; minWrongItems: number; easyMissedRatePercent: number; killerRatePercent: number; failCutoffPercent: number; classGapPercent: number; attendanceRatePercent: number };
};

export type DiagnosisPreviousTask = { subjectName: string; status: string };

export type StudyDiagnosisInput = {
  morning: PreviewData | null;
  regular: PreviewData | null;
  settings: ExamAnalysisSettings;
  attendance?: { absentCount: number; tardyCount: number } | null;
  previousTasks?: DiagnosisPreviousTask[];
};

const round1 = (value: number) => Math.sign(value) * Math.round(Math.abs(value) * 10) / 10;
const scaled = (value: number, fullScore: number | null) => (fullScore && fullScore > 0 ? (value / fullScore) * 100 : value);
// 같은 수일 때 고칠 수 있는 원인부터 보여 준다(순서일 뿐 수치 기준이 아니다).
type ItemCause = "MISTAKE" | "TIME" | "CONCEPT" | "HARD";
const CAUSE_ORDER: ItemCause[] = ["MISTAKE", "TIME", "CONCEPT", "HARD"];

/** 한 시험(과목)의 틀린 문항을 원인별로 나눈다. */
export function classifyWrongItems(items: PreviewItem[], settings: ExamAnalysisSettings) {
  const wrong = items.filter((item) => item.correct === false);
  const blank = (item: PreviewItem) => item.answer === null || item.answer.trim() === "";
  const groups: Record<ItemCause, PreviewItem[]> = { MISTAKE: [], TIME: [], CONCEPT: [], HARD: [] };
  for (const item of wrong) {
    if (blank(item)) groups.TIME.push(item);
    else if (item.externalRate !== null && item.externalRate >= settings.common.easyMissedRatePercent) groups.MISTAKE.push(item);
    else if (item.externalRate !== null && item.externalRate <= settings.common.killerRatePercent) groups.HARD.push(item);
    else groups.CONCEPT.push(item);
  }
  return { wrong, groups };
}

function priorityFromRow(row: StudyRow, data: PreviewData, category: "MORNING" | "REGULAR", settings: ExamAnalysisSettings): DiagnosisPriority {
  const items = data.items.filter((item) => item.sessionId === row.sessionId && item.subjectId === row.subjectId).sort((a, b) => a.itemNo - b.itemNo);
  const { wrong, groups } = classifyWrongItems(items, settings);
  let cause: ItemCause = CAUSE_ORDER.reduce<ItemCause>((best, next) => (groups[next].length > groups[best].length ? next : best), CAUSE_ORDER[0]);
  const below = row.fullScore !== null && isBelowFailCutoff(row.my, row.fullScore, settings.common.failCutoffPercent) === true;
  const farBelow = row.gap !== null && row.gap <= -settings.morning.classGapPercent;
  // 과락이거나 전체 평균보다 크게 낮은데 원인이 '어려운 문제'로 나오면, 어려운 문제 탓이 아니라 범위 전체가 약한 것이다.
  if (cause === "HARD" && (below || farBelow)) cause = "CONCEPT";
  const reference = wrong.length < settings.diagnosis.minWrongItems;
  const words = STUDY_CAUSE_WORDS[cause];
  return {
    key: `${category}:${row.sessionId}:${row.subjectId}`,
    examCategory: category,
    examTypeId: data.examType.id,
    sessionId: row.sessionId,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    date: row.date,
    scope: row.topic,
    itemNos: wrong.map((item) => item.itemNo),
    easyItemNos: groups.MISTAKE.map((item) => item.itemNo),
    cause,
    reference,
    reason: reference ? `틀린 문항이 ${wrong.length}개뿐이라 원인은 면담에서 확인해요.` : words.reason,
    method: words.method,
    baselineMy: round1(scaled(row.my, row.fullScore)),
    baselineAverage: row.external === null ? null : round1(scaled(row.external, row.fullScore)),
    belowFailCutoff: below,
  };
}

/** 과목이 겹치지 않게 먼저 고르고, 남는 자리를 같은 과목의 다음 시험으로 채운다. */
function pickPriorities(rows: DiagnosisPriority[], limit: number): DiagnosisPriority[] {
  const picked: DiagnosisPriority[] = [];
  const subjects = new Set<string>();
  for (const row of rows) {
    if (picked.length >= limit) break;
    const subject = `${row.examCategory}:${row.subjectId}`;
    if (subjects.has(subject)) continue;
    subjects.add(subject);
    picked.push(row);
  }
  for (const row of rows) {
    if (picked.length >= limit) break;
    if (!picked.includes(row)) picked.push(row);
  }
  return picked;
}

export function buildStudyDiagnosis(input: StudyDiagnosisInput): StudyDiagnosis {
  const { morning, regular, settings } = input;
  const rows: Array<{ row: DiagnosisPriority; order: number }> = [];
  if (morning) {
    morningStudyRows(morning).forEach((row, order) => rows.push({ row: priorityFromRow(row, morning, "MORNING", settings), order }));
  }
  if (regular?.regular) {
    const current = regular.comparisons.filter((row) => row.date === regular.range.to);
    morningStudyRows(regular, current).forEach((row, order) => rows.push({ row: priorityFromRow(row, regular, "REGULAR", settings), order }));
  }
  // 아침과 정기를 한 줄로 세운다. 100점 기준 전체 평균과의 차이가 큰(더 낮은) 시험부터, 평균이 없으면 뒤로.
  const gapOf = (row: DiagnosisPriority) => (row.baselineMy !== null && row.baselineAverage !== null ? row.baselineMy - row.baselineAverage : Infinity);
  rows.sort((a, b) => gapOf(a.row) - gapOf(b.row) || Number(b.row.belowFailCutoff) - Number(a.row.belowFailCutoff) || a.order - b.order);
  const priorities = pickPriorities(rows.map((entry) => entry.row), settings.diagnosis.maxTasks);

  const strengths: string[] = [];
  const cautions: string[] = [];
  const questions: StudyDiagnosis["questions"] = [];
  let failed = priorities.some((p) => p.belowFailCutoff);

  if (morning) {
    const summary = morningPersonalSummary(morning);
    for (const subject of summary.subjects) {
      if (subject.status === "good" && subject.gap !== null) strengths.push(`${subjectParticle(subject.name, "은", "는")} 아침 시험 전체 평균보다 ${round1(subject.gap)}점 높아요.`);
      if (subject.failCount > 0) failed = true;
    }
    const few = summary.subjects.filter((s) => s.few).map((s) => s.name);
    if (few.length) cautions.push(`${few.join(", ")}은(는) 시험 횟수가 적어 참고만 하세요.`);
    const lowAttendance = summary.subjects.filter((s) => s.expected > 0 && (s.attended / s.expected) * 100 < settings.morning.attendanceRatePercent);
    if (lowAttendance.length) {
      cautions.push(`${lowAttendance.map((s) => `${s.name} ${s.attended}/${s.expected}회`).join(", ")} 응시로 결시가 많아요.`);
      questions.push({ cause: "ABSENCE", text: STUDY_CAUSE_WORDS.ABSENCE.question });
    }
    if (morning.morning?.subjects.some((s) => s.flags.some((f) => f.kind === "consecutiveDrops" || f.kind === "ownAverageDrop"))) {
      questions.push({ cause: "DECLINE", text: "최근 점수가 내려가고 있어요. 공부 시간이나 생활에 바뀐 것이 있나요?" });
    }
  }

  if (regular?.regular) {
    for (const subject of regular.regular.stats.subjects) {
      const verdict = subjectVerdict(subject, settings.common.failCutoffPercent);
      if (verdict === "우수") strengths.push(`정기 모의고사 ${subjectParticle(subject.name, "은", "는")} 잘하고 있어요.`);
      if (verdict === "과락") failed = true;
    }
    if (regular.regular.myScore.isPartial) cautions.push("정기 모의고사는 일부 과목만 응시한 성적이에요.");
    if (regular.regular.flags.some((f) => f.kind === "totalDrop" || f.kind === "rankDrop") && !questions.some((q) => q.cause === "DECLINE")) {
      questions.push({ cause: "DECLINE", text: "최근 점수가 내려가고 있어요. 공부 시간이나 생활에 바뀐 것이 있나요?" });
    }
  }

  // 원인 질문은 '먼저 공부할 것' 순서대로 맨 앞에 둔다. 그 뒤가 결시·하락·출결 질문이다.
  const causeQuestions = Array.from(new Set(priorities.filter((p) => !p.reference).map((p) => p.cause)))
    .filter((cause) => STUDY_CAUSE_WORDS[cause].question)
    .map((cause) => ({ cause, text: STUDY_CAUSE_WORDS[cause].question }));
  questions.unshift(...causeQuestions);
  if (priorities.some((p) => p.reference)) cautions.push("틀린 문항이 적은 시험은 원인을 단정하지 않았어요. 면담에서 확인하세요.");

  const attendance = input.attendance;
  if (attendance) {
    if (attendance.absentCount + attendance.tardyCount > 0) {
      questions.push({ cause: "ATTENDANCE", text: `최근 지각 ${attendance.tardyCount}번, 결석 ${attendance.absentCount}번이 있어요. 생활 리듬은 어떤가요?` });
    } else {
      strengths.push("최근 지각·결석이 없어요.");
    }
  }

  const previous = input.previousTasks ?? [];
  const done = previous.filter((task) => task.status === "DONE");
  const missed = previous.filter((task) => task.status === "NOT_DONE" || task.status === "PARTIAL");
  if (done.length) strengths.push(`지난번 할 일 ${done.length}개를 해냈어요.`);
  if (missed.length) questions.push({ cause: "PREVIOUS", text: `지난번 할 일(${missed.map((task) => task.subjectName).join(", ")})을 다 못 한 이유는 무엇인가요?` });

  const first = priorities[0];
  const headline: StudyDiagnosis["headline"] = first
    ? {
        text: `${subjectParticle(first.subjectName, "이", "가")} 가장 먼저예요. ${first.reference ? "틀린 문제를 함께 다시 보며 원인을 찾아요." : `${STUDY_CAUSE_WORDS[first.cause].reason} ${STUDY_CAUSE_WORDS[first.cause].method}부터 해요.`}`,
        tone: failed ? "danger" : "warning",
      }
    : morning || regular?.regular
      ? { text: "지금은 크게 부족한 과목이 없어요. 지금처럼 꾸준히 하세요.", tone: "success" }
      : { text: "이 기간에 진단할 시험 성적이 없어요.", tone: "info" };

  return {
    version: STUDY_DIAGNOSIS_VERSION,
    ranges: { morning: morning ? morning.range : null, regularDate: regular?.regular ? regular.range.to : null },
    headline,
    strengths,
    priorities,
    questions,
    cautions,
    settingsUsed: {
      maxTasks: settings.diagnosis.maxTasks,
      minWrongItems: settings.diagnosis.minWrongItems,
      easyMissedRatePercent: settings.common.easyMissedRatePercent,
      killerRatePercent: settings.common.killerRatePercent,
      failCutoffPercent: settings.common.failCutoffPercent,
      classGapPercent: settings.morning.classGapPercent,
      attendanceRatePercent: settings.morning.attendanceRatePercent,
    },
  };
}

/**
 * 할 일을 정한 뒤 그 과목 점수가 얼마나 바뀌었는지. 면담일 다음 날부터 본 같은 과목 시험의 100점 기준 평균과
 * 할 일을 정할 때의 점수(baselineMy)를 비교한다. 그 뒤 시험이 없으면 change 는 null 이다.
 */
export function taskScoreChange(
  task: { subjectId: string | null; examCategory: "MORNING" | "REGULAR" | null; interviewDate: string; baselineMy: number | null },
  exams: { morning: PreviewData | null; regular: PreviewData | null },
): { after: number | null; change: number | null; count: number } {
  const data = task.examCategory === "REGULAR" ? exams.regular : exams.morning;
  if (!data || !task.subjectId) return { after: null, change: null, count: 0 };
  const rows = data.comparisons.filter((row) => row.subjectId === task.subjectId && row.date > task.interviewDate && row.my !== null);
  if (!rows.length) return { after: null, change: null, count: 0 };
  const after = round1(rows.reduce((sum, row) => sum + scaled(row.my!, row.fullScore), 0) / rows.length);
  return { after, change: task.baselineMy === null ? null : round1(after - task.baselineMy), count: rows.length };
}
