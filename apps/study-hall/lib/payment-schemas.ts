import { z } from "zod";

export const paymentSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  paymentTypeId: z.string().min(1, "수납 유형을 선택해 주세요."),
  amount: z
    .number()
    .int("금액은 정수로 입력해 주세요.")
    .positive("금액은 1원 이상이어야 합니다."),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "납부일 형식이 올바르지 않습니다."),
  method: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type PaymentSchemaInput = z.infer<typeof paymentSchema>;
