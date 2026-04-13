import 'server-only'

import bcrypt from 'bcryptjs'
import { revalidateTag, unstable_cache } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createRootServerClient } from '@/lib/supabase/root'
import { buildFallbackTenantConfig, normalizeTenantType, type TrackType } from '@/lib/tenant'

export const CLASS_PASS_APP_KEY = 'class-pass'

export type BranchRole = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF'

export type BranchRecord = {
  id: number
  slug: string
  name: string
  track_type: TrackType
  description: string
  admin_title: string
  series_label: string
  region_label: string
  app_name: string
  theme_color: string
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type OperatorAccountRecord = {
  id: number
  login_id: string
  display_name: string
  pin_hash: string | null
  shared_user_id: string | null
  is_active: boolean
  credential_version: number
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export type OperatorMembershipRecord = {
  id: number
  operator_account_id: number
  role: BranchRole
  branch_id: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  branch?: Pick<BranchRecord, 'id' | 'slug' | 'name' | 'track_type' | 'is_active'>
}

export type OperatorAccountWithMemberships = OperatorAccountRecord & {
  memberships: OperatorMembershipRecord[]
}

const BRANCH_CACHE_TTL_MS = 5_000
const branchBySlugCache = new Map<string, { data: BranchRecord | null; ts: number }>()

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'unknown error')
  }

  return 'unknown error'
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: unknown; message?: unknown }
  return (
    candidate.code === '42P01' ||
    String(candidate.message ?? '').includes('does not exist')
  )
}

function normalizeTrackType(value: unknown, fallback: TrackType): TrackType {
  return value === 'fire' || value === 'police' ? value : fallback
}

function mapBranchRecord(row: Record<string, unknown>): BranchRecord {
  const fallback = buildFallbackTenantConfig(String(row.slug || 'police'))
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name || fallback.branchName),
    track_type: normalizeTrackType(row.track_type, fallback.trackType),
    description: String(row.description || fallback.defaultDescription),
    admin_title: String(row.admin_title || fallback.adminTitle),
    series_label: String(row.series_label || fallback.labels.series),
    region_label: String(row.region_label || fallback.labels.region),
    app_name: String(row.app_name || fallback.defaultAppName),
    theme_color: String(row.theme_color || fallback.defaultThemeColor),
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order) || 0,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function mapOperatorAccountRecord(row: Record<string, unknown>): OperatorAccountRecord {
  return {
    id: Number(row.id),
    login_id: String(row.login_id || ''),
    display_name: String(row.display_name || ''),
    pin_hash: row.pin_hash ? String(row.pin_hash) : null,
    shared_user_id: row.shared_user_id ? String(row.shared_user_id) : null,
    is_active: Boolean(row.is_active),
    credential_version: Number(row.credential_version) || 1,
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function mapOperatorMembershipRecord(
  row: Record<string, unknown>,
  branchMap: Map<number, BranchRecord>,
): OperatorMembershipRecord {
  const branchId = row.branch_id === null || row.branch_id === undefined ? null : Number(row.branch_id)
  const branch = branchId ? branchMap.get(branchId) : undefined

  return {
    id: Number(row.id),
    operator_account_id: Number(row.operator_account_id),
    role: String(row.role || 'STAFF') as BranchRole,
    branch_id: branchId,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    branch: branch
      ? {
          id: branch.id,
          slug: branch.slug,
          name: branch.name,
          track_type: branch.track_type,
          is_active: branch.is_active,
        }
      : undefined,
  }
}

function serializeMemberships(
  memberships: Array<{ role: BranchRole; branch_slug?: string | null; is_active?: boolean }>,
) {
  return memberships
    .map((membership) => {
      const branchSlug = membership.role === 'SUPER_ADMIN' ? '' : membership.branch_slug ?? ''
      return `${membership.role}:${branchSlug}:${membership.is_active === false ? '0' : '1'}`
    })
    .sort()
    .join('|')
}

export async function isBranchOpsReady() {
  const db = createServerClient()
  const { error } = await db.from('branches').select('id').limit(1)
  return !isMissingRelationError(error)
}

export async function getBranchBySlug(slug: string): Promise<BranchRecord | null> {
  const normalized = normalizeTenantType(slug)
  if (!normalized) {
    return null
  }

  const cached = branchBySlugCache.get(normalized)
  if (cached && Date.now() - cached.ts < BRANCH_CACHE_TTL_MS) {
    return cached.data
  }

  const db = createServerClient()
  const { data, error } = await db.from('branches').select('*').eq('slug', normalized).maybeSingle()
  if (isMissingRelationError(error)) {
    branchBySlugCache.set(normalized, { data: null, ts: Date.now() })
    return null
  }
  if (error || !data) {
    branchBySlugCache.set(normalized, { data: null, ts: Date.now() })
    return null
  }

  const branch = mapBranchRecord(data as unknown as Record<string, unknown>)
  branchBySlugCache.set(normalized, { data: branch, ts: Date.now() })
  return branch
}

async function listBranchesUncached(): Promise<BranchRecord[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('branches')
    .select('*')
    .order('display_order', { ascending: true })
    .order('slug', { ascending: true })

  if (isMissingRelationError(error) || !data) {
    return []
  }
  if (error) {
    throw new Error(`Failed to load branches: ${getErrorMessage(error)}`)
  }

  return (data as Array<Record<string, unknown>>).map(mapBranchRecord)
}

const getCachedBranches = unstable_cache(
  async () => listBranchesUncached(),
  ['branch-records'],
  {
    revalidate: 15,
    tags: ['branches'],
  },
)

export async function listBranches(): Promise<BranchRecord[]> {
  return getCachedBranches()
}

export async function upsertBranch(input: {
  slug: string
  name: string
  track_type: TrackType
  description?: string
  admin_title?: string
  series_label?: string
  region_label?: string
  app_name?: string
  theme_color?: string
  is_active?: boolean
  display_order?: number
}) {
  const fallback = buildFallbackTenantConfig(input.slug)
  const db = createServerClient()
  const payload = {
    slug: input.slug,
    name: input.name,
    track_type: input.track_type,
    description: input.description ?? fallback.defaultDescription,
    admin_title: input.admin_title ?? fallback.adminTitle,
    series_label: input.series_label ?? fallback.labels.series,
    region_label: input.region_label ?? fallback.labels.region,
    app_name: input.app_name ?? fallback.defaultAppName,
    theme_color: input.theme_color ?? fallback.defaultThemeColor,
    is_active: input.is_active ?? true,
    display_order: input.display_order ?? 0,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('branches')
    .upsert(payload, { onConflict: 'slug' })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to save branch: ${getErrorMessage(error)}`)
  }

  const branch = mapBranchRecord(data as unknown as Record<string, unknown>)
  branchBySlugCache.set(branch.slug, { data: branch, ts: Date.now() })
  revalidateTag('branches')
  revalidateTag('operator-accounts')
  return branch
}

async function listOperatorAccountsUncached(): Promise<OperatorAccountWithMemberships[]> {
  const db = createServerClient()
  const [accountsResult, membershipsResult, branches] = await Promise.all([
    db.from('operator_accounts').select('*').order('created_at', { ascending: true }),
    db.from('operator_memberships').select('*').order('created_at', { ascending: true }),
    listBranches(),
  ])

  if (isMissingRelationError(accountsResult.error) || isMissingRelationError(membershipsResult.error)) {
    return []
  }
  if (accountsResult.error) {
    throw new Error(`Failed to load operator accounts: ${getErrorMessage(accountsResult.error)}`)
  }
  if (membershipsResult.error) {
    throw new Error(
      `Failed to load operator memberships: ${getErrorMessage(membershipsResult.error)}`,
    )
  }

  const branchMap = new Map(branches.map((branch) => [branch.id, branch]))
  const membershipMap = new Map<number, OperatorMembershipRecord[]>()

  for (const row of (membershipsResult.data ?? []) as Array<Record<string, unknown>>) {
    const membership = mapOperatorMembershipRecord(row, branchMap)
    const current = membershipMap.get(membership.operator_account_id) ?? []
    current.push(membership)
    membershipMap.set(membership.operator_account_id, current)
  }

  return ((accountsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const account = mapOperatorAccountRecord(row)
    return {
      ...account,
      memberships: membershipMap.get(account.id) ?? [],
    }
  })
}

const getCachedOperatorAccounts = unstable_cache(
  async () => listOperatorAccountsUncached(),
  ['operator-accounts'],
  {
    revalidate: 15,
    tags: ['operator-accounts'],
  },
)

export async function listOperatorAccounts(): Promise<OperatorAccountWithMemberships[]> {
  return getCachedOperatorAccounts()
}

async function getOperatorMembershipsForAccount(
  operatorAccountId: number,
): Promise<OperatorMembershipRecord[]> {
  const db = createServerClient()
  const [membershipsResult, branches] = await Promise.all([
    db
      .from('operator_memberships')
      .select('*')
      .eq('operator_account_id', operatorAccountId)
      .order('created_at', { ascending: true }),
    listBranches(),
  ])

  if (isMissingRelationError(membershipsResult.error)) {
    return []
  }
  if (membershipsResult.error) {
    throw new Error(
      `Failed to load operator memberships: ${getErrorMessage(membershipsResult.error)}`,
    )
  }

  const branchMap = new Map(branches.map((branch) => [branch.id, branch]))
  return ((membershipsResult.data ?? []) as Array<Record<string, unknown>>).map((row) =>
    mapOperatorMembershipRecord(row, branchMap),
  )
}

async function withOperatorMemberships(
  account: OperatorAccountRecord | null,
): Promise<OperatorAccountWithMemberships | null> {
  if (!account) {
    return null
  }

  return {
    ...account,
    memberships: await getOperatorMembershipsForAccount(account.id),
  }
}

export async function getOperatorAccountBySharedUser(sharedUserId: string) {
  const db = createServerClient()
  const { data, error } = await db
    .from('operator_accounts')
    .select('*')
    .eq('shared_user_id', sharedUserId)
    .eq('is_active', true)
    .maybeSingle()

  if (isMissingRelationError(error) || !data) {
    return null
  }
  if (error) {
    throw new Error(`Failed to load operator account: ${getErrorMessage(error)}`)
  }

  return withOperatorMemberships(mapOperatorAccountRecord(data as Record<string, unknown>))
}

export async function getOperatorAccountByLoginId(loginId: string) {
  const db = createServerClient()
  const { data, error } = await db
    .from('operator_accounts')
    .select('*')
    .eq('login_id', loginId)
    .maybeSingle()

  if (isMissingRelationError(error) || !data) {
    return null
  }
  if (error) {
    throw new Error(`Failed to load operator account: ${getErrorMessage(error)}`)
  }

  return mapOperatorAccountRecord(data as unknown as Record<string, unknown>)
}

export async function getOperatorAccountWithMembershipsByLoginId(loginId: string) {
  const account = await getOperatorAccountByLoginId(loginId)
  return withOperatorMemberships(account)
}

export async function getOperatorAccountWithMembershipsById(accountId: number) {
  const account = await getOperatorAccountById(accountId)
  return withOperatorMemberships(account)
}

export async function verifyOperatorPin(pin: string, hash: string | null) {
  if (!pin || !hash) {
    return false
  }

  return bcrypt.compare(pin, hash)
}

async function replaceMemberships(
  operatorAccountId: number,
  memberships: Array<{ role: BranchRole; branch_slug?: string | null; is_active?: boolean }>,
) {
  const db = createServerClient()
  const branches = await listBranches()
  const branchBySlug = new Map(branches.map((branch) => [branch.slug, branch]))

  const existingResult = await db
    .from('operator_memberships')
    .select('id, role, branch_id')
    .eq('operator_account_id', operatorAccountId)

  if (existingResult.error && !isMissingRelationError(existingResult.error)) {
    throw new Error(`Failed to load memberships: ${getErrorMessage(existingResult.error)}`)
  }

  const nextRows = memberships.map((membership) => {
    const branchId = membership.branch_slug ? branchBySlug.get(membership.branch_slug)?.id ?? null : null
    return {
      operator_account_id: operatorAccountId,
      role: membership.role,
      branch_id: membership.role === 'SUPER_ADMIN' ? null : branchId,
      is_active: membership.is_active ?? true,
      updated_at: new Date().toISOString(),
    }
  })

  const validRows = nextRows.filter((row) => row.role === 'SUPER_ADMIN' || row.branch_id !== null)

  const existing = (existingResult.data ?? []) as Array<Record<string, unknown>>
  const existingKeys = new Map(
    existing.map((row) => [`${row.role}::${row.branch_id ?? 'global'}`, Number(row.id)]),
  )

  const nextKeys = new Set(validRows.map((row) => `${row.role}::${row.branch_id ?? 'global'}`))

  const rowsToDelete = existing
    .filter((row) => !nextKeys.has(`${row.role}::${row.branch_id ?? 'global'}`))
    .map((row) => Number(row.id))

  if (rowsToDelete.length > 0) {
    const { error } = await db.from('operator_memberships').delete().in('id', rowsToDelete)
    if (error) {
      throw new Error(`Failed to delete memberships: ${getErrorMessage(error)}`)
    }
  }

  if (validRows.length > 0) {
    const payload = validRows.map((row) => ({
      ...row,
      id: existingKeys.get(`${row.role}::${row.branch_id ?? 'global'}`),
    }))
    const { error } = await db.from('operator_memberships').upsert(payload, { onConflict: 'id' })
    if (error) {
      throw new Error(`Failed to save memberships: ${getErrorMessage(error)}`)
    }
  }
}

export async function upsertOperatorAccount(input: {
  id?: number
  login_id: string
  display_name: string
  pin?: string
  shared_user_id?: string | null
  is_active?: boolean
  memberships: Array<{ role: BranchRole; branch_slug?: string | null; is_active?: boolean }>
}) {
  const db = createServerClient()
  let nextCredentialVersion: number | undefined
  let shouldRevokeSessions = false

  if (input.id) {
    const current = await getOperatorAccountWithMembershipsById(input.id)
    if (!current) {
      throw new Error('Operator account not found.')
    }

    if (input.pin) {
      nextCredentialVersion = current.credential_version + 1
      shouldRevokeSessions = true
    }

    const nextIsActive = input.is_active ?? true
    const currentMemberships = current.memberships.map((membership) => ({
      role: membership.role,
      branch_slug: membership.branch?.slug ?? null,
      is_active: membership.is_active,
    }))

    if (
      current.is_active !== nextIsActive
      || serializeMemberships(currentMemberships) !== serializeMemberships(input.memberships)
    ) {
      shouldRevokeSessions = true
    }
  }

  const payload: Record<string, unknown> = {
    login_id: input.login_id.trim(),
    display_name: input.display_name.trim(),
    shared_user_id: input.shared_user_id?.trim() || null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    payload.id = input.id
  }

  if (input.pin) {
    payload.pin_hash = await bcrypt.hash(input.pin, 12)
    payload.credential_version = nextCredentialVersion ?? 1
  }

  const { data, error } = await db
    .from('operator_accounts')
    .upsert(payload, { onConflict: input.id ? 'id' : 'login_id' })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to save operator account: ${getErrorMessage(error)}`)
  }

  const account = mapOperatorAccountRecord(data as unknown as Record<string, unknown>)
  await replaceMemberships(account.id, input.memberships)
  if (input.id && shouldRevokeSessions) {
    await revokeOperatorSessionsForAccount(account.id)
  }
  revalidateTag('operator-accounts')
  await refreshSharedMembershipsForUser(account.shared_user_id)

  const updatedAccounts = await listOperatorAccountsUncached()
  return updatedAccounts.find((item) => item.id === account.id) ?? { ...account, memberships: [] }
}

export async function setOperatorAccountPin(accountId: number, pin: string) {
  const db = createServerClient()
  const current = await getOperatorAccountById(accountId)
  if (!current) {
    throw new Error('Operator account not found.')
  }

  const { error } = await db
    .from('operator_accounts')
    .update({
      pin_hash: await bcrypt.hash(pin, 12),
      credential_version: current.credential_version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)

  if (error) {
    throw new Error(`Failed to update operator PIN: ${getErrorMessage(error)}`)
  }

  revalidateTag('operator-accounts')
}

export async function revokeOperatorSessionsForAccount(accountId: number) {
  const db = createServerClient()
  const { error } = await db
    .from('operator_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('operator_account_id', accountId)
    .is('revoked_at', null)

  if (error && !isMissingRelationError(error)) {
    throw new Error(`Failed to revoke sessions: ${getErrorMessage(error)}`)
  }
}

export async function refreshSharedMembershipsForUser(sharedUserId: string | null | undefined) {
  if (!sharedUserId) {
    return
  }

  const accounts = (await listOperatorAccountsUncached()).filter(
    (account) => account.shared_user_id === sharedUserId && account.is_active,
  )
  const root = createRootServerClient()

  const desiredAppRoles = new Set<string>()
  const desiredDivisionRoles = new Map<string, Set<string>>()

  for (const account of accounts) {
    for (const membership of account.memberships) {
      if (!membership.is_active) continue

      if (membership.role === 'SUPER_ADMIN') {
        desiredAppRoles.add('super_admin')
        continue
      }

      const roleKey = membership.role === 'BRANCH_ADMIN' ? 'admin' : 'staff'
      desiredAppRoles.add(roleKey)
      if (membership.branch?.slug) {
        const current = desiredDivisionRoles.get(membership.branch.slug) ?? new Set<string>()
        current.add(roleKey)
        desiredDivisionRoles.set(membership.branch.slug, current)
      }
    }
  }

  const existingApp = await root
    .from('user_app_memberships')
    .select('id, role_key, status')
    .eq('user_id', sharedUserId)
    .eq('app_key', CLASS_PASS_APP_KEY)

  for (const row of (existingApp.data ?? []) as Array<Record<string, unknown>>) {
    const roleKey = String(row.role_key || '')
    const desiredStatus = desiredAppRoles.has(roleKey) ? 'active' : 'archived'
    if (row.status !== desiredStatus) {
      await root
        .from('user_app_memberships')
        .update({ status: desiredStatus, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    }
  }

  for (const roleKey of desiredAppRoles) {
    await root.from('user_app_memberships').upsert({
      user_id: sharedUserId,
      app_key: CLASS_PASS_APP_KEY,
      role_key: roleKey,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,app_key,role_key' })
  }

  const existingDivision = await root
    .from('user_division_memberships')
    .select('id, division_slug, role_key, status')
    .eq('user_id', sharedUserId)
    .eq('app_key', CLASS_PASS_APP_KEY)

  for (const row of (existingDivision.data ?? []) as Array<Record<string, unknown>>) {
    const divisionSlug = String(row.division_slug || '')
    const roleKey = String(row.role_key || '')
    const desiredRoles = desiredDivisionRoles.get(divisionSlug) ?? new Set<string>()
    const desiredStatus = desiredRoles.has(roleKey) ? 'active' : 'archived'
    if (row.status !== desiredStatus) {
      await root
        .from('user_division_memberships')
        .update({ status: desiredStatus, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    }
  }

  for (const [divisionSlug, roles] of desiredDivisionRoles.entries()) {
    for (const roleKey of roles) {
      await root.from('user_division_memberships').upsert({
        user_id: sharedUserId,
        app_key: CLASS_PASS_APP_KEY,
        division_slug: divisionSlug,
        role_key: roleKey,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,app_key,division_slug,role_key' })
    }
  }
}

export async function getOperatorAccountById(accountId: number) {
  const db = createServerClient()
  const { data, error } = await db
    .from('operator_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle()

  if (isMissingRelationError(error) || !data) {
    return null
  }
  if (error) {
    throw new Error(`Failed to load operator account: ${getErrorMessage(error)}`)
  }

  return mapOperatorAccountRecord(data as unknown as Record<string, unknown>)
}

export async function deleteOperatorAccount(accountId: number) {
  const account = await getOperatorAccountById(accountId)
  if (!account) {
    return false
  }

  await revokeOperatorSessionsForAccount(accountId)

  const db = createServerClient()
  const { error } = await db.from('operator_accounts').delete().eq('id', accountId)
  if (error) {
    throw new Error(`Failed to delete operator account: ${getErrorMessage(error)}`)
  }

  revalidateTag('operator-accounts')
  await refreshSharedMembershipsForUser(account.shared_user_id)
  return true
}
