'use client'

import Link from 'next/link'
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { stripTenantPrefix, withTenantPrefix } from '@/lib/tenant'

const NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/dashboard/courses', label: '강좌 관리', icon: BookOpen },
  { href: '/dashboard/students/auth-setup', label: '학생 인증', icon: ShieldCheck },
  { href: '/dashboard/staff', label: '직원 관리', icon: Users },
  { href: '/dashboard/popups', label: '팝업 관리', icon: MonitorSmartphone },
  { href: '/dashboard/config', label: '지점 설정', icon: Settings },
] as const

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tenant = useTenantConfig()
  const pathname = stripTenantPrefix(usePathname())

  async function logout() {
    await fetch(withTenantPrefix('/api/auth/admin/logout', tenant.type), { method: 'POST' })
    window.location.href = withTenantPrefix('/admin/login', tenant.type)
  }

  return (
    <div className="flex min-h-dvh bg-[#f3f6fb]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-900/10 bg-[#0f172a] md:flex xl:w-72">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600/90 text-white shadow-lg shadow-blue-900/30">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                {tenant.trackLabel} · {tenant.slug}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-white">{tenant.adminTitle}</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-5">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
            관리자 메뉴
          </div>
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={withTenantPrefix(item.href, tenant.type)}
                prefetch={false}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                <span className="font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <Link
            href={withTenantPrefix('/staff/login', tenant.type)}
            prefetch={false}
            className="mb-2 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Users className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="font-semibold">직원 화면</span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="font-semibold">로그아웃</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-slate-900/10 bg-[#0f172a] px-4 py-3 text-white md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {tenant.trackLabel} · {tenant.slug}
              </p>
              <p className="truncate text-sm font-bold">{tenant.adminTitle}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              로그아웃
            </button>
          </div>
        </div>

        <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-3 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={withTenantPrefix(item.href, tenant.type)}
                prefetch={false}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 overflow-auto p-4 md:p-8 xl:p-10">
          <div className="mx-auto w-full max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
