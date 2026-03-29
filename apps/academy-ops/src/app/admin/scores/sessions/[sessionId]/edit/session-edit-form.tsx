"use client";

import { ExamType, Subject } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

export type SessionEditData = {
  id: number;
  examType: ExamType;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: string;
  isCancelled: boolean;
  cancelReason: string | null;
};

type SubjectOption = {
  value: Subject;
  label: string;
  shortLabel?: string;
  maxScore?: number;
};

type Props = {
  session: SessionEditData;
  subjectOptions: SubjectOption[];
};

function Spinner() {
  return (
    <svg className="mr-1.5 inline-block h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((payload.error as string | undefined) ?? "요청 처리에 실패했습니다.");
  }
  return payload;
}

function toDateInputValue(isoString: string) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SessionEditForm({ session, subjectOptions }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(session.isCancelled);

  function handleSubmit() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);

    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const subject = String(formData.get("subject") ?? "");
        const displaySubjectName = String(formData.get("displaySubjectName") ?? "").trim() || null;
        const examDate = String(formData.get("examDate") ?? "");
        const cancelReason = String(formData.get("cancelReason") ?? "").trim() || null;

        await requestJson(`/api/sessions/${session.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            subject,
            displaySubjectName,
            examDate,
            isCancelled,
            cancelReason: isCancelled ? cancelReason : null,
          }),
        });

        setNotice("회차 정보가 수정되었습니다.");
        router.refresh();
        router.push(`/admin/scores/sessions/${session.id}`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "수정에 실패했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <form ref={formRef} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">시험 날짜</label>
              <input
                type="date"
                name="examDate"
                defaultValue={toDateInputValue(session.examDate)}
                required
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">과목</label>
              <select
                name="subject"
                defaultValue={session.subject}
                required
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              >
                {subjectOptions.map((subject) => (
                  <option key={subject.value} value={subject.value}>
                    {subject.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              과목 표시명
              <span className="ml-1 font-normal text-slate">(비우면 현재 지점 기본 과목명을 사용합니다)</span>
            </label>
            <input
              type="text"
              name="displaySubjectName"
              defaultValue={session.displaySubjectName ?? ""}
              placeholder="예: 형법 심화"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">회차 상태</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCancelled(false)}
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
                  !isCancelled
                    ? "border-forest bg-forest text-white"
                    : "border-ink/10 bg-white text-ink hover:border-forest/30 hover:text-forest"
                }`}
              >
                정상
              </button>
              <button
                type="button"
                onClick={() => setIsCancelled(true)}
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
                  isCancelled
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-ink/10 bg-white text-ink hover:border-red-300 hover:text-red-600"
                }`}
              >
                취소됨
              </button>
            </div>
          </div>

          {isCancelled ? (
            <div>
              <label className="mb-2 block text-sm font-medium">취소 사유</label>
              <input
                type="text"
                name="cancelReason"
                defaultValue={session.cancelReason ?? ""}
                placeholder="취소 사유를 입력해 주세요"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {isPending && <Spinner />}
              저장
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
