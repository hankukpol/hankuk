'use client'

import Link from 'next/link'
import { CalendarDays, FileSpreadsheet, ReceiptText } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

const SETTLEMENT_LINKS = [
  {
    href: '/dashboard/settlements/daily',
    title: '일일 정산',
    description: '하루 기준 수납, 환불, 결제자 명단과 영수증 번호 범위를 확인합니다.',
    icon: ReceiptText,
    cta: '일일 정산 열기',
  },
  {
    href: '/dashboard/settlements/monthly',
    title: '월별 정산',
    description: '월간 합계, 환불률, 강좌별 순위와 일별 명세를 확인합니다.',
    icon: CalendarDays,
    cta: '월별 정산 열기',
  },
  {
    href: '/dashboard/settlements/import',
    title: '엑셀 가져오기',
    description: '기존 운영 엑셀 또는 CSV 파일로 수강생과 결제 기록을 일괄 반영합니다.',
    icon: FileSpreadsheet,
    cta: '가져오기 열기',
  },
] as const

export default function SettlementsHubPage() {
  const tenant = useTenantConfig()

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Settlement</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#1d1d1f]">수납·정산</h1>
        <p className="mt-2 text-sm text-slate-500">데스크 결제 기록을 일일 정산과 월별 정산으로 나누어 확인합니다.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {SETTLEMENT_LINKS.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={withTenantPrefix(item.href, tenant.type)}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-[#1d1d1f]">{item.title}</h2>
              <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-500">{item.description}</p>
              <p className="mt-5 text-sm font-bold text-blue-600 group-hover:text-blue-700">{item.cta}</p>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
