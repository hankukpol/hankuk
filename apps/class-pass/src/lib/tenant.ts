export type TrackType = 'police' | 'fire'
export type TenantType = string

export const TENANT_HEADER = 'x-hankuk-division'
export const TENANT_COOKIE = 'hankuk_division'

const RESERVED_TOP_LEVEL_SEGMENTS = new Set([
  'admin',
  'api',
  'attendance-display',
  'courses',
  'dashboard',
  'designated-seat-display',
  'scan',
  'staff',
  'super-admin',
])

function readBrowserCookie(name: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const prefix = `${name}=`
  const entry = document.cookie.split('; ').find((item) => item.startsWith(prefix))
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null
}

function normalizeSlug(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return null
  }

  if (RESERVED_TOP_LEVEL_SEGMENTS.has(normalized)) {
    return null
  }

  return normalized
}

function humanizeTenantSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function normalizeTrackType(value: string | null | undefined): TrackType | null {
  if (value === 'police' || value === 'fire') {
    return value
  }

  return null
}

export function inferTrackTypeFromTenant(slug: TenantType): TrackType {
  return slug.includes('fire') ? 'fire' : 'police'
}

export function getTrackLabel(trackType: TrackType) {
  return trackType === 'fire' ? '소방' : '경찰'
}

export interface TenantConfig {
  type: TenantType
  slug: TenantType
  branchName: string
  trackType: TrackType
  trackLabel: string
  defaultAppName: string
  defaultDescription: string
  defaultThemeColor: string
  adminTitle: string
  labels: {
    series: string
    region: string
  }
}

export const DEFAULT_TENANT_TYPE: TenantType =
  normalizeSlug(process.env.NEXT_PUBLIC_TENANT_TYPE) ?? 'police'

export function normalizeTenantType(value: string | null | undefined): TenantType | null {
  return normalizeSlug(value)
}

export function parseTenantTypeFromPathname(pathname: string | null | undefined): TenantType | null {
  if (!pathname) {
    return null
  }

  const firstSegment = pathname.split('/').filter(Boolean)[0]
  return normalizeTenantType(firstSegment)
}

export function stripTenantPrefix(pathname: string) {
  const tenantType = parseTenantTypeFromPathname(pathname)
  if (!tenantType) {
    return pathname || '/'
  }

  const nextPath = pathname.replace(new RegExp(`^/${tenantType}(?=/|$)`), '')
  return nextPath === '' ? '/' : nextPath
}

export function withTenantPrefix(pathname: string, tenant: TenantType) {
  const sanitizedPath = pathname === '' ? '/' : pathname
  const strippedPath = stripTenantPrefix(sanitizedPath)
  const tenantSlug = normalizeTenantType(tenant) ?? DEFAULT_TENANT_TYPE

  return strippedPath === '/' ? `/${tenantSlug}` : `/${tenantSlug}${strippedPath}`
}

export function buildFallbackTenantConfig(type: TenantType): TenantConfig {
  const tenantSlug = normalizeTenantType(type) ?? DEFAULT_TENANT_TYPE
  const trackType = inferTrackTypeFromTenant(tenantSlug)
  const trackLabel = getTrackLabel(trackType)
  const branchName =
    tenantSlug === 'police' || tenantSlug === 'fire'
      ? trackLabel
      : humanizeTenantSlug(tenantSlug)

  return {
    type: tenantSlug,
    slug: tenantSlug,
    branchName,
    trackType,
    trackLabel,
    defaultAppName: `${branchName} Class Pass`,
    defaultDescription: `${branchName} 강좌 수강증과 좌석 배정, 자료 배부를 한곳에서 운영합니다.`,
    defaultThemeColor: trackType === 'fire' ? '#9A3412' : '#1A237E',
    adminTitle: `${branchName} Class Pass 관리자`,
    labels: {
      series: trackType === 'fire' ? '직렬' : '구분',
      region: '응시지',
    },
  }
}

export function getTenantConfigByType(type: TenantType): TenantConfig {
  return buildFallbackTenantConfig(type)
}

export function getTenantType(): TenantType {
  if (typeof window === 'undefined') {
    return DEFAULT_TENANT_TYPE
  }

  return (
    parseTenantTypeFromPathname(window.location.pathname)
    ?? normalizeTenantType(readBrowserCookie(TENANT_COOKIE))
    ?? DEFAULT_TENANT_TYPE
  )
}

export function getTenantConfig() {
  return getTenantConfigByType(getTenantType())
}
