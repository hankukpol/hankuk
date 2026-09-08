import { z } from "zod";

export const examAnalysisSessionsQuerySchema = z.object({
  examTypeId: z.string().trim().min(1, "시험 종류를 선택해주세요.").max(200),
});
export const examAnalysisQuerySchema = examAnalysisSessionsQuerySchema.extend({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시험 날짜를 확인해주세요.").refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "시험 날짜를 확인해주세요."),
});
