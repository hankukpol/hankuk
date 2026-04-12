import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-session'
import { loadPortalLaunchCards } from '@/lib/portal-access'

const ROLE_LABELS: Record<string, string> = {
  super_admin: '총괄관리자',
  admin: '관리자',
  assistant: '조교',
  staff: '직원',
}

const DIVISION_LABELS: Record<string, string> = {
  police: '경찰',
  fire: '소방',
}

export default async function DashboardPage() {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const cards = await loadPortalLaunchCards(session.userId)

  return (
    <main className="portal-page">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--brand)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            H
          </div>
          <span style={{ fontSize: 15, fontWeight: 600 }}>관리자 포털</span>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button className="portal-button secondary" type="submit" style={{ padding: '8px 14px', fontSize: 13 }}>
            로그아웃
          </button>
        </form>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          안녕하세요, {session.fullName || session.email}님
        </h1>
        <p className="portal-muted" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
          권한이 있는 앱과 지점만 표시됩니다.
        </p>
      </section>

      {cards.length === 0 ? (
        <div
          className="portal-card"
          style={{
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>표시할 권한이 없습니다</p>
          <p className="portal-muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
            운영자 계정에 앱 권한이 연결되어 있는지 확인해 주세요.
          </p>
        </div>
      ) : (
        <div className="portal-grid">
          {cards.map((card) => {
            const url = new URL('/launch', 'http://portal.local')
            url.searchParams.set('app', card.appKey)
            url.searchParams.set('role', card.role)
            if (card.divisionSlug) {
              url.searchParams.set('division', card.divisionSlug)
            }

            const divisionLabel = card.divisionSlug ? DIVISION_LABELS[card.divisionSlug] ?? card.divisionSlug : null
            const roleLabel = ROLE_LABELS[card.role] ?? card.role

            return (
              <Link
                key={card.key}
                href={`${url.pathname}${url.search}`}
                className="launch-card"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{card.appName}</span>
                    {divisionLabel ? (
                      <span className={`division-badge ${card.divisionSlug}`}>{divisionLabel}</span>
                    ) : null}
                  </div>
                  <span className="portal-badge">{roleLabel}</span>
                </div>
                <p className="portal-muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  {roleLabel} 권한으로 접속합니다
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
