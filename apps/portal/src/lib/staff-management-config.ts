import { HANKUK_APP_KEYS, HANKUK_SERVICE_CONFIG } from '@hankuk/config'

export const PORTAL_STAFF_MANAGED_APP_KEYS = [
  HANKUK_APP_KEYS.ACADEMY_OPS,
  HANKUK_APP_KEYS.CLASS_PASS,
  HANKUK_APP_KEYS.STUDY_HALL,
  HANKUK_APP_KEYS.SCORE_PREDICT,
  HANKUK_APP_KEYS.INTERVIEW_PASS,
] as const

export type PortalManagedStaffAppKey = (typeof PORTAL_STAFF_MANAGED_APP_KEYS)[number]

export const PORTAL_STAFF_ROLE_KEYS = ['super_admin', 'admin', 'assistant', 'staff'] as const
export type PortalStaffRoleKey = (typeof PORTAL_STAFF_ROLE_KEYS)[number]

export const PORTAL_INVITE_ROLE_KEYS = ['admin', 'assistant', 'staff'] as const
export type PortalInviteRoleKey = (typeof PORTAL_INVITE_ROLE_KEYS)[number]

export const PORTAL_STAFF_STATUS_KEYS = ['active', 'invited', 'suspended', 'archived'] as const
export type PortalStaffStatusKey = (typeof PORTAL_STAFF_STATUS_KEYS)[number]

export type PortalDivisionOption = {
  slug: string
  label: string
}

export type PortalStaffAppRule = {
  appKey: PortalManagedStaffAppKey
  displayNameFallback: string
  inviteRoles: readonly PortalInviteRoleKey[]
  editRoles: readonly PortalStaffRoleKey[]
  requiresDivision: boolean
  allowMultipleDivisions: boolean
  staticDivisions: readonly PortalDivisionOption[]
}

export const PORTAL_BASE_DIVISION_OPTIONS = Object.freeze([
  { slug: 'police', label: '경찰' },
  { slug: 'fire', label: '소방' },
]) satisfies readonly PortalDivisionOption[]

export const PORTAL_STAFF_APP_RULES = Object.freeze({
  [HANKUK_APP_KEYS.ACADEMY_OPS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.ACADEMY_OPS,
    displayNameFallback: HANKUK_SERVICE_CONFIG[HANKUK_APP_KEYS.ACADEMY_OPS].displayName,
    inviteRoles: ['admin'] as const,
    editRoles: ['super_admin', 'admin'] as const,
    requiresDivision: false,
    allowMultipleDivisions: false,
    staticDivisions: [] as const,
  }),
  [HANKUK_APP_KEYS.CLASS_PASS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.CLASS_PASS,
    displayNameFallback: HANKUK_SERVICE_CONFIG[HANKUK_APP_KEYS.CLASS_PASS].displayName,
    inviteRoles: ['admin', 'staff'] as const,
    editRoles: ['super_admin', 'admin', 'staff'] as const,
    requiresDivision: true,
    allowMultipleDivisions: true,
    staticDivisions: [] as const,
  }),
  [HANKUK_APP_KEYS.STUDY_HALL]: Object.freeze({
    appKey: HANKUK_APP_KEYS.STUDY_HALL,
    displayNameFallback: HANKUK_SERVICE_CONFIG[HANKUK_APP_KEYS.STUDY_HALL].displayName,
    inviteRoles: ['admin', 'assistant'] as const,
    editRoles: ['super_admin', 'admin', 'assistant'] as const,
    requiresDivision: true,
    allowMultipleDivisions: false,
    staticDivisions: [] as const,
  }),
  [HANKUK_APP_KEYS.SCORE_PREDICT]: Object.freeze({
    appKey: HANKUK_APP_KEYS.SCORE_PREDICT,
    displayNameFallback: HANKUK_SERVICE_CONFIG[HANKUK_APP_KEYS.SCORE_PREDICT].displayName,
    inviteRoles: ['admin'] as const,
    editRoles: ['admin'] as const,
    requiresDivision: true,
    allowMultipleDivisions: true,
    staticDivisions: PORTAL_BASE_DIVISION_OPTIONS,
  }),
  [HANKUK_APP_KEYS.INTERVIEW_PASS]: Object.freeze({
    appKey: HANKUK_APP_KEYS.INTERVIEW_PASS,
    displayNameFallback: HANKUK_SERVICE_CONFIG[HANKUK_APP_KEYS.INTERVIEW_PASS].displayName,
    inviteRoles: ['admin'] as const,
    editRoles: ['admin'] as const,
    requiresDivision: true,
    allowMultipleDivisions: true,
    staticDivisions: PORTAL_BASE_DIVISION_OPTIONS,
  }),
}) satisfies Record<PortalManagedStaffAppKey, PortalStaffAppRule>

export function isPortalManagedStaffAppKey(value: string): value is PortalManagedStaffAppKey {
  return PORTAL_STAFF_MANAGED_APP_KEYS.includes(value as PortalManagedStaffAppKey)
}

export function getPortalStaffAppRule(appKey: PortalManagedStaffAppKey) {
  return PORTAL_STAFF_APP_RULES[appKey]
}

export function getPortalRoleLabel(roleKey: PortalStaffRoleKey) {
  switch (roleKey) {
    case 'super_admin':
      return '총괄관리자'
    case 'assistant':
      return '조교'
    case 'staff':
      return '직원'
    default:
      return '관리자'
  }
}

export function getPortalStatusLabel(status: PortalStaffStatusKey) {
  switch (status) {
    case 'active':
      return '활성'
    case 'invited':
      return '초대됨'
    case 'suspended':
      return '정지'
    default:
      return '보관'
  }
}

export function getPortalDivisionLabel(slug: string) {
  const matched = PORTAL_BASE_DIVISION_OPTIONS.find((option) => option.slug === slug)
  return matched?.label ?? slug
}

export function getPortalRoleRank(roleKey: PortalStaffRoleKey) {
  switch (roleKey) {
    case 'super_admin':
      return 4
    case 'admin':
      return 3
    case 'assistant':
      return 2
    case 'staff':
      return 1
    default:
      return 0
  }
}

export function getPortalStatusRank(status: PortalStaffStatusKey) {
  switch (status) {
    case 'active':
      return 4
    case 'invited':
      return 3
    case 'suspended':
      return 2
    case 'archived':
      return 1
    default:
      return 0
  }
}
