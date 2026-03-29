"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ExamEventType = "MONTHLY" | "SPECIAL" | "EXTERNAL";

const EVENT_TYPE_LABEL: Record<ExamEventType, string> = {
  MONTHLY: "월말평가",
  SPECIAL: "특강모의고사",
  EXTERNAL: "외부모의고사",
};

const EVENT_TYPE_API_PATH: Record<ExamEventType, string> = {
  MONTHLY: "/api/exams/monthly",
  SPECIAL: "/api/exams/special",
  EXTERNAL: "/api/exams/external",
};

const EVENT_TYPE_REDIRECT: Record<ExamEventType, string> = {
  MONTHLY: "/admin/exams/monthly",
  SPECIAL: "/admin/exams/special",
  EXTERNAL: "/admin/exams/external",
};

const EVENT_TYPES: ExamEventType[] = ["MONTHLY", "SPECIAL", "EXTERNAL"];

export function ExamCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<ExamEventType>("MONTHLY");
  const [examDate, setExamDate] = useState("");
  const [venue, setVenue] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [registrationFee, setRegistrationFee] = useState("3000");

  // EXTERNAL type doesn't use registrationFee / registrationDeadline
  const isExternal = eventType === "EXTERNAL";

  function validate(): string | null {
    if (!title.trim()) return "시험명을 입력하세요.";
    if (!examDate) return "시험일을 입력하세요.";
    if (registrationDeadline && registrationDeadline > examDate) {
      return "접수 마감일은 시험일 이전이어야 합니다.";
    }
    if (!isExternal && registrationFee !== "" && Number(registrationFee) < 0) {
      return "참가비는 0원 이상이어야 합니다.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);

    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          title: title.trim(),
          examDate,
          venue: venue.trim() || null,
        };

        if (!isExternal) {
          body.registrationFee = registrationFee !== "" ? Number(registrationFee) : 0;
          body.registrationDeadline = registrationDeadline || null;
        }

        const res = await fetch(EVENT_TYPE_API_PATH[eventType], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const payload = await res.json() as { event?: { id: string }; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "생성 실패");

        router.push(EVENT_TYPE_REDIRECT[eventType]);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "생성 실패");
      }
    });
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-ember focus:bg-white focus:outline-none focus:ring-1 focus:ring-ember/30";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        {/* Form header */}
        <div className="border-b border-ink/5 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">시험 정보 입력</h2>
          <p className="mt-0.5 text-xs text-slate">
            <span className="text-red-500">*</span> 표시 항목은 필수입니다.
          </p>
        </div>

        {/* Form body */}
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          {/* 시험유형 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="exam-eventType">
              시험 유형 <span className="text-red-500">*</span>
            </label>
            <select
              id="exam-eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as ExamEventType)}
              className={inputClass}
              disabled={isPending}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {/* 시험명 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="exam-title">
              시험명 <span className="text-red-500">*</span>
            </label>
            <input
              id="exam-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                eventType === "MONTHLY"
                  ? "예: 2026년 3월 월말평가"
                  : eventType === "SPECIAL"
                    ? "예: 특강 3월 모의고사"
                    : "예: 경찰청 외부 모의고사"
              }
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 시험일 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="exam-examDate">
              시험일 <span className="text-red-500">*</span>
            </label>
            <input
              id="exam-examDate"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className={inputClass}
              disabled={isPending}
              required
            />
          </div>

          {/* 장소 */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="exam-venue">
              장소
            </label>
            <input
              id="exam-venue"
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="예: academy-ops 1강의실"
              className={inputClass}
              disabled={isPending}
            />
          </div>

          {/* 참가비 — MONTHLY / SPECIAL only */}
          {!isExternal && (
            <div>
              <label
                className="block text-xs font-medium text-slate"
                htmlFor="exam-registrationFee"
              >
                참가비{" "}
                <span className="text-xs font-normal text-slate/60">(원, 무료면 0)</span>
              </label>
              <input
                id="exam-registrationFee"
                type="number"
                value={registrationFee}
                onChange={(e) => setRegistrationFee(e.target.value)}
                min={0}
                step={500}
                className={inputClass}
                disabled={isPending}
              />
            </div>
          )}

          {/* 접수 마감일 — MONTHLY / SPECIAL only */}
          {!isExternal && (
            <div>
              <label
                className="block text-xs font-medium text-slate"
                htmlFor="exam-registrationDeadline"
              >
                접수 마감일
              </label>
              <input
                id="exam-registrationDeadline"
                type="date"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                className={inputClass}
                disabled={isPending}
              />
            </div>
          )}
        </div>

        {/* Type badge preview */}
        <div className="mx-6 mb-4 flex items-center gap-2 rounded-xl bg-mist/60 px-4 py-3 text-xs text-slate">
          <span className="font-medium text-ink">등록 위치:</span>
          <span>
            {EVENT_TYPE_LABEL[eventType]} 목록 (
            <span className="font-mono text-ember">{EVENT_TYPE_REDIRECT[eventType]}</span>)
          </span>
        </div>

        {/* Error */}
        {formError && (
          <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {formError}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-ink/5 px-6 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "등록 중..." : "시험 등록"}
          </button>
        </div>
      </div>
    </form>
  );
}
