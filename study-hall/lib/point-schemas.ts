import { z } from "zod";

export const pointRuleSchema = z.object({
  category: z.enum(["ATTENDANCE", "BEHAVIOR", "EXAM", "LIFE", "OTHER"]),
  name: z.string().trim().min(1, "규칙 이름을 입력해주세요."),
  points: z.number().int(),
  description: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const pointRecordSchema = z
  .object({
    studentId: z.string().min(1, "학생을 선택해주세요."),
    ruleId: z.string().min(1).nullable().optional(),
    points: z.number().int().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
  })
  .refine((value) => value.ruleId || typeof value.points === "number", {
    message: "규칙을 선택하거나 직접 점수를 입력해주세요.",
    path: ["ruleId"],
  });

export const pointBatchSchema = z
  .object({
    studentIds: z.array(z.string().min(1)).min(1, "대상 학생을 한 명 이상 선택해주세요."),
    ruleId: z.string().min(1).nullable().optional(),
    points: z.number().int().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "부여 날짜 형식이 올바르지 않습니다."),
  })
  .refine((value) => value.ruleId || typeof value.points === "number", {
    message: "규칙을 선택하거나 직접 점수를 입력해주세요.",
    path: ["ruleId"],
  });
