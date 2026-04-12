import { redirect } from 'next/navigation'
import type { HankukAppKey } from '@hankuk/config'
import { LaunchAutoSubmit } from '@/components/LaunchAutoSubmit'
import {
  issuePortalLaunchToken,
  PortalLaunchInfraError,
  type PortalTargetRole,
} from '@/lib/launch-tokens'
import { loadPortalLaunchCards } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function readString(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : ''
}

function LaunchErrorCard(props: { title: string; message: string }) {
  return (
    <main className="portal-page">
      <div className="portal-card" style={{ maxWidth: 640, margin: '60px auto', padding: 32 }}>
        <span className="portal-badge">실행 준비 필요</span>
        <h1 style={{ marginTop: 18, fontSize: 28 }}>{props.title}</h1>
        <p className="portal-muted" style={{ marginTop: 12, lineHeight: 1.8 }}>
          {props.message}
        </p>
        <div
          style={{
            marginTop: 20,
            borderRadius: 16,
            border: '1px solid var(--line)',
            background: 'var(--surface-muted)',
            padding: 16,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          필요한 공통 SQL:
          <br />
          <code>supabase/migrations/20260412143000_add_class_pass_and_portal_registry.sql</code>
        </div>
        <a href="/" className="portal-button" style={{ display: 'inline-flex', marginTop: 24 }}>
          대시보드로 돌아가기
        </a>
      </div>
    </main>
  )
}

export default async function LaunchPage(props: { searchParams: SearchParams }) {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const searchParams = await props.searchParams
  const appKey = readString(searchParams.app) as HankukAppKey
  const role = readString(searchParams.role) as PortalTargetRole
  const divisionSlug = readString(searchParams.division) || null

  const cards = await loadPortalLaunchCards(session.userId)
  const selected = cards.find(
    (card) => card.appKey === appKey && card.role === role && (card.divisionSlug ?? null) === divisionSlug,
  )

  if (!selected) {
    return (
      <main className="portal-page">
        <div className="portal-card" style={{ maxWidth: 560, margin: '60px auto', padding: 32 }}>
          <span className="portal-badge">권한 확인 필요</span>
          <h1 style={{ marginTop: 18, fontSize: 28 }}>이동 권한을 찾지 못했습니다.</h1>
          <p className="portal-muted" style={{ lineHeight: 1.7 }}>
            포털 카드에서 다시 선택해 주세요. 권한이나 지점 매핑이 아직 연결되지 않았을 수도 있습니다.
          </p>
          <a href="/" className="portal-button" style={{ display: 'inline-flex', marginTop: 24 }}>
            대시보드로 돌아가기
          </a>
        </div>
      </main>
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
        title={selected.title}
        description={`${selected.appName}의 ${selected.description} 화면으로 안전하게 연결합니다.`}
      />
    )
  } catch (error) {
    if (error instanceof PortalLaunchInfraError) {
      return (
        <LaunchErrorCard
          title="포털 실행 토큰 테이블이 아직 준비되지 않았습니다."
          message={error.message}
        />
      )
    }

    throw error
  }
}
