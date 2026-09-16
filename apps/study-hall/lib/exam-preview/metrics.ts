import type { RegularRawSource } from '@/lib/exam-analysis-types';
import type { Comparison, PreviewItem } from './types';

export const ymd = (value: string | Date) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
export const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const average = (values: (number | null)[]) => {
  const numbers = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
};

/** Stored subject cohorts remain TOTAL-ranked; never re-rank them by subject. */
export function enrichSessions(source: RegularRawSource, examTypeId: string, sessionIds: string[], studentId?: string) {
  const type = source.examTypes.find(t => t.id === examTypeId);
  const students = new Set(source.students.filter(s => s.divisionId === source.divisionId).map(s => s.id));
  const comparisons: Comparison[] = [], items: PreviewItem[] = [];
  for (const session of source.sessions.filter(s => s.divisionId === source.divisionId && s.examTypeId === examTypeId && sessionIds.includes(s.id))) {
    const participants = source.participants.filter(p => p.divisionId === source.divisionId && p.sessionId === session.id && students.has(p.studentId));
    const mine = participants.find(p => p.studentId === studentId);
    const stored = source.items.filter(i => i.divisionId === source.divisionId && i.sessionId === session.id);
    const externalSubjects = object(object(session.externalStats).subjects);
    for (const subject of type?.subjects ?? []) {
      if (session.primarySubjectId && session.primarySubjectId !== subject.id) continue;
      const subjectItems = stored.filter(i => i.subjectId === subject.id);
      const takers = participants.filter(p => finite(object(p.subjectScores)[subject.id]) !== null);
      const external = object(externalSubjects[subject.id]);
      if (!subjectItems.length && !takers.length && !Object.keys(external).length) continue;
      const my = finite(object(mine?.subjectScores)[subject.id]);
      const count = finite(external.count);
      const distribution = Array.isArray(external.distribution) ? external.distribution as {score: number; count: number}[] : [];
      comparisons.push({ sessionId: session.id, date: ymd(session.examDate), subjectId: subject.id, subjectName: subject.name, topic: session.topic,
        fullScore: subjectItems.length ? subjectItems.reduce((sum, i) => sum + i.points, 0) : null,
        my, internal: average(takers.map(p => finite(object(p.subjectScores)[subject.id]))),
        external: count !== null && count > 0 ? finite(external.mean) : null,
        top10: external.top10Complete === true ? finite(external.top10Avg) : null,
        top30: external.top30Complete === true ? finite(external.top30Avg) : null,
        internalCount: takers.length, externalCount: count, externalFileCount: session.externalCohortSize,
        internalRank: my === null ? null : 1 + takers.filter(p => Number(object(p.subjectScores)[subject.id]) > my).length,
        externalRank: my === null || !distribution.length ? null : 1 + distribution.reduce((sum, p) => sum + (p.score > my ? p.count : 0), 0),
      });
      // Missing response rows are unknown, not unanswered. Exclude untaken alternatives.
      if (studentId && my === null) continue;
      const takerIds = new Set(takers.map(p => p.studentId));
      for (const item of subjectItems) {
        const responses = source.responses.filter(r => r.divisionId === source.divisionId && r.sessionId === session.id && r.subjectId === subject.id && r.itemNo === item.itemNo && takerIds.has(r.studentId));
        const response = responses.find(r => r.studentId === studentId);
        items.push({ id: `${session.id}-${subject.id}-${item.itemNo}`, sessionId: session.id, date: ymd(session.examDate), subjectId: subject.id, subjectName: subject.name,
          itemNo: item.itemNo, answerKey: item.answerKey, answer: response?.answer ?? null, correct: response?.isCorrect ?? null, points: item.points,
          externalRate: finite(item.correctRatePct), internalRate: responses.length ? responses.filter(r => r.isCorrect).length / responses.length * 100 : null,
          responseCount: responses.length, choices: Object.fromEntries(Object.entries(object(item.choiceRates)).filter((e): e is [string, number] => finite(e[1]) !== null && Number(e[1]) >= 0 && Number(e[1]) <= 100)), mostCommonWrong: item.mostCommonWrong ?? null });
      }
    }
  }
  return { comparisons: comparisons.sort((a, b) => a.date.localeCompare(b.date)), items: items.sort((a, b) => a.date.localeCompare(b.date) || a.subjectId.localeCompare(b.subjectId) || a.itemNo - b.itemNo) };
}

export function reviewGroups(items: PreviewItem[], threshold: number) {
  const wrong = items.filter(i => i.correct === false);
  return {
    easy: wrong.filter(i => i.answer !== null && i.answer.trim() !== '' && i.externalRate !== null && i.externalRate >= threshold),
    unanswered: wrong.filter(i => i.answer === null || i.answer.trim() === ''),
    other: wrong.filter(i => i.answer !== null && i.answer.trim() !== '' && (i.externalRate === null || i.externalRate < threshold)),
    points: wrong.reduce((sum, i) => sum + i.points, 0),
  };
}

/** Compare only paired attempts. If even one benchmark is missing, expose the paired n. */
export function pairedComparison(rows: Comparison[], key: 'external' | 'internal' | 'top10' | 'top30') {
  const paired = rows.filter(r => r.my !== null && r[key] !== null);
  return { count: paired.length, my: average(paired.map(r => r.my)), benchmark: average(paired.map(r => r[key])), gap: average(paired.map(r => r.my! - r[key]!)) };
}

/** All personal wrong counts include recorded blank answers; missing records stay excluded. */
export function progressAnswers(items: PreviewItem[]) {
  const recorded=items.filter(i=>i.correct!==null);
  const correct=recorded.filter(i=>i.correct===true);
  const unanswered=recorded.filter(i=>i.correct===false&&!i.answer?.trim());
  const wrong=recorded.filter(i=>i.correct===false);
  return { total:recorded.length, missing:items.length-recorded.length, correct, wrong, unanswered,
    correctRate:recorded.length?correct.length/recorded.length*100:null,
    wrongRate:recorded.length?wrong.length/recorded.length*100:null };
}

/** Each exam keeps its own five most frequently missed questions, including my correct answers. */
export function topWrongBySession(items: PreviewItem[]) {
  const sessions = Array.from(new Set(items.map(item => item.sessionId)));
  return sessions.flatMap(sessionId => items.filter(item => item.sessionId === sessionId && item.externalRate !== null && Number.isFinite(item.externalRate) && item.externalRate >= 0 && item.externalRate <= 100)
    .sort((a, b) => a.externalRate! - b.externalRate! || a.itemNo - b.itemNo).slice(0, 5));
}
