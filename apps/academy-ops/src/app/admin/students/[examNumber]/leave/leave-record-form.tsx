"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EnrollmentOption } from "./page";

type Props = {
  enrollmentOptions: EnrollmentOption[];
  examNumber: string;
  today: string;
};

export function LeaveRecordForm({ enrollmentOptions, examNumber, today }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>(
    enrollmentOptions[0]?.id ?? "",
  );
  const [leaveDate, setLeaveDate] = useState(today);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedEnrollmentId) {
      setError("수강 등록을 선택해주세요.");
      return;
    }
    if (!leaveDate) {
      setError("휴원일을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/enrollments/${selectedEnrollmentId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leaveDate,
            returnDate: expectedReturnDate || undefined,
            reason: reason.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "휴원 처리에 실패했습니다.");
          return;
        }
        setSuccess("휴원 처리가 완료되었습니다.");
        setReason("");
        setExpectedReturnDate("");
        // Refresh the page to show updated leave records
        router.refresh();
      } catch {
        setError("서버 오류가 발생했습니다. 다시 시도해주세요.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-forest">
          {success}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          수강 등록 선택 *
        </label>
        <select
          value={selectedEnrollmentId}
          onChange={(e) => setSelectedEnrollmentId(e.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          required
        >
          <option value="">-- 수강 등록 선택 --</option>
          {enrollmentOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">
            휴원일 *
          </label>
          <input
            type="date"
            value={leaveDate}
            onChange={(e) => setLeaveDate(e.target.value)}
            required
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate">
            복귀 예정일{" "}
            <span className="font-normal text-slate/60">(선택)</span>
          </label>
          <input
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
            min={leaveDate}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">
          사유{" "}
          <span className="font-normal text-slate/60">(선택)</span>
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 개인 사정, 군 입대, 취업 준비 등"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "휴원 처리"}
        </button>
      </div>
    </form>
  );
}
