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
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-100 px-4 py-12">
      <div className="grid w-full max-w-6xl overflow-hidden border border-gray-300 bg-white md:grid-cols-[0.86fr_1.14fr]">
        <section className="hidden bg-slate-950 p-10 text-white md:block">
          <p className="text-sm uppercase tracking-[0.28em] text-white/60">운영 계정 로그인</p>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight">
            관리자와 조교를 위한
            <br />
            운영 포털 로그인
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-white/70">
            Supabase Auth에 등록된 활성 계정으로 로그인합니다. 로그인 후에는 권한과 소속 지점에
            맞는 운영 화면으로 자동 이동합니다.
          </p>
        </section>

        <section className="p-6 md:p-10">
          <div className="mx-auto max-w-xl">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                로그인
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">
                운영 계정으로 로그인
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                로그인하면 권한과 소속 지점에 맞는 화면으로 자동 이동합니다.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-500"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호를 입력해 주세요."
                  className="w-full border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-500"
                  required
                />
              </label>

              {error ? (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
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
        </section>
      </div>
    </main>
  );
}
