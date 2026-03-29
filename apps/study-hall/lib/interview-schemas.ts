import { z } from "zod";

import { INTERVIEW_RESULT_TYPE_VALUES } from "@/lib/interview-meta";

export const interviewSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "면담 날짜 형식이 올바르지 않습니다."),
  trigger: z.string().trim().max(200).nullable().optional(),
  reason: z.string().trim().min(1, "면담 사유를 입력해 주세요.").max(300),
  content: z.string().trim().max(2000).nullable().optional(),
  result: z.string().trim().max(1000).nullable().optional(),
  resultType: z.enum(INTERVIEW_RESULT_TYPE_VALUES, "면담 결과 유형을 선택해 주세요."),
});

export type InterviewSchemaInput = z.infer<typeof interviewSchema>;
