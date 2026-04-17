const portalUrl = (
  process.env.NEXT_PUBLIC_PORTAL_URL ??
  process.env.PORTAL_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://portal.hankukpol.co.kr')
).replace(/\/+$/, '')

type SuperAdminLoginPageProps = {
  searchParams?: Promise<{
    setup?: string
  }>
}

export default async function SuperAdminLoginPage({ searchParams }: SuperAdminLoginPageProps) {
  const resolvedSearchParams = await searchParams
  const setupCompleted = resolvedSearchParams?.setup === 'done'

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-73px)] w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Super Admin Portal
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">
          슈퍼 관리자 로그인
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          슈퍼 관리자 계정은 이제 포털에서만 로그인할 수 있습니다. 최초 설정이 끝났다면 포털로
          이동해 로그인해 주세요.
        </p>

        {setupCompleted ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            초기 설정이 완료되었습니다. 포털에서 로그인하면 Class Pass 슈퍼 관리자 화면으로
            이동할 수 있습니다.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <a
            href={`${portalUrl}/login`}
            className="rounded-2xl bg-slate-900 px-5 py-4 text-center text-lg font-bold text-white transition hover:bg-slate-800"
          >
            포털로 이동
          </a>
          <a
            href="/super-admin/setup"
            className="rounded-2xl border border-slate-200 px-5 py-4 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            최초 설정이 필요하면 초기 설정으로 이동
          </a>
        </div>
      </div>
    </div>
  )
}
