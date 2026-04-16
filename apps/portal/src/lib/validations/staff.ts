import { z } from 'zod'
import {
  PORTAL_INVITE_ROLE_KEYS,
  PORTAL_STAFF_MANAGED_APP_KEYS,
  PORTAL_STAFF_ROLE_KEYS,
  getPortalStaffAppRule,
} from '@/lib/staff-management-config'

const optionalTrimmedString = z.string().trim().max(50).optional().transform((value) => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
})

const inviteAppSchema = z.object({
  appKey: z.enum(PORTAL_STAFF_MANAGED_APP_KEYS),
  roleKey: z.enum(PORTAL_INVITE_ROLE_KEYS),
  divisions: z.array(z.string().trim().min(1)).optional(),
})

const updateMembershipSchema = z.object({
  appKey: z.enum(PORTAL_STAFF_MANAGED_APP_KEYS),
  roleKey: z.enum(PORTAL_STAFF_ROLE_KEYS),
  divisions: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(['active', 'suspended']),
})

function validateAssignments(
  assignments: Array<{ appKey: (typeof PORTAL_STAFF_MANAGED_APP_KEYS)[number]; roleKey: string; divisions?: string[] }>,
  mode: 'invite' | 'edit',
  ctx: z.RefinementCtx,
) {
  const seenAppKeys = new Set<string>()

  assignments.forEach((assignment, index) => {
    const path = ['apps', index] as const
    const rule = getPortalStaffAppRule(assignment.appKey)
    const allowedRoles = mode === 'invite' ? rule.inviteRoles : rule.editRoles

    if (!allowedRoles.includes(assignment.roleKey as never)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'roleKey'],
        message: '이 앱에는 선택할 수 없는 역할입니다.',
      })
    }

    if (seenAppKeys.has(assignment.appKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'appKey'],
        message: '같은 앱을 중복으로 추가할 수 없습니다.',
      })
      return
    }

    seenAppKeys.add(assignment.appKey)

    const divisions = Array.from(new Set((assignment.divisions ?? []).map((value) => value.trim()).filter(Boolean)))
    const requiresDivision = rule.requiresDivision && assignment.roleKey !== 'super_admin'

    if (requiresDivision && divisions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'divisions'],
        message: '최소 1개 지점을 선택해주세요.',
      })
    }

    if (!requiresDivision && divisions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'divisions'],
        message: '이 역할에는 지점을 지정할 수 없습니다.',
      })
    }

    if (requiresDivision && !rule.allowMultipleDivisions && divisions.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'divisions'],
        message: '이 앱은 한 번에 1개 지점만 지정할 수 있습니다.',
      })
    }
  })
}

export const inviteStaffSchema = z
  .object({
    email: z.string().trim().email('유효한 이메일을 입력해주세요.'),
    fullName: z.string().trim().min(1, '이름을 입력해주세요.').max(50, '이름은 50자 이내로 입력해주세요.'),
    phone: optionalTrimmedString,
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
    apps: z.array(inviteAppSchema).min(1, '최소 1개 앱 권한을 선택해주세요.'),
  })
  .superRefine((value, ctx) => {
    validateAssignments(value.apps, 'invite', ctx)
  })

export const updateMembershipsSchema = z
  .object({
    memberships: z.array(updateMembershipSchema),
  })
  .superRefine((value, ctx) => {
    validateAssignments(value.memberships, 'edit', ctx)
  })

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
})
