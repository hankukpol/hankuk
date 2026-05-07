import type { TenantType } from '@/lib/tenant'

export const STAFF_COOKIE = 'staff_token'
export const ADMIN_COOKIE = 'admin_token'
export const SUPER_ADMIN_COOKIE = 'cp_super_admin'

export function getBranchAdminCookieName(branchSlug: TenantType | string) {
  return `cp_admin__${branchSlug}`
}

export function getBranchStaffCookieName(branchSlug: TenantType | string) {
  return `cp_staff__${branchSlug}`
}

export function getAdminCookieCandidates(branchSlug?: TenantType | string | null) {
  return branchSlug ? [getBranchAdminCookieName(branchSlug), ADMIN_COOKIE] : [SUPER_ADMIN_COOKIE, ADMIN_COOKIE]
}

export function getStaffCookieCandidates(branchSlug?: TenantType | string | null) {
  return branchSlug ? [getBranchStaffCookieName(branchSlug), STAFF_COOKIE] : [STAFF_COOKIE]
}
