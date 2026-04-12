import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-session'
import { loadPortalLaunchCards } from '@/lib/portal-access'

export default async function DashboardPage() {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const cards = await loadPortalLaunchCards(session.userId)

  return (
    <main className="portal-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div>
          <span className="portal-badge">통합 관리자 포털</span>
          <h1 style={{ marginTop: 18, fontSize: 34 }}>
            {session.fullName || session.email}님, 어디로 이동할까요?
          </h1>
          <p className="portal-muted" style={{ lineHeight: 1.7 }}>
            권한이 있는 앱과 지점만 표시됩니다. 각 앱의 기존 로그인은 그대로 유지하면서, 포털은 더 빠른 진입과
            권한 라우팅을 맡습니다.
          </p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button className="portal-button secondary" type="submit">
            로그아웃
          </button>
        </form>
      </div>

      <section className="portal-card" style={{ marginTop: 28, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>접속 가능한 운영 화면</h2>
            <p className="portal-muted" style={{ marginTop: 8 }}>
              자동 로그인 브리지는 1회용 토큰으로 동작합니다. 토큰은 60초 안에 한 번만 사용할 수 있습니다.
            </p>
          </div>
          <span className="portal-badge">{cards.length}개 권한</span>
        </div>

        {cards.length === 0 ? (
          <div
            style={{
              marginTop: 20,
              border: '1px dashed var(--line)',
              borderRadius: 20,
              padding: 24,
              background: 'var(--surface-muted)',
            }}
          >
            <strong>표시할 권한이 아직 없습니다.</strong>
            <p className="portal-muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
              `class-pass` super-admin에서 운영자 계정에 `shared_user_id` 연결과 지점 권한 부여가 되었는지 먼저
              확인해 주세요.
            </p>
          </div>
        ) : (
          <div className="portal-grid cards" style={{ marginTop: 20 }}>
            {cards.map((card) => {
              const url = new URL('/launch', 'http://portal.local')
              url.searchParams.set('app', card.appKey)
              url.searchParams.set('role', card.role)
              if (card.divisionSlug) {
                url.searchParams.set('division', card.divisionSlug)
              }

              return (
                <Link
                  key={card.key}
                  href={`${url.pathname}${url.search}`}
                  className="portal-card"
                  style={{ padding: 20, display: 'grid', gap: 14, background: 'var(--surface-muted)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong style={{ fontSize: 20 }}>{card.title}</strong>
                    <span className="portal-badge">{card.role}</span>
                  </div>
                  <p className="portal-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                    {card.description}
                  </p>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    앱: {card.appName}
                    <br />
                    이동 경로: {card.targetPath}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
