import { z } from "zod";

export const tuitionPlanSchema = z.object({
  name: z.string().trim().min(1, "플랜 이름을 입력해 주세요."),
  durationDays: z
    .number()
    .int("기간 일수는 정수여야 합니다.")
    .min(1, "기간 일수는 1일 이상이어야 합니다.")
    .nullable()
    .optional(),
  amount: z
    .number()
    .int("금액은 정수여야 합니다.")
    .min(0, "금액은 0원 이상이어야 합니다."),
  description: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type TuitionPlanSchemaInput = z.infer<typeof tuitionPlanSchema>;
