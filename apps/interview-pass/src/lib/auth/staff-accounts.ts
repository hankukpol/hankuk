import 'server-only'

import { createClient, type AuthError, type SupabaseClient } from '@supabase/supabase-js'
import { HANKUK_APP_KEYS } from '@hankuk/config'
import { hashPin, verifyPin } from '@/lib/auth/pin'
import { createServerClient } from '@/lib/supabase/server'
import type { TenantType } from '@/lib/tenant'

const APP_KEY = HANKUK_APP_KEYS.INTERVIEW_PASS
const DEFAULT_APP = HANKUK_APP_KEYS.INTERVIEW_PASS

export type StaffAccountStatus = 'active' | 'inactive'
export type StaffClaimReservationStatus = 'missing_reservation' | 'reserved' | 'claimed'

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
  sharedLinked: boolean
  reservationStatus: StaffClaimReservationStatus
  claimable: boolean
  claimedEmailMasked: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type StaffAccountRow = StaffAccountRecord & {
  pin_hash: string
}

type ReservationRow = {
  id: string
  alias_value: string
  status: 'reserved' | 'claimed' | 'revoked'
  claimed_user_id: string | null
  metadata: Record<string, unknown> | null
}

let cachedServiceClient: SupabaseClient | null = null
let cachedAnonClient: SupabaseClient | null = null

function getSharedAuthEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceRoleKey) {
    return null
  }

  return { url, anonKey, serviceRoleKey }
}

function getSharedServiceClient() {
  const env = getSharedAuthEnv()
  if (!env) {
    throw new Error('Shared Supabase auth environment variables are not configured.')
  }

  if (!cachedServiceClient) {
    cachedServiceClient = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return cachedServiceClient
}

function getSharedAnonClient() {
  const env = getSharedAuthEnv()
  if (!env) {
    throw new Error('Shared Supabase auth environment variables are not configured.')
  }

  if (!cachedAnonClient) {
    cachedAnonClient = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return cachedAnonClient
}

function normalizeLoginId(loginId: string) {
  return loginId.trim().toLowerCase()
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function maskEmail(email: string | null | undefined) {
  if (!email) {
    return null
  }

  const [localPart, domainPart] = email.split('@')
  if (!localPart || !domainPart) {
    return email
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? '*'}*@${domainPart}`
  }

  return `${localPart.slice(0, 2)}***@${domainPart}`
}

function isEmailAlreadyRegisteredError(error: AuthError | null) {
  if (!error) {
    return false
  }

  const normalized = `${error.name} ${error.message}`.toLowerCase()
  return (
    normalized.includes('already registered')
    || normalized.includes('already been registered')
    || normalized.includes('email exists')
    || normalized.includes('email_exists')
    || normalized.includes('user already exists')
  )
}

function buildDefaultProfileName(division: TenantType, displayName: string) {
  const label = division === 'fire' ? '소방' : '경찰'
  return displayName.trim() || `${label} 면접 직원`
}

async function resolveClaimUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  const anonDb = getSharedAnonClient()
  const serviceDb = getSharedServiceClient()

  const loginResult = await anonDb.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (loginResult.data.user) {
    return {
      userId: loginResult.data.user.id,
      email: normalizeEmail(loginResult.data.user.email ?? normalizedEmail),
      created: false,
    }
  }

  const createResult = await serviceDb.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      default_app: DEFAULT_APP,
      legacy_source: `${APP_KEY}:staff-claim`,
    },
  })

  if (createResult.data.user) {
    return {
      userId: createResult.data.user.id,
      email: normalizeEmail(createResult.data.user.email ?? normalizedEmail),
      created: true,
    }
  }

  if (isEmailAlreadyRegisteredError(createResult.error)) {
    throw new Error('이미 존재하는 공통 계정입니다. 올바른 비밀번호로 다시 시도해 주세요.')
  }

  throw new Error(createResult.error?.message ?? '공통 인증 계정을 만들지 못했습니다.')
}

async function authenticateSharedUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  const anonDb = getSharedAnonClient()
  const loginResult = await anonDb.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (!loginResult.data.user) {
    throw new Error('?몄쬆 ?대찓?쇨낵 鍮꾨?踰덊샇瑜??뺤씤??二쇱꽭??')
  }

  return {
    userId: loginResult.data.user.id,
    email: normalizeEmail(loginResult.data.user.email ?? normalizedEmail),
  }
}

async function loadClaimedEmailMasked(claimedUserId: string | null) {
  if (!claimedUserId) {
    return null
  }

  const db = getSharedServiceClient()
  const { data, error } = await db.auth.admin.getUserById(claimedUserId)
  if (error) {
    return null
  }

  return maskEmail(data.user?.email)
}

async function loadAccountById(division: TenantType, accountId: string) {
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

async function loadAccountByLoginId(division: TenantType, loginId: string) {
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

async function loadStaffReservations(division: TenantType, loginIds: string[]) {
  if (loginIds.length === 0) {
    return new Map<string, ReservationRow>()
  }

  const db = getSharedServiceClient()
  const { data, error } = await db
    .schema('public')
    .from('identity_claim_reservations')
    .select('id, alias_value, status, claimed_user_id, metadata')
    .eq('app_key', APP_KEY)
    .eq('division_slug', division)
    .eq('alias_type', 'staff_id')
    .in('alias_value', loginIds)

  if (error) {
    throw new Error(error.message)
  }

  return new Map(((data ?? []) as ReservationRow[]).map((row) => [row.alias_value, row]))
}

async function ensureStaffReservation(account: StaffAccountRecord) {
  const db = getSharedServiceClient()
  const { data, error } = await db
    .schema('public')
    .from('identity_claim_reservations')
    .upsert(
      {
        app_key: APP_KEY,
        division_slug: account.division,
        alias_type: 'staff_id',
        alias_value: account.login_id,
        role_key: 'staff',
        status: account.shared_user_id ? 'claimed' : 'reserved',
        claimed_user_id: account.shared_user_id,
        metadata: {
          source: 'interview.staff_accounts',
          staff_account_id: account.id,
          display_name: account.display_name,
          legacy_login: 'pin',
        },
      },
      { onConflict: 'app_key,division_slug,alias_type,alias_value' },
    )
    .select('id, alias_value, status, claimed_user_id, metadata')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as ReservationRow
}

async function loadSharedMembershipStates(userIds: string[], division: TenantType) {
  const result = new Map<string, boolean>()
  userIds.forEach((userId) => result.set(userId, false))

  if (userIds.length === 0) {
    return result
  }

  const db = getSharedServiceClient()
  const [appMemberships, divisionMemberships] = await Promise.all([
    db
      .schema('public')
      .from('user_app_memberships')
      .select('user_id')
      .eq('app_key', APP_KEY)
      .eq('role_key', 'staff')
      .eq('status', 'active')
      .in('user_id', userIds),
    db
      .schema('public')
      .from('user_division_memberships')
      .select('user_id')
      .eq('app_key', APP_KEY)
      .eq('division_slug', division)
      .eq('role_key', 'staff')
      .eq('status', 'active')
      .in('user_id', userIds),
  ])

  if (appMemberships.error) {
    throw new Error(appMemberships.error.message)
  }

  if (divisionMemberships.error) {
    throw new Error(divisionMemberships.error.message)
  }

  const appUsers = new Set((appMemberships.data ?? []).map((row) => row.user_id))
  const divisionUsers = new Set((divisionMemberships.data ?? []).map((row) => row.user_id))
  userIds.forEach((userId) => {
    result.set(userId, appUsers.has(userId) && divisionUsers.has(userId))
  })

  return result
}

async function enrichAccountSummaries(accounts: StaffAccountRecord[]) {
  if (accounts.length === 0) {
    return [] as StaffAccountSummary[]
  }

  const division = accounts[0].division
  const reservations = await loadStaffReservations(
    division,
    accounts.map((account) => account.login_id),
  )

  const claimedUserIds = Array.from(
    new Set(accounts.map((account) => account.shared_user_id).filter((value): value is string => Boolean(value))),
  )
  const sharedLinkMap = await loadSharedMembershipStates(claimedUserIds, division)
  const claimedEmailMap = new Map<string, string | null>()

  await Promise.all(
    claimedUserIds.map(async (userId) => {
      claimedEmailMap.set(userId, await loadClaimedEmailMasked(userId))
    }),
  )

  return accounts.map((account) => {
    const reservation = reservations.get(account.login_id)
    const reservationStatus: StaffClaimReservationStatus =
      reservation && reservation.status === 'claimed'
        ? 'claimed'
        : reservation && reservation.status === 'reserved'
          ? 'reserved'
          : 'missing_reservation'
    const sharedUserId = account.shared_user_id ?? reservation?.claimed_user_id ?? null

    return {
      id: account.id,
      division: account.division,
      loginId: account.login_id,
      displayName: account.display_name,
      status: account.status,
      note: account.note,
      sharedUserId,
      sharedLinked: sharedUserId ? Boolean(sharedLinkMap.get(sharedUserId)) : false,
      reservationStatus,
      claimable: reservationStatus !== 'claimed',
      claimedEmailMasked: sharedUserId ? claimedEmailMap.get(sharedUserId) ?? null : null,
      lastLoginAt: account.last_login_at,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    } satisfies StaffAccountSummary
  })
}

async function syncStaffProfile(userId: string, division: TenantType, displayName: string) {
  const db = getSharedServiceClient()
  const { error } = await db
    .schema('public')
    .from('user_profiles')
    .upsert(
      {
        id: userId,
        full_name: buildDefaultProfileName(division, displayName),
        default_app: DEFAULT_APP,
      },
      { onConflict: 'id' },
    )

  if (error) {
    throw new Error(error.message)
  }
}

async function syncStaffMemberships(
  userId: string,
  division: TenantType,
  status: 'active' | 'archived',
) {
  const db = getSharedServiceClient()

  const appMembership = await db
    .schema('public')
    .from('user_app_memberships')
    .upsert(
      {
        user_id: userId,
        app_key: APP_KEY,
        role_key: 'staff',
        status,
      },
      { onConflict: 'user_id,app_key,role_key' },
    )

  if (appMembership.error) {
    throw new Error(appMembership.error.message)
  }

  const divisionMembership = await db
    .schema('public')
    .from('user_division_memberships')
    .upsert(
      {
        user_id: userId,
        app_key: APP_KEY,
        division_slug: division,
        role_key: 'staff',
        status,
      },
      { onConflict: 'user_id,app_key,division_slug,role_key' },
    )

  if (divisionMembership.error) {
    throw new Error(divisionMembership.error.message)
  }
}

async function syncStaffAlias(userId: string, previousLoginId: string | null, nextLoginId: string) {
  const db = getSharedServiceClient()

  if (previousLoginId && previousLoginId !== nextLoginId) {
    const updatePrevious = await db
      .schema('public')
      .from('user_login_aliases')
      .update({
        alias_value: nextLoginId,
        updated_at: new Date().toISOString(),
      })
      .eq('app_key', APP_KEY)
      .eq('alias_type', 'staff_id')
      .eq('user_id', userId)
      .eq('alias_value', previousLoginId)

    if (updatePrevious.error) {
      throw new Error(updatePrevious.error.message)
    }
  }

  const { data, error } = await db
    .schema('public')
    .from('user_login_aliases')
    .update({
      user_id: userId,
      is_primary: false,
      is_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq('app_key', APP_KEY)
    .eq('alias_type', 'staff_id')
    .eq('alias_value', nextLoginId)
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  if ((data ?? []).length > 0) {
    return
  }

  const insertResult = await db
    .schema('public')
    .from('user_login_aliases')
    .insert({
      user_id: userId,
      app_key: APP_KEY,
      alias_type: 'staff_id',
      alias_value: nextLoginId,
      is_primary: false,
      is_verified: true,
    })

  if (insertResult.error) {
    throw new Error(insertResult.error.message)
  }
}

async function updateStaffAccountSharedUser(accountId: string, sharedUserId: string) {
  const db = createServerClient()
  const { error } = await db
    .from('staff_accounts')
    .update({ shared_user_id: sharedUserId })
    .eq('id', accountId)

  if (error) {
    throw new Error(error.message)
  }
}

async function touchStaffAccountLastLogin(division: TenantType, accountId: string) {
  const db = createServerClient()
  const { error } = await db
    .from('staff_accounts')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('division', division)

  if (error) {
    throw new Error(error.message)
  }
}

async function markReservationClaimed(
  reservation: ReservationRow,
  userId: string,
  email: string,
  accountId: string,
) {
  const db = getSharedServiceClient()
  const metadata = {
    ...(reservation.metadata ?? {}),
    claimed_email: email,
    claimed_via: 'interview-pass.staff-claim',
    claimed_at: new Date().toISOString(),
    staff_account_id: accountId,
  }

  const { error } = await db
    .schema('public')
    .from('identity_claim_reservations')
    .update({
      status: 'claimed',
      claimed_user_id: userId,
      metadata,
    })
    .eq('id', reservation.id)

  if (error) {
    throw new Error(error.message)
  }
}

async function syncClaimedStaffAccountToCommonAuth(
  account: StaffAccountRecord,
  previousLoginId: string | null,
) {
  if (!account.shared_user_id) {
    return
  }

  const status = account.status === 'active' ? 'active' : 'archived'
  await syncStaffProfile(account.shared_user_id, account.division, account.display_name)
  await syncStaffMemberships(account.shared_user_id, account.division, status)
  await syncStaffAlias(account.shared_user_id, previousLoginId, account.login_id)
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

  return enrichAccountSummaries((data ?? []) as StaffAccountRecord[])
}

export async function createStaffAccount(params: {
  division: TenantType
  loginId: string
  displayName: string
  pin: string
  note?: string
}) {
  const normalizedLoginId = normalizeLoginId(params.loginId)
  const existing = await loadAccountByLoginId(params.division, normalizedLoginId)
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

  await ensureStaffReservation(data as StaffAccountRecord)
  const [summary] = await enrichAccountSummaries([data as StaffAccountRecord])
  return summary
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
  const current = await loadAccountById(params.division, params.accountId)
  if (!current) {
    throw new Error('직원 계정을 찾을 수 없습니다.')
  }

  const nextLoginId = params.loginId ? normalizeLoginId(params.loginId) : current.login_id
  if (nextLoginId !== current.login_id) {
    const existing = await loadAccountByLoginId(params.division, nextLoginId)
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

  const updated = data as StaffAccountRecord
  await ensureStaffReservation(updated)
  await syncClaimedStaffAccountToCommonAuth(updated, current.login_id)
  const [summary] = await enrichAccountSummaries([updated])
  return summary
}

export async function claimStaffAccountSharedAuth(params: {
  division: TenantType
  accountId: string
  email: string
  password: string
}) {
  const account = await loadAccountById(params.division, params.accountId)
  if (!account) {
    throw new Error('직원 계정을 찾을 수 없습니다.')
  }

  const reservation = await ensureStaffReservation(account)
  const resolvedUser = await resolveClaimUser(params.email, params.password)

  if (
    reservation.claimed_user_id
    && reservation.claimed_user_id !== resolvedUser.userId
  ) {
    throw new Error('이미 다른 공통 계정에 연결된 직원 로그인 아이디입니다.')
  }

  await updateStaffAccountSharedUser(account.id, resolvedUser.userId)
  const linkedAccount: StaffAccountRecord = {
    ...account,
    shared_user_id: resolvedUser.userId,
  }
  await syncClaimedStaffAccountToCommonAuth(linkedAccount, account.login_id)
  await markReservationClaimed(reservation, resolvedUser.userId, resolvedUser.email, account.id)

  const refreshed = await loadAccountById(params.division, params.accountId)
  if (!refreshed) {
    throw new Error('직원 계정을 다시 불러오지 못했습니다.')
  }

  const [summary] = await enrichAccountSummaries([refreshed as StaffAccountRecord])
  return summary
}

export async function authenticateStaffAccount(params: {
  division: TenantType
  loginId: string
  pin: string
}) {
  const account = await loadAccountByLoginId(params.division, params.loginId)
  if (!account || account.status !== 'active') {
    return null
  }

  const matched = await verifyPin(params.pin, account.pin_hash)
  if (!matched) {
    return null
  }

  await touchStaffAccountLastLogin(params.division, account.id)

  const sharedLinked =
    account.shared_user_id
      ? Boolean((await loadSharedMembershipStates([account.shared_user_id], params.division)).get(account.shared_user_id))
      : false

  return {
    accountId: account.id,
    loginId: account.login_id,
    displayName: account.display_name,
    sharedUserId: account.shared_user_id,
    sharedLinked,
    authMethod: 'staff_account' as const,
  }
}

export async function authenticateStaffAccountWithSharedAuth(params: {
  division: TenantType
  loginId: string
  email: string
  password: string
}) {
  const normalizedLoginId = normalizeLoginId(params.loginId)
  const account = await loadAccountByLoginId(params.division, normalizedLoginId)
  if (!account || account.status !== 'active') {
    throw new Error('吏곸썝 怨꾩젙 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.')
  }

  if (!account.shared_user_id) {
    throw new Error('癒쇱? 愿由ъ옄 ?ㅼ젙?먯꽌 怨듯넻 ?몄쬆 怨꾩젙??留곹겕??二쇱꽭??')
  }

  const sharedUser = await authenticateSharedUser(params.email, params.password)
  if (account.shared_user_id !== sharedUser.userId) {
    throw new Error('?대? 吏곸썝 怨꾩젙怨??곌껐??怨듯넻 ?몄쬆 怨꾩젙?낅땲??')
  }

  await ensureStaffReservation(account)
  await syncClaimedStaffAccountToCommonAuth(account, account.login_id)

  const sharedLinked = Boolean(
    (await loadSharedMembershipStates([account.shared_user_id], params.division)).get(account.shared_user_id),
  )

  if (!sharedLinked) {
    throw new Error('怨듯넻 ?몄쬆 怨꾩젙 沅뚰븳???꾩슂?⑸땲?? 愿由ъ옄 ?ㅼ젙?먯꽌 ?ㅼ떆 ?곌껐??二쇱꽭??')
  }

  await touchStaffAccountLastLogin(params.division, account.id)

  return {
    accountId: account.id,
    loginId: account.login_id,
    displayName: account.display_name,
    sharedUserId: account.shared_user_id,
    sharedLinked,
    sharedEmail: sharedUser.email,
    authMethod: 'staff_shared' as const,
  }
}
