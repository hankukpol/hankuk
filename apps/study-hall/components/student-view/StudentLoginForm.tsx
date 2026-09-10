"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import {
  forgetStudentLogin,
  readStudentLogin,
  rememberStudentLogin,
} from "@/lib/login-storage";

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
  const [remember, setRemember] = useState(false);
  const autoTried = useRef(false);

  const submit = useCallback(async (number: string, studentName: string, keep: boolean) => {
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
          studentNumber: number,
          name: studentName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "학생 로그인에 실패했습니다.");
        // 저장해 둔 값으로 실패했으면 지운다. 이름이 바뀌었거나 명단에서 빠진 경우이고,
        // 남겨 두면 열 때마다 같은 오류만 본다.
        forgetStudentLogin(divisionSlug);
        return;
      }

      if (keep) rememberStudentLogin(divisionSlug, number, studentName);
      else forgetStudentLogin(divisionSlug);

      router.push(`/${divisionSlug}/student`);
      router.refresh();
    } catch {
      setError("로그인 요청 중 문제가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }, [divisionSlug, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(studentNumber, name, remember);
  }

  // 저장해 둔 학생이 있으면 열자마자 들어간다. 한 번만 시도하고, 실패하면 저장을 지운다.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const saved = readStudentLogin(divisionSlug);
    if (!saved) return;
    setStudentNumber(saved.studentNumber);
    setName(saved.name);
    setRemember(true);
    void submit(saved.studentNumber, saved.name, true);
  }, [divisionSlug, submit]);

  return (
    /* DESIGN.md 5.1 — 운영 계정 로그인과 같은 카드 규격(최대 480px)을 쓴다. */
    <main className="admin-shell admin-auth-page flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="admin-auth-card w-full max-w-[480px] rounded-lg border border-admin-line p-6">
        <h1 className="admin-page-title">학생 로그인</h1>
        <p className="admin-page-description">
          {divisionName} 학생은 수험번호와 이름만 입력하면 바로 로그인할 수 있습니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="admin-field">
            <span className="admin-label">수험번호</span>
            {/* 수험번호는 전부 숫자다. 학생이 매일 폰으로 치는 칸이라
                문자 키패드가 먼저 뜨면 로그인마다 전환을 한 번씩 더 하게 된다. */}
            <input
              value={studentNumber}
              onChange={(event) => setStudentNumber(event.target.value)}
              placeholder="수험번호 입력"
              autoComplete="username"
              inputMode="numeric"
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

          {/* .admin-field 는 세로 배치라 체크박스 줄에는 쓰지 않는다. */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked);
                if (!event.target.checked) forgetStudentLogin(divisionSlug);
              }}
            />
            <span className="admin-label">이 기기에서 자동 로그인</span>
          </label>
          <p className="admin-help -mt-2">
            수험번호와 이름을 이 기기에만 저장해 다음부터 바로 들어갑니다. 공용 기기에서는 켜지 마세요.
          </p>

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
