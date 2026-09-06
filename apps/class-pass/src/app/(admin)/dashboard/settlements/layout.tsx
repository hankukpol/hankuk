'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { stripTenantPrefix, withTenantPrefix } from '@/lib/tenant'

const TABS = [
  ['/dashboard/settlements', '정산 안내'],
  ['/dashboard/settlements/daily', '일일 정산'],
  ['/dashboard/settlements/monthly', '월별 정산'],
  ['/dashboard/settlements/import', '엑셀 가져오기'],
  ['/dashboard/settlements/integrity', '정산 검증'],
] as const

export default function SettlementLayout({ children }: { children: React.ReactNode }) {
  const tenant = useTenantConfig()
  const pathname = stripTenantPrefix(usePathname())

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <nav className="admin-tabs" aria-label="수납·정산 메뉴">
        {TABS.map(([href, label]) => (
          <Link key={href} href={withTenantPrefix(href, tenant.type)} className="admin-tab"
            aria-current={pathname === href ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="admin-flat-page min-w-0">{children}</div>
    </div>
  )
}
