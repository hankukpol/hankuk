"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";

import {
  portalCardClass,
  portalContainerClass,
  portalPageClass,
} from "@/components/student-view/StudentPortalUi";

type StudentLoginFormProps = {
  divisionSlug: string;
  divisionName: string;
  sampleLogin: {
    studentNumber: string;
    name: string;
  } | null;
};

export function StudentLoginForm({
  divisionSlug,
  divisionName,
  sampleLogin,
}: StudentLoginFormProps) {
  const router = useRouter();
  const [studentNumber, setStudentNumber] = useState(sampleLogin?.studentNumber ?? "");
  const [name, setName] = useState(sampleLogin?.name ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          division: divisionSlug,
          studentNumber,
          name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "학생 로그인에 실패했습니다.");
        return;
      }

      router.push(`/${divisionSlug}/student`);
      router.refresh();
    } catch {
      setError("로그인 요청 중 문제가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={portalPageClass}>
      <div className={`${portalContainerClass} min-h-[calc(100dvh-1.5rem)] items-center justify-center`}>
        <section className={`${portalCardClass} w-full max-w-sm overflow-hidden`}>
          <div
            className="px-5 py-5"
            style={{
              background:
                "linear-gradient(145deg, var(--division-color-strong) 0%, var(--division-hero-end) 100%)",
              color: "var(--division-on-accent)",
            }}
          >
            <h1 className="text-[22px] font-bold">
              학생 로그인
            </h1>
            <p className="mt-2 text-[13px] leading-[1.5] text-white/70">
              {divisionName} 학생은 이름과 학번만 입력하면 바로 로그인할 수 있습니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 p-5">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--foreground)]">학번</span>
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-[#F4F4F2] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--division-color)] focus:bg-white"
                placeholder="학번 입력"
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--foreground)]">이름</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-[#F4F4F2] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--division-color)] focus:bg-white"
                placeholder="이름 입력"
                autoComplete="name"
                required
              />
            </label>

            {error ? (
              <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
              style={{
                backgroundColor: "var(--division-color)",
                color: "var(--division-on-accent)",
              }}
            >
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              로그인
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
