import { getServerTenantConfig } from '@/lib/tenant.server'
import ConfigSubTabNav from './_components/ConfigSubTabNav'

export default async function DashboardConfigLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getServerTenantConfig()

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
          설정 워크스페이스
        </p>
        <h1 className="text-2xl font-bold text-gray-900">설정 관리</h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600">
          {tenant.defaultAppName}의 학생 화면 브랜딩, 기능 토글, 수령증 팝업, 관리자 접근 정보,
          캐시 무효화를 섹션별로 분리해 관리합니다.
        </p>
      </header>

      <ConfigSubTabNav />

      {children}
    </div>
  )
}
