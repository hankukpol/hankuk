"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/browser";

const SAVED_EMAIL_KEY = "admin_saved_email";

type LoginFormProps = {
  redirectTo: string;
  disabled: boolean;
};

export function LoginForm({ redirectTo, disabled }: LoginFormProps) {
  const router = useRouter();
  const safeRedirectTo = sanitizeRedirectPath(redirectTo, "/admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setRememberEmail(true);
      }
    } catch {
      // 일부 브라우저에서 localStorage 접근 불가
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      try {
        if (rememberEmail) {
          localStorage.setItem(SAVED_EMAIL_KEY, email);
        } else {
          localStorage.removeItem(SAVED_EMAIL_KEY);
        }
      } catch {
        // localStorage 실패는 무시
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.replace(safeRedirectTo);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "로그인 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm text-ink outline-none transition focus:border-ember/50 focus:bg-white"
          placeholder="admin@example.com"
          required
          disabled={disabled || submitting}
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm text-ink outline-none transition focus:border-ember/50 focus:bg-white"
          placeholder="••••••••"
          required
          disabled={disabled || submitting}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate select-none">
        <input
          type="checkbox"
          checked={rememberEmail}
          onChange={(e) => setRememberEmail(e.target.checked)}
          className="h-4 w-4 rounded accent-ember"
        />
        아이디 저장
      </label>
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={disabled || submitting}
        className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
      >
        {submitting ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
