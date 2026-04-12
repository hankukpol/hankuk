import 'server-only'

import {
  HANKUK_APP_KEYS,
  HANKUK_SERVICE_CONFIG,
  type HankukAppKey,
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
      return '슈퍼 관리자'
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

  return (envKey || config.productionUrl).replace(/\/+$/, '')
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
    appName: config.displayName,
    role,
    divisionSlug,
    title: `${config.displayName} ${roleLabel(role)}`,
    description: `${roleLabel(role)} 권한${divisionText}`,
    origin: getAppOrigin(appKey, config),
    targetPath,
  }
}

export async function loadPortalLaunchCards(userId: string) {
  const db = createServiceSupabaseClient()
  const [appMemberships, divisionMemberships] = await Promise.all([
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

    const config = HANKUK_SERVICE_CONFIG[appKey]
    const appLevelRole =
      row.role_key === 'super_admin'
        ? 'super_admin'
        : !config.portalLaunch?.requiresDivision && row.role_key === 'admin'
          ? 'admin'
          : null

    if (!appLevelRole) {
      continue
    }

    const card = createCard(appKey, appLevelRole, null)
    if (card && !seen.has(card.key)) {
      cards.push(card)
      seen.add(card.key)
    }
  }

  for (const row of (divisionMemberships.data ?? []) as DivisionMembershipRow[]) {
    if (!SUPPORTED_PORTAL_APPS.includes(row.app_key as SupportedPortalAppKey)) {
      continue
    }

    const role =
      row.role_key === 'assistant'
        ? 'assistant'
        : row.role_key === 'staff'
          ? 'staff'
          : row.role_key === 'admin'
            ? 'admin'
            : null

    if (!role) {
      continue
    }

    const card = createCard(row.app_key as SupportedPortalAppKey, role, row.division_slug)
    if (card && !seen.has(card.key)) {
      cards.push(card)
      seen.add(card.key)
    }
  }

  cards.sort((left, right) => left.title.localeCompare(right.title, 'ko'))
  return cards
}
