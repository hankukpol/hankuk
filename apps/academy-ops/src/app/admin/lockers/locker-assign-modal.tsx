"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { RentalFeeUnit } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LockerAssignTarget {
  id: string;
  lockerNumber: string;
  zone: string;
}

interface StudentResult {
  examNumber: string;
  name: string;
  generation: number | null;
  phone: string | null;
}

interface Props {
  locker: LockerAssignTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LockerAssignModal({ locker, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [feeUnit, setFeeUnit] = useState<RentalFeeUnit>(RentalFeeUnit.MONTHLY);
  const [feeAmount, setFeeAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form when locker changes
  useEffect(() => {
    if (locker) {
      setStudentQuery("");
      setStudentResults([]);
      setSelectedStudent(null);
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      setFeeUnit(RentalFeeUnit.MONTHLY);
      setFeeAmount("");
      setNote("");
      setError(null);
    }
  }, [locker?.id]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

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
          const data = (await res.json()) as {
            students?: Array<Record<string, unknown>>;
          };
          setStudentResults(
            (data.students ?? []).map((s) => ({
              examNumber: String(s.examNumber ?? ""),
              name: String(s.name ?? ""),
              generation: (s.generation as number | null) ?? null,
              phone: (s.phone ?? s.mobile ?? null) as string | null,
            })),
          );
        }
      } finally {
        setStudentSearching(false);
      }
    }, 300);
  }, []);

  function handleConfirm() {
    if (!locker) return;
    if (!selectedStudent) {
      setError("학생을 선택하세요.");
      return;
    }
    if (!startDate) {
      setError("시작일을 입력하세요.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/lockers/${locker.id}/rentals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examNumber: selectedStudent.examNumber,
            startDate,
            endDate: endDate || null,
            feeUnit,
            feeAmount: feeAmount ? Number(feeAmount) : 0,
            note: note || null,
          }),
        });
        const data = (await res.json()) as { rental?: unknown; error?: string };
        if (!res.ok) throw new Error(data.error ?? "배정 실패");
        onSuccess();
      } catch (e) {
        setError(e instanceof Error ? e.message : "배정 실패");
      }
    });
  }

  return (
    <ActionModal
      open={locker !== null}
      badgeLabel="빠른 배정"
      badgeTone="success"
      title={`${locker?.lockerNumber}번 사물함 배정`}
      description="학생에게 사물함을 즉시 배정합니다."
      confirmLabel="배정 처리"
      cancelLabel="취소"
      isPending={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
      panelClassName="max-w-md"
    >
      <div className="space-y-3 pt-1">
        {error && (
          <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
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
                  <span className="ml-1.5 text-xs text-slate">{selectedStudent.generation}기</span>
                )}
                <span className="ml-2 text-xs text-slate">{selectedStudent.examNumber}</span>
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
                autoComplete="off"
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
              {!studentSearching && studentQuery.trim() && studentResults.length === 0 && (
                <p className="mt-1 text-xs text-slate">검색 결과가 없습니다.</p>
              )}
            </>
          )}
        </div>

        {/* Dates */}
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

        {/* Fee */}
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
              min="0"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate">메모 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="특이사항..."
            className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
          />
        </div>
      </div>
    </ActionModal>
  );
}
