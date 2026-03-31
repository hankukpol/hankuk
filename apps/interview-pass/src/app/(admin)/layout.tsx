'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { useAppConfig } from '@/hooks/use-app-config'
import type { AppFeatureKey } from '@/lib/app-config.shared'
import { stripTenantPrefix, withTenantPrefix } from '@/lib/tenant'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LayoutChildren = any

const NAV: Array<{ href: string; label: string; feature?: AppFeatureKey }> = [
  { href: '/dashboard', label: '대시보드', feature: 'admin_dashboard_overview_enabled' },
  { href: '/dashboard/students', label: '학생 명단', feature: 'admin_student_management_enabled' },
  { href: '/dashboard/materials', label: '자료 설정', feature: 'admin_materials_enabled' },
  { href: '/dashboard/logs', label: '배부 로그', feature: 'admin_distribution_logs_enabled' },
  { href: '/dashboard/config', label: '설정' },
]

export default function AdminLayout({ children }: { children: LayoutChildren }) {
  const tenant = useTenantConfig()
  const pathname = stripTenantPrefix(usePathname())
  const { config } = useAppConfig()
  const visibleNav = NAV.filter((item) => !item.feature || config[item.feature])

  return (
    <div className="flex min-h-dvh bg-[#f4f6f8]">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#0f172a] xl:w-72">
        <div className="border-b border-white/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-blue-600 text-sm font-bold text-white">
              A
            </div>
            <div>
              <div className="text-[13px] font-bold leading-tight text-white">{tenant.adminTitle}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">관리자 대시보드</div>
            </div>
          </div>
        </div>

        <div className="border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-slate-700">
              <svg className="h-4 w-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-slate-200">관리자</div>
              <div className="text-[10px] text-slate-500">운영 계정</div>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            메뉴
          </div>
          {visibleNav.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={withTenantPrefix(item.href, tenant.type)}
                className={`relative flex items-center px-4 py-3 text-[14px] transition-colors ${
                  active
                    ? 'bg-blue-600 font-semibold text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                {active ? <span className="absolute left-0 top-0 h-full w-0.5 bg-blue-300" /> : null}
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/5 px-3 py-4">
          <button
            onClick={async () => {
              await fetch('/api/auth/admin/logout', { method: 'POST' })
              window.location.href = withTenantPrefix('/admin/login', tenant.type)
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-[14px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between bg-[#0f172a] px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center bg-blue-600 text-[11px] font-bold text-white">
              A
            </div>
            <span className="text-[13px] font-bold text-white">{tenant.adminTitle}</span>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/admin/logout', { method: 'POST' })
              window.location.href = withTenantPrefix('/admin/login', tenant.type)
            }}
            className="border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 hover:text-white"
          >
            로그아웃
          </button>
        </div>

        <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/5 bg-[#1e293b] px-2 py-2 md:hidden">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={withTenantPrefix(item.href, tenant.type)}
                className={`shrink-0 px-3 py-2 text-[12px] font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 overflow-auto p-5 md:p-8 xl:p-10">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
