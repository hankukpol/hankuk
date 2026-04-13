import { NextRequest, NextResponse } from 'next/server'
import type { StaffJwtPayload } from '@/types/database'
import {
  ADMIN_COOKIE,
  STAFF_COOKIE,
  SUPER_ADMIN_COOKIE,
  getAdminCookieCandidates,
  getBranchAdminCookieName,
  getBranchStaffCookieName,
  getStaffCookieCandidates,
  verifyJwt,
} from '@/lib/auth/jwt'
import { validateOperatorSession } from '@/lib/auth/operator-sessions'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { DEFAULT_SESSION_VERSION, getSessionVersion } from '@/lib/auth/session-version'
import {
  readVerifiedAdminPayload,
  readVerifiedStaffPayload,
  readVerifiedSuperAdminPayload,
} from '@/lib/auth/verified-auth'
import { getServerTenantType } from '@/lib/tenant.server'

type AdminAuthResult = {
  payload: StaffJwtPayload | null
  error: NextResponse | null
}

type StaffAuthResult = {
  payload: StaffJwtPayload | null
  actingRole: 'staff' | 'admin' | null
  error: NextResponse | null
}

function hasCurrentSessionVersion(payload: StaffJwtPayload, currentVersion: number) {
  return (payload.sessionVersion ?? DEFAULT_SESSION_VERSION) === currentVersion
}

function getCookieValue(req: NextRequest, candidates: string[]) {
  for (const name of candidates) {
    const value = req.cookies.get(name)?.value
    if (value) {
      return value
    }
  }

  return null
}

async function validateLegacyAdmin(payload: StaffJwtPayload, division: string) {
  if (payload.role !== 'admin' || payload.division !== division) {
    return false
  }

  const currentVersion = await getSessionVersion('admin')
  return hasCurrentSessionVersion(payload, currentVersion)
}

async function validateLegacyStaff(payload: StaffJwtPayload, division: string) {
  if (payload.role !== 'staff' || payload.division !== division) {
    return false
  }

  const currentVersion = await getSessionVersion('staff')
  return hasCurrentSessionVersion(payload, currentVersion)
}

export async function authenticateAdminRequest(req: NextRequest): Promise<AdminAuthResult> {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return { payload: null, error: originError }
  }

  const division = await getServerTenantType()
  const token = getCookieValue(req, getAdminCookieCandidates(division))
  const payload = readVerifiedAdminPayload(req) ?? (token ? await verifyJwt(token) : null)

  if (!payload) {
    return {
      payload: null,
      error: NextResponse.json({ error: 'Admin authentication required.' }, { status: 403 }),
    }
  }

  if (payload.accountId && payload.membershipId && payload.sessionScope === 'branch_admin') {
    const session = await validateOperatorSession(payload, { scope: 'branch_admin', division })
    if (session) {
      return { payload, error: null }
    }
  }

  if (!(await validateLegacyAdmin(payload, division))) {
    return {
      payload: null,
      error: NextResponse.json({ error: 'Admin authentication required.' }, { status: 403 }),
    }
  }

  return { payload, error: null }
}

export async function authenticateSuperAdminRequest(req: NextRequest): Promise<AdminAuthResult> {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return { payload: null, error: originError }
  }

  const token = req.cookies.get(SUPER_ADMIN_COOKIE)?.value
  const payload = readVerifiedSuperAdminPayload(req) ?? (token ? await verifyJwt(token) : null)

  if (!payload || payload.role !== 'admin' || payload.sessionScope !== 'super_admin') {
    return {
      payload: null,
      error: NextResponse.json({ error: 'Super admin authentication required.' }, { status: 401 }),
    }
  }

  const session = await validateOperatorSession(payload, { scope: 'super_admin' })
  if (!session) {
    return {
      payload: null,
      error: NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 }),
    }
  }

  return { payload, error: null }
}

export async function authenticateStaffRequest(req: NextRequest): Promise<StaffAuthResult> {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return { payload: null, actingRole: null, error: originError }
  }

  const division = await getServerTenantType()
  const verifiedStaffPayload = readVerifiedStaffPayload(req)
  const verifiedAdminPayload = readVerifiedAdminPayload(req)
  const staffToken = getCookieValue(req, getStaffCookieCandidates(division))
  const adminToken = getCookieValue(req, getAdminCookieCandidates(division))
  const [staffPayload, adminPayload] = await Promise.all([
    verifiedStaffPayload
      ? Promise.resolve(verifiedStaffPayload)
      : staffToken
        ? verifyJwt(staffToken)
        : Promise.resolve(null),
    verifiedAdminPayload
      ? Promise.resolve(verifiedAdminPayload)
      : adminToken
        ? verifyJwt(adminToken)
        : Promise.resolve(null),
  ])

  if (staffPayload?.accountId && staffPayload.membershipId && staffPayload.sessionScope === 'staff') {
    const session = await validateOperatorSession(staffPayload, { scope: 'staff', division })
    if (session) {
      return { payload: staffPayload, actingRole: 'staff', error: null }
    }
  }

  if (staffPayload && (await validateLegacyStaff(staffPayload, division))) {
    return { payload: staffPayload, actingRole: 'staff', error: null }
  }

  if (adminPayload?.accountId && adminPayload.membershipId && adminPayload.sessionScope === 'branch_admin') {
    const session = await validateOperatorSession(adminPayload, { scope: 'branch_admin', division })
    if (session) {
      return { payload: adminPayload, actingRole: 'admin', error: null }
    }
  }

  if (adminPayload && (await validateLegacyAdmin(adminPayload, division))) {
    return { payload: adminPayload, actingRole: 'admin', error: null }
  }

  return {
    payload: null,
    actingRole: null,
    error: NextResponse.json({ error: 'Staff authentication required.' }, { status: 401 }),
  }
}

export function getCurrentAdminCookieName(division: string) {
  return getBranchAdminCookieName(division)
}

export function getCurrentStaffCookieName(division: string) {
  return getBranchStaffCookieName(division)
}

export function getLegacyAdminCookieName() {
  return ADMIN_COOKIE
}

export function getLegacyStaffCookieName() {
  return STAFF_COOKIE
}
