/**
 * 아침 모의고사 개인 성적표의 화면 값. 새 통계를 만들지 않고 이미 가져온 회차별 점수·평균·문항 정오를 묶는다.
 * 학생과 관리자가 같은 함수를 쓰므로 같은 숫자와 같은 문장을 본다.
 *
 * - 점수는 회차 만점 기준 100점으로 바꿔 평균한다(아침은 대부분 100점 만점이라 값이 그대로다).
 * - '전체 평균'은 성적 파일의 전체 응시자 평균(external)이다. 내 점수와 전체 평균이 둘 다 있는 회차만 비교한다.
 * - '잘하고 있음' 기준은 학원 설정 morning.classGapPercent, '참고' 표시는 morning.movingAverageSessions 를 쓴다.
 */
import type { Comparison, PreviewData, PreviewItem } from './types';
import { reviewGroups } from './metrics';
import { isBelowFailCutoff, weekStart } from './report-summary';

// 음수도 0.5 를 바깥으로 올린다(-6.25 → -6.3). Math.round 는 음수의 0.5 를 0 쪽으로 보내 같은 행의 평균 표시와 어긋난다.
const round1 = (value: number) => Math.sign(value) * Math.round(Math.abs(value) * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const scaled = (value: number, fullScore: number | null) => (fullScore && fullScore > 0 ? (value / fullScore) * 100 : value);

/** 받침이 있으면 true. 과목 이름 뒤 조사(이/가, 은/는)를 고른다. */
function hasFinalConsonant(word: string) {
  const code = word.trim().charCodeAt(word.trim().length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return /[0-9lmnr]$/i.test(word.trim());
}
export const subjectParticle = (word: string, withFinal: string, withoutFinal: string) => `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;

/** 차이를 방향 있는 말로. 0 이면 '같음'. */
export function gapText(gap: number | null, unit = '점') {
  if (gap === null) return '비교 자료 없음';
  const value = round1(gap);
  if (value === 0) return '평균과 같음';
  return `${Math.abs(value)}${unit} ${value > 0 ? '높음' : '낮음'}`;
}

export type SubjectStatus = 'none' | 'fail' | 'first' | 'review' | 'average' | 'good';
export type WeekAttempt = { date: string; my: number | null; below: boolean };
export type MorningSubjectRow = {
  subjectId: string; name: string;
  /** 100점 기준 평균. 전체 평균과 비교할 수 있는 회차만 쓴다(그런 회차가 없으면 응시한 회차 전체). */
  my: number | null; benchmark: number | null; gap: number | null;
  attended: number; expected: number; paired: number;
  /** 학원 기준 회차 수보다 적게 비교됐다 — 표시는 하되 '참고'로 적는다. */
  few: boolean; failCount: number;
  status: SubjectStatus; statusLabel: string;
  /** weeks 와 같은 순서. 그 주에 시험이 없으면 빈 배열, 시험은 있었는데 점수가 없으면 my=null(결시). */
  weeks: WeekAttempt[][];
};
export type MorningPersonalSummary = {
  weeks: string[];
  subjects: MorningSubjectRow[];
  overall: { my: number | null; benchmark: number | null; gap: number | null; attended: number; expected: number };
  headline: { text: string; tone: 'danger' | 'warning' | 'success' | 'info' };
  scaledNote: boolean;
};

export function morningPersonalSummary(data: PreviewData, maxWeeks = 4): MorningPersonalSummary {
  const settings = data.morning?.settings?.morning;
  const required = settings?.movingAverageSessions ?? 0;
  const goodGap = settings?.classGapPercent ?? null;
  const weeks = Array.from(new Set(data.comparisons.map((r) => weekStart(r.date)))).sort().slice(-maxWeeks);
  const pairedOf = (rows: Comparison[]) => rows.filter((r) => r.my !== null && r.external !== null);
  const subjects = data.subjects.map((subject) => {
    const rows = data.comparisons.filter((r) => r.subjectId === subject.id).sort((a, b) => a.date.localeCompare(b.date));
    const taken = rows.filter((r) => r.my !== null);
    const paired = pairedOf(rows);
    const basis = paired.length ? paired : taken;
    const my = mean(basis.map((r) => scaled(r.my!, r.fullScore)));
    const benchmark = mean(paired.map((r) => scaled(r.external!, r.fullScore)));
    const gap = my !== null && benchmark !== null ? round1(my - benchmark) : null;
    const failCount = taken.filter((r) => r.fullScore !== null && isBelowFailCutoff(r.my!, r.fullScore, data.failCutoffPercent) === true).length;
    return {
      subjectId: subject.id, name: subject.name,
      my: my === null ? null : round1(my), benchmark: benchmark === null ? null : round1(benchmark), gap,
      attended: taken.length, expected: rows.length, paired: paired.length,
      few: paired.length > 0 && paired.length < required, failCount,
      status: 'none' as SubjectStatus, statusLabel: '',
      weeks: weeks.map((week) => rows.filter((r) => weekStart(r.date) === week).map((r) => ({
        date: r.date, my: r.my,
        below: r.my !== null && r.fullScore !== null && isBelowFailCutoff(r.my, r.fullScore, data.failCutoffPercent) === true,
      }))),
    };
  });

  // 가장 먼저 복습할 과목: 평균보다 낮은 과목 중 차이가 가장 큰 것. 기록이 충분한 과목을 먼저 고른다.
  const below = subjects.filter((s) => s.gap !== null && s.gap < 0);
  const pick = (list: MorningSubjectRow[]) => [...list].sort((a, b) => a.gap! - b.gap!)[0];
  const first = pick(below.filter((s) => !s.few)) ?? pick(below);
  for (const s of subjects) {
    if (s.expected === 0 || s.attended === 0) { s.status = 'none'; s.statusLabel = s.expected ? '응시 기록 없음' : '시험 없음'; }
    else if (s.failCount > 0) { s.status = 'fail'; s.statusLabel = `과락 ${s.failCount}회`; }
    else if (s.gap === null) { s.status = 'none'; s.statusLabel = '비교 자료 없음'; }
    else if (s === first) { s.status = 'first'; s.statusLabel = '가장 먼저 복습'; }
    else if (s.gap < 0) { s.status = 'review'; s.statusLabel = '복습 필요'; }
    else if (goodGap !== null && s.gap >= goodGap) { s.status = 'good'; s.statusLabel = '잘하고 있음'; }
    else { s.status = 'average'; s.statusLabel = '평균 이상'; }
  }

  const taken = data.comparisons.filter((r) => r.my !== null);
  const paired = pairedOf(data.comparisons);
  const overallMy = mean(taken.map((r) => scaled(r.my!, r.fullScore)));
  const overallBench = mean(paired.map((r) => scaled(r.external!, r.fullScore)));
  const pairedMy = mean(paired.map((r) => scaled(r.my!, r.fullScore)));

  return {
    weeks, subjects,
    overall: {
      my: overallMy === null ? null : round1(overallMy), benchmark: overallBench === null ? null : round1(overallBench),
      gap: pairedMy !== null && overallBench !== null ? round1(pairedMy - overallBench) : null,
      attended: taken.length, expected: data.comparisons.length,
    },
    headline: morningPersonalHeadline(subjects, first),
    scaledNote: data.comparisons.some((r) => r.fullScore !== null && r.fullScore !== 100),
  };
}

function morningPersonalHeadline(subjects: MorningSubjectRow[], first: MorningSubjectRow | undefined): MorningPersonalSummary['headline'] {
  const compared = subjects.filter((s) => s.gap !== null);
  if (!compared.length) {
    return subjects.some((s) => s.attended > 0)
      ? { text: '전체 평균과 비교할 수 있는 시험이 아직 없습니다.', tone: 'info' }
      : { text: '조회 기간에 응시한 아침 모의고사가 없습니다.', tone: 'info' };
  }
  const sentences: string[] = [];
  const failed = subjects.filter((s) => s.failCount > 0);
  if (failed.length) sentences.push(`${failed.map((s) => s.name).join(', ')}에서 과락 점수가 있었습니다.`);
  const enough = compared.filter((s) => !s.few);
  const best = [...(enough.length ? enough : compared)].filter((s) => s.gap! > 0 && s !== first).sort((a, b) => b.gap! - a.gap!)[0];
  if (best) sentences.push(`${subjectParticle(best.name, '은', '는')} 전체 평균보다 ${round1(best.gap!)}점 높습니다.`);
  if (first) sentences.push(`${subjectParticle(first.name, '이', '가')} 전체 평균보다 ${Math.abs(round1(first.gap!))}점 낮아 가장 먼저 복습해야 합니다.`);
  else sentences.push('모든 과목이 전체 평균 이상입니다.');
  if (!enough.length) sentences.push('아직 시험 횟수가 적어 참고용입니다.');
  return { text: sentences.join(' '), tone: failed.length ? 'danger' : first ? 'warning' : 'success' };
}

export type StudyRow = {
  sessionId: string; date: string; subjectId: string; subjectName: string; topic: string | null;
  my: number; external: number | null; fullScore: number | null;
  /** 100점 기준 전체 평균과의 차이. 평균이 없으면 null. */
  gap: number | null;
  /** 다른 응시자는 대부분 맞힌(학원 설정 기준 정답률 이상) 문제 중 내가 답을 골라 틀린 것 */
  easy: PreviewItem[];
  /** 그 밖의 틀린 문항(답을 비운 문항 포함) */
  other: PreviewItem[];
};

/**
 * 틀린 문항이 있는 응시 회차를, 전체 평균보다 많이 낮았던 시험부터 줄 세운다.
 * 정기 모의고사는 선택한 회차의 과목 행만 넘겨 같은 표를 만든다.
 */
export function morningStudyRows(data: PreviewData, comparisons: Comparison[] = data.comparisons): StudyRow[] {
  return comparisons.flatMap((r) => {
    if (r.my === null) return [];
    const items = data.items.filter((i) => i.sessionId === r.sessionId && i.subjectId === r.subjectId).sort((a, b) => a.itemNo - b.itemNo);
    const groups = reviewGroups(items, data.easyThreshold);
    const wrong = items.filter((i) => i.correct === false);
    if (!wrong.length) return [];
    const easy = new Set(groups.easy.map((i) => i.id));
    const gap = r.external === null ? null : round1(scaled(r.my, r.fullScore) - scaled(r.external, r.fullScore));
    return [{
      sessionId: r.sessionId, date: r.date, subjectId: r.subjectId, subjectName: r.subjectName, topic: r.topic,
      my: r.my, external: r.external, fullScore: r.fullScore, gap,
      easy: wrong.filter((i) => easy.has(i.id)), other: wrong.filter((i) => !easy.has(i.id)),
    }];
  }).sort((a, b) => (a.gap ?? Infinity) - (b.gap ?? Infinity) || b.easy.length - a.easy.length || b.date.localeCompare(a.date));
}

/** ISO 주(연도·주 번호)의 월요일. 주간 석차를 다른 표와 같은 'M/D 주'로 적는다. */
export function isoWeekMonday(weekYear: number, weekNumber: number) {
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (weekNumber - 1) * 7 * 86400000);
  return monday.toISOString().slice(0, 10);
}
