import 'server-only'

import {
  HANKUK_APP_KEYS,
  HANKUK_PORTAL_BRIDGE_ROLE_POLICY,
  HANKUK_SERVICE_CONFIG,
  getHankukServiceCanonicalUrl,
  type HankukAppKey,
  type HankukPortalTargetRole,
  type HankukServiceConfig,
} from '@hankuk/config'
import { createServiceSupabaseClient } from '@/lib/supabase'
import type { PortalTargetRole } from '@/lib/launch-tokens'

const SUPPORTED_PORTAL_APPS = [
  HANKUK_APP_KEYS.ACADEMY_OPS,
  HANKUK_APP_KEYS.CLASS_PASS,
  HANKUK_APP_KEYS.SCORE_PREDICT,
  HANKUK_APP_KEYS.STUDY_HALL,
  HANKUK_APP_KEYS.INTERVIEW_PASS,
] as const

type SupportedPortalAppKey = (typeof SUPPORTED_PORTAL_APPS)[number]

type MembershipRow = {
  app_key: HankukAppKey
  role_key: string
  status: string
}

type DivisionMembershipRow = MembershipRow & {
  division_slug: string
}

type AppRegistryRow = {
  app_key: SupportedPortalAppKey
  display_name: string
}

const APP_MEMBERSHIP_ROLE_KEYS = new Set<PortalTargetRole>(['super_admin', 'admin'])
const DIVISION_MEMBERSHIP_ROLE_KEYS = new Set<HankukPortalTargetRole>(['admin', 'assistant', 'staff'])

export class PortalAccessError extends Error {
  constructor(message = 'Portal access data could not be loaded.') {
    super(message)
    this.name = 'PortalAccessError'
  }
}

export type PortalLaunchCard = {
  key: string
  appKey: SupportedPortalAppKey
  appName: string
  role: PortalTargetRole
  divisionSlug: string | null
  title: string
  description: string
  origin: string
  targetPath: string
}

function roleLabel(role: PortalTargetRole) {
  switch (role) {
    case 'super_admin':
      return '총괄관리자'
    case 'assistant':
      return '조교'
    case 'staff':
      return '직원'
    default:
      return '관리자'
  }
}

function getAppOrigin(appKey: SupportedPortalAppKey, config: HankukServiceConfig) {
  const envKey =
    appKey === HANKUK_APP_KEYS.ACADEMY_OPS
      ? process.env.PORTAL_TARGET_ACADEMY_OPS_URL
      : appKey === HANKUK_APP_KEYS.CLASS_PASS
      ? process.env.PORTAL_TARGET_CLASS_PASS_URL
      : appKey === HANKUK_APP_KEYS.SCORE_PREDICT
        ? process.env.PORTAL_TARGET_SCORE_PREDICT_URL
      : appKey === HANKUK_APP_KEYS.STUDY_HALL
        ? process.env.PORTAL_TARGET_STUDY_HALL_URL
        : process.env.PORTAL_TARGET_INTERVIEW_PASS_URL

  const preferCanonicalDomain = process.env.PORTAL_PREFER_CUSTOM_DOMAINS === 'true'
  const canonicalOrigin = preferCanonicalDomain ? getHankukServiceCanonicalUrl(appKey) : null

  return (envKey || canonicalOrigin || config.productionUrl).replace(/\/+$/, '')
}

function resolveLaunchPath(
  config: HankukServiceConfig,
  role: PortalTargetRole,
  divisionSlug: string | null,
) {
  const launch = config.portalLaunch
  const template =
    role === 'super_admin'
      ? launch?.superAdminPath
      : role === 'assistant'
        ? launch?.assistantPath
        : role === 'staff'
          ? launch?.staffPath
          : launch?.adminPath

  if (!template) {
    return null
  }

  if (template.includes('{division}')) {
    if (!divisionSlug) {
      return null
    }
    return template.replaceAll('{division}', divisionSlug)
  }

  return template
}

function createCard(
  appKey: SupportedPortalAppKey,
  appName: string,
  role: PortalTargetRole,
  divisionSlug: string | null,
): PortalLaunchCard | null {
  const config = HANKUK_SERVICE_CONFIG[appKey]
  const targetPath = resolveLaunchPath(config, role, divisionSlug)
  if (!targetPath) {
    return null
  }

  const divisionText = divisionSlug ? ` · ${divisionSlug}` : ''

  return {
    key: `${appKey}:${role}:${divisionSlug ?? 'global'}`,
    appKey,
    appName,
    role,
    divisionSlug,
    title: `${appName} ${roleLabel(role)}`,
    description: `${roleLabel(role)} 권한${divisionText}`,
    origin: getAppOrigin(appKey, config),
    targetPath,
  }
}

function mapAppMembershipRole(
  appKey: SupportedPortalAppKey,
  roleKey: string,
): PortalTargetRole | null {
  if (!APP_MEMBERSHIP_ROLE_KEYS.has(roleKey as PortalTargetRole)) {
    return null
  }

  const role = roleKey as PortalTargetRole
  return HANKUK_PORTAL_BRIDGE_ROLE_POLICY[appKey].appRoles.includes(role) ? role : null
}

function mapDivisionMembershipRole(
  appKey: SupportedPortalAppKey,
  roleKey: string,
): PortalTargetRole | null {
  if (!DIVISION_MEMBERSHIP_ROLE_KEYS.has(roleKey as HankukPortalTargetRole)) {
    return null
  }

  const role = roleKey as PortalTargetRole
  return HANKUK_PORTAL_BRIDGE_ROLE_POLICY[appKey].divisionRoles.includes(role) ? role : null
}

function isNonBlockingReadinessError(error: unknown) {
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
    || message.includes('relation')
    || message.includes('Invalid schema')
    || message.includes('permission denied')
  )
}

async function loadPortalDisplayNames(
  db: ReturnType<typeof createServiceSupabaseClient>,
) {
  const { data, error } = await db
    .from('app_registry')
    .select('app_key, display_name')
    .in('app_key', [...SUPPORTED_PORTAL_APPS])

  if (error) {
    throw error
  }

  const names = new Map<SupportedPortalAppKey, string>()
  for (const row of (data ?? []) as AppRegistryRow[]) {
    names.set(row.app_key, row.display_name)
  }

  for (const appKey of SUPPORTED_PORTAL_APPS) {
    if (!names.has(appKey)) {
      names.set(appKey, HANKUK_SERVICE_CONFIG[appKey].displayName)
    }
  }

  return names
}

export async function isSuperAdmin(userId: string) {
  const db = createServiceSupabaseClient()
  const { data, error } = await db
    .from('user_app_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('role_key', 'super_admin')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

async function hasActiveAppMembership(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  appKey: SupportedPortalAppKey,
  roleKey: PortalTargetRole,
) {
  const result = await db
    .from('user_app_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('app_key', appKey)
    .eq('role_key', roleKey)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return Boolean(result.data)
}

async function canLaunchAcademyOpsForUser(
  _db: ReturnType<typeof createServiceSupabaseClient>,
  _userId: string,
  card: PortalLaunchCard,
) {
  // academy_ops uses the shared auth UUID directly and its schema is not exposed
  // through the Supabase REST API used by the portal. Shared membership remains
  // the source of truth for whether the card should be shown.
  return card.role === 'super_admin' || card.role === 'admin'
}

async function canLaunchStudyHallForUser(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  card: PortalLaunchCard,
) {
  const adminResult = await db
    .schema('study_hall')
    .from('admins')
    .select('role, is_active, division_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (adminResult.error) {
    if (isNonBlockingReadinessError(adminResult.error)) {
      return false
    }
    throw adminResult.error
  }

  const admin = adminResult.data
  if (!admin || admin.is_active !== true) {
    return false
  }

  if (card.role === 'super_admin') {
    return admin.role === 'SUPER_ADMIN'
  }

  if (card.role === 'admin' && admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
    return false
  }

  if (
    card.role === 'assistant'
    && admin.role !== 'ASSISTANT'
    && admin.role !== 'ADMIN'
    && admin.role !== 'SUPER_ADMIN'
  ) {
    return false
  }

  if (admin.role === 'SUPER_ADMIN') {
    return true
  }

  if (!card.divisionSlug || !admin.division_id) {
    return false
  }

  const divisionResult = await db
    .schema('study_hall')
    .from('divisions')
    .select('slug')
    .eq('id', admin.division_id)
    .maybeSingle()

  if (divisionResult.error) {
    if (isNonBlockingReadinessError(divisionResult.error)) {
      return false
    }
    throw divisionResult.error
  }

  return divisionResult.data?.slug === card.divisionSlug
}

async function canLaunchClassPassForUser(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  card: PortalLaunchCard,
) {
  const accountResult = await db
    .schema('class_pass')
    .from('operator_accounts')
    .select('id, is_active')
    .eq('shared_user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (accountResult.error) {
    if (isNonBlockingReadinessError(accountResult.error)) {
      return false
    }
    throw accountResult.error
  }

  const account = accountResult.data
  if (!account || account.is_active !== true) {
    return false
  }

  const membershipResult = await db
    .schema('class_pass')
    .from('operator_memberships')
    .select('role, branch_id, is_active')
    .eq('operator_account_id', account.id)
    .eq('is_active', true)

  if (membershipResult.error) {
    if (isNonBlockingReadinessError(membershipResult.error)) {
      return false
    }
    throw membershipResult.error
  }

  const memberships = membershipResult.data ?? []
  if (card.role === 'super_admin') {
    return memberships.some((membership) => membership.role === 'SUPER_ADMIN')
  }

  if (!card.divisionSlug) {
    return false
  }

  const targetRole = card.role === 'staff' ? 'STAFF' : 'BRANCH_ADMIN'
  const branchIds = memberships
    .filter((membership) => membership.role === targetRole && membership.branch_id !== null)
    .map((membership) => membership.branch_id)

  if (branchIds.length === 0) {
    return false
  }

  const branchResult = await db
    .schema('class_pass')
    .from('branches')
    .select('id, slug')
    .in('id', branchIds)

  if (branchResult.error) {
    if (isNonBlockingReadinessError(branchResult.error)) {
      return false
    }
    throw branchResult.error
  }

  return (branchResult.data ?? []).some((branch) => branch.slug === card.divisionSlug)
}

async function loadInterviewAdminId(
  db: ReturnType<typeof createServiceSupabaseClient>,
  divisionSlug: string,
) {
  const result = await db
    .schema('interview')
    .from('app_config')
    .select('config_key, config_value')
    .in('config_key', [`${divisionSlug}::admin_id`, 'admin_id'])

  if (result.error) {
    if (isNonBlockingReadinessError(result.error)) {
      return null
    }
    throw result.error
  }

  const scoped = result.data?.find((row) => row.config_key === `${divisionSlug}::admin_id`)?.config_value
  const fallback = result.data?.find((row) => row.config_key === 'admin_id')?.config_value
  const value = typeof scoped === 'string' && scoped.trim()
    ? scoped.trim()
    : typeof fallback === 'string' && fallback.trim()
      ? fallback.trim()
      : null

  return value
}

async function canLaunchInterviewPassForUser(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  card: PortalLaunchCard,
) {
  if (card.role !== 'admin' || !card.divisionSlug) {
    return false
  }

  const hasSharedMembership = await hasActiveAppMembership(
    db,
    userId,
    HANKUK_APP_KEYS.INTERVIEW_PASS,
    'admin',
  )
  if (!hasSharedMembership) {
    return false
  }

  const adminId = await loadInterviewAdminId(db, card.divisionSlug)
  if (!adminId) {
    return false
  }

  const result = await db
    .from('identity_claim_reservations')
    .select('id')
    .eq('app_key', HANKUK_APP_KEYS.INTERVIEW_PASS)
    .eq('division_slug', card.divisionSlug)
    .eq('alias_type', 'admin_id')
    .eq('alias_value', adminId)
    .eq('status', 'claimed')
    .eq('claimed_user_id', userId)
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return Boolean(result.data)
}

function getScorePredictAliasType(divisionSlug: string | null) {
  return divisionSlug === 'fire' ? 'phone' : 'username'
}

async function findScorePredictAlias(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  divisionSlug: string,
) {
  const aliasType = getScorePredictAliasType(divisionSlug)
  const aliasResult = await db
    .from('user_login_aliases')
    .select('alias_value')
    .eq('user_id', userId)
    .eq('app_key', HANKUK_APP_KEYS.SCORE_PREDICT)
    .eq('alias_type', aliasType)
    .order('is_primary', { ascending: false })
    .limit(1)

  if (aliasResult.error) {
    throw aliasResult.error
  }

  const aliasValue = aliasResult.data?.[0]?.alias_value?.trim()
  if (aliasValue) {
    return aliasValue
  }

  const reservationResult = await db
    .from('identity_claim_reservations')
    .select('alias_value')
    .eq('claimed_user_id', userId)
    .eq('app_key', HANKUK_APP_KEYS.SCORE_PREDICT)
    .eq('division_slug', divisionSlug)
    .eq('status', 'claimed')
    .eq('alias_type', aliasType)
    .limit(1)

  if (reservationResult.error) {
    throw reservationResult.error
  }

  return reservationResult.data?.[0]?.alias_value?.trim() ?? null
}

async function canLaunchScorePredictForUser(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  card: PortalLaunchCard,
) {
  if (card.role !== 'admin' || !card.divisionSlug) {
    return false
  }

  const alias = await findScorePredictAlias(db, userId, card.divisionSlug)
  return Boolean(alias)
}

async function isLaunchCardReady(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  card: PortalLaunchCard,
) {
  try {
    switch (card.appKey) {
      case HANKUK_APP_KEYS.ACADEMY_OPS:
        return await canLaunchAcademyOpsForUser(db, userId, card)
      case HANKUK_APP_KEYS.CLASS_PASS:
        return await canLaunchClassPassForUser(db, userId, card)
      case HANKUK_APP_KEYS.SCORE_PREDICT:
        return await canLaunchScorePredictForUser(db, userId, card)
      case HANKUK_APP_KEYS.STUDY_HALL:
        return await canLaunchStudyHallForUser(db, userId, card)
      case HANKUK_APP_KEYS.INTERVIEW_PASS:
        return await canLaunchInterviewPassForUser(db, userId, card)
      default:
        return false
    }
  } catch (error) {
    console.warn('[portal-access] Failed to validate portal launch card.', {
      appKey: card.appKey,
      role: card.role,
      divisionSlug: card.divisionSlug,
      error,
    })
    return false
  }
}

export async function loadPortalLaunchCards(userId: string) {
  try {
    const db = createServiceSupabaseClient()
    const [appMemberships, divisionMemberships, displayNames] = await Promise.all([
      db
        .from('user_app_memberships')
        .select('app_key, role_key, status')
        .eq('user_id', userId)
        .eq('status', 'active'),
      db
        .from('user_division_memberships')
        .select('app_key, division_slug, role_key, status')
        .eq('user_id', userId)
        .eq('status', 'active'),
      loadPortalDisplayNames(db),
    ])

    if (appMemberships.error) {
      throw new Error(`Failed to load app memberships: ${appMemberships.error.message}`)
    }
    if (divisionMemberships.error) {
      throw new Error(`Failed to load division memberships: ${divisionMemberships.error.message}`)
    }

    const cards: PortalLaunchCard[] = []
    const seen = new Set<string>()

    for (const row of (appMemberships.data ?? []) as MembershipRow[]) {
      const appKey = row.app_key as SupportedPortalAppKey
      if (!SUPPORTED_PORTAL_APPS.includes(appKey)) {
        continue
      }

      const role = mapAppMembershipRole(appKey, row.role_key)
      if (!role) {
        continue
      }

      const card = createCard(
        appKey,
        displayNames.get(appKey) ?? HANKUK_SERVICE_CONFIG[appKey].displayName,
        role,
        null,
      )
      if (card && !seen.has(card.key)) {
        cards.push(card)
        seen.add(card.key)
      }
    }

    for (const row of (divisionMemberships.data ?? []) as DivisionMembershipRow[]) {
      const appKey = row.app_key as SupportedPortalAppKey
      if (!SUPPORTED_PORTAL_APPS.includes(appKey)) {
        continue
      }

      const role = mapDivisionMembershipRole(appKey, row.role_key)
      if (!role) {
        continue
      }

      const card = createCard(
        appKey,
        displayNames.get(appKey) ?? HANKUK_SERVICE_CONFIG[appKey].displayName,
        role,
        row.division_slug,
      )
      if (card && !seen.has(card.key)) {
        cards.push(card)
        seen.add(card.key)
      }
    }

    const readiness = await Promise.all(
      cards.map(async (card) => ({
        card,
        ready: await isLaunchCardReady(db, userId, card),
      })),
    )

    const readyCards = readiness.filter((entry) => entry.ready).map((entry) => entry.card)

    readyCards.sort((left, right) => left.title.localeCompare(right.title, 'ko'))
    return readyCards
  } catch (error) {
    console.error('[portal-access] Failed to load portal launch cards.', error)
    throw new PortalAccessError()
  }
}
