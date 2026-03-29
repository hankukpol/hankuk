import { z } from "zod";

export const phoneSubmissionStatusSchema = z.enum(["SUBMITTED", "NOT_SUBMITTED", "RENTED"]);

export type PhoneSubmissionStatusValue = z.infer<typeof phoneSubmissionStatusSchema>;

export const phoneSubmissionBatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)"),
  periodId: z.string().min(1, "교시를 선택해주세요."),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: phoneSubmissionStatusSchema,
        rentalNote: z.string().max(200).optional(),
      }),
    )
    .min(1, "학생 정보가 없습니다."),
});

export type PhoneSubmissionBatchSchemaInput = z.infer<typeof phoneSubmissionBatchSchema>;
