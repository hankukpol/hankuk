import { z } from "zod";
import { examAnalysisQuerySchema, examAnalysisSessionsQuerySchema } from "./exam-analysis-schemas";
import { morningAnalysisRangeSchema } from "./morning-exam-analysis-schemas";

export const examAnalysisExportSchema = z.union([
  examAnalysisQuerySchema.extend({ kind: z.literal("regular") }),
  examAnalysisSessionsQuerySchema.extend({ kind: z.literal("morning"), from: z.string(), to: z.string() }).and(morningAnalysisRangeSchema),
]);
export type ExamAnalysisExportInput = z.infer<typeof examAnalysisExportSchema>;
