import { z } from "zod";
import { examAnalysisSessionsQuerySchema } from "./exam-analysis-schemas";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 확인해주세요.").refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "날짜를 확인해주세요.");

/**
 * 기본 조회 기간은 오늘 하루다.
 *
 * 아침 시험은 매일 있다. 최근 84일을 기본으로 두면 시험 60여 회가 한 화면에 들어와,
 * 오늘 성적을 보러 온 사람이 매번 날짜를 좁혀야 했다. 과거를 볼 일이 있으면 시작일을
 * 뒤로 옮기면 되고, 그쪽이 덜 흔한 쪽이다.
 */
export function defaultMorningAnalysisRange(now = new Date()) {
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: today, to: today };
}

/**
 * 오늘까지 최근 N주(7N일). 성적 분석 화면의 기본 기간이다.
 * 아침 모의고사는 과목을 한 주에 한 번씩 돌아가며 치르므로, 오늘 하루나 ‘이번 달’로는
 * 과목별 회차가 추세 판단 최소 회수(movingAverageSessions)에 못 미친다(운영자 확인 2026-09-25).
 */
export function recentMorningAnalysisRange(weeks = 8, now = new Date()) {
  const { to } = defaultMorningAnalysisRange(now);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (weeks * 7 - 1) * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export const morningAnalysisRangeSchema = z.object({ from: dateSchema, to: dateSchema }).refine(value => {
  const span = Date.parse(value.to) - Date.parse(value.from);
  return span >= 0 && span <= 92 * 86400000;
}, "조회 기간은 시작일 이후 최대 92일까지 선택해주세요.");

export const morningAnalysisQuerySchema = examAnalysisSessionsQuerySchema.extend({
  from: dateSchema.optional(), to: dateSchema.optional(),
}).transform(value => ({ ...defaultMorningAnalysisRange(), ...value })).pipe(
  examAnalysisSessionsQuerySchema.and(morningAnalysisRangeSchema),
);
