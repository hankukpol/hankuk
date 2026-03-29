"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { LockerStatus, RentalStatus, RentalFeeUnit } from "@prisma/client";

type Props = {
  locker: {
    id: string;
    zone: string;
    lockerNumber: string;
    status: LockerStatus;
    note: string | null;
    row: number | null;
    col: number | null;
  };
  activeRental: {
    id: string;
    examNumber: string;
    studentName: string;
    phone: string | null;
    startDate: string;
    endDate: string | null;
    feeAmount: number;
    feeUnit: RentalFeeUnit;
    status: RentalStatus;
  } | null;
  rentalHistory: Array<{
    id: string;
    examNumber: string;
    studentName: string;
    startDate: string;
    endDate: string | null;
    feeAmount: number;
    feeUnit: RentalFeeUnit;
    status: RentalStatus;
    creatorName: string;
  }>;
};

const STATUS_OPTIONS: { value: LockerStatus; label: string }[] = [
  { value: "AVAILABLE", label: "사용 가능" },
  { value: "IN_USE", label: "사용 중" },
  { value: "RESERVED", label: "예약됨" },
  { value: "BROKEN", label: "고장" },
  { value: "BLOCKED", label: "사용 불가" },
];

const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  ACTIVE: "사용 중",
  RETURNED: "반납 완료",
  EXPIRED: "만료",
  CANCELLED: "취소",
};

const RENTAL_STATUS_CLASS: Record<RentalStatus, string> = {
  ACTIVE: "bg-amber-100 text-amber-700",
  RETURNED: "bg-green-100 text-green-700",
  EXPIRED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFee(amount: number, unit: RentalFeeUnit): string {
  if (amount === 0) return "무료";
  const unitLabel = unit === "MONTHLY" ? "/월" : "/기수";
  return `${amount.toLocaleString()}원${unitLabel}`;
}

export function LockerDetailClient({
  locker,
  activeRental,
  rentalHistory,
}: Props) {
  const [status, setStatus] = useState<LockerStatus>(locker.status);
  const [note, setNote] = useState(locker.note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lockers/${locker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? "저장 실패");
      } else {
        toast.success("저장되었습니다.");
      }
    } catch {
      toast.error("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Status editor */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">상태 관리</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">
              상태
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LockerStatus)}
              className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">
              메모
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="비고 (선택)"
              className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#C55A11] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#A34A0F] disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* Active rental */}
      {activeRental ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold text-amber-800">현재 사용자</h2>
          <div className="mt-3 grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate">학생</dt>
              <dd className="mt-1">
                <Link
                  href={`/admin/students/${activeRental.examNumber}`}
                  className="font-medium text-ink hover:text-ember"
                >
                  {activeRental.studentName}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate">학번</dt>
              <dd className="mt-1 font-mono text-xs">
                {activeRental.examNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate">사용 시작</dt>
              <dd className="mt-1">{formatDate(activeRental.startDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate">요금</dt>
              <dd className="mt-1 font-medium">
                {formatFee(activeRental.feeAmount, activeRental.feeUnit)}
              </dd>
            </div>
            {activeRental.endDate && (
              <div>
                <dt className="text-xs text-slate">종료일</dt>
                <dd className="mt-1">{formatDate(activeRental.endDate)}</dd>
              </div>
            )}
            {activeRental.phone && (
              <div>
                <dt className="text-xs text-slate">연락처</dt>
                <dd className="mt-1 font-mono text-xs">{activeRental.phone}</dd>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] border border-ink/10 bg-white p-6 text-center text-sm text-slate shadow-panel">
          현재 사용 중인 학생이 없습니다.
        </div>
      )}

      {/* Rental history */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">사용 이력</h2>
        {rentalHistory.length === 0 ? (
          <p className="mt-4 text-sm text-slate">이력이 없습니다.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                  <th className="pb-2 pr-4">학생</th>
                  <th className="pb-2 pr-4">시작일</th>
                  <th className="pb-2 pr-4">종료일</th>
                  <th className="pb-2 pr-4">요금</th>
                  <th className="pb-2 pr-4">상태</th>
                  <th className="pb-2">담당</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rentalHistory.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/students/${r.examNumber}`}
                        className="font-medium text-ink hover:text-ember"
                      >
                        {r.studentName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatDate(r.startDate)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {formatDate(r.endDate)}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {formatFee(r.feeAmount, r.feeUnit)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          RENTAL_STATUS_CLASS[r.status] ??
                          "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {RENTAL_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-slate">
                      {r.creatorName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
