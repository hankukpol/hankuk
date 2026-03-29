import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readRedirectPath(searchParams: PageProps["searchParams"]) {
  const value = searchParams?.redirectTo;
  const path = Array.isArray(value) ? value[0] : value;

  if (!path || !path.startsWith("/student")) {
    return "/student";
  }

  return path;
}

export default async function StudentLoginPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              학생 포털 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학생 포털은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 포털 조회에 필요한 데이터베이스 연결이 없습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                홈으로
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const student = await getStudentPortalViewer();

  if (student) {
    redirect(readRedirectPath(searchParams));
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
          <div className="bg-hero-grid bg-[size:28px_28px] px-6 py-8 sm:px-8 sm:py-10">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              학생 로그인
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              수험번호와 생년월일로 본인 포털에 로그인합니다.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-8 text-slate sm:text-base">
              로그인 후 성적, 오답 노트, 공지사항을 본인 기준으로 계속 조회할 수 있습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                홈으로
              </Link>
            </div>
          </div>
        </section>

        <LoginForm redirectPath={readRedirectPath(searchParams)} />
      </div>
    </main>
  );
}
