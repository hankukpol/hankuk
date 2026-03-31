import Link from "next/link";
import { redirect } from "next/navigation";

import { hasAdminSession, isAdminSetupConfigured } from "@/lib/auth";
import { hasActiveAdminUsers } from "@/lib/admin-users";
import { SectionCard } from "@/components/ui/section-card";

type AdminLoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

const errorMessages: Record<string, string> = {
  invalid_credentials: "관리자 아이디 또는 비밀번호가 올바르지 않습니다.",
  missing_login_id: "관리자 아이디를 입력해주세요.",
  missing_password: "관리자 비밀번호를 입력해주세요.",
  missing_config:
    "관리자 세션 서명 설정이 없습니다. `ADMIN_SESSION_SECRET` 또는 `SUPABASE_SERVICE_ROLE_KEY` 설정을 확인해주세요.",
  missing_admin_users:
    "아직 생성된 관리자 계정이 없습니다. 먼저 초기 관리자 계정을 만들어주세요.",
};

function SetupRequiredCard({ setupConfigured }: { setupConfigured: boolean }) {
  return (
    <main className="admin-container">
      <SectionCard
        title="관리자 계정 초기 설정 필요"
        description="이제 관리자 접속은 공용 비밀번호가 아니라 관리자 계정으로 처리됩니다."
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            첫 관리자 계정은 `/admin/setup`에서 생성할 수 있습니다.
            {!setupConfigured
              ? " Vercel 환경변수에 `ADMIN_SETUP_KEY`를 먼저 추가한 뒤 진행하세요."
              : " 설정 키를 입력해 초기 관리자 계정을 만든 뒤 로그인하세요."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/setup"
              className="inline-flex items-center rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              관리자 계정 만들기
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              메인으로 돌아가기
            </Link>
          </div>
        </div>
      </SectionCard>
    </main>
  );
}

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  if (hasAdminSession()) {
    redirect("/admin");
  }

  const [hasAdmins, setupConfigured] = await Promise.all([
    hasActiveAdminUsers(),
    Promise.resolve(isAdminSetupConfigured()),
  ]);

  if (!hasAdmins) {
    return <SetupRequiredCard setupConfigured={setupConfigured} />;
  }

  const errorMessage = searchParams?.error
    ? errorMessages[searchParams.error] ?? "로그인 중 문제가 발생했습니다."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-[440px]">
        <SectionCard
          title="관리자 로그인"
          description="관리자 아이디와 비밀번호를 입력하면 운영 대시보드 세션이 생성됩니다."
        >
          <div className="space-y-5">
            <form
              action="/api/admin/auth/login"
              method="post"
              className="space-y-4"
            >
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  관리자 아이디
                </span>
                <input
                  name="loginId"
                  type="text"
                  autoComplete="username"
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  placeholder="admin.manager"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  관리자 비밀번호
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  placeholder="관리자 비밀번호"
                />
              </label>

              {errorMessage ? (
                <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                로그인
              </button>
            </form>

            <p className="text-xs leading-5 text-slate-500">
              로그인 후에는 `httpOnly` 세션 쿠키로 관리자 페이지와
              `/api/admin/*` 라우트를 함께 보호합니다. 계정 복구가 필요하면
              `ADMIN_SETUP_KEY`를 설정한 뒤 `/admin/setup`을 사용하면 됩니다.
            </p>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
