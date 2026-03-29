import { z } from "zod";

export const studentUpsertSchema = z.object({
  name: z.string().trim().min(1, "학생 이름을 입력해 주세요."),
  studentNumber: z.string().trim().min(1, "수험번호를 입력해 주세요."),
  studyTrack: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  seatId: z.string().trim().nullable().optional(),
  courseStartDate: z.string().trim().nullable().optional(),
  courseEndDate: z.string().trim().nullable().optional(),
  tuitionPlanId: z.string().trim().nullable().optional(),
  tuitionAmount: z
    .number()
    .int("적용 금액은 정수여야 합니다.")
    .min(0, "적용 금액은 0원 이상이어야 합니다.")
    .nullable()
    .optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "GRADUATED"]).optional(),
  memo: z.string().trim().nullable().optional(),
});

export const studentWithdrawSchema = z.object({
  withdrawnNote: z.string().trim().min(1, "퇴실 사유를 입력해 주세요."),
});

export const studentMemoSchema = z.object({
  memo: z.string().trim().max(2000, "메모는 2000자 이하여야 합니다.").nullable(),
});
