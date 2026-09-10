import { z } from "zod";

export const studentUpsertSchema = z
  .object({
    name: z.string().trim().min(1, "학생 이름을 입력해 주세요.").max(50, "학생 이름은 50자 이하여야 합니다."),
    studentNumber: z.string().trim().min(1, "수험번호를 입력해 주세요.").max(50, "수험번호는 50자 이하여야 합니다."),
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

export const studentBulkCreateSchema = z.object({
  /** 등록하는 학생 전원에게 같은 직렬을 적용한다. 시험 템플릿이 직렬로 대상자를 고른다. */
  studyTrack: z
    .string()
    .trim()
    .max(100, "직렬은 100자 이하여야 합니다.")
    .nullable()
    .optional(),
  rows: z
    .array(
      z.object({
        studentNumber: z
          .string()
          .trim()
          .min(1, "수험번호를 입력해 주세요.")
          .max(50, "수험번호는 50자 이하여야 합니다."),
        name: z
          .string()
          .trim()
          .min(1, "학생 이름을 입력해 주세요.")
          .max(50, "학생 이름은 50자 이하여야 합니다."),
        phone: z.string().trim().max(20, "연락처는 20자 이하여야 합니다.").nullable().optional(),
        seatLabel: z.string().trim().max(50, "좌석번호는 50자 이하여야 합니다.").nullable().optional(),
      }),
    )
    .min(1, "등록할 학생을 한 명 이상 선택해 주세요.")
    .max(500, "한 번에 등록할 수 있는 인원은 500명까지입니다."),
  /** 이미 등록된 수험번호를 건너뛰지 않고 이름·연락처를 덮어쓴다. */
  overwriteExisting: z.boolean().optional(),
});

export const studentWithdrawSchema = z.object({
  withdrawnNote: z.string().trim().min(1, "퇴실 사유를 입력해 주세요."),
});

export const studentMemoSchema = z.object({
  memo: z.string().trim().max(2000, "메모는 2000자 이하여야 합니다.").nullable(),
});
