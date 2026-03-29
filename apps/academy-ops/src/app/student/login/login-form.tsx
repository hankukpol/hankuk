"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type LoginFormProps = {
  redirectPath?: string;
};

export function LoginForm({ redirectPath = "/student" }: LoginFormProps) {
  const router = useRouter();
  const [examNumber, setExamNumber] = useState("");
  const [birthDate6, setBirthDate6] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!examNumber.trim()) {
      setErrorMessage("학번을 입력해 주세요.");
      return;
    }

    if (!birthDate6 || birthDate6.length !== 6) {
      setErrorMessage("생년월일 6자리를 입력해 주세요. (예: 991231)");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/student/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumber: examNumber.trim(), birthDate6 }),
          cache: "no-store",
        });

        const payload = (await res.json()) as {
          data?: { examNumber: string; name: string };
          error?: string;
        };

        if (!res.ok) {
          setErrorMessage(
            payload.error ?? "학번 또는 생년월일이 올바르지 않습니다.",
          );
          return;
        }

        router.push(redirectPath);
        router.refresh();
      } catch {
        setErrorMessage("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
      <h2 className="text-xl font-semibold text-ink">학번 + 생년월일로 로그인</h2>
      <p className="mt-3 text-sm leading-7 text-slate">
        수험번호와 생년월일 6자리를 입력하면 세션이 유지되어 계속 조회할 수 있습니다.
      </p>
      <p className="mt-1 text-xs text-slate">
        생년월일 6자리 예: 1999년 12월 31일 → 991231
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="login-exam-number"
              className="mb-1.5 block text-xs font-semibold text-slate"
            >
              학번 *
            </label>
            <input
              id="login-exam-number"
              type="text"
              value={examNumber}
              onChange={(e) => setExamNumber(e.target.value)}
              placeholder="수험번호"
              autoComplete="username"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30 disabled:opacity-60"
            />
          </div>
          <div>
            <label
              htmlFor="login-birth-date"
              className="mb-1.5 block text-xs font-semibold text-slate"
            >
              생년월일 6자리 *
            </label>
            <input
              id="login-birth-date"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={birthDate6}
              onChange={(e) =>
                setBirthDate6(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="예: 991231"
              autoComplete="bday"
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isPending ? "로그인 중..." : "로그인"}
          </button>
        </div>
      </form>
    </section>
  );
}
