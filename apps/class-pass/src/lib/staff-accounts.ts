import 'server-only'

import { revalidateTag, unstable_cache } from 'next/cache'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

export type StoredStaffAccount = {
  id: string
  name: string
  pin_hash: string
  created_at: string
}

export type StaffAccountSummary = Pick<StoredStaffAccount, 'id' | 'name' | 'created_at'>

export type StoredStaffAccountsSnapshot = {
  accounts: StoredStaffAccount[]
  updatedAt: string | null
}

type SupabaseErrorLike = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

const STAFF_ACCOUNTS_TAG = 'staff-accounts'

export class StaffAccountConflictError extends Error {
  constructor(message = 'Staff account already exists.') {
    super(message)
    this.name = 'StaffAccountConflictError'
  }
}

export class StaffAccountNotFoundError extends Error {
  constructor(message = 'Staff account not found.') {
    super(message)
    this.name = 'StaffAccountNotFoundError'
  }
}

export class StaffAccountsChangedError extends Error {
  constructor(message = 'Staff accounts changed. Please reload and try again.') {
    super(message)
    this.name = 'StaffAccountsChangedError'
  }
}

async function getStaffAccountsKey() {
  const division = await getServerTenantType()
  return `${division}::staff_accounts`
}

function parseStoredStaffAccounts(value: string | null | undefined): StoredStaffAccount[] {
  if (!value) {
    return []
  }

  try {
    return JSON.parse(value) as StoredStaffAccount[]
  } catch {
    return []
  }
}

function isUniqueViolation(error: SupabaseErrorLike | null | undefined) {
  return error?.code === '23505'
}

function isMissingStaffAccountsTableError(error: SupabaseErrorLike | null | undefined) {
  if (!error) {
    return false
  }

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || (
      message.includes('staff_accounts')
      && (
        message.includes('does not exist')
        || message.includes('not found')
        || message.includes('schema cache')
      )
    )
  )
}

function toStaffAccountSummary(account: StoredStaffAccount): StaffAccountSummary {
  return {
    id: account.id,
    name: account.name,
    created_at: account.created_at,
  }
}

async function loadStoredStaffAccountsSnapshotUncached(division: string): Promise<StoredStaffAccountsSnapshot> {
  const db = createServerClient()
  const key = `${division}::staff_accounts`
  const data = unwrapSupabaseResult(
    'staffAccounts.load',
    await db
      .from('app_config')
      .select('value,updated_at')
      .eq('key', key)
      .maybeSingle(),
  ) as { value?: string | null; updated_at?: string | null } | null

  return {
    accounts: parseStoredStaffAccounts(data?.value),
    updatedAt: data?.updated_at ?? null,
  }
}

async function loadTableStaffAccountsUncached(division: string): Promise<StoredStaffAccount[] | null> {
  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .select('id,name,pin_hash,created_at')
    .eq('division', division)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingStaffAccountsTableError(error)) {
      return null
    }

    throw error
  }

  return (data ?? []) as StoredStaffAccount[]
}

async function loadStoredStaffAccountsUncached(division: string): Promise<StoredStaffAccount[]> {
  const tableAccounts = await loadTableStaffAccountsUncached(division)
  if (tableAccounts) {
    return tableAccounts
  }

  return (await loadStoredStaffAccountsSnapshotUncached(division)).accounts
}

const getCachedStoredStaffAccounts = unstable_cache(
  async (division: string) => loadStoredStaffAccountsUncached(division),
  ['staff-accounts'],
  {
    revalidate: 15,
    tags: [STAFF_ACCOUNTS_TAG],
  },
)

export async function loadStoredStaffAccounts(): Promise<StoredStaffAccount[]> {
  const division = await getServerTenantType()
  return getCachedStoredStaffAccounts(division)
}

export async function loadStoredStaffAccountsSnapshot(): Promise<StoredStaffAccountsSnapshot> {
  const division = await getServerTenantType()
  return loadStoredStaffAccountsSnapshotUncached(division)
}

export async function listStaffAccounts(): Promise<StaffAccountSummary[]> {
  const accounts = await loadStoredStaffAccounts()
  return accounts.map(toStaffAccountSummary)
}

export async function findStoredStaffAccount(loginId: string): Promise<StoredStaffAccount | null> {
  const normalized = loginId.trim()
  if (!normalized) {
    return null
  }

  // Credential checks must not use the 15-second display/list cache.
  const division = await getServerTenantType()
  const accounts = await loadStoredStaffAccountsUncached(division)
  return accounts.find((account) => account.id === normalized || account.name === normalized) ?? null
}

export async function findStoredStaffAccountByIdUncached(
  id: string,
  division: string,
): Promise<StoredStaffAccount | null> {
  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .select('id,name,pin_hash,created_at')
    .eq('division', division)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (isMissingStaffAccountsTableError(error)) {
      const snapshot = await loadStoredStaffAccountsSnapshotUncached(division)
      return snapshot.accounts.find((account) => account.id === id) ?? null
    }
    throw error
  }

  // An absent row is revoked, not a reason to revive an old app_config account.
  return data as StoredStaffAccount | null
}

export async function saveStoredStaffAccounts(
  accounts: StoredStaffAccount[],
  options?: { expectedUpdatedAt?: string | null },
) {
  const db = createServerClient()
  const key = await getStaffAccountsKey()
  const payload = {
    key,
    value: JSON.stringify(accounts),
    updated_at: new Date().toISOString(),
  }

  if (options && 'expectedUpdatedAt' in options) {
    if (options.expectedUpdatedAt === null) {
      const { error } = await db.from('app_config').insert(payload)
      if (error) {
        if (error.code === '23505') {
          return false
        }
        throw error
      }
    } else {
      const saved = unwrapSupabaseResult(
        'staffAccounts.save.cas',
        await db
          .from('app_config')
          .update(payload)
          .eq('key', key)
          .eq('updated_at', options.expectedUpdatedAt)
          .select('key')
          .maybeSingle(),
      ) as { key: string } | null

      if (!saved) {
        return false
      }
    }
  } else {
    unwrapSupabaseResult(
      'staffAccounts.save',
      await db.from('app_config').upsert(payload, { onConflict: 'key' }),
    )
  }

  revalidateTag(STAFF_ACCOUNTS_TAG)
  return true
}

async function createLegacyStaffAccount(input: { name: string; pinHash: string }) {
  const snapshot = await loadStoredStaffAccountsSnapshot()
  const accounts = snapshot.accounts

  if (accounts.some((account) => account.name === input.name)) {
    throw new StaffAccountConflictError()
  }

  const newAccount: StoredStaffAccount = {
    id: crypto.randomUUID(),
    name: input.name,
    pin_hash: input.pinHash,
    created_at: new Date().toISOString(),
  }

  accounts.push(newAccount)

  const saved = await saveStoredStaffAccounts(accounts, { expectedUpdatedAt: snapshot.updatedAt })
  if (!saved) {
    throw new StaffAccountsChangedError()
  }

  return toStaffAccountSummary(newAccount)
}

export async function createStaffAccount(input: { name: string; pinHash: string }) {
  const division = await getServerTenantType()
  const db = createServerClient()
  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(),
    division,
    name: input.name,
    pin_hash: input.pinHash,
    created_at: now,
    updated_at: now,
  }

  const { data, error } = await db
    .from('staff_accounts')
    .insert(row)
    .select('id,name,pin_hash,created_at')
    .single()

  if (error) {
    if (isMissingStaffAccountsTableError(error)) {
      return createLegacyStaffAccount(input)
    }

    if (isUniqueViolation(error)) {
      throw new StaffAccountConflictError()
    }

    throw error
  }

  revalidateTag(STAFF_ACCOUNTS_TAG)
  return toStaffAccountSummary(data as StoredStaffAccount)
}

async function updateLegacyStaffAccount(input: { id: string; name?: string; pinHash?: string }) {
  const snapshot = await loadStoredStaffAccountsSnapshot()
  const accounts = snapshot.accounts
  const index = accounts.findIndex((account) => account.id === input.id)

  if (index === -1) {
    throw new StaffAccountNotFoundError()
  }

  if (input.name && accounts.some((account) => account.id !== input.id && account.name === input.name)) {
    throw new StaffAccountConflictError()
  }

  if (input.name) {
    accounts[index].name = input.name
  }

  if (input.pinHash) {
    accounts[index].pin_hash = input.pinHash
  }

  const saved = await saveStoredStaffAccounts(accounts, { expectedUpdatedAt: snapshot.updatedAt })
  if (!saved) {
    throw new StaffAccountsChangedError()
  }

  return toStaffAccountSummary(accounts[index])
}

export async function updateStaffAccount(input: { id: string; name?: string; pinHash?: string }) {
  const division = await getServerTenantType()
  const db = createServerClient()
  const patch: Record<string, string> = {}

  if (input.name) {
    patch.name = input.name
  }

  if (input.pinHash) {
    patch.pin_hash = input.pinHash
  }

  if (Object.keys(patch).length === 0) {
    const { data, error } = await db
      .from('staff_accounts')
      .select('id,name,pin_hash,created_at')
      .eq('division', division)
      .eq('id', input.id)
      .maybeSingle()

    if (error) {
      if (isMissingStaffAccountsTableError(error)) {
        return updateLegacyStaffAccount(input)
      }

      throw error
    }

    if (!data) {
      throw new StaffAccountNotFoundError()
    }

    return toStaffAccountSummary(data as StoredStaffAccount)
  }

  patch.updated_at = new Date().toISOString()

  const { data, error } = await db
    .from('staff_accounts')
    .update(patch)
    .eq('division', division)
    .eq('id', input.id)
    .select('id,name,pin_hash,created_at')
    .maybeSingle()

  if (error) {
    if (isMissingStaffAccountsTableError(error)) {
      return updateLegacyStaffAccount(input)
    }

    if (isUniqueViolation(error)) {
      throw new StaffAccountConflictError()
    }

    throw error
  }

  if (!data) {
    throw new StaffAccountNotFoundError()
  }

  revalidateTag(STAFF_ACCOUNTS_TAG)
  return toStaffAccountSummary(data as StoredStaffAccount)
}

async function deleteLegacyStaffAccount(id: string) {
  const snapshot = await loadStoredStaffAccountsSnapshot()
  const accounts = snapshot.accounts
  const filtered = accounts.filter((account) => account.id !== id)

  if (filtered.length === accounts.length) {
    throw new StaffAccountNotFoundError()
  }

  const saved = await saveStoredStaffAccounts(filtered, { expectedUpdatedAt: snapshot.updatedAt })
  if (!saved) {
    throw new StaffAccountsChangedError()
  }
}

export async function deleteStaffAccount(id: string) {
  const division = await getServerTenantType()
  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .delete()
    .eq('division', division)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    if (isMissingStaffAccountsTableError(error)) {
      await deleteLegacyStaffAccount(id)
      return
    }

    throw error
  }

  if (!data) {
    throw new StaffAccountNotFoundError()
  }

  revalidateTag(STAFF_ACCOUNTS_TAG)
}
