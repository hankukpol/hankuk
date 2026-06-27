import { z } from "zod";

const PHONE_RECORDS_MAX = 500;

export const phoneSubmissionStatusSchema = z.enum(["SUBMITTED", "NOT_SUBMITTED", "RENTED"]);

export type PhoneSubmissionStatusValue = z.infer<typeof phoneSubmissionStatusSchema>;

export const phoneSubmissionStatusInputSchema = phoneSubmissionStatusSchema.nullable();

export const phoneSubmissionBatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)"),
  periodId: z.string().min(1, "교시를 선택해주세요."),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: phoneSubmissionStatusInputSchema,
        rentalNote: z.string().max(200).optional(),
      }),
    )
    .min(1, "학생 정보가 없습니다.")
    .max(PHONE_RECORDS_MAX, `한 번에 ${PHONE_RECORDS_MAX}명까지만 저장할 수 있습니다.`),
});

export type PhoneSubmissionBatchSchemaInput = z.infer<typeof phoneSubmissionBatchSchema>;

export const phoneBulkRentalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)"),
  studentIds: z
    .array(z.string().min(1))
    .min(1, "학생을 선택해주세요.")
    .max(PHONE_RECORDS_MAX, `한 번에 ${PHONE_RECORDS_MAX}명까지만 대여 처리할 수 있습니다.`),
  startPeriodId: z.string().min(1, "시작 교시를 선택해주세요."),
  endPeriodId: z.string().min(1, "종료 교시를 선택해주세요."),
  rentalNote: z.string().max(200).optional(),
  overwriteExisting: z.boolean().optional(),
});

export type PhoneBulkRentalSchemaInput = z.infer<typeof phoneBulkRentalSchema>;
