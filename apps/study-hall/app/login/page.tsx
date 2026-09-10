"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import { type FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
              required
            />
          </label>

          {error ? <p className="admin-notice admin-notice-danger">{error}</p> : null}

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
