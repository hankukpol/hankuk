import 'server-only'

import { hashPin, verifyPin } from '@/lib/auth/pin'
import { createServerClient } from '@/lib/supabase/server'
import type { TenantType } from '@/lib/tenant'

export type StaffAccountStatus = 'active' | 'inactive'

export type StaffAccountRecord = {
  id: string
  division: TenantType
  login_id: string
  display_name: string
  status: StaffAccountStatus
  note: string
  shared_user_id: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export type StaffAccountSummary = {
  id: string
  division: TenantType
  loginId: string
  displayName: string
  status: StaffAccountStatus
  note: string
  sharedUserId: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type StaffAccountRow = StaffAccountRecord & {
  pin_hash: string
}

function normalizeLoginId(loginId: string) {
  return loginId.trim().toLowerCase()
}

function toSummary(row: StaffAccountRecord): StaffAccountSummary {
  return {
    id: row.id,
    division: row.division,
    loginId: row.login_id,
    displayName: row.display_name,
    status: row.status,
    note: row.note,
    sharedUserId: row.shared_user_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getAccountById(division: TenantType, accountId: string) {
  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .select('*')
    .eq('division', division)
    .eq('id', accountId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as StaffAccountRow | null) ?? null
}

async function getAccountByLoginId(division: TenantType, loginId: string) {
  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .select('*')
    .eq('division', division)
    .eq('login_id', normalizeLoginId(loginId))
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as StaffAccountRow | null) ?? null
}

export async function listStaffAccounts(division: TenantType) {
  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .select('id, division, login_id, display_name, status, note, shared_user_id, last_login_at, created_at, updated_at')
    .eq('division', division)
    .order('display_name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as StaffAccountRecord[]).map(toSummary)
}

export async function createStaffAccount(params: {
  division: TenantType
  loginId: string
  displayName: string
  pin: string
  note?: string
}) {
  const normalizedLoginId = normalizeLoginId(params.loginId)
  const existing = await getAccountByLoginId(params.division, normalizedLoginId)
  if (existing) {
    throw new Error('이미 사용 중인 직원 로그인 아이디입니다.')
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .insert({
      division: params.division,
      login_id: normalizedLoginId,
      display_name: params.displayName.trim(),
      pin_hash: await hashPin(params.pin),
      note: params.note?.trim() ?? '',
      status: 'active',
    })
    .select('id, division, login_id, display_name, status, note, shared_user_id, last_login_at, created_at, updated_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return toSummary(data as StaffAccountRecord)
}

export async function updateStaffAccount(params: {
  division: TenantType
  accountId: string
  loginId?: string
  displayName?: string
  note?: string
  status?: StaffAccountStatus
  pin?: string
}) {
  const current = await getAccountById(params.division, params.accountId)
  if (!current) {
    throw new Error('직원 계정을 찾을 수 없습니다.')
  }

  const nextLoginId = params.loginId ? normalizeLoginId(params.loginId) : current.login_id
  if (nextLoginId !== current.login_id) {
    const existing = await getAccountByLoginId(params.division, nextLoginId)
    if (existing && existing.id !== current.id) {
      throw new Error('이미 사용 중인 직원 로그인 아이디입니다.')
    }
  }

  const updatePayload: Partial<StaffAccountRow> = {
    login_id: nextLoginId,
    display_name: params.displayName?.trim() ?? current.display_name,
    note: params.note?.trim() ?? current.note,
    status: params.status ?? current.status,
  }

  if (params.pin) {
    updatePayload.pin_hash = await hashPin(params.pin)
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('staff_accounts')
    .update(updatePayload)
    .eq('division', params.division)
    .eq('id', params.accountId)
    .select('id, division, login_id, display_name, status, note, shared_user_id, last_login_at, created_at, updated_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return toSummary(data as StaffAccountRecord)
}

export async function authenticateStaffAccount(params: {
  division: TenantType
  loginId: string
  pin: string
}) {
  const account = await getAccountByLoginId(params.division, params.loginId)
  if (!account || account.status !== 'active') {
    return null
  }

  const matched = await verifyPin(params.pin, account.pin_hash)
  if (!matched) {
    return null
  }

  const db = createServerClient()
  const now = new Date().toISOString()
  const { error } = await db
    .from('staff_accounts')
    .update({ last_login_at: now })
    .eq('id', account.id)
    .eq('division', params.division)

  if (error) {
    throw new Error(error.message)
  }

  return {
    accountId: account.id,
    loginId: account.login_id,
    displayName: account.display_name,
    sharedUserId: account.shared_user_id,
    sharedLinked: Boolean(account.shared_user_id),
    authMethod: 'staff_account' as const,
  }
}
