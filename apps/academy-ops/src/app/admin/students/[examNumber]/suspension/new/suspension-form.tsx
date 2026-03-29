"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type EnrollmentOption = {
  id: string;
  label: string;
};

type Props = {
  examNumber: string;
  enrollmentOptions: EnrollmentOption[];
  today: string;
};

export function SuspensionForm({ examNumber, enrollmentOptions, today }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enrollmentId, setEnrollmentId] = useState<string>(
    enrollmentOptions[0]?.id ?? "",
  );
  const [leaveDate, setLeaveDate] = useState(today);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!enrollmentId) {
      setError("수강 등록을 선택해주세요.");
      return;
    }
    if (!leaveDate) {
      setError("휴원 시작일을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/students/${examNumber}/suspension`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrollmentId,
            leaveDate,
            expectedReturnDate: expectedReturnDate || undefined,
            reason: reason.trim() || undefined,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "휴원 신청에 실패했습니다.");
          return;
        }
        setSuccess("휴원 신청이 완료되었습니다. 수강 상태가 휴원으로 변경되었습니다.");
        router.push(`/admin/students/${examNumber}/suspension`);
        router.refresh();
      } catch {
        setError("서버 오류가 발생했습니다. 다시 시도해주세요.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 px-4 py-3 text-sm text-[#1F4D3A]">
          {success}
        </div>
      )}

      {/* Enrollment Select */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-[#4B5563]">
          수강 등록 선택 <span className="text-red-500">*</span>
        </label>
        {enrollmentOptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#111827]/10 px-4 py-4 text-sm text-[#4B5563]">
            현재 수강 중(ACTIVE)인 등록이 없습니다. 수강 상태를 확인해주세요.
          </div>
        ) : (
          <select
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            required
            className="w-full rounded-2xl border border-[#111827]/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          >
            <option value="">-- 수강 등록 선택 --</option>
            {enrollmentOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#4B5563]">
            휴원 시작일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={leaveDate}
            onChange={(e) => setLeaveDate(e.target.value)}
            required
            className="w-full rounded-2xl border border-[#111827]/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#4B5563]">
            복귀 예정일{" "}
            <span className="font-normal text-[#4B5563]/60">(선택)</span>
          </label>
          <input
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
            min={leaveDate}
            className="w-full rounded-2xl border border-[#111827]/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-[#4B5563]">
          사유{" "}
          <span className="font-normal text-[#4B5563]/60">(선택)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="예: 개인 사정, 군 입대, 건강 문제, 취업 준비 등"
          className="w-full resize-none rounded-2xl border border-[#111827]/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
        />
      </div>

      {/* Info Banner */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        <p className="font-semibold">처리 안내</p>
        <p className="mt-0.5">
          휴원 신청 시 해당 수강 등록 상태가 <strong>SUSPENDED(휴원)</strong>로 자동 변경됩니다.
          복귀 처리는 수강 관리 페이지에서 진행해주세요.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center rounded-full border border-[#111827]/10 px-5 py-2.5 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending || enrollmentOptions.length === 0}
          className="inline-flex items-center rounded-full bg-[#C55A11] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#C55A11]/90 disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "휴원 신청"}
        </button>
      </div>
    </form>
  );
}
