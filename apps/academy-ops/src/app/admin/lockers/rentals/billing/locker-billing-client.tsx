"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";

export type BillingRentalRow = {
  id: string;
  lockerNumber: string;
  zone: string;
  lockerId: string;
  examNumber: string;
  studentName: string;
  startDate: string;
  endDate: string | null;
  feeAmount: number;
  feeUnit: string;
  status: string;
  paidAt: string | null;
  note: string | null;
};

type Props = {
  initialRentals: BillingRentalRow[];
};

const ZONE_LABELS: Record<string, string> = {
  CLASS_ROOM: "1강의실",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

const FEE_UNIT_LABELS: Record<string, string> = {
  MONTHLY: "월정액",
  PER_COHORT: "기수별",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function isOverdue(endDate: string | null): boolean {
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(endDate) < today;
}

export function LockerBillingClient({ initialRentals }: Props) {
  const [rentals, setRentals] = useState<BillingRentalRow[]>(initialRentals);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorId, setErrorId] = useState<string | null>(null);

  const displayed = useMemo(() => {
    if (!filterOverdue) return rentals;
    return rentals.filter((r) => isOverdue(r.endDate));
  }, [rentals, filterOverdue]);

  // Summary stats
  const totalActive = rentals.length;
  const totalOverdue = rentals.filter((r) => isOverdue(r.endDate)).length;
  const unpaid = rentals.filter((r) => !r.paidAt);
  const totalUnpaidAmount = unpaid.reduce((sum, r) => sum + r.feeAmount, 0);

  async function handleMarkPaid(rentalId: string) {
    setPendingIds((prev) => new Set(prev).add(rentalId));
    setErrorId(null);

    try {
      const res = await fetch(`/api/lockers/rentals/${rentalId}/pay`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        rental?: { paidAt: string };
        error?: string;
      };

      if (!res.ok) {
        setErrorId(rentalId);
        toast.error(data.error ?? "납부 처리에 실패했습니다.");
        return;
      }

      setRentals((prev) =>
        prev.map((r) =>
          r.id === rentalId
            ? { ...r, paidAt: data.rental?.paidAt ?? new Date().toISOString() }
            : r,
        ),
      );
      toast.success("납부 완료 처리되었습니다.");
    } catch {
      setErrorId(rentalId);
      toast.error("납부 처리 중 오류가 발생했습니다.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(rentalId);
        return next;
      });
    }
  }

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-ink">{totalActive}</p>
          <p className="mt-1 text-xs text-slate">전체 활성 대여</p>
        </div>
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl font-bold text-red-700">{totalOverdue}</p>
          <p className="mt-1 text-xs text-slate">연체 (종료일 경과)</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalUnpaidAmount)}</p>
          <p className="mt-1 text-xs text-slate">미납 요금 합계</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFilterOverdue(false)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            !filterOverdue
              ? "bg-ink text-white"
              : "border border-ink/20 bg-white text-ink hover:bg-mist"
          }`}
        >
          전체 ({totalActive})
        </button>
        <button
          type="button"
          onClick={() => setFilterOverdue(true)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            filterOverdue
              ? "bg-red-600 text-white"
              : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          }`}
        >
          연체만 ({totalOverdue})
        </button>
      </div>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 py-14 text-center text-sm text-slate">
          {filterOverdue ? "연체된 대여가 없습니다." : "활성 대여가 없습니다."}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-ink">학생</th>
                <th className="px-5 py-3.5 font-semibold text-ink">학번</th>
                <th className="px-5 py-3.5 font-semibold text-ink">사물함</th>
                <th className="px-5 py-3.5 font-semibold text-ink">구역</th>
                <th className="px-5 py-3.5 font-semibold text-ink">시작일</th>
                <th className="px-5 py-3.5 font-semibold text-ink">종료일</th>
                <th className="px-5 py-3.5 font-semibold text-ink">요금</th>
                <th className="px-5 py-3.5 font-semibold text-ink">단위</th>
                <th className="px-5 py-3.5 font-semibold text-ink">납부</th>
                <th className="px-5 py-3.5 font-semibold text-ink text-right">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 bg-white">
              {displayed.map((rental) => {
                const overdue = isOverdue(rental.endDate);
                const isPaid = !!rental.paidAt;
                const isPending = pendingIds.has(rental.id);
                const hasError = errorId === rental.id;

                return (
                  <tr
                    key={rental.id}
                    className={`transition-colors ${
                      overdue && !isPaid
                        ? "bg-red-50/40 hover:bg-red-50/60"
                        : !isPaid
                        ? "bg-amber-50/40 hover:bg-amber-50/60"
                        : "hover:bg-mist/40"
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/students/${rental.examNumber}`}
                        className="font-medium text-ink hover:text-ember hover:underline"
                      >
                        {rental.studentName}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate">
                      {rental.examNumber}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/lockers/${rental.lockerId}`}
                        className="font-mono font-semibold text-ink hover:text-ember hover:underline"
                      >
                        {rental.lockerNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate text-xs">
                      {ZONE_LABELS[rental.zone] ?? rental.zone}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate">
                      {formatDate(rental.startDate)}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs">
                      {rental.endDate ? (
                        <span className={overdue ? "font-semibold text-red-600" : "text-ink"}>
                          {formatDate(rental.endDate)}
                          {overdue && (
                            <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                              연체
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-ink">
                      {formatCurrency(rental.feeAmount)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate">
                      {FEE_UNIT_LABELS[rental.feeUnit] ?? rental.feeUnit}
                    </td>
                    <td className="px-5 py-3.5">
                      {isPaid ? (
                        <span className="inline-flex rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                          납부 완료
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          미납
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {!isPaid && (
                        <div className="flex items-center justify-end gap-2">
                          {hasError && (
                            <span className="text-xs text-red-600">실패</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(rental.id)}
                            disabled={isPending}
                            className="inline-flex items-center rounded-full bg-ember px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isPending ? "처리 중..." : "납부 완료"}
                          </button>
                        </div>
                      )}
                      {isPaid && rental.paidAt && (
                        <span className="text-xs text-slate">
                          {formatDate(rental.paidAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
