import Link from 'next/link'
import type { PortalSessionPayload } from '@/lib/portal-session'

type PortalNavProps = {
  session: PortalSessionPayload
  isSuperAdmin: boolean
  current: 'dashboard' | 'staff' | 'settings'
}

export function PortalNav({ session, isSuperAdmin, current }: PortalNavProps) {
  return (
    <nav className="portal-nav">
      <div className="portal-nav-left">
        <Link href="/" className="portal-nav-logo">
          <span className="portal-nav-logo-icon">H</span>
          <span>Hankuk Portal</span>
        </Link>
        <div className="portal-nav-links">
          <Link href="/" className={`portal-nav-link${current === 'dashboard' ? ' active' : ''}`}>
            대시보드
          </Link>
          {isSuperAdmin ? (
            <>
              <Link href="/staff" className={`portal-nav-link${current === 'staff' ? ' active' : ''}`}>
                직원 관리
              </Link>
              <Link href="/settings" className={`portal-nav-link${current === 'settings' ? ' active' : ''}`}>
                설정
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="portal-nav-actions">
        <span className="portal-nav-user">{session.fullName || session.email}</span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit">로그아웃</button>
        </form>
      </div>
    </nav>
  )
}
