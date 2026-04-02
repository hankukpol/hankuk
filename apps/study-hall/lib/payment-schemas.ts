import { z } from "zod";

const paymentMethodFieldSchema = z
  .string()
  .trim()
  .min(1, "결제 수단을 선택해 주세요.")
  .max(50, "결제 수단은 50자 이하여야 합니다.");

export const paymentSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  paymentTypeId: z.string().min(1, "수납 유형을 선택해 주세요."),
  amount: z
    .number()
    .int("금액은 정수로 입력해 주세요.")
    .refine((value) => value !== 0, "금액은 0원일 수 없습니다."),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "결제 날짜 형식이 올바르지 않습니다."),
  method: paymentMethodFieldSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

const paymentPayloadSchema = z.object({
  paymentTypeId: z.string().min(1, "수납 유형을 선택해 주세요."),
  amount: z
    .number()
    .int("금액은 정수로 입력해 주세요.")
    .refine((value) => value !== 0, "금액은 0원일 수 없습니다."),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "결제 날짜 형식이 올바르지 않습니다."),
  method: paymentMethodFieldSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

const paymentEntriesSchema = z
  .array(paymentPayloadSchema)
  .min(1, "결제 항목을 1개 이상 입력해 주세요.")
  .max(10, "결제 항목은 최대 10개까지 입력할 수 있습니다.");

export const paymentBatchSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  payments: paymentEntriesSchema,
});

export const enrollPaymentSchema = z
  .object({
    student: z.object({
      name: z.string().trim().min(1, "학생 이름을 입력해 주세요."),
      studentNumber: z.string().trim().min(1, "학번을 입력해 주세요."),
      phone: z.string().trim().max(20, "연락처는 20자 이하여야 합니다.").nullable().optional(),
      memo: z.string().trim().max(2000, "메모는 2000자 이하여야 합니다.").nullable().optional(),
    }),
    tuitionPlanId: z.string().min(1, "수강 플랜을 선택해 주세요."),
    tuitionAmount: z
      .number()
      .int("적용 금액은 정수여야 합니다.")
      .min(0, "적용 금액은 0원 이상이어야 합니다.")
      .nullable()
      .optional(),
    tuitionExempt: z.boolean().optional(),
    tuitionExemptReason: z
      .string()
      .trim()
      .max(200, "면제 사유는 200자 이하여야 합니다.")
      .nullable()
      .optional(),
    courseStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "수강 시작일 형식이 올바르지 않습니다.")
      .optional(),
    payment: paymentPayloadSchema.optional(),
    payments: paymentEntriesSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.tuitionExempt && !value.payment && !value.payments?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payments"],
        message: "면제 학생이 아니면 수납 정보를 입력해 주세요.",
      });
    }
  });

export const renewPaymentSchema = z
  .object({
    studentId: z.string().min(1, "학생을 선택해 주세요."),
    tuitionPlanId: z.string().min(1, "연장 플랜을 선택해 주세요."),
    tuitionAmount: z
      .number()
      .int("적용 금액은 정수여야 합니다.")
      .min(0, "적용 금액은 0원 이상이어야 합니다.")
      .nullable()
      .optional(),
    payment: paymentPayloadSchema.optional(),
    payments: paymentEntriesSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.payment && !value.payments?.length) {
      return;
    }
  });

const refundBaseSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  refundPaymentTypeId: z.string().min(1, "환불 수납 유형을 선택해 주세요."),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "환불 날짜 형식이 올바르지 않습니다."),
});

const refundSimpleSchema = refundBaseSchema.extend({
  mode: z.literal("simple"),
  amount: z
    .number()
    .int("환불 금액은 정수로 입력해 주세요.")
    .positive("환불 금액은 0보다 커야 합니다."),
  originalPaymentId: z.string().trim().min(1).nullable().optional(),
  method: paymentMethodFieldSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

const refundCardFullCancelSchema = refundBaseSchema.extend({
  mode: z.literal("card-full-cancel"),
  originalPaymentId: z.string().min(1, "원결제를 선택해 주세요."),
  rechargePaymentTypeId: z.string().min(1, "재결제 수납 유형을 선택해 주세요."),
  rechargeAmount: z
    .number()
    .int("재결제 금액은 정수로 입력해 주세요.")
    .positive("재결제 금액은 0보다 커야 합니다."),
  refundNotes: z.string().trim().max(500).nullable().optional(),
  rechargeNotes: z.string().trim().max(500).nullable().optional(),
});

export const refundPaymentSchema = z.discriminatedUnion("mode", [
  refundSimpleSchema,
  refundCardFullCancelSchema,
]);

export type PaymentSchemaInput = z.infer<typeof paymentSchema>;
export type PaymentBatchSchemaInput = z.infer<typeof paymentBatchSchema>;
export type EnrollPaymentSchemaInput = z.infer<typeof enrollPaymentSchema>;
export type RenewPaymentSchemaInput = z.infer<typeof renewPaymentSchema>;
export type RefundPaymentSchemaInput = z.infer<typeof refundPaymentSchema>;
