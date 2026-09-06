import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { StaffJwtPayload } from '@/types/database'
import type { TenantType } from '@/lib/tenant'
import { findStoredStaffAccountByIdUncached, type StoredStaffAccount } from '@/lib/staff-accounts'

type StoredStaffClaims = Pick<StaffJwtPayload,
  'division' | 'authMethod' | 'staffName' | 'sessionVersion' | 'storedStaffAccountId' | 'storedStaffCredential'
>

export function hasStoredStaffSessionMarkers(payload: StaffJwtPayload) {
  // Presence, not truthiness: malformed claims cannot downgrade to shared PIN.
  return payload.authMethod === 'stored_staff'
    || 'storedStaffAccountId' in payload
    || 'storedStaffCredential' in payload
}

function credentialBinding(account: StoredStaffAccount, division: string, sessionId: string) {
  const key = process.env.JWT_SECRET
  if (!key || key.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.')
  }

  // Domain-separated, keyed binding: never put a raw PIN or its password hash
  // into a readable JWT. Include tenant, identity and session to prevent reuse.
  return createHmac('sha256', key)
    .update('class-pass:stored-staff-session:v1\0')
    .update(JSON.stringify([division, account.id, account.name, account.pin_hash, sessionId]))
    .digest('base64url')
}

export function createStoredStaffSessionClaims(
  account: StoredStaffAccount,
  division: TenantType,
  sessionId: string,
  sessionVersion: number,
): StoredStaffClaims {
  return {
    division,
    authMethod: 'stored_staff',
    staffName: account.name,
    sessionVersion,
    storedStaffAccountId: account.id,
    storedStaffCredential: credentialBinding(account, division, sessionId),
  }
}

export async function validateStoredStaffSession(payload: StaffJwtPayload, division: string) {
  if (payload.role !== 'staff' || payload.division !== division || payload.authMethod !== 'stored_staff'
    || typeof payload.sub !== 'string' || !payload.sub
    || typeof payload.storedStaffAccountId !== 'string' || !payload.storedStaffAccountId
    || typeof payload.staffName !== 'string' || !payload.staffName
    || typeof payload.storedStaffCredential !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(payload.storedStaffCredential)) {
    return false
  }

  try {
    // No validation cache: the next protected request after a committed delete
    // or PIN/name change must observe that change, even on another app worker.
    const account = await findStoredStaffAccountByIdUncached(payload.storedStaffAccountId, division)
    if (!account || account.id !== payload.storedStaffAccountId || account.name !== payload.staffName
      || typeof account.pin_hash !== 'string' || !account.pin_hash) {
      return false
    }

    const expected = credentialBinding(account, division, payload.sub)
    return timingSafeEqual(Buffer.from(payload.storedStaffCredential), Buffer.from(expected))
  } catch {
    // Missing/unavailable account storage must never become a legacy credential.
    return false
  }
}
