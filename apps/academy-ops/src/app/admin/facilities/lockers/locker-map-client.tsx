"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
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

// Zone ordering: CLASS_ROOM first, then JIDEOK_RIGHT, then JIDEOK_LEFT
const ZONE_ORDER: LockerZone[] = [
  LockerZone.CLASS_ROOM,
  LockerZone.JIDEOK_RIGHT,
  LockerZone.JIDEOK_LEFT,
];

// Zone descriptions for the layout header
const ZONE_RANGE: Record<LockerZone, string> = {
  CLASS_ROOM: "1 ~ 120번",
  JIDEOK_RIGHT: "121 ~ 168번",
  JIDEOK_LEFT: "A-1 ~ A-40번",
};

// Grid columns per zone
const ZONE_COLS: Record<LockerZone, number> = {
  CLASS_ROOM: 12,
  JIDEOK_RIGHT: 12,
  JIDEOK_LEFT: 10,
};

// Status cell styling
const STATUS_CELL_COLOR: Record<string, string> = {
  AVAILABLE:
    "bg-forest/10 border-forest/20 text-forest hover:bg-forest/25 cursor-pointer",
  IN_USE:
    "bg-ember/10 border-ember/20 text-ember hover:bg-ember/25 cursor-pointer",
  RESERVED:
    "bg-amber-100 border-amber-200 text-amber-800 hover:bg-amber-200 cursor-pointer",
  BROKEN:
    "bg-red-100 border-red-200 text-red-600 hover:bg-red-200 cursor-pointer",
  BLOCKED:
    "bg-ink/10 border-ink/20 text-slate hover:bg-ink/15 cursor-pointer",
};

type StudentResult = {
  examNumber: string;
  name: string;
  generation: number | null;
  phone: string | null;
};

function sortLockerNumbers(a: LockerWithRental, b: LockerWithRental): number {
  const toNum = (s: string) => {
    if (s.startsWith("A-")) return parseInt(s.slice(2), 10);
    return parseInt(s, 10);
  };
  return toNum(a.lockerNumber) - toNum(b.lockerNumber);
}

function isExpiredRental(locker: LockerWithRental): boolean {
  if (locker.status !== "IN_USE") return false;
  const rental = locker.rentals[0];
  if (!rental?.endDate) return false;
  return new Date(rental.endDate) < new Date();
}

export function LockerMapClient({ initialLockers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeZone, setActiveZone] = useState<LockerZone>(LockerZone.CLASS_ROOM);
  const [selected, setSelected] = useState<LockerWithRental | null>(null);
  const [rentOpen, setRentOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign form state
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [feeUnit, setFeeUnit] = useState<RentalFeeUnit>(RentalFeeUnit.MONTHLY);
  const [feeAmount, setFeeAmount] = useState("");
  const [rentNote, setRentNote] = useState("");
  const [newStatus, setNewStatus] = useState<LockerStatus>(LockerStatus.AVAILABLE);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced student search
  const handleStudentQueryChange = useCallback((q: string) => {
    setStudentQuery(q);
    setSelectedStudent(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) {
      setStudentResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setStudentSearching(true);
      try {
        const res = await fetch(
          `/api/students?search=${encodeURIComponent(q)}&pageSize=8&activeOnly=true`,
        );
        if (res.ok) {
          const data = await res.json();
          setStudentResults(
            (data.students ?? []).map((s: Record<string, unknown>) => ({
              examNumber: s.examNumber,
              name: s.name,
              generation: s.generation ?? null,
              phone: s.phone ?? s.mobile ?? null,
            })),
          );
        }
      } finally {
        setStudentSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Stats across all zones
  const stats = {
    total: initialLockers.length,
    available: initialLockers.filter((l) => l.status === "AVAILABLE").length,
    inUse: initialLockers.filter((l) => l.status === "IN_USE").length,
    broken: initialLockers.filter(
      (l) => l.status === "BROKEN" || l.status === "BLOCKED",
    ).length,
  };

  // Current zone's lockers sorted
  const zoneLockers = initialLockers
    .filter((l) => l.zone === activeZone)
    .sort(sortLockerNumbers);

  const cols = ZONE_COLS[activeZone];

  // Build grid matrix
  const rows: (LockerWithRental | null)[][] = [];
  let rowBuf: (LockerWithRental | null)[] = [];
  for (let i = 0; i < zoneLockers.length; i++) {
    rowBuf.push(zoneLockers[i]);
    if (rowBuf.length === cols) {
      rows.push(rowBuf);
      rowBuf = [];
    }
  }
  if (rowBuf.length > 0) {
    while (rowBuf.length < cols) rowBuf.push(null);
    rows.push(rowBuf);
  }

  function openRent() {
    setStudentQuery("");
    setStudentResults([]);
    setSelectedStudent(null);
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setFeeUnit(RentalFeeUnit.MONTHLY);
    setFeeAmount("");
    setRentNote("");
    setError(null);
    setRentOpen(true);
  }

  function handleRent() {
    if (!selectedStudent) {
      setError("학생을 선택하세요.");
      return;
    }
    if (!startDate) {
      setError("시작일을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lockers/${selected!.id}/rent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examNumber: selectedStudent.examNumber,
            startDate,
            endDate: endDate || null,
            feeUnit,
            feeAmount: feeAmount ? Number(feeAmount) : 0,
            note: rentNote,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "배정 실패");
        setRentOpen(false);
        setSelected(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "배정 실패");
      }
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
          body: JSON.stringify({
            status: "RETURNED",
            endDate: new Date().toISOString().slice(0, 10),
          }),
        });
        if (!res.ok) throw new Error("반납 실패");
        setReturnOpen(false);
        setSelected(null);
        router.refresh();
      } catch {
        setError("반납 실패");
      }
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
      } catch {
        setError("상태 변경 실패");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
          <p className="mt-1 text-xs text-slate">전체</p>
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-4 text-center">
          <p className="text-2xl font-bold text-ember">{stats.inUse}</p>
          <p className="mt-1 text-xs text-slate">사용 중</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-4 text-center">
          <p className="text-2xl font-bold text-forest">{stats.available}</p>
          <p className="mt-1 text-xs text-slate">공석</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 p-4 text-center">
          <p className="text-2xl font-bold text-slate">{stats.broken}</p>
          <p className="mt-1 text-xs text-slate">사용 불가</p>
        </div>
      </div>

      {/* Zone tabs */}
      <div className="flex flex-wrap gap-2">
        {ZONE_ORDER.map((zone) => {
          const zl = initialLockers.filter((l) => l.zone === zone);
          const zoneInUse = zl.filter((l) => l.status === "IN_USE").length;
          return (
            <button
              key={zone}
              onClick={() => {
                setActiveZone(zone);
                setSelected(null);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeZone === zone
                  ? "bg-ink text-white"
                  : "border border-ink/20 text-slate hover:border-ink/40"
              }`}
            >
              {LOCKER_ZONE_LABEL[zone]}
              <span className="ml-1.5 text-xs opacity-70">
                {zoneInUse}/{zl.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(LOCKER_STATUS_LABEL).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className={`h-3 w-3 rounded border ${STATUS_CELL_COLOR[status] ?? "bg-ink/10 border-ink/20"}`}
            />
            <span className="text-slate">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded border border-orange-300 bg-orange-100" />
          <span className="text-slate">기간 만료</span>
        </div>
      </div>

      {/* Locker map grid */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {LOCKER_ZONE_LABEL[activeZone]}
            <span className="ml-2 text-sm font-normal text-slate">
              ({ZONE_RANGE[activeZone]})
            </span>
          </h2>
          <span className="text-xs text-slate">
            {zoneLockers.filter((l) => l.status === "IN_USE").length} /{" "}
            {zoneLockers.length} 사용 중
          </span>
        </div>

        {zoneLockers.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate">
            이 구역에 사물함이 없습니다.{" "}
            <a
              href="/admin/settings/lockers"
              className="text-forest underline underline-offset-2"
            >
              사물함 초기 설정
            </a>
            에서 먼저 생성해주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid gap-1.5 w-fit"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(3rem, 3.5rem))` }}
            >
              {rows.map((row, ri) =>
                row.map((locker, ci) => {
                  if (!locker) {
                    return (
                      <div
                        key={`empty-${ri}-${ci}`}
                        className="h-12 w-full"
                      />
                    );
                  }
                  const expired = isExpiredRental(locker);
                  const colorClass = expired
                    ? "bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200 cursor-pointer"
                    : (STATUS_CELL_COLOR[locker.status] ??
                      "bg-mist border-ink/10 text-slate cursor-pointer");
                  const rental = locker.rentals[0];

                  return (
                    <button
                      key={locker.id}
                      onClick={() => {
                        setSelected(locker);
                        setError(null);
                      }}
                      className={`relative flex h-12 w-full flex-col items-center justify-center rounded-[8px] border text-[10px] font-medium transition-all ${colorClass} ${
                        selected?.id === locker.id
                          ? "ring-2 ring-ink ring-offset-1"
                          : ""
                      }`}
                      title={
                        rental
                          ? `${rental.student.name} (${rental.student.examNumber})`
                          : locker.lockerNumber
                      }
                    >
                      <span className="leading-none">{locker.lockerNumber}</span>
                      {rental && (
                        <span className="mt-0.5 max-w-[36px] truncate text-[8px] opacity-75 leading-none">
                          {rental.student.name}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail side panel */}
      {selected && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                {LOCKER_ZONE_LABEL[selected.zone as LockerZone]} ·{" "}
                {selected.lockerNumber}번
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                    LOCKER_STATUS_COLOR[selected.status as LockerStatus]
                  }`}
                >
                  {LOCKER_STATUS_LABEL[selected.status as LockerStatus]}
                </span>
                {isExpiredRental(selected) && (
                  <span className="inline-flex rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                    기간 만료
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-xl text-slate hover:text-ink"
            >
              ×
            </button>
          </div>

          {/* Active rental info */}
          {selected.rentals[0] && (
            <div className="mt-4 rounded-[16px] border border-ink/10 bg-mist/40 p-4 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <a
                    href={`/admin/students/${selected.rentals[0].student.examNumber}`}
                    className="font-semibold text-forest hover:underline"
                  >
                    {selected.rentals[0].student.name}
                  </a>
                  {selected.rentals[0].student.generation !== null && (
                    <span className="ml-1.5 text-xs text-slate">
                      {selected.rentals[0].student.generation}기
                    </span>
                  )}
                  <p className="mt-0.5 text-xs text-slate">
                    학번: {selected.rentals[0].student.examNumber}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    selected.rentals[0].status === "ACTIVE"
                      ? "border-forest/30 bg-forest/10 text-forest"
                      : "border-orange-300 bg-orange-100 text-orange-700"
                  }`}
                >
                  {selected.rentals[0].status === "ACTIVE" ? "대여 중" : "만료"}
                </span>
              </div>
              <p className="mt-2 text-slate">
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
            <p className="mt-3 text-sm text-slate">메모: {selected.note}</p>
          )}

          {error && (
            <p className="mt-3 rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {selected.status === "AVAILABLE" && (
              <button
                onClick={openRent}
                className="rounded-[20px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
              >
                배정
              </button>
            )}
            {(selected.status === "IN_USE" || selected.status === "RESERVED") &&
              selected.rentals[0] && (
                <button
                  onClick={() => setReturnOpen(true)}
                  className="rounded-[20px] border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest hover:bg-forest/20"
                >
                  반납
                </button>
              )}
            <button
              onClick={() => {
                setNewStatus(selected.status as LockerStatus);
                setStatusOpen(true);
              }}
              className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate hover:border-ink/40"
            >
              상태 변경
            </button>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      <ActionModal
        open={rentOpen}
        badgeLabel="사물함 배정"
        title={`${selected?.lockerNumber}번 사물함 배정`}
        description="학생에게 사물함을 배정합니다."
        confirmLabel="배정 처리"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setRentOpen(false)}
        onConfirm={handleRent}
        panelClassName="max-w-md"
      >
        <div className="space-y-3 pt-2">
          {error && (
            <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Student search */}
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate">
              학생 검색 (이름 또는 학번) *
            </label>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-[12px] border border-forest/30 bg-forest/5 px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium">{selectedStudent.name}</span>
                  {selectedStudent.generation !== null && (
                    <span className="ml-1.5 text-xs text-slate">
                      {selectedStudent.generation}기
                    </span>
                  )}
                  <span className="ml-2 text-xs text-slate">
                    {selectedStudent.examNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentQuery("");
                    setStudentResults([]);
                  }}
                  className="text-slate hover:text-ink"
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={studentQuery}
                  onChange={(e) => handleStudentQueryChange(e.target.value)}
                  placeholder="이름 또는 학번 입력..."
                  className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
                />
                {studentSearching && (
                  <p className="mt-1 text-xs text-slate">검색 중...</p>
                )}
                {studentResults.length > 0 && (
                  <div className="mt-1 rounded-[12px] border border-ink/10 bg-white shadow-sm">
                    {studentResults.map((s) => (
                      <button
                        key={s.examNumber}
                        type="button"
                        onClick={() => {
                          setSelectedStudent(s);
                          setStudentResults([]);
                          setStudentQuery("");
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-mist first:rounded-t-[12px] last:rounded-b-[12px]"
                      >
                        <span className="font-medium">{s.name}</span>
                        {s.generation !== null && (
                          <span className="text-xs text-slate">{s.generation}기</span>
                        )}
                        <span className="ml-auto text-xs text-slate">{s.examNumber}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!studentSearching &&
                  studentQuery.trim() &&
                  studentResults.length === 0 && (
                    <p className="mt-1 text-xs text-slate">검색 결과가 없습니다.</p>
                  )}
              </>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">
                시작일 *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">
                종료일 (선택)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
          </div>

          {/* Fee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">
                요금 단위
              </label>
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
              <label className="mb-1 block text-xs font-medium text-slate">
                요금 (원)
              </label>
              <input
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">
              메모 (선택)
            </label>
            <input
              type="text"
              value={rentNote}
              onChange={(e) => setRentNote(e.target.value)}
              placeholder="특이사항..."
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
        description={`${selected?.rentals[0]?.student?.name ?? "학생"}의 사물함을 반납 처리합니다. 오늘 날짜로 반납 완료 처리됩니다.`}
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
              type="button"
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
