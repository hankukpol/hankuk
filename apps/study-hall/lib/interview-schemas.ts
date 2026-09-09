import { z } from "zod";

import { INTERVIEW_RESULT_TYPE_VALUES, INTERVIEW_STATUS_VALUES } from "@/lib/interview-meta";

const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.");

const optionalYmdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  ymdSchema.nullable().optional(),
);

export const interviewSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  date: ymdSchema,
  trigger: z.string().trim().max(200).nullable().optional(),
  reason: z.string().trim().min(1, "면담 사유를 입력해 주세요.").max(300),
  content: z.string().trim().max(2000).nullable().optional(),
  result: z.string().trim().max(1000).nullable().optional(),
  resultType: z.enum(INTERVIEW_RESULT_TYPE_VALUES, "면담 결과 유형을 선택해 주세요."),
  followUpDate: optionalYmdSchema,
  guardianContacted: z.boolean().default(false),
  status: z.enum(INTERVIEW_STATUS_VALUES).default("OPEN"),
});

/** 이력 카드에서 후속 조치만 손보는 경로. 전달된 필드만 갱신한다. */
export const interviewUpdateSchema = z
  .object({
    followUpDate: optionalYmdSchema,
    guardianContacted: z.boolean().optional(),
    status: z.enum(INTERVIEW_STATUS_VALUES).optional(),
    result: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "변경할 내용을 입력해 주세요.",
  );

export type InterviewSchemaInput = z.infer<typeof interviewSchema>;
export type InterviewUpdateSchemaInput = z.infer<typeof interviewUpdateSchema>;
