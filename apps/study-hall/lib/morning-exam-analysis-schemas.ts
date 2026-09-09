import { z } from "zod";
import { examAnalysisSessionsQuerySchema } from "./exam-analysis-schemas";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 확인해주세요.").refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "날짜를 확인해주세요.");

export function defaultMorningAnalysisRange(now = new Date()) {
  const to = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - 83 * 86400000).toISOString().slice(0, 10);
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
