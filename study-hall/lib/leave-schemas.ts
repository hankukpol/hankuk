import { z } from "zod";

import { LEAVE_TYPE_VALUES } from "@/lib/leave-meta";

export const leavePermissionSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해주세요."),
  type: z.enum(LEAVE_TYPE_VALUES, "휴가 유형을 선택해주세요."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "휴가 날짜 형식이 올바르지 않습니다."),
  reason: z.string().trim().max(500).nullable().optional(),
});

export type LeavePermissionSchemaInput = z.infer<typeof leavePermissionSchema>;

export const leaveSettlementSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "정산 대상 월 형식이 올바르지 않습니다."),
});

export type LeaveSettlementSchemaInput = z.infer<typeof leaveSettlementSchema>;
