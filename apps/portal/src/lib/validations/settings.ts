import { z } from 'zod'
import { PORTAL_STAFF_MANAGED_APP_KEYS } from '@/lib/staff-management-config'

const managedAppKeySchema = z.enum(PORTAL_STAFF_MANAGED_APP_KEYS)

export const updateAppNamesSchema = z.object({
  apps: z.array(
    z.object({
      appKey: managedAppKeySchema,
      displayName: z
        .string()
        .trim()
        .min(1, '앱 이름을 입력해주세요.')
        .max(30, '앱 이름은 30자 이내로 입력해주세요.'),
    }),
  ).min(1, '변경할 앱 이름을 전달해주세요.'),
})
