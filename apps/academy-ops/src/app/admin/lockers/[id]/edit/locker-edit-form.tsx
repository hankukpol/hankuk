"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";

type LockerStatus = "AVAILABLE" | "IN_USE" | "RESERVED" | "BROKEN" | "BLOCKED";

const LOCKER_STATUS_OPTIONS: { value: LockerStatus; label: string }[] = [
  { value: "AVAILABLE", label: "사용 가능" },
  { value: "IN_USE", label: "사용 중" },
  { value: "RESERVED", label: "예약됨" },
  { value: "BROKEN", label: "고장" },
  { value: "BLOCKED", label: "사용 불가" },
];

type ActiveRental = {
  id: string;
  examNumber: string;
  studentName: string;
  phone: string | null;
  startDate: string;
  endDate: string | null;
};

type LockerEditData = {
  id: string;
  lockerNumber: string;
  zone: string;
  zoneName: string;
  status: LockerStatus;
  note: string | null;
};

type Props = {
  locker: LockerEditData;
  activeRental: ActiveRental | null;
};

export function LockerEditForm({ locker, activeRental }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<LockerStatus>(locker.status);
  const [note, setNote] = useState(locker.note ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/lockers/${locker.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            note: note.trim() || null,
          }),
          cache: "no-store",
        });

        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "수정 실패");

        router.push(`/admin/lockers/${locker.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {/* Active rental info (read-only) */}
      {activeRental && (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-amber-800">현재 대여 중인 학생</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-slate">학번</span>
              <span className="ml-2 font-medium text-ink">
                <Link
                  href={`/admin/students/${activeRental.examNumber}`}
                  className="text-[#C55A11] underline-offset-2 hover:underline"
                >
                  {activeRental.examNumber}
                </Link>
              </span>
            </div>
            <div>
              <span className="text-slate">이름</span>
              <span className="ml-2 font-medium text-ink">
                <Link
                  href={`/admin/students/${activeRental.examNumber}`}
                  className="text-[#C55A11] underline-offset-2 hover:underline"
                >
                  {activeRental.studentName}
                </Link>
              </span>
            </div>
            {activeRental.phone && (
              <div>
                <span className="text-slate">연락처</span>
                <span className="ml-2 text-ink">{activeRental.phone}</span>
              </div>
            )}
            <div>
              <span className="text-slate">대여 시작</span>
              <span className="ml-2 text-ink">
                {new Date(activeRental.startDate).toLocaleDateString("ko-KR")}
              </span>
            </div>
            {activeRental.endDate && (
              <div>
                <span className="text-slate">대여 종료</span>
                <span className="ml-2 text-ink">
                  {new Date(activeRental.endDate).toLocaleDateString("ko-KR")}
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-amber-700">
            대여 중인 학생이 있습니다. 상태 변경 시 대여 현황을 확인하세요.
          </p>
        </div>
      )}

      {/* Edit fields */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">사물함 정보 수정</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {/* Locker number (read-only) */}
          <div>
            <label className="block text-xs font-medium text-slate">사물함 번호</label>
            <div className="mt-1.5 w-full rounded-xl border border-ink/10 bg-mist/60 px-3.5 py-2.5 text-sm text-slate">
              {locker.zoneName} — {locker.lockerNumber}번
            </div>
          </div>

          {/* Status */}
          <div>
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="locker-edit-status"
            >
              상태 <span className="text-red-500">*</span>
            </label>
            <select
              id="locker-edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LockerStatus)}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            >
              {LOCKER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div className="sm:col-span-2">
            <label
              className="block text-xs font-medium text-slate"
              htmlFor="locker-edit-note"
            >
              메모
            </label>
            <textarea
              id="locker-edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="사물함 관련 메모 (고장 사유, 특이사항 등)"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/admin/lockers/${locker.id}`}
          className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
