import { listOperatorAccounts } from '@/lib/branch-ops'
import { withTenantPrefix } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'

const portalUrl = (
  process.env.NEXT_PUBLIC_PORTAL_URL ??
  process.env.PORTAL_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://portal.hankukpol.co.kr')
).replace(/\/+$/, '')

const ROLE_LABELS: Record<'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF', string> = {
  SUPER_ADMIN: '슈퍼 관리자',
  BRANCH_ADMIN: '지점 관리자',
  STAFF: '스태프',
}

type DevLoginOption = {
  accountId: number
  membershipId: number
  loginId: string
  displayName: string
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF'
  branchName: string | null
  branchSlug: string | null
}

async function loadDevLoginOptions(): Promise<DevLoginOption[]> {
  try {
    const accounts = await listOperatorAccounts()
    return accounts
      .filter((account) => account.is_active)
      .flatMap((account) =>
        account.memberships
          .filter(
            (membership) =>
              membership.is_active &&
              (membership.role === 'SUPER_ADMIN' || membership.branch?.is_active !== false),
          )
          .map((membership) => ({
            accountId: account.id,
            membershipId: membership.id,
            loginId: account.login_id,
            displayName: account.display_name,
            role: membership.role,
            branchName: membership.branch?.name ?? null,
            branchSlug: membership.branch?.slug ?? null,
          })),
      )
  } catch (error) {
    console.warn('[admin/login] Failed to load dev login options.', error)
    return []
  }
}

export default async function AdminLoginPage() {
  const tenantType = await getServerTenantType()
  const devEnabled = process.env.NODE_ENV !== 'production'
  const devOptions = devEnabled ? await loadDevLoginOptions() : []

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

        {devEnabled ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              DEV ONLY
            </p>
            <p className="mt-2 text-sm font-semibold text-amber-900">
              개발용 바로 로그인
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              이 섹션은 로컬 개발 환경에서만 표시됩니다. 아래 목록에서 계정을 선택하면 포털을
              거치지 않고 세션이 발급됩니다.
            </p>

            {devOptions.length === 0 ? (
              <p className="mt-4 text-xs text-amber-800">
                활성화된 operator_accounts가 없습니다. Supabase에 계정을 먼저 생성해 주세요.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {devOptions.map((option) => (
                  <form
                    key={`${option.accountId}-${option.membershipId}`}
                    method="POST"
                    action="/api/auth/admin/dev-login"
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"
                  >
                    <input type="hidden" name="accountId" value={option.accountId} />
                    <input type="hidden" name="membershipId" value={option.membershipId} />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {option.displayName}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          @{option.loginId}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {ROLE_LABELS[option.role]}
                        {option.branchName ? ` · ${option.branchName}` : ''}
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      바로 로그인
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
