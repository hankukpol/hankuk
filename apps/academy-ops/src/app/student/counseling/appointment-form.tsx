"use client";

import { useState } from "react";

const TIME_SLOTS = [
  { value: "09-10", label: "오전 9시 ~ 10시" },
  { value: "10-11", label: "오전 10시 ~ 11시" },
  { value: "11-12", label: "오전 11시 ~ 12시" },
  { value: "13-14", label: "오후 1시 ~ 2시" },
  { value: "14-15", label: "오후 2시 ~ 3시" },
  { value: "15-16", label: "오후 3시 ~ 4시" },
] as const;

function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const wd = weekDays[date.getDay()] ?? "";
  return `${y}년 ${m}월 ${d}일 (${wd})`;
}

// Minimum selectable date (today)
function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type FormState = "idle" | "submitting" | "success" | "error";

interface AppointmentFormProps {
  onSuccess?: () => void;
  contactPhone: string | null;
}

export function AppointmentForm({ onSuccess, contactPhone }: AppointmentFormProps) {
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState("");
  const [note, setNote] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const todayStr = getTodayStr();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formState === "submitting") return;

    // Client-side validation
    if (!preferredDate) {
      setErrorMsg("선호 날짜를 선택해 주세요.");
      return;
    }
    if (!preferredTimeSlot) {
      setErrorMsg("선호 시간대를 선택해 주세요.");
      return;
    }
    if (note.trim().length < 5) {
      setErrorMsg("상담 내용을 5자 이상 입력해 주세요.");
      return;
    }
    if (note.trim().length > 500) {
      setErrorMsg("상담 내용은 500자 이내로 입력해 주세요.");
      return;
    }

    setFormState("submitting");
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/student/counseling/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredDate, preferredTimeSlot, note }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.error ?? "면담 신청 중 오류가 발생했습니다.");
        setFormState("error");
        return;
      }

      const slotLabel = TIME_SLOTS.find((s) => s.value === preferredTimeSlot)?.label ?? preferredTimeSlot;
      setSuccessMsg(
        `면담 신청이 완료되었습니다.\n신청 날짜: ${formatKoreanDate(preferredDate)}\n선호 시간: ${slotLabel}\n학원 담당자가 확인 후 안내 드립니다.`,
      );
      setFormState("success");
      // Reset form
      setPreferredDate("");
      setPreferredTimeSlot("");
      setNote("");
      onSuccess?.();
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setFormState("error");
    }
  }

  if (formState === "success" && successMsg) {
    return (
      <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-forest"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-forest">면담 신청 완료!</p>
            <p className="mt-1.5 whitespace-pre-line text-xs leading-6 text-slate">
              {successMsg}
            </p>
            <p className="mt-2 text-xs text-slate">
              예상 처리 시간: 1~2 영업일 이내
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setFormState("idle");
            setSuccessMsg("");
          }}
          className="mt-4 inline-flex items-center rounded-full border border-forest/20 bg-white px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/5"
        >
          추가 신청하기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Error message */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-xs font-medium text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Preferred date */}
      <div>
        <label
          htmlFor="preferred-date"
          className="mb-1.5 block text-sm font-semibold text-ink"
        >
          선호 날짜
          <span className="ml-1 text-ember">*</span>
        </label>
        <input
          id="preferred-date"
          type="date"
          min={todayStr}
          value={preferredDate}
          onChange={(e) => {
            setPreferredDate(e.target.value);
            setErrorMsg("");
          }}
          required
          className="w-full rounded-[16px] border border-ink/15 bg-white px-4 py-3 text-sm text-ink placeholder-slate/50 outline-none transition focus:border-ember/50 focus:ring-2 focus:ring-ember/20"
        />
        {preferredDate && (
          <p className="mt-1.5 text-xs text-slate">
            선택한 날짜: {formatKoreanDate(preferredDate)}
          </p>
        )}
      </div>

      {/* Preferred time slot */}
      <div>
        <label
          htmlFor="preferred-time"
          className="mb-1.5 block text-sm font-semibold text-ink"
        >
          선호 시간대
          <span className="ml-1 text-ember">*</span>
        </label>
        <select
          id="preferred-time"
          value={preferredTimeSlot}
          onChange={(e) => {
            setPreferredTimeSlot(e.target.value);
            setErrorMsg("");
          }}
          required
          className="w-full rounded-[16px] border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ember/50 focus:ring-2 focus:ring-ember/20"
        >
          <option value="">시간대를 선택해 주세요</option>
          {TIME_SLOTS.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-slate">
          실제 면담 시간은 담당자 일정에 따라 조정될 수 있습니다.
        </p>
      </div>

      {/* Note / content */}
      <div>
        <label
          htmlFor="counsel-note"
          className="mb-1.5 block text-sm font-semibold text-ink"
        >
          상담 내용
          <span className="ml-1 text-ember">*</span>
        </label>
        <textarea
          id="counsel-note"
          rows={5}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setErrorMsg("");
          }}
          placeholder="상담하고 싶은 내용을 자유롭게 작성해 주세요. (예: 성적 향상 방법, 학습 방향, 수강 관련 문의 등)"
          maxLength={500}
          required
          className="w-full resize-none rounded-[16px] border border-ink/15 bg-white px-4 py-3 text-sm text-ink placeholder-slate/40 outline-none transition focus:border-ember/50 focus:ring-2 focus:ring-ember/20"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-xs text-slate">최소 5자 이상 작성해 주세요.</p>
          <p
            className={`text-xs font-medium ${
              note.length > 450 ? "text-amber-600" : "text-slate"
            }`}
          >
            {note.length} / 500
          </p>
        </div>
      </div>

      {/* Notice */}
      <div className="rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3">
        <p className="text-xs font-semibold text-ink">안내 사항</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate">
          <li>• 면담 신청 후 1~2 영업일 이내에 담당자가 확인하여 안내해 드립니다.</li>
          <li>• 동일 날짜에 중복 신청은 불가합니다.</li>
          <li>
            • 면담 취소는 학원 창구
            {contactPhone ? `(${contactPhone})` : ""}로 문의해 주세요.
          </li>
          <li>• 영업 시간: 평일 09~21시, 주말 09~18시</li>
        </ul>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={formState === "submitting"}
        className="w-full rounded-full bg-ember px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {formState === "submitting" ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
              />
            </svg>
            신청 중...
          </span>
        ) : (
          "면담 신청하기"
        )}
      </button>
    </form>
  );
}
