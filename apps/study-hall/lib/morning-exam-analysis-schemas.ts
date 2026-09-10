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

export const morningAnalysisRangeSchema = z.object({ from: dateSchema, to: dateSchema }).refine(value => {
  const span = Date.parse(value.to) - Date.parse(value.from);
  return span >= 0 && span <= 92 * 86400000;
}, "조회 기간은 시작일 이후 최대 92일까지 선택해주세요.");

export const morningAnalysisQuerySchema = examAnalysisSessionsQuerySchema.extend({
  from: dateSchema.optional(), to: dateSchema.optional(),
}).transform(value => ({ ...defaultMorningAnalysisRange(), ...value })).pipe(
  examAnalysisSessionsQuerySchema.and(morningAnalysisRangeSchema),
);
