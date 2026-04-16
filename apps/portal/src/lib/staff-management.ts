import 'server-only'

import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import {
  PORTAL_STAFF_MANAGED_APP_KEYS,
  getPortalDivisionLabel,
  getPortalRoleLabel,
  getPortalRoleRank,
  getPortalStaffAppRule,
  getPortalStatusRank,
  isPortalManagedStaffAppKey,
  type PortalDivisionOption,
  type PortalManagedStaffAppKey,
  type PortalStaffRoleKey,
  type PortalStaffStatusKey,
} from '@/lib/staff-management-config'
import { createServiceSupabaseClient } from '@/lib/supabase'

type AppMembershipRow = {
  id: string
  user_id: string
  app_key: PortalManagedStaffAppKey
  role_key: PortalStaffRoleKey
  status: PortalStaffStatusKey
}

type DivisionMembershipRow = AppMembershipRow & {
  division_slug: string
}

type UserProfileRow = {
  id: string
  full_name: string | null
  phone: string | null
}

type DesiredMembership = {
  appKey: PortalManagedStaffAppKey
  roleKey: PortalStaffRoleKey
  status: 'active' | 'suspended'
  divisions: string[]
}

export type StaffListFilters = {
  search?: string
  role?: string
  app?: string
  status?: string
  page?: number
  limit?: number
}

export type StaffListItem = {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  apps: Array<{
    appKey: PortalManagedStaffAppKey
    displayName: string
    roleKey: PortalStaffRoleKey
    divisions: string[]
    status: PortalStaffStatusKey
  }>
  createdAt: string
  lastSignInAt: string | null
  isSuperAdmin: boolean
  primaryRoleKey: PortalStaffRoleKey | null
}

export type StaffListResponse = {
  staff: StaffListItem[]
  total: number
  page: number
  limit: number
}

export type StaffAppOption = {
  appKey: PortalManagedStaffAppKey
  displayName: string
  roles: Array<{ key: PortalStaffRoleKey; label: string }>
  requiresDivision: boolean
  allowMultipleDivisions: boolean
  divisions: PortalDivisionOption[]
}

export type StaffDetailResponse = {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  createdAt: string
  lastSignInAt: string | null
  isSuperAdmin: boolean
  memberships: Array<{
    id: string
    appKey: PortalManagedStaffAppKey
    appDisplayName: string
    roleKey: PortalStaffRoleKey
    status: PortalStaffStatusKey
    divisions: Array<{
      id: string
      slug: string
      label: string
      roleKey: PortalStaffRoleKey
      status: PortalStaffStatusKey
    }>
  }>
}

export type SettingsAppRecord = {
  appKey: PortalManagedStaffAppKey
  displayName: string
  schemaName: string
  isActive: boolean
}

type ManagedRegistryRow = {
  app_key: PortalManagedStaffAppKey
  display_name: string
  schema_name: string
  is_active: boolean
}

function isNonBlockingSchemaError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: unknown; message?: unknown }
  const message = String(candidate.message ?? '')
  return (
    candidate.code === '42P01'
    || candidate.code === 'PGRST106'
    || candidate.code === '42501'
    || message.includes('does not exist')
    || message.includes('Invalid schema')
    || message.includes('permission denied')
  )
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeDivisionList(divisions: string[] | undefined) {
  return Array.from(new Set((divisions ?? []).map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'ko'),
  )
}

function toRoleKey(value: string): PortalStaffRoleKey {
  if (value === 'super_admin' || value === 'admin' || value === 'assistant' || value === 'staff') {
    return value
  }

  throw new Error(`Unsupported portal role: ${value}`)
}

function toStatusKey(value: string): PortalStaffStatusKey {
  if (value === 'active' || value === 'invited' || value === 'suspended' || value === 'archived') {
    return value
  }

  throw new Error(`Unsupported portal status: ${value}`)
}

function getPaginationValue(value: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(value ?? fallback), 1), max)
}

function buildAppDisplayNameFallback(appKey: PortalManagedStaffAppKey) {
  return getPortalStaffAppRule(appKey).displayNameFallback
}

function buildSummaryMap(
  appRows: AppMembershipRow[],
  divisionRows: DivisionMembershipRow[],
  displayNameMap: Map<PortalManagedStaffAppKey, string>,
) {
  const map = new Map<
    PortalManagedStaffAppKey,
    {
      id: string
      appKey: PortalManagedStaffAppKey
      appDisplayName: string
      roleKey: PortalStaffRoleKey
      status: PortalStaffStatusKey
      divisions: Array<{
        id: string
        slug: string
        label: string
        roleKey: PortalStaffRoleKey
        status: PortalStaffStatusKey
      }>
    }
  >()

  for (const row of appRows) {
    const existing = map.get(row.app_key)
    const nextRole =
      existing && getPortalRoleRank(existing.roleKey) > getPortalRoleRank(row.role_key)
        ? existing.roleKey
        : row.role_key
    const nextStatus =
      existing && getPortalStatusRank(existing.status) > getPortalStatusRank(row.status)
        ? existing.status
        : row.status

    map.set(row.app_key, {
      id: row.id,
      appKey: row.app_key,
      appDisplayName: displayNameMap.get(row.app_key) ?? buildAppDisplayNameFallback(row.app_key),
      roleKey: nextRole,
      status: nextStatus,
      divisions: existing?.divisions ?? [],
    })
  }

  for (const row of divisionRows) {
    const existing = map.get(row.app_key)
    const nextRole =
      existing && getPortalRoleRank(existing.roleKey) > getPortalRoleRank(row.role_key)
        ? existing.roleKey
        : row.role_key
    const nextStatus =
      existing && getPortalStatusRank(existing.status) > getPortalStatusRank(row.status)
        ? existing.status
        : row.status
    const divisions = [
      ...(existing?.divisions ?? []),
      {
        id: row.id,
        slug: row.division_slug,
        label: getPortalDivisionLabel(row.division_slug),
        roleKey: row.role_key,
        status: row.status,
      },
    ]
      .sort((left, right) => left.label.localeCompare(right.label, 'ko'))
      .filter((division, index, array) => array.findIndex((item) => item.id === division.id) === index)

    map.set(row.app_key, {
      id: existing?.id ?? `${row.app_key}:${row.user_id}`,
      appKey: row.app_key,
      appDisplayName: displayNameMap.get(row.app_key) ?? buildAppDisplayNameFallback(row.app_key),
      roleKey: nextRole,
      status: nextStatus,
      divisions,
    })
  }

  return map
}

async function listAllAuthUsers() {
  const db = createServiceSupabaseClient()
  const allUsers: SupabaseAuthUser[] = []
  const perPage = 500
  let page = 1

  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`)
    }

    const users = data.users ?? []
    allUsers.push(...users)

    if (users.length < perPage) {
      break
    }

    page += 1
  }

  return allUsers
}

async function getAuthUserById(userId: string) {
  const db = createServiceSupabaseClient()
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error) {
    throw new Error(`Failed to load auth user: ${error.message}`)
  }

  return data.user ?? null
}

async function findAuthUserByEmail(email: string) {
  const users = await listAllAuthUsers()
  const normalized = normalizeEmail(email)
  return users.find((user) => normalizeEmail(user.email ?? '') === normalized) ?? null
}

async function listManagedRegistryApps(activeOnly = false): Promise<SettingsAppRecord[]> {
  const db = createServiceSupabaseClient()
  const { data, error } = await db
    .from('app_registry')
    .select('app_key, display_name, schema_name, is_active')
    .in('app_key', [...PORTAL_STAFF_MANAGED_APP_KEYS])

  if (error) {
    throw new Error(`Failed to load app registry: ${error.message}`)
  }

  const rows = new Map(
    ((data ?? []) as ManagedRegistryRow[]).map((row) => [
      row.app_key,
      {
        appKey: row.app_key,
        displayName: row.display_name,
        schemaName: row.schema_name,
        isActive: row.is_active,
      } satisfies SettingsAppRecord,
    ]),
  )

  return PORTAL_STAFF_MANAGED_APP_KEYS
    .map((appKey) => rows.get(appKey) ?? {
      appKey,
      displayName: buildAppDisplayNameFallback(appKey),
      schemaName: appKey.replaceAll('-', '_'),
      isActive: true,
    })
    .filter((row) => (activeOnly ? row.isActive : true))
}

function buildDisplayNameMap(records: SettingsAppRecord[]) {
  return new Map(records.map((record) => [record.appKey, record.displayName]))
}

async function listDynamicDivisions(): Promise<Partial<Record<PortalManagedStaffAppKey, PortalDivisionOption[]>>> {
  const db = createServiceSupabaseClient()

  const [classPassResult, studyHallResult] = await Promise.all([
    db
      .schema('class_pass')
      .from('branches')
      .select('slug, name, is_active, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('slug', { ascending: true }),
    db
      .schema('study_hall')
      .from('divisions')
      .select('slug, name, is_active, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('slug', { ascending: true }),
  ])

  if (classPassResult.error && !isNonBlockingSchemaError(classPassResult.error)) {
    throw new Error(`Failed to load class-pass branches: ${classPassResult.error.message}`)
  }

  if (studyHallResult.error && !isNonBlockingSchemaError(studyHallResult.error)) {
    throw new Error(`Failed to load study-hall divisions: ${studyHallResult.error.message}`)
  }

  return {
    'class-pass': ((classPassResult.data ?? []) as Array<{ slug: string; name: string }>).map((row) => ({
      slug: row.slug,
      label: row.name,
    })),
    'study-hall': ((studyHallResult.data ?? []) as Array<{ slug: string; name: string }>).map((row) => ({
      slug: row.slug,
      label: row.name,
    })),
  } satisfies Partial<Record<PortalManagedStaffAppKey, PortalDivisionOption[]>>
}

async function queryAppMemberships(options: {
  userIds?: string[]
  role?: string
  app?: string
  status?: string
}) {
  if (options.userIds && options.userIds.length === 0) {
    return [] as AppMembershipRow[]
  }

  const db = createServiceSupabaseClient()
  let query = db
    .from('user_app_memberships')
    .select('id, user_id, app_key, role_key, status')
    .in('app_key', [...PORTAL_STAFF_MANAGED_APP_KEYS])
    .in('role_key', ['super_admin', 'admin', 'assistant', 'staff'])

  if (options.userIds?.length) {
    query = query.in('user_id', options.userIds)
  }

  if (options.role) {
    query = query.eq('role_key', options.role)
  }

  if (options.app && isPortalManagedStaffAppKey(options.app)) {
    query = query.eq('app_key', options.app)
  }

  if (options.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load app memberships: ${error.message}`)
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    app_key: row.app_key as PortalManagedStaffAppKey,
    role_key: toRoleKey(String(row.role_key)),
    status: toStatusKey(String(row.status)),
  }))
}

async function queryDivisionMemberships(options: {
  userIds?: string[]
  role?: string
  app?: string
  status?: string
}) {
  if (options.userIds && options.userIds.length === 0) {
    return [] as DivisionMembershipRow[]
  }

  const db = createServiceSupabaseClient()
  let query = db
    .from('user_division_memberships')
    .select('id, user_id, app_key, division_slug, role_key, status')
    .in('app_key', [...PORTAL_STAFF_MANAGED_APP_KEYS])
    .in('role_key', ['super_admin', 'admin', 'assistant', 'staff'])

  if (options.userIds?.length) {
    query = query.in('user_id', options.userIds)
  }

  if (options.role) {
    query = query.eq('role_key', options.role)
  }

  if (options.app && isPortalManagedStaffAppKey(options.app)) {
    query = query.eq('app_key', options.app)
  }

  if (options.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load division memberships: ${error.message}`)
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    app_key: row.app_key as PortalManagedStaffAppKey,
    division_slug: String(row.division_slug),
    role_key: toRoleKey(String(row.role_key)),
    status: toStatusKey(String(row.status)),
  }))
}

async function queryProfiles(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, UserProfileRow>()
  }

  const db = createServiceSupabaseClient()
  const { data, error } = await db
    .from('user_profiles')
    .select('id, full_name, phone')
    .in('id', userIds)

  if (error) {
    throw new Error(`Failed to load user profiles: ${error.message}`)
  }

  return new Map(
    ((data ?? []) as UserProfileRow[]).map((row) => [
      row.id,
      {
        id: row.id,
        full_name: row.full_name,
        phone: row.phone,
      },
    ]),
  )
}

async function assertKnownDivisions(memberships: DesiredMembership[]) {
  const appOptions = await listStaffAppOptions({ includeElevatedRoles: true })
  const optionMap = new Map(
    appOptions.map((option) => [option.appKey, new Set(option.divisions.map((division) => division.slug))]),
  )

  for (const membership of memberships) {
    const allowedDivisions = optionMap.get(membership.appKey) ?? new Set<string>()
    for (const division of membership.divisions) {
      if (!allowedDivisions.has(division)) {
        throw new Error(`${membership.appKey}에서 선택할 수 없는 지점입니다: ${division}`)
      }
    }
  }
}

function normalizeDesiredMemberships(
  memberships: Array<{
    appKey: PortalManagedStaffAppKey
    roleKey: PortalStaffRoleKey
    status?: 'active' | 'suspended'
    divisions?: string[]
  }>,
) {
  return memberships
    .map((membership) => ({
      appKey: membership.appKey,
      roleKey: membership.roleKey,
      status: membership.status ?? 'active',
      divisions: normalizeDivisionList(membership.divisions),
    }))
    .sort(
      (left, right) =>
        PORTAL_STAFF_MANAGED_APP_KEYS.indexOf(left.appKey) - PORTAL_STAFF_MANAGED_APP_KEYS.indexOf(right.appKey),
    )
}

export async function listStaff(filters: StaffListFilters): Promise<StaffListResponse> {
  const page = getPaginationValue(filters.page, 1, 1000)
  const limit = getPaginationValue(filters.limit, 20, 100)
  const search = filters.search?.trim().toLowerCase() ?? ''

  const [candidateAppRows, candidateDivisionRows, registryApps] = await Promise.all([
    queryAppMemberships({ role: filters.role, app: filters.app, status: filters.status }),
    queryDivisionMemberships({ role: filters.role, app: filters.app, status: filters.status }),
    listManagedRegistryApps(),
  ])

  const candidateUserIds = Array.from(
    new Set([...candidateAppRows.map((row) => row.user_id), ...candidateDivisionRows.map((row) => row.user_id)]),
  )

  if (candidateUserIds.length === 0) {
    return {
      staff: [],
      total: 0,
      page,
      limit,
    }
  }

  const [allAppRows, allDivisionRows, profiles, authUsers] = await Promise.all([
    queryAppMemberships({ userIds: candidateUserIds }),
    queryDivisionMemberships({ userIds: candidateUserIds }),
    queryProfiles(candidateUserIds),
    listAllAuthUsers(),
  ])

  const authUserMap = new Map(
    authUsers
      .filter((user) => candidateUserIds.includes(user.id))
      .map((user) => [user.id, user]),
  )
  const displayNameMap = buildDisplayNameMap(registryApps)
  const appRowsByUser = new Map<string, AppMembershipRow[]>()
  const divisionRowsByUser = new Map<string, DivisionMembershipRow[]>()

  for (const row of allAppRows) {
    const current = appRowsByUser.get(row.user_id) ?? []
    current.push(row)
    appRowsByUser.set(row.user_id, current)
  }

  for (const row of allDivisionRows) {
    const current = divisionRowsByUser.get(row.user_id) ?? []
    current.push(row)
    divisionRowsByUser.set(row.user_id, current)
  }

  const items = candidateUserIds
    .map((userId) => {
      const authUser = authUserMap.get(userId)
      const profile = profiles.get(userId)
      const summaries = Array.from(
        buildSummaryMap(appRowsByUser.get(userId) ?? [], divisionRowsByUser.get(userId) ?? [], displayNameMap).values(),
      ).sort((left, right) => left.appDisplayName.localeCompare(right.appDisplayName, 'ko'))

      const primaryRole = summaries.reduce<PortalStaffRoleKey | null>((current, summary) => {
        if (!current) {
          return summary.roleKey
        }

        return getPortalRoleRank(summary.roleKey) > getPortalRoleRank(current) ? summary.roleKey : current
      }, null)

      return {
        id: userId,
        email: authUser?.email ?? '',
        fullName:
          normalizeText(profile?.full_name)
          ?? normalizeText(typeof authUser?.user_metadata?.full_name === 'string' ? authUser.user_metadata.full_name : null),
        phone: normalizeText(profile?.phone),
        apps: summaries.map((summary) => ({
          appKey: summary.appKey,
          displayName: summary.appDisplayName,
          roleKey: summary.roleKey,
          divisions: summary.divisions.map((division) => division.slug),
          status: summary.status,
        })),
        createdAt: authUser?.created_at ?? '',
        lastSignInAt: authUser?.last_sign_in_at ?? null,
        isSuperAdmin: summaries.some((summary) => summary.roleKey === 'super_admin'),
        primaryRoleKey: primaryRole,
      } satisfies StaffListItem
    })
    .filter((item) => {
      if (!search) {
        return true
      }

      return [item.email, item.fullName, item.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    })
    .sort((left, right) => {
      if (left.createdAt && right.createdAt) {
        return right.createdAt.localeCompare(left.createdAt)
      }

      return left.email.localeCompare(right.email, 'ko')
    })

  const total = items.length
  const startIndex = (page - 1) * limit

  return {
    staff: items.slice(startIndex, startIndex + limit),
    total,
    page,
    limit,
  }
}

export async function listStaffAppOptions(options: { includeElevatedRoles?: boolean } = {}) {
  const [registryApps, dynamicDivisions] = await Promise.all([listManagedRegistryApps(true), listDynamicDivisions()])

  return registryApps.map((record) => {
    const rule = getPortalStaffAppRule(record.appKey)
    const divisions = rule.staticDivisions.length > 0
      ? [...rule.staticDivisions]
      : [...(dynamicDivisions[record.appKey] ?? [])]

    return {
      appKey: record.appKey,
      displayName: record.displayName,
      roles: (options.includeElevatedRoles ? rule.editRoles : rule.inviteRoles).map((roleKey) => ({
        key: roleKey as PortalStaffRoleKey,
        label: getPortalRoleLabel(roleKey),
      })),
      requiresDivision: rule.requiresDivision,
      allowMultipleDivisions: rule.allowMultipleDivisions,
      divisions,
    } satisfies StaffAppOption
  })
}

export async function getStaffDetail(userId: string): Promise<StaffDetailResponse | null> {
  const [authUser, profiles, appRows, divisionRows, registryApps] = await Promise.all([
    getAuthUserById(userId),
    queryProfiles([userId]),
    queryAppMemberships({ userIds: [userId] }),
    queryDivisionMemberships({ userIds: [userId] }),
    listManagedRegistryApps(),
  ])

  if (!authUser) {
    return null
  }

  const profile = profiles.get(userId)
  const summaries = Array.from(buildSummaryMap(appRows, divisionRows, buildDisplayNameMap(registryApps)).values()).sort(
    (left, right) => left.appDisplayName.localeCompare(right.appDisplayName, 'ko'),
  )

  return {
    id: userId,
    email: authUser.email ?? '',
    fullName:
      normalizeText(profile?.full_name)
      ?? normalizeText(typeof authUser.user_metadata?.full_name === 'string' ? authUser.user_metadata.full_name : null),
    phone: normalizeText(profile?.phone),
    createdAt: authUser.created_at ?? '',
    lastSignInAt: authUser.last_sign_in_at ?? null,
    isSuperAdmin: summaries.some((summary) => summary.roleKey === 'super_admin'),
    memberships: summaries.map((summary) => ({
      id: summary.id,
      appKey: summary.appKey,
      appDisplayName: summary.appDisplayName,
      roleKey: summary.roleKey,
      status: summary.status,
      divisions: summary.divisions,
    })),
  }
}

async function writeDesiredMembershipState(userId: string, desiredMemberships: DesiredMembership[]) {
  const db = createServiceSupabaseClient()
  const now = new Date().toISOString()
  const [existingAppRows, existingDivisionRows] = await Promise.all([
    queryAppMemberships({ userIds: [userId] }),
    queryDivisionMemberships({ userIds: [userId] }),
  ])

  const desiredAppKeys = new Set(desiredMemberships.map((membership) => `${membership.appKey}:${membership.roleKey}`))
  const desiredDivisionKeys = new Set(
    desiredMemberships.flatMap((membership) =>
      membership.divisions.map((division) => `${membership.appKey}:${division}:${membership.roleKey}`),
    ),
  )

  const appMembershipsToArchive = existingAppRows.filter(
    (row) => !desiredAppKeys.has(`${row.app_key}:${row.role_key}`) && row.status !== 'archived',
  )
  const divisionMembershipsToArchive = existingDivisionRows.filter(
    (row) => !desiredDivisionKeys.has(`${row.app_key}:${row.division_slug}:${row.role_key}`) && row.status !== 'archived',
  )

  if (appMembershipsToArchive.length > 0) {
    const { error } = await db
      .from('user_app_memberships')
      .update({ status: 'archived', updated_at: now })
      .in(
        'id',
        appMembershipsToArchive.map((row) => row.id),
      )

    if (error) {
      throw new Error(`Failed to archive app memberships: ${error.message}`)
    }
  }

  if (divisionMembershipsToArchive.length > 0) {
    const { error } = await db
      .from('user_division_memberships')
      .update({ status: 'archived', updated_at: now })
      .in(
        'id',
        divisionMembershipsToArchive.map((row) => row.id),
      )

    if (error) {
      throw new Error(`Failed to archive division memberships: ${error.message}`)
    }
  }

  if (desiredMemberships.length > 0) {
    const { error } = await db.from('user_app_memberships').upsert(
      desiredMemberships.map((membership) => ({
        user_id: userId,
        app_key: membership.appKey,
        role_key: membership.roleKey,
        status: membership.status,
        updated_at: now,
      })),
      { onConflict: 'user_id,app_key,role_key' },
    )

    if (error) {
      throw new Error(`Failed to save app memberships: ${error.message}`)
    }
  }

  const desiredDivisionRows = desiredMemberships.flatMap((membership) =>
    membership.divisions.map((division) => ({
      user_id: userId,
      app_key: membership.appKey,
      division_slug: division,
      role_key: membership.roleKey,
      status: membership.status,
      updated_at: now,
    })),
  )

  if (desiredDivisionRows.length > 0) {
    const { error } = await db
      .from('user_division_memberships')
      .upsert(desiredDivisionRows, { onConflict: 'user_id,app_key,division_slug,role_key' })

    if (error) {
      throw new Error(`Failed to save division memberships: ${error.message}`)
    }
  }

  return {
    previousAppRows: existingAppRows,
    previousDivisionRows: existingDivisionRows,
  }
}

async function syncOperatingAccounts(
  userId: string,
  email: string,
  fullName: string | null,
  previousState: {
    previousAppRows: AppMembershipRow[]
    previousDivisionRows: DivisionMembershipRow[]
  },
  desiredMemberships: DesiredMembership[],
) {
  const db = createServiceSupabaseClient()
  const appsToSync = new Set<PortalManagedStaffAppKey>()

  for (const row of previousState.previousAppRows) {
    appsToSync.add(row.app_key)
  }

  for (const row of previousState.previousDivisionRows) {
    appsToSync.add(row.app_key)
  }

  for (const membership of desiredMemberships) {
    appsToSync.add(membership.appKey)
  }

  for (const appKey of appsToSync) {
    const deactivateResult = await db.rpc('deactivate_staff_for_app', {
      p_user_id: userId,
      p_app_key: appKey,
    })

    if (deactivateResult.error) {
      throw new Error(`Failed to deactivate ${appKey} operator access: ${deactivateResult.error.message}`)
    }

    const desired = desiredMemberships.find((membership) => membership.appKey === appKey)
    if (!desired || desired.status !== 'active') {
      continue
    }

    const divisions = desired.divisions.length > 0 ? desired.divisions : [null]
    for (const division of divisions) {
      const provisionResult = await db.rpc('provision_staff_for_app', {
        p_user_id: userId,
        p_app_key: appKey,
        p_role_key: desired.roleKey,
        p_division_slug: division,
        p_full_name: fullName,
        p_email: email,
      })

      if (provisionResult.error) {
        throw new Error(`Failed to provision ${appKey} operator access: ${provisionResult.error.message}`)
      }
    }
  }
}

async function upsertUserProfile(userId: string, fullName: string, phone: string | undefined) {
  const db = createServiceSupabaseClient()
  const now = new Date().toISOString()
  const { error } = await db.from('user_profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      phone: normalizeText(phone),
      updated_at: now,
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw new Error(`Failed to save user profile: ${error.message}`)
  }
}

async function loadProvisioningIdentity(userId: string) {
  const [authUser, profiles] = await Promise.all([getAuthUserById(userId), queryProfiles([userId])])
  if (!authUser) {
    throw new Error('사용자를 찾을 수 없습니다.')
  }

  const profile = profiles.get(userId)
  return {
    email: authUser.email ?? '',
    fullName:
      normalizeText(profile?.full_name)
      ?? normalizeText(typeof authUser.user_metadata?.full_name === 'string' ? authUser.user_metadata.full_name : null)
      ?? authUser.email
      ?? '운영자',
  }
}

export async function inviteStaff(input: {
  email: string
  fullName: string
  phone?: string
  password: string
  apps: Array<{
    appKey: PortalManagedStaffAppKey
    roleKey: PortalStaffRoleKey
    divisions?: string[]
  }>
  actorUserId: string
}) {
  const normalizedEmail = normalizeEmail(input.email)
  const existingUser = await findAuthUserByEmail(normalizedEmail)
  if (existingUser) {
    throw new Error('이미 등록된 이메일입니다.')
  }

  const desiredMemberships = normalizeDesiredMemberships(
    input.apps.map((membership) => ({
      appKey: membership.appKey,
      roleKey: membership.roleKey,
      divisions: membership.divisions,
      status: 'active',
    })),
  )
  await assertKnownDivisions(desiredMemberships)

  const db = createServiceSupabaseClient()
  const { data, error } = await db.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
    },
  })

  if (error || !data.user) {
    throw new Error(error?.message ?? '직원 계정을 생성하지 못했습니다.')
  }

  await upsertUserProfile(data.user.id, input.fullName, input.phone)
  const previousState = { previousAppRows: [] as AppMembershipRow[], previousDivisionRows: [] as DivisionMembershipRow[] }
  await writeDesiredMembershipState(data.user.id, desiredMemberships)
  await syncOperatingAccounts(data.user.id, normalizedEmail, input.fullName, previousState, desiredMemberships)

  console.log('[portal-staff] invited staff account.', {
    actorUserId: input.actorUserId,
    userId: data.user.id,
    email: normalizedEmail,
    apps: desiredMemberships,
  })

  return {
    id: data.user.id,
    email: normalizedEmail,
  }
}

export async function updateStaffMemberships(input: {
  userId: string
  memberships: Array<{
    appKey: PortalManagedStaffAppKey
    roleKey: PortalStaffRoleKey
    divisions?: string[]
    status: 'active' | 'suspended'
  }>
  actorUserId: string
}) {
  const desiredMemberships = normalizeDesiredMemberships(input.memberships)
  await assertKnownDivisions(desiredMemberships)

  const previousState = await writeDesiredMembershipState(input.userId, desiredMemberships)
  const identity = await loadProvisioningIdentity(input.userId)
  await syncOperatingAccounts(input.userId, identity.email, identity.fullName, previousState, desiredMemberships)

  console.log('[portal-staff] updated staff memberships.', {
    actorUserId: input.actorUserId,
    userId: input.userId,
    memberships: desiredMemberships,
  })

  return getStaffDetail(input.userId)
}

export async function resetStaffPassword(input: {
  userId: string
  newPassword: string
  actorUserId: string
}) {
  const db = createServiceSupabaseClient()
  const { error } = await db.auth.admin.updateUserById(input.userId, {
    password: input.newPassword,
  })

  if (error) {
    throw new Error(`비밀번호를 변경하지 못했습니다: ${error.message}`)
  }

  console.log('[portal-staff] reset staff password.', {
    actorUserId: input.actorUserId,
    userId: input.userId,
  })

  return {
    ok: true,
  }
}

export async function deactivateStaff(input: {
  userId: string
  actorUserId: string
}) {
  if (input.userId === input.actorUserId) {
    throw new Error('본인 계정은 비활성화할 수 없습니다.')
  }

  const previousState = {
    previousAppRows: await queryAppMemberships({ userIds: [input.userId] }),
    previousDivisionRows: await queryDivisionMemberships({ userIds: [input.userId] }),
  }

  const db = createServiceSupabaseClient()
  const now = new Date().toISOString()

  if (previousState.previousAppRows.length > 0) {
    const { error } = await db
      .from('user_app_memberships')
      .update({ status: 'archived', updated_at: now })
      .eq('user_id', input.userId)
      .in('app_key', [...PORTAL_STAFF_MANAGED_APP_KEYS])

    if (error) {
      throw new Error(`앱 멤버십을 보관 처리하지 못했습니다: ${error.message}`)
    }
  }

  if (previousState.previousDivisionRows.length > 0) {
    const { error } = await db
      .from('user_division_memberships')
      .update({ status: 'archived', updated_at: now })
      .eq('user_id', input.userId)
      .in('app_key', [...PORTAL_STAFF_MANAGED_APP_KEYS])

    if (error) {
      throw new Error(`지점 멤버십을 보관 처리하지 못했습니다: ${error.message}`)
    }
  }

  await syncOperatingAccounts(input.userId, '', null, previousState, [])

  console.log('[portal-staff] deactivated staff account.', {
    actorUserId: input.actorUserId,
    userId: input.userId,
  })

  return {
    ok: true,
  }
}

export async function listSettingsApps() {
  return listManagedRegistryApps(true)
}

export async function updateAppDisplayNames(
  actorUserId: string,
  apps: Array<{ appKey: PortalManagedStaffAppKey; displayName: string }>,
) {
  const db = createServiceSupabaseClient()
  const now = new Date().toISOString()

  for (const app of apps) {
    if (!isPortalManagedStaffAppKey(app.appKey)) {
      throw new Error(`수정할 수 없는 앱입니다: ${app.appKey}`)
    }

    const { error } = await db
      .from('app_registry')
      .update({ display_name: app.displayName.trim(), updated_at: now })
      .eq('app_key', app.appKey)

    if (error) {
      throw new Error(`앱 이름을 저장하지 못했습니다: ${error.message}`)
    }
  }

  console.log('[portal-staff] updated app display names.', {
    actorUserId,
    apps,
  })

  return listSettingsApps()
}
