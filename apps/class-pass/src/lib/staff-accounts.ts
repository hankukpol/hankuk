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

async function getStaffAccountsKey() {
  const division = await getServerTenantType()
  return `${division}::staff_accounts`
}

async function loadStoredStaffAccountsUncached(division: string): Promise<StoredStaffAccount[]> {
  const db = createServerClient()
  const key = `${division}::staff_accounts`
  const data = unwrapSupabaseResult(
    'staffAccounts.load',
    await db
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle(),
  ) as { value?: string | null } | null

  if (!data?.value) {
    return []
  }

  try {
    return JSON.parse(data.value) as StoredStaffAccount[]
  } catch {
    return []
  }
}

const getCachedStoredStaffAccounts = unstable_cache(
  async (division: string) => loadStoredStaffAccountsUncached(division),
  ['staff-accounts'],
  {
    revalidate: 15,
    tags: ['staff-accounts'],
  },
)

export async function loadStoredStaffAccounts(): Promise<StoredStaffAccount[]> {
  const division = await getServerTenantType()
  return getCachedStoredStaffAccounts(division)
}

export async function listStaffAccounts(): Promise<StaffAccountSummary[]> {
  const accounts = await loadStoredStaffAccounts()
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    created_at: account.created_at,
  }))
}

export async function findStoredStaffAccount(loginId: string): Promise<StoredStaffAccount | null> {
  const normalized = loginId.trim()
  if (!normalized) {
    return null
  }

  const accounts = await loadStoredStaffAccounts()
  return accounts.find((account) => account.id === normalized || account.name === normalized) ?? null
}

export async function saveStoredStaffAccounts(accounts: StoredStaffAccount[]) {
  const db = createServerClient()
  const key = await getStaffAccountsKey()
  unwrapSupabaseResult(
    'staffAccounts.save',
    await db.from('app_config').upsert({
      key,
      value: JSON.stringify(accounts),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' }),
  )
  revalidateTag('staff-accounts')
}
