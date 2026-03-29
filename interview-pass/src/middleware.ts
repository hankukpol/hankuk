import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt, STAFF_COOKIE, ADMIN_COOKIE } from '@/lib/auth/jwt'
import {
  DEFAULT_TENANT_TYPE,
  TENANT_COOKIE,
  TENANT_HEADER,
  normalizeTenantType,
  parseTenantTypeFromPathname,
  stripTenantPrefix,
  withTenantPrefix,
  type TenantType,
} from '@/lib/tenant'

const PUBLIC_FILE = /\.[^/]+$/

function withDivisionCookie(response: NextResponse, division: TenantType) {
  response.cookies.set(TENANT_COOKIE, division, {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  })

  return response
}

function prefixedUrl(req: NextRequest, division: TenantType, pathname: string) {
  const url = req.nextUrl.clone()
  url.pathname = withTenantPrefix(pathname, division)
  return url
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
  const divisionCookie = req.cookies.get(TENANT_COOKIE)?.value
  const division =
    divisionFromPath
    ?? divisionFromOriginalPath
    ?? divisionFromHeader
    ?? normalizeTenantType(divisionCookie)
    ?? DEFAULT_TENANT_TYPE
  const pathname = divisionFromPath ? stripTenantPrefix(currentPathname) : currentPathname
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set(TENANT_HEADER, division)
  requestHeaders.set('x-hankuk-original-pathname', originalPathname)

  if (
    !divisionFromPath
    && !forwardedOriginalPathname
    && divisionCookie
    && req.method === 'GET'
    && !pathname.startsWith('/api')
  ) {
    return withDivisionCookie(
      NextResponse.redirect(prefixedUrl(req, division, pathname)),
      division,
    )
  }

  if (pathname === '/admin/login') {
    const token = req.cookies.get(ADMIN_COOKIE)?.value
    if (token) {
      const payload = await verifyJwt(token)
      if (payload?.role === 'admin') {
        return withDivisionCookie(
          NextResponse.redirect(prefixedUrl(req, division, '/dashboard')),
          division,
        )
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

  const isStaffPath =
    pathname.startsWith('/scan') ||
    pathname.startsWith('/api/distribution/scan') ||
    pathname.startsWith('/api/distribution/manual') ||
    pathname.startsWith('/api/distribution/quick')

  const isPublicApiRoute =
    pathname === '/api/students/lookup' ||
    /^\/api\/students\/[^/]+\/receipts$/.test(pathname) ||
    (pathname === '/api/materials' &&
      req.method === 'GET' &&
      req.nextUrl.searchParams.get('all') !== '1')

  const isAdminPath =
    !isPublicApiRoute && (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/api/students') ||
      pathname.startsWith('/api/materials') ||
      pathname.startsWith('/api/distribution/logs') ||
      pathname.startsWith('/api/distribution/unreceived') ||
      pathname.startsWith('/api/config/cache') ||
      pathname.startsWith('/api/auth/admin/logout') ||
      pathname.startsWith('/api/auth/staff/pin') ||
      pathname.startsWith('/api/auth/admin/pin') ||
      pathname.startsWith('/api/auth/admin/id')
    )

  if (isAdminPath) {
    const token = req.cookies.get(ADMIN_COOKIE)?.value
    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
      }

      return withDivisionCookie(
        NextResponse.redirect(prefixedUrl(req, division, '/admin/login')),
        division,
      )
    }

    const payload = await verifyJwt(token)
    if (!payload || payload.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }

      return withDivisionCookie(
        NextResponse.redirect(prefixedUrl(req, division, '/admin/login')),
        division,
      )
    }
  }

  if (isStaffPath) {
    const staffToken = req.cookies.get(STAFF_COOKIE)?.value
    const adminToken = req.cookies.get(ADMIN_COOKIE)?.value

    const staffPayload = staffToken ? await verifyJwt(staffToken) : null
    const adminPayload = adminToken ? await verifyJwt(adminToken) : null

    const authorized =
      (staffPayload && staffPayload.role === 'staff') ||
      (adminPayload && adminPayload.role === 'admin')

    if (!authorized) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: '직원 인증이 필요합니다.' }, { status: 401 })
      }

      const loginUrl = prefixedUrl(req, division, '/staff/login')
      loginUrl.searchParams.set('redirect', `${pathname}${req.nextUrl.search}`)
      return withDivisionCookie(NextResponse.redirect(loginUrl), division)
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
}
