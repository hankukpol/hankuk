"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockerStatus, LockerZone, RentalFeeUnit } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import {
  LOCKER_ZONE_LABEL,
  LOCKER_STATUS_LABEL,
  LOCKER_STATUS_COLOR,
} from "@/lib/constants";
import type { LockerWithRental } from "./page";

interface Props {
  initialLockers: LockerWithRental[];
}

const ZONE_ORDER: LockerZone[] = [
  LockerZone.CLASS_ROOM,
  LockerZone.JIDEOK_LEFT,
  LockerZone.JIDEOK_RIGHT,
];

const STATUS_GRID_COLOR: Record<string, string> = {
  AVAILABLE: "bg-forest/10 border-forest/20 text-forest hover:bg-forest/20",
  IN_USE: "bg-ember/10 border-ember/20 text-ember",
  RESERVED: "bg-amber-100 border-amber-200 text-amber-800",
  BROKEN: "bg-red-100 border-red-200 text-red-600",
  BLOCKED: "bg-ink/10 border-ink/20 text-slate",
};

export function LockerBoard({ initialLockers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<LockerWithRental | null>(null);
  const [activeZone, setActiveZone] = useState<LockerZone>(LockerZone.CLASS_ROOM);
  const [rentOpen, setRentOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rent form
  const [examNumber, setExamNumber] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [feeUnit, setFeeUnit] = useState<RentalFeeUnit>(RentalFeeUnit.MONTHLY);
  const [feeAmount, setFeeAmount] = useState("");
  const [rentNote, setRentNote] = useState("");
  const [newStatus, setNewStatus] = useState<LockerStatus>(LockerStatus.AVAILABLE);

  const zoneLockers = initialLockers.filter((l) => l.zone === activeZone);

  // Build grid
  const maxRow = Math.max(...zoneLockers.map((l) => l.row ?? 0), 0);
  const maxCol = Math.max(...zoneLockers.map((l) => l.col ?? 0), 0);
  const grid: (LockerWithRental | null)[][] = Array.from({ length: maxRow }, () =>
    Array.from({ length: maxCol }, () => null),
  );
  for (const l of zoneLockers) {
    if (l.row && l.col) grid[l.row - 1][l.col - 1] = l;
  }

  const stats = {
    available: initialLockers.filter((l) => l.status === "AVAILABLE").length,
    inUse: initialLockers.filter((l) => l.status === "IN_USE").length,
    broken: initialLockers.filter(
      (l) => l.status === "BROKEN" || l.status === "BLOCKED",
    ).length,
  };

  function openLocker(locker: LockerWithRental) {
    setSelected(locker);
    setError(null);
  }

  function openRent() {
    setExamNumber("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setFeeUnit(RentalFeeUnit.MONTHLY);
    setFeeAmount("");
    setRentNote("");
    setError(null);
    setRentOpen(true);
  }

  function handleRent() {
    if (!examNumber.trim()) { setError("학생 수험번호를 입력하세요."); return; }
    if (!startDate) { setError("시작일을 입력하세요."); return; }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lockers/${selected!.id}/rent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumber, startDate, endDate: endDate || null, feeUnit, feeAmount: feeAmount ? Number(feeAmount) : 0, note: rentNote }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "대여 실패");
        setRentOpen(false);
        setSelected(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "대여 실패"); }
    });
  }

  function handleReturn() {
    if (!selected) return;
    const rentalId = selected.rentals[0]?.id;
    if (!rentalId) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/locker-rentals/${rentalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "RETURNED", endDate: new Date().toISOString().slice(0, 10) }),
        });
        if (!res.ok) throw new Error("반납 실패");
        setReturnOpen(false);
        setSelected(null);
        router.refresh();
      } catch { setError("반납 실패"); }
    });
  }

  function handleStatusChange() {
    if (!selected) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lockers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, status: newStatus }),
        });
        if (!res.ok) throw new Error("상태 변경 실패");
        setStatusOpen(false);
        setSelected(null);
        router.refresh();
      } catch { setError("상태 변경 실패"); }
    });
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-4 text-center">
          <p className="text-2xl font-bold text-forest">{stats.available}</p>
          <p className="text-xs text-slate mt-1">사용 가능</p>
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-4 text-center">
          <p className="text-2xl font-bold text-ember">{stats.inUse}</p>
          <p className="text-xs text-slate mt-1">사용 중</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 p-4 text-center">
          <p className="text-2xl font-bold text-slate">{stats.broken}</p>
          <p className="text-xs text-slate mt-1">사용 불가</p>
        </div>
      </div>

      {/* Zone tabs */}
      <div className="flex gap-2 mb-6">
        {ZONE_ORDER.map((zone) => (
          <button
            key={zone}
            onClick={() => setActiveZone(zone)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeZone === zone
                ? "bg-ink text-white"
                : "border border-ink/20 text-slate hover:border-ink/40"
            }`}
          >
            {LOCKER_ZONE_LABEL[zone]}
            <span className="ml-1.5 text-xs opacity-70">
              ({initialLockers.filter((l) => l.zone === zone).length})
            </span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {Object.entries(LOCKER_STATUS_LABEL).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${STATUS_GRID_COLOR[status] ?? "bg-ink/10"}`} />
            <span className="text-slate">{label}</span>
          </div>
        ))}
      </div>

      {/* Locker grid */}
      <div className="rounded-[20px] border border-ink/10 bg-white p-6 overflow-x-auto">
        <div
          style={{ gridTemplateColumns: `repeat(${maxCol}, minmax(3rem, 3.5rem))` }}
          className="grid gap-1.5 w-fit mx-auto"
        >
          {grid.map((row, ri) =>
            row.map((locker, ci) =>
              locker ? (
                <button
                  key={locker.id}
                  onClick={() => openLocker(locker)}
                  className={`h-12 w-full rounded-[8px] border text-xs font-medium transition-all ${
                    STATUS_GRID_COLOR[locker.status] ?? "bg-mist border-ink/10 text-slate"
                  } ${selected?.id === locker.id ? "ring-2 ring-ink ring-offset-1" : ""}`}
                  title={locker.rentals[0] ? `${locker.rentals[0].student.name}` : locker.lockerNumber}
                >
                  {locker.lockerNumber}
                </button>
              ) : (
                <div key={`empty-${ri}-${ci}`} className="h-12 w-full" />
              ),
            ),
          )}
        </div>
      </div>

      {/* Locker detail panel */}
      {selected && (
        <div className="mt-6 rounded-[20px] border border-ink/10 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                {LOCKER_ZONE_LABEL[selected.zone as LockerZone]} · {selected.lockerNumber}번
              </h3>
              <span
                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                  LOCKER_STATUS_COLOR[selected.status as LockerStatus]
                }`}
              >
                {LOCKER_STATUS_LABEL[selected.status as LockerStatus]}
              </span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-slate hover:text-ink text-xl"
            >
              ×
            </button>
          </div>

          {selected.rentals[0] && (
            <div className="mt-4 rounded-[12px] border border-ink/10 bg-mist/40 p-4 text-sm">
              <p className="font-medium">
                {selected.rentals[0].student.name}
                {selected.rentals[0].student.generation && (
                  <span className="ml-1 text-xs text-slate">
                    {selected.rentals[0].student.generation}기
                  </span>
                )}
              </p>
              <p className="text-slate mt-1">
                {new Date(selected.rentals[0].startDate).toLocaleDateString("ko-KR")}
                {selected.rentals[0].endDate &&
                  ` ~ ${new Date(selected.rentals[0].endDate).toLocaleDateString("ko-KR")}`}
              </p>
              {selected.rentals[0].feeAmount > 0 && (
                <p className="text-slate">
                  {selected.rentals[0].feeAmount.toLocaleString()}원 /{" "}
                  {selected.rentals[0].feeUnit === "MONTHLY" ? "월" : "기수"}
                </p>
              )}
            </div>
          )}

          {selected.note && (
            <p className="mt-3 text-sm text-slate">{selected.note}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {selected.status === "AVAILABLE" && (
              <button
                onClick={openRent}
                className="rounded-[20px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
              >
                대여 처리
              </button>
            )}
            {selected.status === "IN_USE" && selected.rentals[0] && (
              <button
                onClick={() => setReturnOpen(true)}
                className="rounded-[20px] border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest hover:bg-forest/20"
              >
                반납 처리
              </button>
            )}
            <button
              onClick={() => { setNewStatus(selected.status as LockerStatus); setStatusOpen(true); }}
              className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate hover:border-ink/40"
            >
              상태 변경
            </button>
          </div>
        </div>
      )}

      {/* Rent Modal */}
      <ActionModal
        open={rentOpen}
        badgeLabel="사물함 대여"
        title={`${selected?.lockerNumber}번 사물함 대여`}
        description="학생에게 사물함을 배정합니다."
        confirmLabel="대여 처리"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setRentOpen(false)}
        onConfirm={handleRent}
        panelClassName="max-w-md"
      >
        <div className="space-y-3 pt-2">
          {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">학생 수험번호 *</label>
            <input
              type="text"
              value={examNumber}
              onChange={(e) => setExamNumber(e.target.value)}
              placeholder="예: 202600001"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">시작일 *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">종료일 (선택)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">요금 단위</label>
              <select
                value={feeUnit}
                onChange={(e) => setFeeUnit(e.target.value as RentalFeeUnit)}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              >
                <option value="MONTHLY">월정액</option>
                <option value="PER_COHORT">기수별</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">요금 (원)</label>
              <input
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">메모 (선택)</label>
            <input
              type="text"
              value={rentNote}
              onChange={(e) => setRentNote(e.target.value)}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
        </div>
      </ActionModal>

      {/* Return Modal */}
      <ActionModal
        open={returnOpen}
        badgeLabel="사물함 반납"
        title={`${selected?.lockerNumber}번 반납 처리`}
        description={`${selected?.rentals[0]?.student?.name ?? "학생"}의 사물함을 반납 처리합니다.`}
        confirmLabel="반납 처리"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setReturnOpen(false)}
        onConfirm={handleReturn}
      />

      {/* Status change Modal */}
      <ActionModal
        open={statusOpen}
        badgeLabel="상태 변경"
        title={`${selected?.lockerNumber}번 상태 변경`}
        description="사물함 상태를 변경합니다."
        confirmLabel="변경"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setStatusOpen(false)}
        onConfirm={handleStatusChange}
        panelClassName="max-w-sm"
      >
        <div className="grid grid-cols-2 gap-2 pt-2">
          {Object.entries(LOCKER_STATUS_LABEL).map(([status, label]) => (
            <button
              key={status}
              onClick={() => setNewStatus(status as LockerStatus)}
              className={`rounded-[12px] border py-3 text-sm font-medium transition-colors ${
                newStatus === status
                  ? "border-forest bg-forest/10 text-forest"
                  : "border-ink/15 text-slate hover:border-forest/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </ActionModal>
    </div>
  );
}
