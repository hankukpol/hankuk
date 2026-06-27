import { z } from "zod";

export const studentUpsertSchema = z
  .object({
    name: z.string().trim().min(1, "학생 이름을 입력해 주세요.").max(50, "학생 이름은 50자 이하여야 합니다."),
    studentNumber: z.string().trim().min(1, "학번을 입력해 주세요.").max(50, "학번은 50자 이하여야 합니다."),
    studyTrack: z.string().trim().max(100, "직렬은 100자 이하여야 합니다.").nullable().optional(),
    phone: z.string().trim().max(20, "연락처는 20자 이하여야 합니다.").nullable().optional(),
    seatId: z.string().trim().nullable().optional(),
    courseStartDate: z.string().trim().nullable().optional(),
    courseEndDate: z.string().trim().nullable().optional(),
    tuitionPlanId: z.string().trim().nullable().optional(),
    tuitionAmount: z
      .number()
      .int("적용 금액은 정수여야 합니다.")
      .min(0, "적용 금액은 0원 이상이어야 합니다.")
      .max(2_000_000_000, "적용 금액이 너무 큽니다.")
      .nullable()
      .optional(),
    tuitionExempt: z.boolean().optional(),
    tuitionExemptReason: z
      .string()
      .trim()
      .max(200, "면제 사유는 200자 이하여야 합니다.")
      .nullable()
      .optional(),
    status: z.enum(["ACTIVE", "ON_LEAVE", "GRADUATED"]).optional(),
    memo: z.string().trim().max(2000, "메모는 2000자 이하여야 합니다.").nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tuitionExempt && !value.tuitionExemptReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tuitionExemptReason"],
        message: "수강료 면제 사유를 입력해 주세요.",
      });
    }
  });

export const studentWithdrawSchema = z.object({
  withdrawnNote: z.string().trim().min(1, "퇴실 사유를 입력해 주세요."),
});

export const studentMemoSchema = z.object({
  memo: z.string().trim().max(2000, "메모는 2000자 이하여야 합니다.").nullable(),
});
