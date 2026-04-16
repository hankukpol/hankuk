import Link from 'next/link'
import { AppSwitchMenu } from '@/components/AppSwitchMenu'

export default function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Class Pass
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-slate-900">Super Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-3 text-sm font-semibold">
              <Link href="/super-admin" className="text-slate-600 hover:text-slate-900">
                개요
              </Link>
              <Link
                href="/super-admin/manage"
                className="text-slate-600 hover:text-slate-900"
              >
                지점별 운영자 관리
              </Link>
            </nav>
            <AppSwitchMenu role="super_admin" />
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
