import { z } from "zod";

// 지점 관리자가 생성할 수 있는 역할: ADMIN, ASSISTANT만 가능 (SUPER_ADMIN 제외)
const divisionStaffRoleSchema = z.enum(["ADMIN", "ASSISTANT"]);

export const staffCreateSchema = z.object({
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  name: z.string().trim().min(1, "이름을 입력해주세요."),
  role: divisionStaffRoleSchema,
  isActive: z.boolean().optional().default(true),
});

export const staffUpdateSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요."),
  role: divisionStaffRoleSchema,
  isActive: z.boolean().default(true),
});

export const staffPasswordResetSchema = z.object({
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type StaffPasswordResetInput = z.infer<typeof staffPasswordResetSchema>;
