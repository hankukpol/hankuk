import { NextRequest, NextResponse } from 'next/server'
import { withConfiguredCookieDomain } from '@/lib/auth/cookie-domain'
import {
  getAdminCookieCandidates,
  getStaffCookieCandidates,
  SUPER_ADMIN_COOKIE,
} from '@/lib/auth/cookie-names'
import { verifyJwtInMiddleware } from '@/lib/auth/middleware-jwt'
import {
  encodeVerifiedPayload,
  VERIFIED_ADMIN_HEADER,
  VERIFIED_STAFF_HEADER,
  VERIFIED_SUPER_ADMIN_HEADER,
} from '@/lib/auth/verified-auth'
import {
  DEFAULT_TENANT_TYPE,
  TENANT_COOKIE,
  TENANT_HEADER,
  normalizeTenantType,
  parseTenantTypeFromPathname,
  stripTenantPrefix,
  type TenantType,
  withTenantPrefix,
} from '@/lib/tenant'

const PUBLIC_FILE = /\.[^/]+$/

function withDivisionCookie(response: NextResponse, division: TenantType) {
  response.cookies.set(
    TENANT_COOKIE,
    division,
    withConfiguredCookieDomain({
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    }),
  )

  return response
}

function prefixedUrl(req: NextRequest, division: TenantType, pathname: string) {
  const url = req.nextUrl.clone()
  url.pathname = withTenantPrefix(pathname, division)
  return url
}

function parseTenantTypeFromReferer(req: NextRequest) {
  const referer = req.headers.get('referer')
  if (!referer) {
    return null
  }

  try {
    return parseTenantTypeFromPathname(new URL(referer).pathname)
  } catch {
    return null
  }
}

function getCookieValue(req: NextRequest, names: string[]) {
  for (const name of names) {
    const value = req.cookies.get(name)?.value
    if (value) {
      return value
    }
  }

  return null
}

function jsonAuthError(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status })
}

function isPublicApiRoute(pathname: string, method: string) {
  return (
    pathname === '/api/enrollments/lookup'
    || pathname === '/api/enrollments/pass'
    || /^\/api\/enrollments\/\d+\/receipts$/.test(pathname)
    || (pathname === '/api/config/app' && method === 'GET')
  )
}

function isAdminApiRoute(pathname: string, method: string) {
  if (pathname.startsWith('/api/courses')) return true
  if (pathname.startsWith('/api/dashboard')) return true
  if (pathname.startsWith('/api/designated-seats/admin')) return true
  if (pathname.startsWith('/api/materials')) return true
  if (pathname.startsWith('/api/popups')) return true
  if (pathname.startsWith('/api/seats')) return true
  if (pathname.startsWith('/api/staff-accounts')) return true
  if (pathname.startsWith('/api/students')) return true
  if (pathname.startsWith('/api/attendance/admin')) return true
  if (pathname.startsWith('/api/distribution/manual')) return true
  if (pathname.startsWith('/api/distribution/receipt-matrix')) return true
  if (pathname.startsWith('/api/distribution/undo')) return true
  if (pathname.startsWith('/api/auth/staff/pin')) return true
  if (pathname.startsWith('/api/auth/admin/logout')) return true
  if (pathname.startsWith('/api/auth/admin/session')) return true
  if (pathname.startsWith('/api/auth/admin/pin')) return true
  if (pathname.startsWith('/api/auth/admin/id')) return true
  if (pathname.startsWith('/api/enrollments') && !isPublicApiRoute(pathname, method)) return true
  if (pathname.startsWith('/api/config') && !(pathname === '/api/config/app' && method === 'GET')) return true

  return false
}

function isStaffApiRoute(pathname: string) {
  return (
    pathname.startsWith('/api/distribution/quick')
    || pathname.startsWith('/api/distribution/scan')
    || pathname.startsWith('/api/distribution/staff-bootstrap')
    || pathname.startsWith('/api/auth/staff/session')
    || pathname.startsWith('/api/auth/staff/logout')
  )
}

function isPublicSuperAdminRoute(pathname: string) {
  return pathname === '/super-admin/login'
    || pathname === '/super-admin/setup'
    || pathname === '/api/auth/super-admin/login'
    || pathname === '/api/auth/super-admin/bootstrap'
}

export async function middleware(req: NextRequest) {
  const currentPathname = req.nextUrl.pathname
  const forwardedOriginalPathname = req.headers.get('x-hankuk-original-pathname')
  const originalPathname = forwardedOriginalPathname ?? currentPathname

  if (originalPathname.startsWith('/_next') || PUBLIC_FILE.test(originalPathname)) {
    return NextResponse.next()
  }

  const divisionFromPath = parseTenantTypeFromPathname(currentPathname)
  const divisionFromOriginalPath = parseTenantTypeFromPathname(originalPathname)
  const divisionFromHeader = normalizeTenantType(req.headers.get(TENANT_HEADER))
  const divisionFromReferer = parseTenantTypeFromReferer(req)
  const divisionCookie = req.cookies.get(TENANT_COOKIE)?.value
  const division =
    divisionFromPath
    ?? divisionFromOriginalPath
    ?? divisionFromHeader
    ?? divisionFromReferer
    ?? normalizeTenantType(divisionCookie)
    ?? DEFAULT_TENANT_TYPE

  const pathname = divisionFromPath ? stripTenantPrefix(currentPathname) : currentPathname
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set(TENANT_HEADER, division)
  requestHeaders.set('x-hankuk-original-pathname', originalPathname)
  requestHeaders.delete(VERIFIED_ADMIN_HEADER)
  requestHeaders.delete(VERIFIED_STAFF_HEADER)
  requestHeaders.delete(VERIFIED_SUPER_ADMIN_HEADER)

  if (
    !divisionFromPath
    && !forwardedOriginalPathname
    && divisionCookie
    && req.method === 'GET'
    && !pathname.startsWith('/api')
    && !pathname.startsWith('/super-admin')
  ) {
    return withDivisionCookie(
      NextResponse.redirect(prefixedUrl(req, division, pathname)),
      division,
    )
  }

  const isSuperAdminPath =
    pathname.startsWith('/super-admin')
    || pathname.startsWith('/api/super-admin')
    || pathname.startsWith('/api/auth/super-admin')
  const isAdminPath = pathname.startsWith('/dashboard') || isAdminApiRoute(pathname, req.method)
  const isStaffPath = pathname.startsWith('/scan') || isStaffApiRoute(pathname)

  if (isSuperAdminPath && !isPublicSuperAdminRoute(pathname)) {
    const superAdminToken = req.cookies.get(SUPER_ADMIN_COOKIE)?.value
    const payload = superAdminToken ? await verifyJwtInMiddleware(superAdminToken) : null

    if (!payload || payload.role !== 'admin' || payload.sessionScope !== 'super_admin') {
      if (pathname.startsWith('/api/')) {
        return jsonAuthError('Super admin authentication required.')
      }

      const url = req.nextUrl.clone()
      url.pathname = '/super-admin/login'
      return NextResponse.redirect(url)
    }

    requestHeaders.set(VERIFIED_SUPER_ADMIN_HEADER, encodeVerifiedPayload(payload))
  }

  if (isAdminPath) {
    const adminToken = getCookieValue(req, getAdminCookieCandidates(division))
    const payload = adminToken ? await verifyJwtInMiddleware(adminToken) : null

    if (!payload || payload.role !== 'admin' || payload.division !== division) {
      if (pathname.startsWith('/api/')) {
        return jsonAuthError('관리자 인증이 필요합니다.')
      }

      return withDivisionCookie(
        NextResponse.redirect(prefixedUrl(req, division, '/admin/login')),
        division,
      )
    }

    requestHeaders.set(VERIFIED_ADMIN_HEADER, encodeVerifiedPayload(payload))
  }

  if (isStaffPath) {
    const [staffPayload, adminPayload] = await Promise.all([
      (() => {
        const token = getCookieValue(req, getStaffCookieCandidates(division))
        return token ? verifyJwtInMiddleware(token) : Promise.resolve(null)
      })(),
      (() => {
        const token = getCookieValue(req, getAdminCookieCandidates(division))
        return token ? verifyJwtInMiddleware(token) : Promise.resolve(null)
      })(),
    ])

    const hasStaffAccess =
      (staffPayload && staffPayload.role === 'staff' && staffPayload.division === division)
      || (adminPayload && adminPayload.role === 'admin' && adminPayload.division === division)

    if (!hasStaffAccess) {
      if (pathname.startsWith('/api/')) {
        return jsonAuthError('직원 인증이 필요합니다.')
      }

      const loginUrl = prefixedUrl(req, division, '/staff/login')
      loginUrl.searchParams.set('redirect', `${pathname}${req.nextUrl.search}`)
      return withDivisionCookie(NextResponse.redirect(loginUrl), division)
    }

    if (staffPayload?.role === 'staff' && staffPayload.division === division) {
      requestHeaders.set(VERIFIED_STAFF_HEADER, encodeVerifiedPayload(staffPayload))
    }

    if (adminPayload?.role === 'admin' && adminPayload.division === division) {
      requestHeaders.set(VERIFIED_ADMIN_HEADER, encodeVerifiedPayload(adminPayload))
    }
  }

  if (divisionFromPath) {
    const rewriteUrl = req.nextUrl.clone()
    rewriteUrl.pathname = pathname
    return withDivisionCookie(
      NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } }),
      division,
    )
  }

  return withDivisionCookie(
    NextResponse.next({ request: { headers: requestHeaders } }),
    division,
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
}
