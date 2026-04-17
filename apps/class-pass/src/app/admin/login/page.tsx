import { withTenantPrefix } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'

const portalUrl = (
  process.env.NEXT_PUBLIC_PORTAL_URL ??
  process.env.PORTAL_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://portal.hankukpol.co.kr')
).replace(/\/+$/, '')

export default async function AdminLoginPage() {
  const tenantType = await getServerTenantType()

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Admin Portal</p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-900">관리자 로그인</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          관리자 계정은 한국공무원학원 포털에서만 로그인할 수 있습니다.
          스태프 로그인과 학생 기능은 기존 경로를 그대로 사용합니다.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={`${portalUrl}/login`}
            className="rounded-2xl px-5 py-4 text-center text-lg font-bold text-white"
            style={{ background: 'var(--theme)' }}
          >
            포털로 이동
          </a>
          <a
            href={withTenantPrefix('/staff/login', tenantType)}
            className="rounded-2xl border border-slate-200 px-5 py-4 text-center text-lg font-bold text-gray-900"
          >
            스태프 로그인
          </a>
        </div>
      </div>
    </div>
  )
}
