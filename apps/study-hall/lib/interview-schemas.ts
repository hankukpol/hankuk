import { z } from "zod";

import { INTERVIEW_RESULT_TYPE_VALUES, INTERVIEW_STATUS_VALUES } from "@/lib/interview-meta";

const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.");

const optionalYmdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  ymdSchema.nullable().optional(),
);

export const INTERVIEW_CATEGORY_VALUES = ["GENERAL", "STUDY"] as const;
export const STUDY_CAUSE_VALUES = ["CONCEPT", "MISTAKE", "TIME", "HARD", "ABSENCE", "OTHER"] as const;
export const INTERVIEW_TASK_STATUS_VALUES = ["PLANNED", "DONE", "PARTIAL", "NOT_DONE", "CANCELLED"] as const;

const optionalIdSchema = z.string().trim().max(100).nullable().optional();

/**
 * 학습 면담에서 정한 할 일 하나. 기준 점수(baseline)는 받지 않는다 — 서버가 진단을 다시 계산해 채운다.
 * 개수 상한은 입력 크기 보호용이다(제안 개수는 학원 설정 examAnalysis.diagnosis.maxTasks).
 */
export const interviewTaskInputSchema = z.object({
  examCategory: z.enum(["MORNING", "REGULAR"]).nullable().optional(),
  examTypeId: optionalIdSchema,
  subjectId: optionalIdSchema,
  sessionId: optionalIdSchema,
  subjectName: z.string().trim().min(1, "과목을 적어 주세요.").max(60),
  examDate: optionalYmdSchema,
  scope: z.string().trim().max(120).nullable().optional(),
  itemNos: z.array(z.number().int().min(1).max(500)).max(50).default([]),
  cause: z.enum(STUDY_CAUSE_VALUES, "원인을 선택해 주세요."),
  title: z.string().trim().min(1, "할 일을 적어 주세요.").max(120),
  method: z.string().trim().max(200).nullable().optional(),
  dueDate: optionalYmdSchema,
  visibleToStudent: z.boolean().default(true),
});

/** 지난 할 일을 이번 면담에서 확인한 결과. */
export const interviewTaskReviewSchema = z.object({
  taskId: z.string().trim().min(1).max(100),
  status: z.enum(INTERVIEW_TASK_STATUS_VALUES),
  note: z.string().trim().max(200).nullable().optional(),
});

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
  // 2026-10-07 학습 면담. 일반 면담(GENERAL)은 아래 칸을 보내지 않는다.
  category: z.enum(INTERVIEW_CATEGORY_VALUES).default("GENERAL"),
  diagnosisRange: z.object({ from: ymdSchema, to: ymdSchema }).optional(),
  tasks: z.array(interviewTaskInputSchema).max(12, "할 일은 12개까지 정할 수 있습니다.").default([]),
  reviews: z.array(interviewTaskReviewSchema).max(30).default([]),
}).refine(
  (value) => value.category === "STUDY" || (!value.tasks.length && !value.reviews.length && !value.diagnosisRange),
  { message: "할 일과 진단은 학습 면담에서만 저장합니다.", path: ["category"] },
);

/** 할 일 하나의 상태·공개 여부·확인 메모만 바꾼다. */
export const interviewTaskUpdateSchema = z
  .object({
    status: z.enum(INTERVIEW_TASK_STATUS_VALUES).optional(),
    visibleToStudent: z.boolean().optional(),
    reviewNote: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "변경할 내용을 입력해 주세요.",
  );

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
export type InterviewTaskInput = z.infer<typeof interviewTaskInputSchema>;
export type InterviewTaskReviewInput = z.infer<typeof interviewTaskReviewSchema>;
export type InterviewTaskUpdateInput = z.infer<typeof interviewTaskUpdateSchema>;

/** 서비스가 받는 면담 입력. 학습 면담 칸이 없는 예전 호출(일반 면담)도 그대로 받는다. */
export type InterviewCreateInput = Omit<InterviewSchemaInput, "category" | "tasks" | "reviews" | "diagnosisRange">
  & Partial<Pick<InterviewSchemaInput, "category" | "tasks" | "reviews" | "diagnosisRange">>;
