import { z } from "zod";

const MORNING_EXAM_ROWS_MAX = 500;

export const morningExamScoresBatchSchema = z.object({
  examTypeId: z.string().min(1, "시험 종류를 선택해주세요."),
  subjectId: z.string().min(1, "과목을 선택해주세요."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)"),
  rows: z
    .array(
      z.object({
        studentId: z.string().min(1),
        score: z.number().int("점수는 정수여야 합니다.").min(0, "점수는 0 이상이어야 합니다.").nullable(),
        notes: z.string().max(500, "메모는 500자 이하여야 합니다.").nullable().optional(),
      }),
    )
    .min(1, "저장할 성적이 없습니다.")
    .max(MORNING_EXAM_ROWS_MAX, `한 번에 ${MORNING_EXAM_ROWS_MAX}명까지만 저장할 수 있습니다.`),
});

export type MorningExamScoresBatchInput = z.infer<typeof morningExamScoresBatchSchema>;
