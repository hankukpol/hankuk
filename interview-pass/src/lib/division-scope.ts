import type { TenantType } from '@/lib/tenant'

export const LEGACY_SHARED_DIVISION = 'shared' as const

export type ScopedDivision = TenantType | typeof LEGACY_SHARED_DIVISION

export function getScopedDivisionValues(division: TenantType): ScopedDivision[] {
  return [division, LEGACY_SHARED_DIVISION]
}

