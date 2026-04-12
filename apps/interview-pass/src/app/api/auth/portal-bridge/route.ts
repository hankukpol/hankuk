import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { HANKUK_APP_KEYS } from '@hankuk/config'
import { ADMIN_COOKIE, ADMIN_TTL_SEC, cookieOptions, signJwt } from '@/lib/auth/jwt'
import { getAdminIdForDivision } from '@/lib/auth/pin'
import { withConfiguredCookieDomain } from '@/lib/auth/cookie-domain'
import { TENANT_COOKIE, normalizeTenantType, withTenantPrefix, type TenantType } from '@/lib/tenant'

type ConsumedPortalLaunch = {
  user_id: string
  division_slug: string | null
  target_path: string
  target_role: 'super_admin' | 'admin' | 'assistant' | 'staff'
}

function createRootServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured.')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function consumePortalLaunchToken(token: string) {
  const root = createRootServiceClient()
  const { data, error } = await root.rpc('consume_portal_launch_token', {
    p_plain_token: token,
    p_app_key: HANKUK_APP_KEYS.INTERVIEW_PASS,
  })

  if (error) {
    throw new Error(`Failed to consume portal launch token: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : null
  return (row as ConsumedPortalLaunch | null) ?? null
}

function normalizeTargetPath(targetPath: string | null | undefined, fallback: string) {
  if (!targetPath || !targetPath.startsWith('/') || targetPath.startsWith('//')) {
    return fallback
  }

  return targetPath
}

async function hasActiveSharedMembership(userId: string, division: TenantType) {
  const root = createRootServiceClient()
  const [appMembership, divisionMembership] = await Promise.all([
    root
      .schema('public')
      .from('user_app_memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('app_key', HANKUK_APP_KEYS.INTERVIEW_PASS)
      .eq('role_key', 'admin')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    root
      .schema('public')
      .from('user_division_memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('app_key', HANKUK_APP_KEYS.INTERVIEW_PASS)
      .eq('division_slug', division)
      .eq('role_key', 'admin')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  ])

  if (appMembership.error) {
    throw new Error(appMembership.error.message)
  }

  if (divisionMembership.error) {
    throw new Error(divisionMembership.error.message)
  }

  return Boolean(appMembership.data && divisionMembership.data)
}

async function hasClaimedReservation(userId: string, division: TenantType, adminId: string) {
  const root = createRootServiceClient()
  const { data, error } = await root
    .schema('public')
    .from('identity_claim_reservations')
    .select('id')
    .eq('app_key', HANKUK_APP_KEYS.INTERVIEW_PASS)
    .eq('division_slug', division)
    .eq('alias_type', 'admin_id')
    .eq('alias_value', adminId)
    .eq('status', 'claimed')
    .eq('claimed_user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null)
  const launchToken = String(formData?.get('launchToken') || '').trim()
  if (!launchToken) {
    return NextResponse.json({ error: '포털 실행 토큰이 필요합니다.' }, { status: 400 })
  }

  const consumed = await consumePortalLaunchToken(launchToken)
  if (!consumed) {
    return NextResponse.json({ error: '실행 토큰이 유효하지 않거나 만료되었습니다.' }, { status: 401 })
  }

  if (consumed.target_role !== 'admin') {
    return NextResponse.json({ error: 'Interview Pass는 관리자 브리지만 지원합니다.' }, { status: 403 })
  }

  const division = normalizeTenantType(consumed.division_slug)
  if (!division) {
    return NextResponse.json({ error: '지점 정보가 필요합니다.' }, { status: 400 })
  }

  const adminId = (await getAdminIdForDivision(division)).trim()
  if (!adminId) {
    return NextResponse.json({ error: '해당 지점의 관리자 ID가 아직 설정되지 않았습니다.' }, { status: 403 })
  }

  const [sharedLinked, claimed] = await Promise.all([
    hasActiveSharedMembership(consumed.user_id, division),
    hasClaimedReservation(consumed.user_id, division, adminId),
  ])

  if (!sharedLinked || !claimed) {
    return NextResponse.json({ error: '공통 인증으로 연결된 관리자 권한을 확인할 수 없습니다.' }, { status: 403 })
  }

  const token = await signJwt('admin', randomUUID(), {
    division,
    adminId,
    authMethod: 'admin_shared',
    sharedUserId: consumed.user_id,
    sharedLinked: true,
  })

  const response = NextResponse.redirect(
    new URL(
      normalizeTargetPath(consumed.target_path, withTenantPrefix('/dashboard', division)),
      req.url,
    ),
  )
  response.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_TTL_SEC))
  response.cookies.set(TENANT_COOKIE, division, withConfiguredCookieDomain({
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  }))

  return response
}
