import 'server-only'

import { createClient, type AuthError, type SupabaseClient } from '@supabase/supabase-js'
import { getAdminId } from '@/lib/auth/pin'
import type { TenantType } from '@/lib/tenant'

const APP_KEY = 'interview-pass'
const DEFAULT_APP = 'interview-pass'

export type InterviewAdminClaimReservationStatus =
  | 'missing_admin_id'
  | 'missing_reservation'
  | 'reserved'
  | 'claimed'

export type InterviewAdminClaimStatus = {
  division: TenantType
  adminId: string
  reservationStatus: InterviewAdminClaimReservationStatus
  claimable: boolean
  claimedEmailMasked: string | null
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

function buildDefaultProfileName(division: TenantType, adminId: string) {
  const label = division === 'fire' ? '소방' : '경찰'
  return `${label} 면접 관리자 (${adminId})`
}

async function loadReservation(division: TenantType, adminId: string) {
  const db = getSharedServiceClient()
  const { data, error } = await db
    .schema('public')
    .from('identity_claim_reservations')
    .select('id, alias_value, status, claimed_user_id, metadata')
    .eq('app_key', APP_KEY)
    .eq('division_slug', division)
    .eq('alias_type', 'admin_id')
    .eq('alias_value', adminId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as ReservationRow | null) ?? null
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
      legacy_source: `${APP_KEY}:admin-claim`,
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

  throw new Error(createResult.error?.message ?? '공통 인증 계정을 생성하지 못했습니다.')
}

async function upsertSharedProfile(userId: string, division: TenantType, adminId: string) {
  const db = getSharedServiceClient()
  const { error } = await db
    .schema('public')
    .from('user_profiles')
    .upsert(
      {
        id: userId,
        full_name: buildDefaultProfileName(division, adminId),
        default_app: DEFAULT_APP,
      },
      { onConflict: 'id' },
    )

  if (error) {
    throw new Error(error.message)
  }

}

async function upsertSharedMemberships(userId: string, division: TenantType) {
  const db = getSharedServiceClient()

  const appMembershipResult = await db
    .schema('public')
    .from('user_app_memberships')
    .upsert(
      {
        user_id: userId,
        app_key: APP_KEY,
        role_key: 'admin',
        status: 'active',
      },
      { onConflict: 'user_id,app_key,role_key' },
    )

  if (appMembershipResult.error) {
    throw new Error(appMembershipResult.error.message)
  }

  const divisionMembershipResult = await db
    .schema('public')
    .from('user_division_memberships')
    .upsert(
      {
        user_id: userId,
        app_key: APP_KEY,
        division_slug: division,
        role_key: 'admin',
        status: 'active',
      },
      { onConflict: 'user_id,app_key,division_slug,role_key' },
    )

  if (divisionMembershipResult.error) {
    throw new Error(divisionMembershipResult.error.message)
  }
}

async function upsertAdminAlias(userId: string, adminId: string) {
  const db = getSharedServiceClient()
  const updateResult = await db
    .schema('public')
    .from('user_login_aliases')
    .update({
      user_id: userId,
      is_primary: false,
      is_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq('app_key', APP_KEY)
    .eq('alias_type', 'admin_id')
    .eq('alias_value', adminId)
    .select('id')

  if (updateResult.error) {
    throw new Error(updateResult.error.message)
  }

  if ((updateResult.data ?? []).length > 0) {
    return
  }

  const insertResult = await db
    .schema('public')
    .from('user_login_aliases')
    .insert({
      user_id: userId,
      app_key: APP_KEY,
      alias_type: 'admin_id',
      alias_value: adminId,
      is_primary: false,
      is_verified: true,
    })

  if (insertResult.error) {
    throw new Error(insertResult.error.message)
  }
}

async function markReservationClaimed(reservation: ReservationRow, userId: string, email: string) {
  const db = getSharedServiceClient()
  const metadata = {
    ...(reservation.metadata ?? {}),
    claimed_email: email,
    claimed_via: 'interview-pass.admin-claim',
    claimed_at: new Date().toISOString(),
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

export async function getInterviewAdminClaimStatus(
  division: TenantType,
): Promise<InterviewAdminClaimStatus> {
  const adminId = (await getAdminId()).trim()

  if (!adminId) {
    return {
      division,
      adminId: '',
      reservationStatus: 'missing_admin_id',
      claimable: false,
      claimedEmailMasked: null,
    }
  }

  const reservation = await loadReservation(division, adminId)
  if (!reservation) {
    return {
      division,
      adminId,
      reservationStatus: 'missing_reservation',
      claimable: false,
      claimedEmailMasked: null,
    }
  }

  if (reservation.status === 'claimed') {
    return {
      division,
      adminId,
      reservationStatus: 'claimed',
      claimable: false,
      claimedEmailMasked: await loadClaimedEmailMasked(reservation.claimed_user_id),
    }
  }

  if (reservation.status === 'revoked') {
    return {
      division,
      adminId,
      reservationStatus: 'missing_reservation',
      claimable: false,
      claimedEmailMasked: null,
    }
  }

  return {
    division,
    adminId,
    reservationStatus: 'reserved',
    claimable: true,
    claimedEmailMasked: null,
  }
}

export async function claimInterviewAdminSharedAuth(params: {
  division: TenantType
  email: string
  password: string
}) {
  const adminId = (await getAdminId()).trim()
  if (!adminId) {
    throw new Error('관리자 아이디를 먼저 저장해 주세요.')
  }

  const reservation = await loadReservation(params.division, adminId)
  if (!reservation) {
    throw new Error('현재 관리자 아이디에 대한 공통 인증 예약을 찾지 못했습니다.')
  }

  const resolvedUser = await resolveClaimUser(params.email, params.password)

  if (
    reservation.claimed_user_id
    && reservation.claimed_user_id !== resolvedUser.userId
  ) {
    throw new Error('이미 다른 공통 계정에 연결된 관리자 아이디입니다.')
  }

  await upsertSharedProfile(resolvedUser.userId, params.division, adminId)
  await upsertSharedMemberships(resolvedUser.userId, params.division)
  await upsertAdminAlias(resolvedUser.userId, adminId)
  await markReservationClaimed(reservation, resolvedUser.userId, resolvedUser.email)

  return getInterviewAdminClaimStatus(params.division)
}
