import 'server-only'

import { createHash, randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import type { StaffJwtPayload } from '@/types/database'
import { createServerClient } from '@/lib/supabase/server'
import { getBranchBySlug, type BranchRole } from '@/lib/branch-ops'
import { getClientIp } from '@/lib/auth/rateLimiter'

const SESSION_TTL_SEC = 8 * 60 * 60

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
  if (!payload.accountId || !payload.membershipId || !payload.sub) {
    return null
  }

  const db = createServerClient()
  const { data: sessionRow, error: sessionError } = await db
    .from('operator_sessions')
    .select('*')
    .eq('id', payload.sub)
    .maybeSingle()

  if (sessionError || !sessionRow) {
    return null
  }

  const session = sessionRow as Record<string, unknown>
  if (session.revoked_at) {
    return null
  }
  if (!session.expires_at || new Date(String(session.expires_at)).getTime() <= Date.now()) {
    return null
  }

  const { data: accountRow, error: accountError } = await db
    .from('operator_accounts')
    .select('*')
    .eq('id', payload.accountId)
    .maybeSingle()
  if (accountError || !accountRow) {
    return null
  }

  const account = accountRow as Record<string, unknown>
  if (!account.is_active) {
    return null
  }
  if ((payload.credentialVersion ?? 1) !== (Number(account.credential_version) || 1)) {
    return null
  }

  const { data: membershipRow, error: membershipError } = await db
    .from('operator_memberships')
    .select('*')
    .eq('id', payload.membershipId)
    .maybeSingle()
  if (membershipError || !membershipRow) {
    return null
  }

  const membership = membershipRow as Record<string, unknown>
  if (!membership.is_active) {
    return null
  }

  const expectedRole =
    expected.scope === 'super_admin'
      ? 'SUPER_ADMIN'
      : expected.scope === 'branch_admin'
        ? 'BRANCH_ADMIN'
        : 'STAFF'

  if (membership.role !== expectedRole) {
    return null
  }

  if (expectedRole !== 'SUPER_ADMIN' && expected.division) {
    const branch = await getBranchBySlug(expected.division)
    if (!branch || Number(membership.branch_id) !== branch.id) {
      return null
    }
  }

  await db
    .from('operator_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', payload.sub)

  return {
    session,
    account,
    membership,
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
}
