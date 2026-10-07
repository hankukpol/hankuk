/**
 * 성적표 인쇄(A4 표 서식)의 행. 화면 성적표와 같은 자료(PreviewData)와 같은 판정만 쓴다 — 새 통계를 만들지 않는다.
 * 인쇄 화면: components/exams/preview/ScorePrintSheet.tsx
 */
import type { PreviewData } from './types';
import { reviewGroups } from './metrics';
import { isBelowFailCutoff } from './report-summary';

// morning-personal.ts 와 같은 반올림·100점 환산(음수의 0.5 도 바깥으로).
const round1 = (value: number) => Math.sign(value) * Math.round(Math.abs(value) * 10) / 10;
const scaled = (value: number, fullScore: number | null) => (fullScore && fullScore > 0 ? (value / fullScore) * 100 : value);

/** 틀린 문항 번호. easy = 응시자 대부분이 맞힌 문제를 답을 골라 틀린 것(학원 설정 기준 정답률 이상). */
export type WrongItem = { itemNo: number; easy: boolean };

export function wrongItems(data: PreviewData, sessionId: string, subjectId: string): WrongItem[] {
  const items = data.items.filter((i) => i.sessionId === sessionId && i.subjectId === subjectId).sort((a, b) => a.itemNo - b.itemNo);
  const easy = new Set(reviewGroups(items, data.easyThreshold).easy.map((i) => i.id));
  return items.filter((i) => i.correct === false).map((i) => ({ itemNo: i.itemNo, easy: easy.has(i.id) }));
}

export type ScoreRecordRow = {
  key: string; date: string; subjectName: string; topic: string | null;
  my: number | null; external: number | null; fullScore: number | null;
  /** 100점 기준 내 점수 - 전체 평균. 어느 하나가 없으면 null. */
  gap: number | null;
  /** 과락(학원 설정 기준 미만) */
  below: boolean;
  wrong: WrongItem[];
};

/** 아침 시험 기록: 기간 안의 모든 시험을 날짜순(같은 날은 템플릿 과목 순서)으로 한 줄씩. 결시는 my=null. */
export function morningRecordRows(data: PreviewData): ScoreRecordRow[] {
  const order = new Map(data.subjects.map((s, index) => [s.id, index]));
  return [...data.comparisons]
    .sort((a, b) => a.date.localeCompare(b.date) || (order.get(a.subjectId) ?? 99) - (order.get(b.subjectId) ?? 99))
    .map((r) => ({
      key: `${r.sessionId}-${r.subjectId}`, date: r.date, subjectName: r.subjectName, topic: r.topic,
      my: r.my, external: r.external, fullScore: r.fullScore,
      gap: r.my !== null && r.external !== null ? round1(scaled(r.my, r.fullScore) - scaled(r.external, r.fullScore)) : null,
      below: r.my !== null && r.fullScore !== null && isBelowFailCutoff(r.my, r.fullScore, data.failCutoffPercent) === true,
      wrong: r.my === null ? [] : wrongItems(data, r.sessionId, r.subjectId),
    }));
}

/** 정기 점수 변화: 최근 회차부터 거꾸로 max 개를 골라 날짜순으로. */
export function regularHistoryRows(data: PreviewData, max = 5) {
  const rows = data.regular?.history?.rows ?? [];
  return rows.slice(-max).map((r) => ({
    date: r.date, total: r.total, fullScore: r.fullScore, isPartial: r.isPartial,
    rank: r.externalRank, count: r.externalCount,
  }));
}
