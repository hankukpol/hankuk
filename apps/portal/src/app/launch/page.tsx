import { redirect } from 'next/navigation'
import { HANKUK_PORTAL_TARGET_ROLES } from '@hankuk/config'
import { LaunchAutoSubmit } from '@/components/LaunchAutoSubmit'
import {
  issuePortalLaunchToken,
  PortalLaunchInfraError,
  type PortalTargetRole,
} from '@/lib/launch-tokens'
import { loadPortalLaunchCards, PortalAccessError } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LaunchSearchParams = Record<string, string | string[] | undefined>

function readString(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : ''
}

function isPortalTargetRole(value: string): value is PortalTargetRole {
  return HANKUK_PORTAL_TARGET_ROLES.includes(value as PortalTargetRole)
}

function getRoleLabel(role: PortalTargetRole) {
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

function buildLaunchDescription(role: PortalTargetRole, divisionSlug: string | null) {
  const roleLabel = getRoleLabel(role)
  return divisionSlug ? `${roleLabel} 권한 · ${divisionSlug}` : `${roleLabel} 권한`
}

function ErrorCard(props: { title: string; message: string }) {
  return (
    <main className="portal-transition">
      <div className="portal-transition-card">
        <span className="portal-error-badge">오류</span>
        <h1
          style={{
            marginTop: 16,
            fontFamily: '"SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontSize: 21,
            fontWeight: 700,
            lineHeight: 1.19,
            letterSpacing: '0.231px',
            color: '#1d1d1f',
          }}
        >
          {props.title}
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.43,
            letterSpacing: '-0.224px',
            color: 'rgba(0, 0, 0, 0.8)',
          }}
        >
          {props.message}
        </p>
        <a href="/" className="portal-button secondary" style={{ display: 'inline-flex', marginTop: 24 }}>
          돌아가기
        </a>
      </div>
    </main>
  )
}

export default async function LaunchPage(props: {
  searchParams?: Promise<LaunchSearchParams>
}) {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const searchParams = (await props.searchParams) ?? {}
  const appKey = readString(searchParams.app)
  const roleValue = readString(searchParams.role)
  const divisionSlug = readString(searchParams.division) || null

  if (!isPortalTargetRole(roleValue)) {
    return (
      <ErrorCard
        title="유효하지 않은 이동 요청입니다."
        message="포털 대시보드에서 다시 앱을 선택해 주세요."
      />
    )
  }

  const role = roleValue

  let cards
  try {
    cards = await loadPortalLaunchCards(session.userId)
  } catch (error) {
    if (error instanceof PortalAccessError) {
      return (
        <ErrorCard
          title="권한 정보를 불러오지 못했습니다."
          message="잠시 후 다시 시도해 주세요."
        />
      )
    }

    throw error
  }

  const selected = cards.find(
    (card) => card.appKey === appKey && card.role === role && (card.divisionSlug ?? null) === divisionSlug,
  )

  if (!selected) {
    return (
      <ErrorCard
        title="이동 권한을 찾지 못했습니다."
        message="포털 대시보드에서 다시 선택해 주세요. 권한이나 지점 연결이 아직 완료되지 않았을 수 있습니다."
      />
    )
  }

  try {
    const launchToken = await issuePortalLaunchToken({
      userId: session.userId,
      appKey: selected.appKey,
      divisionSlug: selected.divisionSlug,
      targetPath: selected.targetPath,
      targetRole: selected.role,
    })

    return (
      <LaunchAutoSubmit
        action={`${selected.origin}/api/auth/portal-bridge`}
        launchToken={launchToken}
        title={selected.appName}
        description={buildLaunchDescription(selected.role, selected.divisionSlug)}
      />
    )
  } catch (error) {
    if (error instanceof PortalLaunchInfraError) {
      return (
        <ErrorCard
          title="실행 토큰 테이블이 준비되지 않았습니다."
          message={error.message}
        />
      )
    }

    throw error
  }
}
