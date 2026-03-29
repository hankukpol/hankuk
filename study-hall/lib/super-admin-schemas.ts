import { z } from "zod";

const slugPattern = /^[a-z0-9-]+$/;
const hexColorPattern = /^#([0-9a-fA-F]{6})$/;

export const divisionCreateSchema = z.object({
  name: z.string().trim().min(1, "지점 이름을 입력해주세요."),
  slug: z
    .string()
    .trim()
    .min(2, "slug를 입력해주세요.")
    .regex(slugPattern, "slug는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다."),
  fullName: z.string().trim().min(1, "전체 이름을 입력해주세요."),
  color: z.string().trim().regex(hexColorPattern, "HEX 색상 형식만 입력할 수 있습니다."),
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().optional().default(true),
});

export const divisionUpdateSchema = z.object({
  name: z.string().trim().min(1, "지점 이름을 입력해주세요."),
  fullName: z.string().trim().min(1, "전체 이름을 입력해주세요."),
  color: z.string().trim().regex(hexColorPattern, "HEX 색상 형식만 입력할 수 있습니다."),
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

const adminRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "ASSISTANT"]);

export const adminAccountCreateSchema = z
  .object({
    email: z.string().trim().email("이메일 형식이 올바르지 않습니다."),
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
    name: z.string().trim().min(1, "이름을 입력해주세요."),
    role: adminRoleSchema,
    divisionSlug: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.role !== "SUPER_ADMIN" && !value.divisionSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "지점을 선택해주세요.",
        path: ["divisionSlug"],
      });
    }
  });

export const adminAccountUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해주세요."),
    role: adminRoleSchema,
    divisionSlug: z.string().trim().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.role !== "SUPER_ADMIN" && !value.divisionSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "지점을 선택해주세요.",
        path: ["divisionSlug"],
      });
    }
  });

export const adminPasswordResetSchema = z.object({
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
});

export type AdminPasswordResetInput = z.infer<typeof adminPasswordResetSchema>;
export type DivisionCreateInput = z.infer<typeof divisionCreateSchema>;
export type DivisionUpdateInput = z.infer<typeof divisionUpdateSchema>;
export type AdminAccountCreateInput = z.infer<typeof adminAccountCreateSchema>;
export type AdminAccountUpdateInput = z.infer<typeof adminAccountUpdateSchema>;
