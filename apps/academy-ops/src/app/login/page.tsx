import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { isLocalMockMode } from "@/lib/env";
import { sanitizeRedirectPath } from "@/lib/security";

type LoginPageProps = {
  searchParams?: {
    redirectTo?: string;
    error?: string;
  };
};

const errorMessage: Record<string, string> = {
  unauthorized: "관리자 권한이 있는 계정으로 로그인해야 합니다.",
  invalid: "로그인 세션을 다시 확인해 주세요.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = sanitizeRedirectPath(searchParams?.redirectTo, "/admin");
  const error = searchParams?.error;
  const branding = await getAcademyRuntimeBranding();

  if (isLocalMockMode()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4">
        <div className="w-full max-w-lg rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Local Mock Mode
          </div>
          <h1 className="mt-5 text-2xl font-bold text-ink">관리자 인증이 로컬 목업 모드로 전환되었습니다.</h1>
          <p className="mt-4 text-sm leading-7 text-slate">
            Supabase 로그인 없이 로컬 Prisma DB의 목업 관리자 계정으로 바로 테스트할 수 있습니다.
            관리자 화면은 아래 버튼으로 이동하세요.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={redirectTo}
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              관리자 화면 열기
            </Link>
            <Link
              href="/student/login"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털 로그인
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">{branding.systemName}</h1>
          <p className="mt-2 text-sm text-slate">관리자 계정으로 로그인하세요</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel">
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage[error] ?? "로그인 상태를 다시 확인해 주세요."}
            </div>
          ) : null}
          <LoginForm redirectTo={redirectTo} disabled={false} />
        </div>
      </div>
    </main>
  );
}
