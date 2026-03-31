import Link from "next/link";

import {
  getAdminSession,
  isAdminSetupConfigured,
} from "@/lib/auth";
import { listAdminUsers } from "@/lib/admin-users";
import { SectionCard } from "@/components/ui/section-card";

type AdminSetupPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

const errorMessages: Record<string, string> = {
  missing_setup_key:
    "설정 키가 없으면 초기 관리자 계정을 만들 수 없습니다. `ADMIN_SETUP_KEY`를 입력해주세요.",
  invalid_setup_key: "설정 키가 올바르지 않습니다.",
  missing_login_id: "관리자 아이디를 입력해주세요.",
  missing_password: "관리자 비밀번호를 입력해주세요.",
  password_mismatch: "비밀번호와 비밀번호 확인이 서로 다릅니다.",
  invalid_login_id:
    "관리자 아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈만 사용해 4~32자로 입력해주세요.",
  invalid_password: "관리자 비밀번호는 10~72자로 입력해주세요.",
  invalid_display_name: "관리자 이름은 2~40자로 입력해주세요.",
  duplicate_login_id: "이미 사용 중인 관리자 아이디입니다.",
  create_failed: "관리자 계정을 생성하지 못했습니다.",
  missing_config:
    "관리자 세션 서명 설정이 없습니다. `ADMIN_SESSION_SECRET` 또는 `SUPABASE_SERVICE_ROLE_KEY` 설정을 확인해주세요.",
};

const successMessages: Record<string, string> = {
  account_created: "새 관리자 계정을 생성했습니다.",
};

function EmptyStateCard({
  setupConfigured,
}: {
  setupConfigured: boolean;
}) {
  return (
    <SectionCard
      title="초기 설정 키 필요"
      description="첫 관리자 계정 생성 또는 비밀번호 분실 복구에는 설정 키가 필요합니다."
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          {!setupConfigured
            ? "Vercel 환경변수에 `ADMIN_SETUP_KEY`를 추가한 뒤 다시 접속하세요."
            : "환경변수 설정은 끝났습니다. 아래 버튼으로 관리자 계정 생성 화면으로 이동하세요."}
        </p>
        <div className="flex flex-wrap gap-3">
          {setupConfigured ? (
            <Link
              href="/admin/setup"
              className="inline-flex items-center rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              관리자 계정 생성 화면 새로고침
            </Link>
          ) : null}
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            메인으로 돌아가기
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

export default async function AdminSetupPage({
  searchParams,
}: AdminSetupPageProps) {
  const adminSession = getAdminSession();
  const [setupConfigured, adminUsers] = await Promise.all([
    Promise.resolve(isAdminSetupConfigured()),
    adminSession ? listAdminUsers() : Promise.resolve([]),
  ]);

  if (!adminSession && !setupConfigured) {
    return (
      <main className="admin-container">
        <EmptyStateCard setupConfigured={false} />
      </main>
    );
  }

  const errorMessage = searchParams?.error
    ? errorMessages[searchParams.error] ?? "설정 중 문제가 발생했습니다."
    : null;
  const successMessage = searchParams?.success
    ? successMessages[searchParams.success] ?? "처리가 완료되었습니다."
    : null;

  return (
    <main className="admin-container space-y-5">
      <SectionCard
        title={adminSession ? "관리자 계정 추가" : "초기 관리자 계정 생성"}
        description={
          adminSession
            ? "추가 관리자 계정을 생성합니다. 기본 역할은 `admin`으로 저장됩니다."
            : "첫 관리자 계정 또는 복구용 관리자 계정을 생성합니다."
        }
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-600">
            {adminSession
              ? `현재 로그인 계정: ${adminSession.displayName} (${adminSession.loginId})`
              : "로그인하지 않은 상태에서는 `ADMIN_SETUP_KEY`가 필요합니다."}
          </p>

          <form
            action="/api/admin/auth/setup"
            method="post"
            className="grid gap-4 md:grid-cols-2"
          >
            {!adminSession ? (
              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  설정 키
                </span>
                <input
                  name="setupKey"
                  type="password"
                  autoComplete="one-time-code"
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  placeholder="ADMIN_SETUP_KEY"
                />
              </label>
            ) : null}

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
                관리자 이름
              </span>
              <input
                name="displayName"
                type="text"
                autoComplete="name"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                placeholder="운영 관리자"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                비밀번호
              </span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                placeholder="10자 이상 비밀번호"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                비밀번호 확인
              </span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                placeholder="비밀번호 다시 입력"
              />
            </label>

            {errorMessage ? (
              <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2">
                {errorMessage}
              </p>
            ) : null}

            {successMessage ? (
              <p className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 md:col-span-2">
                {successMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                {adminSession ? "관리자 계정 추가" : "관리자 계정 생성"}
              </button>
              <Link
                href={adminSession ? "/admin" : "/admin/login"}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                {adminSession ? "관리자 홈으로" : "로그인 화면으로"}
              </Link>
            </div>
          </form>
        </div>
      </SectionCard>

      {adminSession ? (
        <SectionCard
          title="현재 관리자 계정"
          description="현재 로그인 가능한 관리자 계정 목록입니다."
        >
          <div className="space-y-3">
            {adminUsers.length ? (
              adminUsers.map((adminUser) => (
                <div
                  key={adminUser.id}
                  className="flex flex-col gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {adminUser.displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {adminUser.loginId} · {adminUser.role} ·{" "}
                      {adminUser.isActive ? "active" : "inactive"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    마지막 로그인: {adminUser.lastLoginAt ?? "없음"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                표시할 관리자 계정이 없습니다.
              </p>
            )}
          </div>
        </SectionCard>
      ) : null}
    </main>
  );
}
