"use client";

import { ExamType } from "@prisma/client";
import { useState, useTransition } from "react";

type StudentLookupFormProps = {
  currentStudent?: {
    examNumber: string;
    name: string;
    examType: ExamType;
  } | null;
  redirectPath?: string;
};

function examTypeLabel(examType: ExamType) {
  return examType === ExamType.GYEONGCHAE ? "경채" : "공채";
}

export function StudentLookupForm({
  currentStudent,
  redirectPath = "/student",
}: StudentLookupFormProps) {
  const [examNumber, setExamNumber] = useState(currentStudent?.examNumber ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  function handleLookup() {
    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await requestJson("/api/student/auth/login", {
          method: "POST",
          body: JSON.stringify({
            examNumber,
            birthDate,
          }),
        });

        window.location.href = redirectPath;
      } catch (error) {
        setNotice(null);
        setErrorMessage(
          error instanceof Error ? error.message : "학생 로그인에 실패했습니다.",
        );
      }
    });
  }

  function handleLogout() {
    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await requestJson("/api/student/auth/logout", {
          method: "POST",
        });

        window.location.href = "/student/login";
      } catch (error) {
        setNotice(null);
        setErrorMessage(
          error instanceof Error ? error.message : "로그아웃에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">학생 로그인</h2>
          <p className="mt-3 text-sm leading-7 text-slate">
            수험번호와 생년월일 6자리로 본인 포털에 로그인합니다.
          </p>
        </div>
        {currentStudent ? (
          <div className="rounded-[20px] border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {currentStudent.name} ({currentStudent.examNumber}) /{" "}
            {examTypeLabel(currentStudent.examType)}
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          value={examNumber}
          onChange={(event) => setExamNumber(event.target.value)}
          placeholder="수험번호"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
        />
        <input
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="생년월일 6자리 (예: 901231)"
          inputMode="numeric"
          maxLength={6}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleLookup}
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          로그인
        </button>
        {currentStudent ? (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
          >
            로그아웃
          </button>
        ) : null}
      </div>
    </div>
  );
}




