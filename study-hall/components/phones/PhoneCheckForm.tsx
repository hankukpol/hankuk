"use client";

import dynamic from "next/dynamic";

import { RefreshCcw, Save } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { PhoneCheckStatus, PhoneDaySnapshot } from "@/lib/services/phone-submission.service";
import type { SeatLayout, StudyRoomItem } from "@/lib/services/seat.service";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";

const PhoneCheckSeatMap = dynamic(
  () => import("@/components/phones/PhoneCheckSeatMap").then((mod) => mod.PhoneCheckSeatMap),
  {
    loading: () => (
      <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500">
        좌석 지도를 불러오는 중입니다.
      </div>
    ),
  },
);

export type LocalStatus = PhoneCheckStatus | null;

export type LocalPeriodState = {
  [studentId: string]: {
    status: LocalStatus;
    rentalNote: string;
  };
};

type AllPeriodsState = {
  [periodId: string]: LocalPeriodState;
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildInitialState(snapshot: PhoneDaySnapshot): AllPeriodsState {
  const state: AllPeriodsState = {};
  for (const period of snapshot.periods) {
    const recordByStudentId = new Map(period.records.map((record) => [record.studentId, record]));
    state[period.periodId] = {};
    for (const student of snapshot.students) {
      const record = recordByStudentId.get(student.id);
      state[period.periodId][student.id] = {
        status: record ? record.status : null,
        rentalNote: record?.rentalNote ?? "",
      };
    }
  }
  return state;
}

type PhoneCheckFormProps = {
  divisionSlug: string;
  initialDate: string;
  initialSnapshot: PhoneDaySnapshot;
  seatRooms?: StudyRoomItem[];
  initialSeatLayout?: SeatLayout;
};

export function PhoneCheckForm({ divisionSlug, initialDate, initialSnapshot, seatRooms, initialSeatLayout }: PhoneCheckFormProps) {
  const [date, setDate] = useState(initialDate);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [periodsState, setPeriodsState] = useState<AllPeriodsState>(() =>
    buildInitialState(initialSnapshot),
  );
  const [activePeriodId, setActivePeriodId] = useState<string>(
    initialSnapshot.periods[0]?.periodId ?? "",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [savingPeriodId, setSavingPeriodId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const periods = snapshot.periods;
  const students = snapshot.students;
  const activePeriod = periods.find((p) => p.periodId === activePeriodId);
  const activePeriodState = useMemo(
    () => periodsState[activePeriodId] ?? {},
    [activePeriodId, periodsState],
  );

  async function loadSnapshot(newDate: string) {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/${divisionSlug}/phone-submissions?mode=snapshot&date=${newDate}`,
      );
      if (!res.ok) {
        toast.error("데이터를 불러오는 데 실패했습니다.");
        return;
      }
      const { snapshot: newSnapshot } = (await res.json()) as { snapshot: PhoneDaySnapshot };
      setSnapshot(newSnapshot);
      setPeriodsState(buildInitialState(newSnapshot));
      setIsDirty(false);
      if (
        newSnapshot.periods.length > 0 &&
        !newSnapshot.periods.find((p) => p.periodId === activePeriodId)
      ) {
        setActivePeriodId(newSnapshot.periods[0].periodId);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleDateChange(newDate: string) {
    if (newDate === date) {
      return;
    }

    setDate(newDate);
    void loadSnapshot(newDate);
  }

  function setStudentStatus(periodId: string, studentId: string, status: LocalStatus) {
    markDirty();
    setPeriodsState((prev) => ({
      ...prev,
      [periodId]: {
        ...prev[periodId],
        [studentId]: {
          status,
          rentalNote: status !== "RENTED" ? "" : (prev[periodId]?.[studentId]?.rentalNote ?? ""),
        },
      },
    }));
  }

  function setRentalNote(periodId: string, studentId: string, note: string) {
    setPeriodsState((prev) => ({
      ...prev,
      [periodId]: {
        ...prev[periodId],
        [studentId]: { ...prev[periodId]?.[studentId], rentalNote: note },
      },
    }));
  }

  function setAllForPeriod(periodId: string, status: PhoneCheckStatus) {
    markDirty();
    setPeriodsState((prev) => {
      const next: LocalPeriodState = {};
      for (const student of students) {
        next[student.id] = {
          status,
          rentalNote: status === "RENTED" ? (prev[periodId]?.[student.id]?.rentalNote ?? "") : "",
        };
      }
      return { ...prev, [periodId]: next };
    });
  }

  async function savePeriod(periodId: string) {
    const periodStateMap = periodsState[periodId] ?? {};
    const records = Object.entries(periodStateMap)
      .filter(([, v]) => v.status !== null)
      .map(([studentId, v]) => ({
        studentId,
        status: v.status as PhoneCheckStatus,
        rentalNote: v.rentalNote || undefined,
      }));

    if (records.length === 0) {
      toast.error("저장할 기록이 없습니다. 최소 1명의 상태를 선택해주세요.");
      return;
    }

    setSavingPeriodId(periodId);
    try {
      const res = await fetch(`/api/${divisionSlug}/phone-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, periodId, records }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "저장에 실패했습니다.");
        return;
      }

      const { snapshot: newSnapshot } = (await res.json()) as { snapshot: PhoneDaySnapshot };
      setSnapshot(newSnapshot);
      setPeriodsState((prev) => {
        const updated = { ...prev };
        const savedPeriod = newSnapshot.periods.find((p) => p.periodId === periodId);
        if (savedPeriod) {
          const recordByStudentId = new Map(
            savedPeriod.records.map((record) => [record.studentId, record]),
          );
          const newPeriodState: LocalPeriodState = {};
          for (const student of newSnapshot.students) {
            const record = recordByStudentId.get(student.id);
            newPeriodState[student.id] = {
              status: record ? record.status : null,
              rentalNote: record?.rentalNote ?? "",
            };
          }
          updated[periodId] = newPeriodState;
        }
        return updated;
      });
      setIsDirty(false);
      toast.success("저장되었습니다.");
    } finally {
      setSavingPeriodId(null);
    }
  }

  const activePeriodStats = useMemo(() => {
    let submittedCount = 0;
    let notSubmittedCount = 0;
    let rentedCount = 0;
    let uncheckedCount = 0;

    Object.values(activePeriodState).forEach((entry) => {
      if (entry.status === "SUBMITTED") {
        submittedCount += 1;
        return;
      }

      if (entry.status === "NOT_SUBMITTED") {
        notSubmittedCount += 1;
        return;
      }

      if (entry.status === "RENTED") {
        rentedCount += 1;
        return;
      }

      uncheckedCount += 1;
    });

    return {
      submittedCount,
      notSubmittedCount,
      rentedCount,
      uncheckedCount,
    };
  }, [activePeriodState]);

  return (
    <div className="space-y-5">
      <UnsavedChangesGuard isDirty={isDirty} />
      {/* 날짜 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          max={getKstToday()}
          onChange={(e) => handleDateChange(e.target.value)}
          className="rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
        />
        <button
          type="button"
          onClick={() => loadSnapshot(date)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {periods.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500">
          활성화된 교시가 없습니다.
        </div>
      ) : (
        <>
          {/* 교시 탭 */}
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-1 rounded-[10px] border border-slate-200 bg-slate-50 p-1.5">
              {periods.map((period) => {
                const isActive = period.periodId === activePeriodId;
                return (
                  <button
                    key={period.periodId}
                    type="button"
                    onClick={() => setActivePeriodId(period.periodId)}
                    className={`shrink-0 rounded-[10px] px-4 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-[var(--division-color)] text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {period.periodName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택된 교시 내용 */}
          {activePeriod && (
            <div className="space-y-4">
              {/* 교시 정보 + 통계 */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {activePeriod.periodName}
                    {activePeriod.periodLabel && (
                      <span className="ml-1.5 text-slate-500">({activePeriod.periodLabel})</span>
                    )}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {activePeriod.startTime}–{activePeriod.endTime}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    반납 {activePeriodStats.submittedCount}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                    미반납 {activePeriodStats.notSubmittedCount}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-700/20">
                    대여 {activePeriodStats.rentedCount}
                  </span>
                  {activePeriodStats.uncheckedCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      미체크 {activePeriodStats.uncheckedCount}
                    </span>
                  )}
                </div>
              </div>

              {/* 빠른 설정 + 저장 */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllForPeriod(activePeriodId, "SUBMITTED")}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  전원 반납
                </button>
                <button
                  type="button"
                  onClick={() => setAllForPeriod(activePeriodId, "NOT_SUBMITTED")}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  전원 미반납
                </button>
                <button
                  type="button"
                  onClick={() => savePeriod(activePeriodId)}
                  disabled={savingPeriodId === activePeriodId || isLoading}
                  className="ml-auto inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingPeriodId === activePeriodId ? "저장 중..." : "저장"}
                </button>
              </div>

              {/* 학생 목록 */}
              {students.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">
                  재원 학생이 없습니다.
                </div>
              ) : seatRooms && seatRooms.length > 0 && initialSeatLayout ? (
                <PhoneCheckSeatMap
                  divisionSlug={divisionSlug}
                  rooms={seatRooms}
                  initialSeatLayout={initialSeatLayout}
                  students={students}
                  periodState={activePeriodState}
                  onStatusChange={(studentId, status) => setStudentStatus(activePeriodId, studentId, status)}
                  onRentalNoteChange={(studentId, note) => setRentalNote(activePeriodId, studentId, note)}
                />
              ) : (
                <div className="space-y-2">
                  {students.map((student) => {
                    const entry = activePeriodState[student.id] ?? { status: null, rentalNote: "" };
                    const { status, rentalNote } = entry;

                    const cardBg =
                      status === "SUBMITTED"
                        ? "border-green-100 bg-green-50/30"
                        : status === "NOT_SUBMITTED"
                          ? "border-red-100 bg-red-50/30"
                          : status === "RENTED"
                            ? "border-sky-100 bg-sky-50/30"
                            : "border-slate-100 bg-white";

                    return (
                      <div
                        key={student.id}
                        className={`rounded-[10px] border p-3 transition ${cardBg}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                            <p className="text-xs text-slate-500">
                              {student.studentNumber}
                              {student.studyTrack && ` · ${student.studyTrack}`}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {(
                              [
                                { s: "SUBMITTED" as const, label: "반납", active: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20" },
                                { s: "NOT_SUBMITTED" as const, label: "미반납", active: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20" },
                                { s: "RENTED" as const, label: "대여", active: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-700/20" },
                              ]
                            ).map(({ s, label, active }) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() =>
                                  setStudentStatus(activePeriodId, student.id, status === s ? null : s)
                                }
                                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                  status === s
                                    ? active
                                    : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {status === "RENTED" && (
                          <div className="mt-2">
                            <input
                              type="text"
                              value={rentalNote}
                              onChange={(e) =>
                                setRentalNote(activePeriodId, student.id, e.target.value)
                              }
                              placeholder="대여 사유 (예: 인강 수강)"
                              maxLength={200}
                              className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-xs outline-none transition focus:border-slate-400 placeholder:text-slate-400"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
