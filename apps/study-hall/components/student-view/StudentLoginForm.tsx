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
          {/* DESIGN.md 7절 — 그라데이션 대신 선으로 구분한다. */}
          <div className="admin-dialog-header">
            <div className="min-w-0">
              <h1 className="admin-dialog-title">학생 로그인</h1>
              <p className="admin-dialog-description">
                {divisionName} 학생은 이름과 학번만 입력하면 바로 로그인할 수 있습니다.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 p-5">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-admin-text">학번</span>
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                className="w-full rounded-lg border border-admin-line bg-admin-surface-soft px-4 py-3 text-sm text-admin-text transition focus:border-[var(--division-color)]"
                placeholder="학번 입력"
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-admin-text">이름</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-admin-line bg-admin-surface-soft px-4 py-3 text-sm text-admin-text transition focus:border-[var(--division-color)]"
                placeholder="이름 입력"
                autoComplete="name"
                required
              />
            </label>

            {error ? (
              <div className="admin-notice admin-notice-danger">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="admin-button w-full"
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
