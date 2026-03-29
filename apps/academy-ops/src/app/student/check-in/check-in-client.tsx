"use client";

import { useState } from "react";
import { toast } from "sonner";

type SessionInfo = {
  id: string;
  subjectName: string;
  cohortName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  instructorName: string | null;
};

type StudentInfo = {
  examNumber: string;
  name: string;
};

type CheckInResult = {
  status: "PRESENT" | "LATE";
  checkedAt: string;
  message: string;
};

type Props = {
  token: string;
  sessionInfo: SessionInfo;
  studentInfo: StudentInfo;
};

export function CheckInClient({ token, sessionInfo, studentInfo }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleCheckIn() {
    setState("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/student/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = (await res.json()) as { data?: CheckInResult; error?: string };

      if (!res.ok || !json.data) {
        const msg = json.error ?? "출석 처리 중 오류가 발생했습니다.";
        setErrorMessage(msg);
        setState("error");
        toast.error(msg);
        return;
      }

      setResult(json.data);
      setState("success");
      toast.success("출석이 완료되었습니다.");
    } catch {
      const msg = "네트워크 오류가 발생했습니다. 다시 시도해 주세요.";
      setErrorMessage(msg);
      setState("error");
      toast.error(msg);
    }
  }

  // 성공 상태
  if (state === "success" && result) {
    const isLate = result.status === "LATE";
    const checkedAtTime = new Date(result.checkedAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
        <div
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full animate-bounce ${
            isLate ? "bg-amber-50" : "bg-forest/10"
          }`}
        >
          <svg
            className={`h-11 w-11 ${isLate ? "text-amber-500" : "text-forest"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1
          className={`mt-5 text-2xl font-bold ${isLate ? "text-amber-700" : "text-forest"}`}
        >
          {isLate ? "지각 처리" : "출석 완료"}
        </h1>

        <p className="mt-2 text-base text-ink">
          {result.message}
        </p>

        <div className="mt-5 rounded-2xl bg-mist p-4 text-sm space-y-1.5 text-left">
          <div className="flex justify-between">
            <span className="text-slate">학생</span>
            <span className="font-medium text-ink">
              {studentInfo.name} ({studentInfo.examNumber})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">강의</span>
            <span className="font-medium text-ink">{sessionInfo.subjectName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">날짜</span>
            <span className="font-medium text-ink">{sessionInfo.sessionDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">체크인 시각</span>
            <span className="font-medium text-ink">{checkedAtTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">처리 결과</span>
            <span
              className={`font-semibold ${isLate ? "text-amber-700" : "text-forest"}`}
            >
              {isLate ? "지각" : "출석"}
            </span>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate">
          이 페이지를 닫아도 됩니다.
        </p>
      </div>
    );
  }

  // 기본 / 로딩 / 오류 상태
  return (
    <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 shadow-sm">
      {/* 제목 */}
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ember/10">
          <svg className="h-7 w-7 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="mt-3 text-xl font-bold text-ink">출석 체크인</h1>
        <p className="mt-1 text-sm text-slate">아래 정보를 확인하고 출석 확인 버튼을 누르세요.</p>
      </div>

      {/* 강의 정보 */}
      <div className="mt-5 space-y-2.5">
        <div className="flex justify-between rounded-2xl bg-mist px-4 py-2.5 text-sm">
          <span className="text-slate">강의</span>
          <span className="font-semibold text-ink">{sessionInfo.subjectName}</span>
        </div>
        {sessionInfo.instructorName && (
          <div className="flex justify-between rounded-2xl bg-mist px-4 py-2.5 text-sm">
            <span className="text-slate">강사</span>
            <span className="font-semibold text-ink">{sessionInfo.instructorName}</span>
          </div>
        )}
        <div className="flex justify-between rounded-2xl bg-mist px-4 py-2.5 text-sm">
          <span className="text-slate">날짜</span>
          <span className="font-semibold text-ink">{sessionInfo.sessionDate}</span>
        </div>
        <div className="flex justify-between rounded-2xl bg-mist px-4 py-2.5 text-sm">
          <span className="text-slate">시간</span>
          <span className="font-semibold text-ink">
            {sessionInfo.startTime} ~ {sessionInfo.endTime}
          </span>
        </div>
        <div className="flex justify-between rounded-2xl border border-forest/20 bg-forest/5 px-4 py-2.5 text-sm">
          <span className="text-slate">학생</span>
          <span className="font-semibold text-ink">
            {studentInfo.name}{" "}
            <span className="font-normal text-slate">({studentInfo.examNumber})</span>
          </span>
        </div>
      </div>

      {/* 지각 안내 */}
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5">
        <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700">
          강의 시작({sessionInfo.startTime}) 5분 이후 체크인 시 지각 처리됩니다.
        </p>
      </div>

      {/* 오류 메시지 */}
      {state === "error" && errorMessage && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* 출석 확인 버튼 */}
      <button
        onClick={handleCheckIn}
        disabled={state === "loading"}
        className="mt-5 w-full rounded-2xl bg-ember px-6 py-3.5 text-base font-bold text-white transition hover:bg-ember/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            처리 중...
          </span>
        ) : (
          "출석 확인"
        )}
      </button>
    </div>
  );
}
