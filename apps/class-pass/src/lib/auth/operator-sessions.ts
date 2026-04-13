import 'server-only'

import { createHash, randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import type { StaffJwtPayload } from '@/types/database'
import { createServerClient } from '@/lib/supabase/server'
import {
  getBranchBySlug,
  listOperatorAccounts,
  type BranchRole,
  type OperatorAccountWithMemberships,
  type OperatorMembershipRecord,
} from '@/lib/branch-ops'
import { getClientIp } from '@/lib/auth/rateLimiter'

const SESSION_TTL_SEC = 8 * 60 * 60
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000
const VALIDATION_CACHE_TTL_MS = 5_000

export type OperatorSessionScope = 'super_admin' | 'branch_admin' | 'staff'

type OperatorSessionContext = {
  accountId: number
  membershipId: number
  branchSlug: string | null
  role: BranchRole
  credentialVersion: number
  loginId: string
  displayName: string
  sharedUserId: string | null
}

type ValidatedOperatorSession = {
  session: Record<string, unknown>
  account: Record<string, unknown>
  membership: Record<string, unknown>
}

const validationCache = new Map<string, { value: ValidatedOperatorSession; ts: number }>()
const validationInFlight = new Map<string, Promise<ValidatedOperatorSession | null>>()

function hashValue(value: string | null | undefined) {
  if (!value) {
    return null
  }

  return createHash('sha256').update(value).digest('hex')
}

function normalizeSessionScope(role: BranchRole): OperatorSessionScope {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'super_admin'
    case 'BRANCH_ADMIN':
      return 'branch_admin'
    default:
      return 'staff'
  }
}

function getExpectedRole(scope: OperatorSessionScope): BranchRole {
  switch (scope) {
    case 'super_admin':
      return 'SUPER_ADMIN'
    case 'branch_admin':
      return 'BRANCH_ADMIN'
    default:
      return 'STAFF'
  }
}

async function getCachedOperatorSecuritySnapshot(
  accountId: number,
  membershipId: number,
): Promise<{
  account: OperatorAccountWithMemberships | null
  membership: OperatorMembershipRecord | null
}> {
  const accounts = await listOperatorAccounts()
  const account = accounts.find((item) => item.id === accountId) ?? null
  const membership = account?.memberships.find((item) => item.id === membershipId) ?? null

  return { account, membership }
}

function getValidationCacheKey(
  payload: StaffJwtPayload,
  expected: { scope: OperatorSessionScope; division?: string | null },
) {
  return [
    payload.sub,
    payload.accountId,
    payload.membershipId,
    payload.credentialVersion ?? 1,
    expected.scope,
    expected.division ?? '',
  ].join(':')
}

function getCachedValidation(key: string) {
  const cached = validationCache.get(key)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.ts >= VALIDATION_CACHE_TTL_MS) {
    validationCache.delete(key)
    return null
  }

  return cached.value
}

function setCachedValidation(key: string, value: ValidatedOperatorSession) {
  validationCache.set(key, { value, ts: Date.now() })
}

function clearCachedValidation(sessionId?: string) {
  if (!sessionId) {
    validationCache.clear()
    validationInFlight.clear()
    return
  }

  for (const key of validationCache.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      validationCache.delete(key)
    }
  }

  for (const key of validationInFlight.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      validationInFlight.delete(key)
    }
  }
}

export function getOperatorSessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_SEC * 1000)
}

export async function createOperatorSession(
  req: NextRequest,
  context: OperatorSessionContext,
): Promise<StaffJwtPayload> {
  const db = createServerClient()
  const expiresAt = getOperatorSessionExpiry()
  const ipHash = hashValue(getClientIp(req))
  const userAgent = req.headers.get('user-agent')
  const { data, error } = await db
    .from('operator_sessions')
    .insert({
      id: randomUUID(),
      operator_account_id: context.accountId,
      membership_id: context.membershipId,
      branch_id: context.branchSlug ? (await getBranchBySlug(context.branchSlug))?.id ?? null : null,
      role: context.role,
      expires_at: expiresAt.toISOString(),
      last_seen_at: new Date().toISOString(),
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create operator session: ${error?.message ?? 'unknown error'}`)
  }

  return {
    sub: String(data.id),
    role: context.role === 'STAFF' ? 'staff' : 'admin',
    division: context.branchSlug ?? undefined,
    adminId: context.role === 'STAFF' ? undefined : context.loginId,
    staffName: context.role === 'STAFF' ? context.displayName : undefined,
    authMethod:
      context.role === 'SUPER_ADMIN'
        ? 'super_admin'
        : context.role === 'BRANCH_ADMIN'
          ? 'operator'
          : 'operator_staff',
    sessionScope: normalizeSessionScope(context.role),
    accountId: context.accountId,
    membershipId: context.membershipId,
    branchSlug: context.branchSlug ?? undefined,
    credentialVersion: context.credentialVersion,
    sharedUserId: context.sharedUserId ?? undefined,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  }
}

export async function validateOperatorSession(
  payload: StaffJwtPayload,
  expected: {
    scope: OperatorSessionScope
    division?: string | null
  },
) {
  const accountId = payload.accountId
  const membershipId = payload.membershipId

  if (!accountId || !membershipId || !payload.sub) {
    return null
  }

  const cacheKey = getValidationCacheKey(payload, expected)
  const cached = getCachedValidation(cacheKey)
  if (cached) {
    return cached
  }
  const inFlight = validationInFlight.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const validationPromise = (async () => {
    const db = createServerClient()
    const { data: sessionRow, error: sessionError } = await db
      .from('operator_sessions')
      .select('id, operator_account_id, membership_id, branch_id, role, revoked_at, expires_at, last_seen_at')
      .eq('id', payload.sub)
      .eq('operator_account_id', accountId)
      .eq('membership_id', membershipId)
      .maybeSingle()

    if (sessionError || !sessionRow) {
      return null
    }

    const session = sessionRow as Record<string, unknown>
    if (session.revoked_at) {
      clearCachedValidation(payload.sub)
      return null
    }
    if (!session.expires_at || new Date(String(session.expires_at)).getTime() <= Date.now()) {
      clearCachedValidation(payload.sub)
      return null
    }

    const expectedRole = getExpectedRole(expected.scope)
    if (String(session.role || '') !== expectedRole) {
      return null
    }

    const securitySnapshot = await getCachedOperatorSecuritySnapshot(accountId, membershipId)
    if (!securitySnapshot.account || !securitySnapshot.membership) {
      return null
    }

    const account = securitySnapshot.account as unknown as Record<string, unknown>
    if (!account.is_active) {
      return null
    }
    if ((payload.credentialVersion ?? 1) !== (Number(account.credential_version) || 1)) {
      return null
    }

    const membership = securitySnapshot.membership as unknown as Record<string, unknown>
    if (!membership.is_active) {
      return null
    }

    if (membership.role !== expectedRole) {
      return null
    }

    const sessionBranchId =
      session.branch_id === null || session.branch_id === undefined ? null : Number(session.branch_id)
    const membershipBranchId =
      membership.branch_id === null || membership.branch_id === undefined ? null : Number(membership.branch_id)

    if (expectedRole === 'SUPER_ADMIN') {
      if (sessionBranchId !== null || membershipBranchId !== null) {
        return null
      }
    } else {
      if (sessionBranchId === null || membershipBranchId === null || sessionBranchId !== membershipBranchId) {
        return null
      }

      if (expected.division) {
        const payloadDivision = payload.branchSlug ?? payload.division
        if (payloadDivision !== expected.division) {
          return null
        }
      }
    }

    const result: ValidatedOperatorSession = {
      session,
      account,
      membership,
    }
    setCachedValidation(cacheKey, result)

    const lastSeenMs = session.last_seen_at ? new Date(String(session.last_seen_at)).getTime() : 0
    if (!Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs >= LAST_SEEN_UPDATE_INTERVAL_MS) {
      await db
        .from('operator_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', payload.sub)
    }

    return result
  })()

  validationInFlight.set(cacheKey, validationPromise)

  try {
    return await validationPromise
  } finally {
    validationInFlight.delete(cacheKey)
  }
}

export async function revokeOperatorSession(sessionId: string) {
  const db = createServerClient()
  const { error } = await db
    .from('operator_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('revoked_at', null)

  if (error) {
    throw new Error(`Failed to revoke operator session: ${error.message}`)
  }

  clearCachedValidation(sessionId)
}
