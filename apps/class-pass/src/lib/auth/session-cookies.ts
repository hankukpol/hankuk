import { NextResponse } from 'next/server'
import {
  ADMIN_COOKIE,
  ADMIN_TTL_SEC,
  STAFF_COOKIE,
  STAFF_TTL_SEC,
  SUPER_ADMIN_COOKIE,
  clearCookieOptions,
  cookieOptions,
  getBranchAdminCookieName,
  getBranchStaffCookieName,
} from '@/lib/auth/jwt'

export function setBranchAdminSessionCookie(response: NextResponse, branchSlug: string, token: string) {
  response.cookies.set(getBranchAdminCookieName(branchSlug), token, cookieOptions(ADMIN_TTL_SEC))
  response.cookies.set(ADMIN_COOKIE, '', clearCookieOptions())
}

export function setBranchStaffSessionCookie(response: NextResponse, branchSlug: string, token: string) {
  response.cookies.set(getBranchStaffCookieName(branchSlug), token, cookieOptions(STAFF_TTL_SEC))
  response.cookies.set(STAFF_COOKIE, '', clearCookieOptions())
}

export function setSuperAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SUPER_ADMIN_COOKIE, token, cookieOptions(ADMIN_TTL_SEC))
}

export function clearBranchAdminSessionCookie(response: NextResponse, branchSlug: string) {
  response.cookies.set(getBranchAdminCookieName(branchSlug), '', clearCookieOptions())
  response.cookies.set(ADMIN_COOKIE, '', clearCookieOptions())
}

export function clearBranchStaffSessionCookie(response: NextResponse, branchSlug: string) {
  response.cookies.set(getBranchStaffCookieName(branchSlug), '', clearCookieOptions())
  response.cookies.set(STAFF_COOKIE, '', clearCookieOptions())
}

export function clearSuperAdminSessionCookie(response: NextResponse) {
  response.cookies.set(SUPER_ADMIN_COOKIE, '', clearCookieOptions())
}
