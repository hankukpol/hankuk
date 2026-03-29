"use client";

import { useState, useTransition } from "react";
import { AdminRole } from "@prisma/client";

type ProfileFormProps = {
  adminId: string;
  initialName: string;
  email: string;
  role: AdminRole;
};

const ROLE_LABEL: Record<AdminRole, string> = {
  VIEWER: "조회 전용",
  TEACHER: "강사",
  COUNSELOR: "상담",
  ACADEMIC_ADMIN: "교무행정",
  MANAGER: "실장",
  DEPUTY_DIRECTOR: "부원장",
  DIRECTOR: "원장",
  SUPER_ADMIN: "최고 관리자",
};

export function ProfileForm({
  initialName,
  email,
  role,
}: ProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });

        const json = (await res.json()) as { data?: { name: string }; error?: string };

        if (!res.ok) {
          setError(json.error ?? "저장 중 오류가 발생했습니다.");
          return;
        }

        setNotice("이름이 변경되었습니다.");
      } catch {
        setError("저장 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Profile info card */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">계정 정보</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              이메일
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{email}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              역할
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {ROLE_LABEL[role]}
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              현재 이름
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{initialName}</p>
          </div>
        </div>
      </div>

      {/* Feedback messages */}
      {notice && (
        <div className="rounded-[24px] border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Change name */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">이름 변경</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          관리자 화면 및 감사 로그에 표시되는 이름을 변경합니다.
        </p>
        <form onSubmit={handleSaveName} className="mt-5 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-ink"
            >
              이름
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNotice(null);
                setError(null);
              }}
              maxLength={50}
              required
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm text-ink focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || !name.trim() || name.trim() === initialName}
            className="inline-flex rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
        </form>
      </div>

      {/* Password change */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">비밀번호 변경</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          비밀번호는 Supabase 인증을 통해 관리됩니다. 아래 절차를 따라 변경해
          주세요.
        </p>
        <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-slate">
          <li>
            로그인 화면에서{" "}
            <span className="font-semibold text-ink">비밀번호 재설정</span>{" "}
            링크를 클릭하세요.
          </li>
          <li>
            현재 계정 이메일({" "}
            <span className="font-mono text-xs text-ink">{email}</span> )로
            재설정 메일이 발송됩니다.
          </li>
          <li>메일의 링크를 클릭하여 새 비밀번호를 설정하세요.</li>
        </ol>
        <a
          href="/login?mode=forgot"
          className="mt-5 inline-flex rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink/40"
        >
          비밀번호 재설정 이메일 보내기
        </a>
      </div>
    </div>
  );
}
