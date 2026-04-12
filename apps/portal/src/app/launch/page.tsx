import { redirect } from 'next/navigation'
import { LaunchAutoSubmit } from '@/components/LaunchAutoSubmit'
import {
  issuePortalLaunchToken,
  PortalLaunchInfraError,
  type PortalTargetRole,
} from '@/lib/launch-tokens'
import { loadPortalLaunchCards } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LaunchSearchParams = Record<string, string | string[] | undefined>

function readString(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : ''
}

function ErrorCard(props: { title: string; message: string }) {
  return (
    <main className="portal-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80dvh' }}>
      <div className="portal-card" style={{ maxWidth: 440, width: '100%', padding: 28 }}>
        <span className="portal-badge" style={{ background: '#FEF2F2', color: 'var(--danger)' }}>오류</span>
        <h1 style={{ marginTop: 14, fontSize: 20, fontWeight: 700 }}>{props.title}</h1>
        <p className="portal-muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          {props.message}
        </p>
        <a href="/" className="portal-button secondary" style={{ display: 'inline-flex', marginTop: 20 }}>
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
  const role = readString(searchParams.role) as PortalTargetRole
  const divisionSlug = readString(searchParams.division) || null

  const cards = await loadPortalLaunchCards(session.userId)
  const selected = cards.find(
    (card) => card.appKey === appKey && card.role === role && (card.divisionSlug ?? null) === divisionSlug,
  )

  if (!selected) {
    return (
      <ErrorCard
        title="이동 권한을 찾지 못했습니다"
        message="포털 대시보드에서 다시 선택해 주세요. 권한이나 지점 매핑이 아직 연결되지 않았을 수 있습니다."
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
        description={selected.description}
      />
    )
  } catch (error) {
    if (error instanceof PortalLaunchInfraError) {
      return (
        <ErrorCard
          title="실행 토큰 테이블이 준비되지 않았습니다"
          message={error.message}
        />
      )
    }

    throw error
  }
}
