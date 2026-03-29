import { z } from "zod";

export const scoreTargetUpsertSchema = z.object({
  examTypeId: z.string().trim().min(1, "시험 종류를 선택해 주세요."),
  targetScore: z
    .number()
    .int("목표 점수는 정수여야 합니다.")
    .min(0, "목표 점수는 0점 이상이어야 합니다."),
  note: z
    .string()
    .trim()
    .max(500, "목표 메모는 500자 이하로 입력해 주세요.")
    .nullable()
    .optional(),
});

export type ScoreTargetUpsertInput = z.infer<typeof scoreTargetUpsertSchema>;
