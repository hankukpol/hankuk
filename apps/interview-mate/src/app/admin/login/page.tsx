import Link from "next/link";
import { redirect } from "next/navigation";

import { hasAdminSession, isAdminPasswordConfigured } from "@/lib/auth";
import { SectionCard } from "@/components/ui/section-card";

type AdminLoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

const errorMessages: Record<string, string> = {
  invalid_password: "관리자 비밀번호가 올바르지 않습니다.",
  missing_password: "관리자 비밀번호를 입력해주세요.",
  missing_config:
    "관리자 비밀번호가 아직 설정되지 않았습니다. 환경변수를 먼저 추가하세요.",
};

export default function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  if (hasAdminSession()) {
    redirect("/admin");
  }

  if (!isAdminPasswordConfigured()) {
    return (
      <main className="admin-container">
        <SectionCard
          title="관리자 비밀번호 미설정"
          description="환경변수 `ADMIN_PASSWORD`가 있어야 관리자 로그인을 사용할 수 있습니다."
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              로컬에서는 `.env.local`, 배포에서는 Vercel 환경변수에
              `ADMIN_PASSWORD`를 추가한 뒤 다시 접속하세요.
            </p>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              메인으로 돌아가기
            </Link>
          </div>
        </SectionCard>
      </main>
    );
  }

  const errorMessage = searchParams?.error
    ? errorMessages[searchParams.error] ?? "로그인 중 문제가 발생했습니다."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-[440px]">
      <SectionCard
        title="관리자 로그인"
        description="관리자 비밀번호를 입력하면 운영 대시보드 세션이 생성됩니다."
      >
        <div className="space-y-5">
          <form
            action="/api/admin/auth/login"
            method="post"
            className="space-y-4"
          >
            <input
              type="text"
              name="loginId"
              autoComplete="username"
              defaultValue="admin"
              className="sr-only"
              tabIndex={-1}
              readOnly
            />

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
            `/api/admin/*` 라우트를 함께 보호합니다.
          </p>
        </div>
      </SectionCard>
      </div>
    </main>
  );
}
