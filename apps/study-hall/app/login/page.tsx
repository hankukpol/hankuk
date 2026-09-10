"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { forgetStaffEmail, readStaffEmail, rememberStaffEmail } from "@/lib/login-storage";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);

  // 저장해 둔 이메일이 있으면 채워 두고 체크박스도 켠 상태로 연다.
  // 비밀번호 칸에 바로 커서가 가도록 브라우저 자동완성 힌트를 함께 준다.
  useEffect(() => {
    const saved = readStaffEmail();
    if (!saved) return;
    setEmail(saved);
    setRememberEmail(true);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "로그인에 실패했습니다.");
        return;
      }

      if (rememberEmail) rememberStaffEmail(email);
      else forgetStaffEmail();

      const nextPath =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;

      if (nextPath) {
        window.location.href = nextPath;
        return;
      }

      if (data.session?.role === "SUPER_ADMIN") {
        window.location.href = "/super-admin";
      } else if (data.session?.role === "ASSISTANT") {
        window.location.href = `/${data.session.divisionSlug}/assistant`;
      } else if (data.session?.divisionSlug) {
        window.location.href = `/${data.session.divisionSlug}/admin`;
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("로그인 요청 중 문제가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    /* DESIGN.md 5.1 — 로그인 카드 최대 480px, 관리자 공통 폰트·입력·버튼을 쓴다. */
    <main className="admin-shell admin-auth-page flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="admin-auth-card w-full max-w-[480px] rounded-lg border border-admin-line p-6">
        <h1 className="admin-page-title">운영 계정으로 로그인</h1>
        <p className="admin-page-description">
          로그인하면 권한과 소속 지점에 맞는 화면으로 자동 이동합니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="admin-field">
            <span className="admin-label">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-label">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호를 입력해 주세요"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="admin-notice admin-notice-danger">{error}</p> : null}

          {/* 담는 것은 이메일뿐이다. 비밀번호는 저장하지 않는다 — 조교·관리자 화면은
              지점 전체의 출결과 상벌점을 고칠 수 있어서, 기기를 잠깐 빌려준 사이에
              그대로 열리면 안 된다. 대신 로그인 세션이 30일 유지되므로 한 번 들어오면
              한 달 동안 이 화면을 다시 볼 일이 없다. */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(event) => {
                setRememberEmail(event.target.checked);
                if (!event.target.checked) forgetStaffEmail();
              }}
            />
            <span className="admin-label">이 기기에 이메일 저장</span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="admin-button admin-button-primary w-full"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}
