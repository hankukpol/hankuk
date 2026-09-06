'use client'

import Link from 'next/link'
import { BookOpen, LayoutDashboard, LogOut, MonitorSmartphone, ReceiptText, Settings, ShieldCheck, Users } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { AppSwitchMenu } from '@/components/AppSwitchMenu'
import { AdminTheme } from '@/components/admin/AdminTheme'
import { AdminMobileNavigation } from '@/components/admin/AdminMobileNavigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { stripTenantPrefix, withTenantPrefix } from '@/lib/tenant'

const NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/dashboard/courses', label: '강좌 관리', icon: BookOpen },
  { href: '/dashboard/settlements', label: '수납·정산', icon: ReceiptText },
  { href: '/dashboard/students/auth-setup', label: '학생 인증', icon: ShieldCheck },
  { href: '/dashboard/staff', label: '직원 관리', icon: Users },
  { href: '/dashboard/popups', label: '팝업 관리', icon: MonitorSmartphone },
  { href: '/dashboard/config', label: '지점 설정', icon: Settings },
] as const

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tenant = useTenantConfig()
  const pathname = stripTenantPrefix(usePathname())
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))

  async function logout() {
    await fetch(withTenantPrefix('/api/auth/admin/logout', tenant.type), { method: 'POST' })
    window.location.href = withTenantPrefix('/admin/login', tenant.type)
  }

  return (
    <AdminTheme>
      <aside className="admin-sidebar-rail hidden lg:block">
        <div className="admin-sidebar">
        <div className="admin-sidebar-header">
          <p className="admin-sidebar-brand">클래스패스</p>
          <p className="admin-sidebar-caption">{tenant.trackLabel} · 관리자 운영</p>
        </div>
        <nav className="admin-sidebar-nav" aria-label="관리자 메뉴">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={withTenantPrefix(href, tenant.type)} className="admin-sidebar-link"
              data-active={isActive(href)} aria-current={isActive(href) ? 'page' : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link href={withTenantPrefix('/staff/login', tenant.type)} className="admin-sidebar-link">
            <Users aria-hidden="true" /><span>직원 화면</span>
          </Link>
          <button type="button" onClick={() => void logout()} className="admin-sidebar-link w-full">
            <LogOut aria-hidden="true" /><span>로그아웃</span>
          </button>
        </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-mobile-header lg:hidden">
          <div><p className="admin-sidebar-brand">클래스패스</p><p className="admin-sidebar-caption">{tenant.trackLabel} · 관리자 운영</p></div>
          <button type="button" onClick={() => void logout()} className="admin-sidebar-link">로그아웃</button>
        </header>
        <main className="admin-main">
          <div className="admin-content-frame">
            <div className="admin-utility-row">
              <AdminMobileNavigation pathname={pathname}>
                {NAV_ITEMS.map(({ href, label }) => (
                  <Link key={href} href={withTenantPrefix(href, tenant.type)} className="admin-mobile-link"
                    data-active={isActive(href)} aria-current={isActive(href) ? 'page' : undefined}>{label}</Link>
                ))}
                <Link href={withTenantPrefix('/staff/login', tenant.type)} className="admin-mobile-link">직원 화면</Link>
              </AdminMobileNavigation>
              <AppSwitchMenu role="admin" divisionSlug={tenant.type} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </AdminTheme>
  )
}
