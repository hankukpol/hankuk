import { z } from "zod";

const examSubjectSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "과목명을 입력해주세요."),
  totalItems: z
    .number()
    .int("문항 수는 정수여야 합니다.")
    .positive("문항 수는 1 이상이어야 합니다.")
    .nullable()
    .optional(),
  pointsPerItem: z
    .number()
    .positive("문항당 배점은 0보다 커야 합니다.")
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const EXAM_CATEGORIES = ["MORNING", "REGULAR"] as const;
export type ExamCategory = (typeof EXAM_CATEGORIES)[number];

export const examTypeSchema = z.object({
  name: z.string().trim().min(1, "시험 종류명을 입력해주세요."),
  category: z.enum(["MORNING", "REGULAR"]).default("REGULAR"),
  studyTrack: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
  subjects: z.array(examSubjectSchema).min(1, "과목을 하나 이상 추가해주세요."),
});

export const examScoresBatchSchema = z.object({
  examTypeId: z.string().min(1, "시험 종류를 선택해주세요."),
  examRound: z
    .number()
    .int("회차는 정수여야 합니다.")
    .positive("회차는 1 이상이어야 합니다."),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "시험일 형식이 올바르지 않습니다.")
    .nullable()
    .optional(),
  rows: z
    .array(
      z.object({
        studentId: z.string().min(1),
        scores: z.record(z.string(), z.number().nullable()),
        notes: z.string().nullable().optional(),
      }),
    )
    .min(1, "저장할 성적이 없습니다."),
});

export type ExamTypeSchemaInput = z.infer<typeof examTypeSchema>;
export type ExamScoresBatchSchemaInput = z.infer<typeof examScoresBatchSchema>;
