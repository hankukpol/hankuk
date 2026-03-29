import { z } from "zod";

export const examScheduleSchema = z.object({
  name: z.string().min(1, "시험명을 입력해주세요.").max(100),
  type: z.enum(["WRITTEN", "PHYSICAL", "INTERVIEW", "RESULT", "OTHER"]),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)"),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const examScheduleUpdateSchema = examScheduleSchema.partial();

export type ExamScheduleSchemaInput = z.infer<typeof examScheduleSchema>;
export type ExamScheduleUpdateSchemaInput = z.infer<typeof examScheduleUpdateSchema>;
