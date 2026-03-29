"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ActionModal } from "@/components/ui/action-modal";
import { LockerRentalDetailModal } from "@/components/facilities/locker-rental-detail-modal";
import type { RentalRow } from "./page";

type Kpi = {
  totalRentals: number;
  expiringSoon: number;
  unpaidCount: number;
  monthlyRevenue: number;
};

type Props = {
  initialRentals: RentalRow[];
  kpi: Kpi;
};

type FilterTab = "all" | "unpaid" | "expiring" | "ended";

type NewRentalForm = {
  lockerId: string;
  examNumber: string;
  startDate: string;
  endDate: string;
  feeAmount: string;
  note: string;
};

type RenewForm = {
  endDate: string;
};

const EMPTY_NEW_FORM: NewRentalForm = {
  lockerId: "",
  examNumber: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  feeAmount: "",
  note: "",
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
  if (!iso) return "-";
  return iso.replace(/-/g, ".");
}

function getDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function addOneMonth(dateStr: string): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split("T")[0];
}

export function LockerRentalBillingClient({ initialRentals, kpi }: Props) {
  const [rentals, setRentals] = useState<RentalRow[]>(initialRentals);
  const [tab, setTab] = useState<FilterTab>("all");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedRental, setSelectedRental] = useState<RentalRow | null>(null);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState<NewRentalForm>(EMPTY_NEW_FORM);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewForm, setRenewForm] = useState<RenewForm>({ endDate: "" });
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const filteredRentals = rentals.filter((r) => {
    if (tab === "unpaid") return r.status === "ACTIVE" && !r.paidAt;
    if (tab === "expiring") {
      if (!r.endDate || r.status !== "ACTIVE") return false;
      const days = getDaysRemaining(r.endDate);
      return days !== null && days >= 0 && days <= 7;
    }
    if (tab === "ended") return r.status === "EXPIRED" || r.status === "RETURNED";
    return true;
  });

  const tabCounts = {
    all: rentals.length,
    unpaid: rentals.filter((r) => r.status === "ACTIVE" && !r.paidAt).length,
    expiring: rentals.filter((r) => {
      if (!r.endDate || r.status !== "ACTIVE") return false;
      const days = getDaysRemaining(r.endDate);
      return days !== null && days >= 0 && days <= 7;
    }).length,
    ended: rentals.filter((r) => r.status === "EXPIRED" || r.status === "RETURNED").length,
  };

  function openPay(id: string) {
    setPayingId(id);
    setError(null);
    setIsPayModalOpen(true);
  }

  function openRenew(rental: RentalRow) {
    setRenewingId(rental.id);
    setRenewForm({ endDate: rental.endDate ? addOneMonth(rental.endDate) : addOneMonth(new Date().toISOString().split("T")[0]) });
    setError(null);
    setIsRenewModalOpen(true);
  }

  function openNew() {
    setNewForm(EMPTY_NEW_FORM);
    setError(null);
    setIsNewModalOpen(true);
  }

  function handlePay() {
    if (!payingId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/lockers/rentals/${payingId}/pay`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "납부 처리 실패");
        return;
      }
      setRentals((prev) =>
        prev.map((r) =>
          r.id === payingId
            ? { ...r, paidAt: data.rental?.paidAt ?? new Date().toISOString() }
            : r,
        ),
      );
      setIsPayModalOpen(false);
      setPayingId(null);
    });
  }

  function handleRenew() {
    if (!renewingId || !renewForm.endDate) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/lockers/rentals/${renewingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: renewForm.endDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "연장 처리 실패");
        return;
      }
      setRentals((prev) =>
        prev.map((r) =>
          r.id === renewingId
            ? { ...r, endDate: data.rental?.endDate ? new Date(data.rental.endDate).toISOString().split("T")[0] : renewForm.endDate, status: "ACTIVE" }
            : r,
        ),
      );
      setIsRenewModalOpen(false);
      setRenewingId(null);
    });
  }

  function handleMarkPaid(rentalId: string) {
    setRentals((prev) =>
      prev.map((r) =>
        r.id === rentalId ? { ...r, paidAt: new Date().toISOString() } : r,
      ),
    );
  }

  function handleCancelRental(rentalId: string) {
    setRentals((prev) =>
      prev.map((r) =>
        r.id === rentalId ? { ...r, status: "CANCELLED" } : r,
      ),
    );
  }

  function handleCreate() {
    setError(null);
    if (!newForm.lockerId.trim()) {
      setError("사물함 ID를 입력하세요.");
      return;
    }
    if (!newForm.examNumber.trim()) {
      setError("학번을 입력하세요.");
      return;
    }
    if (!newForm.startDate) {
      setError("시작일을 입력하세요.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/lockers/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lockerId: newForm.lockerId.trim(),
          examNumber: newForm.examNumber.trim(),
          startDate: newForm.startDate,
          endDate: newForm.endDate || null,
          feeAmount: newForm.feeAmount ? Number(newForm.feeAmount) : 0,
          note: newForm.note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록 실패");
        return;
      }
      const r = data.rental;
      const newRow: RentalRow = {
        id: r.id,
        lockerId: r.lockerId,
        lockerNumber: r.locker?.lockerNumber ?? newForm.lockerId,
        zone: r.locker?.zone ?? "",
        examNumber: r.examNumber,
        studentName: r.student?.name ?? newForm.examNumber,
        startDate: new Date(r.startDate).toISOString().split("T")[0],
        endDate: r.endDate ? new Date(r.endDate).toISOString().split("T")[0] : null,
        feeAmount: r.feeAmount,
        feeUnit: r.feeUnit,
        status: r.status,
        paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
        note: r.note,
      };
      setRentals((prev) => [newRow, ...prev]);
      setIsNewModalOpen(false);
    });
  }

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">총 임대</p>
          <p className="mt-3 text-3xl font-bold text-ink">{kpi.totalRentals.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">만료 임박</p>
          <p className="mt-3 text-3xl font-bold text-amber-700">{kpi.expiringSoon.toLocaleString()}</p>
          <p className="mt-1 text-xs text-amber-600">7일 이내</p>
        </div>
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-700">미납</p>
          <p className="mt-3 text-3xl font-bold text-red-700">{kpi.unpaidCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-red-600">건</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">이번 달 수입</p>
          <p className="mt-3 text-3xl font-bold text-forest">{kpi.monthlyRevenue.toLocaleString()}</p>
          <p className="mt-1 text-xs text-forest/70">원</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex gap-1 rounded-2xl border border-ink/10 bg-mist p-1">
          {(
            [
              { key: "all", label: "전체" },
              { key: "unpaid", label: "미납" },
              { key: "expiring", label: "만료 임박" },
              { key: "ended", label: "종료" },
            ] as { key: FilterTab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                tab === t.key
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate hover:text-ink",
              ].join(" ")}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-60">({tabCounts[t.key]})</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          + 신규 대여 등록
        </button>
      </div>

      {/* Table */}
      {filteredRentals.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          해당하는 대여 내역이 없습니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">학생명</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">학번</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">사물함 번호</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">구역</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">시작일</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">만료일</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">임대료</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">납부 상태</th>
                  <th className="px-5 py-3.5 font-semibold text-right whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {filteredRentals.map((rental) => {
                  const daysLeft = getDaysRemaining(rental.endDate);
                  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                  const isExpired = daysLeft !== null && daysLeft < 0;

                  return (
                    <tr
                      key={rental.id}
                      className="cursor-pointer hover:bg-mist/50 transition-colors"
                      onClick={() => setSelectedRental(rental)}
                    >
                      <td className="px-5 py-3.5 font-medium">
                        <Link
                          href={`/admin/students/${rental.examNumber}`}
                          className="text-forest hover:underline underline-offset-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {rental.studentName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-slate font-mono text-xs">{rental.examNumber}</td>
                      <td className="px-5 py-3.5 font-semibold">{rental.lockerNumber}</td>
                      <td className="px-5 py-3.5 text-slate">{ZONE_LABELS[rental.zone] ?? rental.zone}</td>
                      <td className="px-5 py-3.5 text-slate">{formatDate(rental.startDate)}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={[
                            "font-medium",
                            isExpired ? "text-red-600" : isExpiringSoon ? "text-amber-600" : "text-ink",
                          ].join(" ")}
                        >
                          {formatDate(rental.endDate)}
                          {daysLeft !== null && rental.status === "ACTIVE" && (
                            <span className="ml-1.5 text-xs opacity-70">
                              {isExpired ? `(${Math.abs(daysLeft)}일 초과)` : daysLeft === 0 ? "(오늘 만료)" : `(D-${daysLeft})`}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium">{rental.feeAmount.toLocaleString()}원</span>
                        <span className="ml-1 text-xs text-slate">/{FEE_UNIT_LABELS[rental.feeUnit] ?? rental.feeUnit}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {rental.paidAt ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            납부 완료
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            미납
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {rental.status === "ACTIVE" && (
                          <>
                            {!rental.paidAt && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openPay(rental.id); }}
                                className="mr-3 text-xs font-semibold text-forest transition hover:text-ink"
                              >
                                납부 처리
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openRenew(rental); }}
                              className="text-xs font-semibold text-slate transition hover:text-ink"
                            >
                              연장
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 납부 처리 모달 */}
      <ActionModal
        open={isPayModalOpen}
        badgeLabel="임대료 관리"
        badgeTone="success"
        title="납부 처리"
        description="이 사물함 임대료를 납부 완료로 처리하시겠습니까?"
        confirmLabel="납부 완료 처리"
        cancelLabel="취소"
        onClose={() => {
          setIsPayModalOpen(false);
          setPayingId(null);
          setError(null);
        }}
        onConfirm={handlePay}
        isPending={isPending}
      >
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </ActionModal>

      {/* 연장 모달 */}
      <ActionModal
        open={isRenewModalOpen}
        badgeLabel="임대료 관리"
        title="대여 기간 연장"
        description="새 만료일을 설정합니다. 기본값은 현재 만료일 기준 1개월 연장입니다."
        confirmLabel="연장"
        cancelLabel="취소"
        onClose={() => {
          setIsRenewModalOpen(false);
          setRenewingId(null);
          setError(null);
        }}
        onConfirm={handleRenew}
        isPending={isPending}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">새 만료일 *</label>
            <input
              type="date"
              value={renewForm.endDate}
              onChange={(e) => setRenewForm({ endDate: e.target.value })}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
        </div>
      </ActionModal>

      {/* 상세 모달 */}
      <LockerRentalDetailModal
        rental={selectedRental}
        onClose={() => setSelectedRental(null)}
        onMarkPaid={handleMarkPaid}
        onCancel={handleCancelRental}
      />

      {/* 신규 대여 등록 모달 */}
      <ActionModal
        open={isNewModalOpen}
        badgeLabel="임대료 관리"
        title="신규 대여 등록"
        description="새 사물함 대여를 등록합니다."
        confirmLabel="등록"
        cancelLabel="취소"
        onClose={() => {
          setIsNewModalOpen(false);
          setError(null);
        }}
        onConfirm={handleCreate}
        isPending={isPending}
        panelClassName="max-w-lg"
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">사물함 ID *</label>
            <input
              type="text"
              value={newForm.lockerId}
              onChange={(e) => setNewForm((f) => ({ ...f, lockerId: e.target.value }))}
              placeholder="사물함 고유 ID"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">학번 *</label>
            <input
              type="text"
              value={newForm.examNumber}
              onChange={(e) => setNewForm((f) => ({ ...f, examNumber: e.target.value }))}
              placeholder="학생 학번"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5">시작일 *</label>
              <input
                type="date"
                value={newForm.startDate}
                onChange={(e) => setNewForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5">만료일</label>
              <input
                type="date"
                value={newForm.endDate}
                onChange={(e) => setNewForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">임대료 (원)</label>
            <input
              type="number"
              value={newForm.feeAmount}
              onChange={(e) => setNewForm((f) => ({ ...f, feeAmount: e.target.value }))}
              placeholder="예: 5000"
              min={0}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">메모 (선택)</label>
            <input
              type="text"
              value={newForm.note}
              onChange={(e) => setNewForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="비고 사항"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
        </div>
      </ActionModal>
    </>
  );
}
