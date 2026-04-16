import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PortalNav } from '@/components/PortalNav'
import { isSuperAdmin, loadPortalLaunchCards } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'

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

  const [cards, superAdmin] = await Promise.all([
    loadPortalLaunchCards(session.userId),
    isSuperAdmin(session.userId),
  ])

  return (
    <>
      <PortalNav session={session} isSuperAdmin={superAdmin} current="dashboard" />

      <section className="portal-hero">
        <h1>{session.fullName || session.email}</h1>
        <p>권한이 연결된 운영 앱으로 바로 이동할 수 있습니다.</p>
      </section>

      <section className="portal-content">
        <div className="portal-content-inner">
          <div className="portal-section-row">
            <div>
              <h2 className="portal-section-heading">바로가기</h2>
              <p className="portal-section-sub">현재 활성화된 역할과 지점만 카드로 표시됩니다.</p>
            </div>

            {superAdmin ? (
              <div className="portal-actions-inline">
                <Link href="/staff" className="portal-button secondary">
                  직원 관리
                </Link>
                <Link href="/settings" className="portal-button secondary">
                  설정
                </Link>
              </div>
            ) : null}
          </div>

          {cards.length === 0 ? (
            <div className="portal-empty">
              <p>표시할 권한이 없습니다.</p>
              <p>포털 권한과 운영 계정 연결 상태를 확인해주세요.</p>
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

                const divisionLabel = card.divisionSlug
                  ? DIVISION_LABELS[card.divisionSlug] ?? card.divisionSlug
                  : null
                const roleLabel = ROLE_LABELS[card.role] ?? card.role

                return (
                  <Link key={card.key} href={`${url.pathname}${url.search}`} className="launch-card">
                    <div>
                      <div className="launch-card-header">
                        <span className="launch-card-title">{card.appName}</span>
                        {divisionLabel ? (
                          <span className={`division-badge ${card.divisionSlug}`}>{divisionLabel}</span>
                        ) : null}
                      </div>
                      <p className="launch-card-desc" style={{ marginTop: 10 }}>
                        {roleLabel} 권한으로 접속합니다.
                      </p>
                    </div>
                    <div className="launch-card-footer">
                      <span className="launch-card-link">바로가기</span>
                      <span className="portal-badge">{roleLabel}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
