"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";

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
    /* DESIGN.md 5.1 — 운영 계정 로그인과 같은 카드 규격(최대 480px)을 쓴다. */
    <main className="admin-shell flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px] rounded-lg border border-admin-line p-6">
        <h1 className="admin-page-title">학생 로그인</h1>
        <p className="admin-page-description">
          {divisionName} 학생은 수험번호와 이름만 입력하면 바로 로그인할 수 있습니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="admin-field">
            <span className="admin-label">수험번호</span>
            <input
              value={studentNumber}
              onChange={(event) => setStudentNumber(event.target.value)}
              placeholder="수험번호 입력"
              autoComplete="username"
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-label">이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="이름 입력"
              autoComplete="name"
              required
            />
          </label>

          {error ? <p className="admin-notice admin-notice-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="admin-button admin-button-primary w-full"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}
