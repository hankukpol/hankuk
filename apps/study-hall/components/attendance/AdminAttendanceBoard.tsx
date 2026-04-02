"use client";

import dynamic from "next/dynamic";
import { LayoutGrid, LoaderCircle, RefreshCcw, Save, Table2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import {
  ATTENDANCE_STATUS_OPTIONS,
  getAttendanceStatusClasses,
  type AttendanceOptionValue,
} from "@/lib/attendance-meta";
import type { SeatLayout, StudyRoomItem } from "@/lib/services/seat.service";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";

const seatViewFallback = () => (
  <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
    좌석 출석 보드를 불러오는 중입니다.
  </div>
);

const AttendanceSeatView = dynamic(
  () => import("@/components/attendance/AttendanceSeatView").then((mod) => mod.AttendanceSeatView),
  { ssr: false, loading: seatViewFallback },
);

type PeriodItem = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isMandatory: boolean;
  isActive: boolean;
};

type StudentItem = {
  id: string;
  name: string;
  studentNumber: string;
  seatLabel: string | null;
  seatDisplay: string | null;
  studyTrack: string | null;
};

type AttendanceRecordItem = {
  studentId: string;
  periodId: string;
  status: Exclude<AttendanceOptionValue, "">;
  reason: string | null;
};

type StatsPayload = {
  attendanceRate: number;
  totals: Record<string, number>;
};

export type AdminAttendanceBoardProps = {
  divisionSlug: string;
  initialDate: string;
  initialPeriods: PeriodItem[];
  initialStudents: StudentItem[];
  initialRecords: AttendanceRecordItem[];
  initialStats: StatsPayload;
  seatRooms?: StudyRoomItem[];
  initialSeatLayout?: SeatLayout;
};

type MatrixState = Record<
  string,
  Record<
    string,
    {
      status: AttendanceOptionValue;
      reason: string;
    }
  >
>;

function createMatrix(
  students: StudentItem[],
  periods: PeriodItem[],
  records: AttendanceRecordItem[],
): MatrixState {
  const next: MatrixState = {};
  const recordMap = new Map(records.map((record) => [`${record.studentId}:${record.periodId}`, record]));

  for (const student of students) {
    next[student.id] = {};

    for (const period of periods) {
      const record = recordMap.get(`${student.id}:${period.id}`);
      next[student.id][period.id] = {
        status: record?.status ?? "",
        reason: record?.reason ?? "",
      };
    }
  }

  return next;
}

export const AdminAttendanceBoard = memo(function AdminAttendanceBoard({
  divisionSlug,
  initialDate,
  initialPeriods,
  initialStudents,
  initialRecords,
  initialStats,
  seatRooms,
  initialSeatLayout,
}: AdminAttendanceBoardProps) {
  const initialMatrix = useMemo(
    () => createMatrix(initialStudents, initialPeriods, initialRecords),
    [initialPeriods, initialRecords, initialStudents],
  );
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [students, setStudents] = useState(initialStudents);
  const [periods, setPeriods] = useState(initialPeriods);
  const [matrix, setMatrix] = useState<MatrixState>(() => initialMatrix);
  const [stats, setStats] = useState(initialStats);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const hasSeatLayout = Boolean(seatRooms && seatRooms.length > 0 && initialSeatLayout);
  const [viewMode, setViewMode] = useState<"table" | "seat">("table");
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: "출석", value: stats.totals.present ?? 0, className: "border border-slate-200-slate-200 bg-white text-emerald-600 font-medium" },
      { label: "지각", value: stats.totals.tardy ?? 0, className: "border border-slate-200-slate-200 bg-white text-amber-600 font-medium" },
      { label: "결석", value: stats.totals.absent ?? 0, className: "border border-slate-200-slate-200 bg-white text-rose-600 font-medium" },
      { label: "출석률", value: `${stats.attendanceRate}%`, className: "border border-slate-200-slate-200 bg-white text-slate-800 font-medium" },
    ],
    [stats],
  );

  useEffect(() => {
    let isMounted = true;

    if (selectedDate === initialDate) {
      setStudents(initialStudents);
      setPeriods(initialPeriods);
      setMatrix(initialMatrix);
      setStats(initialStats);
      setIsLoading(false);

      return () => {
        isMounted = false;
      };
    }

    async function loadData() {
      setIsLoading(true);

      try {
        const [attendanceResponse, statsResponse] = await Promise.all([
          fetch(`/api/${divisionSlug}/attendance?date=${selectedDate}`, { cache: "no-store" }),
          fetch(`/api/${divisionSlug}/attendance/stats?dateFrom=${selectedDate}&dateTo=${selectedDate}`, {
            cache: "no-store",
          }),
        ]);
        const attendanceData = await attendanceResponse.json();
        const statsData = await statsResponse.json();

        if (!attendanceResponse.ok) {
          throw new Error(attendanceData.error ?? "출석부를 불러오지 못했습니다.");
        }

        if (!statsResponse.ok) {
          throw new Error(statsData.error ?? "통계를 불러오지 못했습니다.");
        }

        if (!isMounted) {
          return;
        }

        setStudents(attendanceData.students);
        setPeriods(attendanceData.periods);
        setMatrix(createMatrix(attendanceData.students, attendanceData.periods, attendanceData.records));
        setStats(statsData);
        setIsDirty(false);
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "출석부를 불러오지 못했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [divisionSlug, initialDate, initialMatrix, initialPeriods, initialStats, initialStudents, selectedDate]);

  function updateCell(studentId: string, periodId: string, value: Partial<{ status: AttendanceOptionValue; reason: string }>) {
    markDirty();
    setMatrix((current) => ({
      ...current,
      [studentId]: {
        ...current[studentId],
        [periodId]: {
          status: value.status ?? current[studentId]?.[periodId]?.status ?? "",
          reason: value.reason ?? current[studentId]?.[periodId]?.reason ?? "",
        },
      },
    }));
  }

  function updateStudentAllPeriods(studentId: string, status: AttendanceOptionValue) {
    markDirty();
    setMatrix((current) => {
      const updated = { ...current, [studentId]: { ...(current[studentId] ?? {}) } };
      for (const period of periods) {
        updated[studentId][period.id] = { status, reason: "" };
      }
      return updated;
    });
  }

  function updatePeriodAllStudents(periodId: string, status: AttendanceOptionValue) {
    markDirty();
    setMatrix((current) => {
      const updated = { ...current };

      for (const student of students) {
        updated[student.id] = {
          ...(current[student.id] ?? {}),
          [periodId]: {
            status,
            reason: "",
          },
        };
      }

      return updated;
    });
  }

  async function savePeriodsForStudents(targetStudentIds?: string[]) {
    const targetStudents = targetStudentIds
      ? students.filter((s) => targetStudentIds.includes(s.id))
      : students;

    // 입력된 교시만 필터 (최소 1명이라도 상태가 설정된 교시)
    const periodsWithData = periods.filter((period) =>
      targetStudents.some((student) => matrix[student.id]?.[period.id]?.status),
    );

    if (periodsWithData.length === 0) {
      throw new Error("저장할 출결 데이터가 없습니다. 최소 1개 교시의 출석 상태를 입력해주세요.");
    }

    // 입력된 교시에 대해서만 검증 (해당 교시 내 모든 학생이 채워져야 함)
    for (const period of periodsWithData) {
      const unresolved = targetStudents.find((student) => !matrix[student.id]?.[period.id]?.status);
      if (unresolved) {
        throw new Error(`${period.name}에서 ${unresolved.name} 학생 상태가 비어 있습니다.`);
      }
    }

    // 입력된 교시만 저장
    await Promise.all(
      periodsWithData.map(async (period) => {
        const response = await fetch(`/api/${divisionSlug}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: period.id,
            date: selectedDate,
            records: targetStudents.map((student) => ({
              studentId: student.id,
              status: matrix[student.id][period.id].status,
              reason: matrix[student.id][period.id].reason || null,
            })),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? `${period.name} 저장에 실패했습니다.`);
        }
      })
    );

    const statsResponse = await fetch(
      `/api/${divisionSlug}/attendance/stats?dateFrom=${selectedDate}&dateTo=${selectedDate}`,
      { cache: "no-store" },
    );
    const statsData = await statsResponse.json();
    if (statsResponse.ok) {
      setStats(statsData);
    }
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      await savePeriodsForStudents();
      setIsDirty(false);
      toast.success("출석부를 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "출석부 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveStudent(studentId: string) {
    await savePeriodsForStudents([studentId]);
    toast.success("저장되었습니다.");
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard isDirty={isDirty} />
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">일일 출결</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">관리자 출석부</h2>
          </div>

          <div className="flex items-center gap-2">
            {hasSeatLayout && (
              <div className="flex gap-1 rounded-[10px] border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === "table"
                      ? "bg-[var(--division-color)] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Table2 className="inline h-3.5 w-3.5 mr-1" />
                  테이블
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("seat")}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === "seat"
                      ? "bg-[var(--division-color)] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <LayoutGrid className="inline h-3.5 w-3.5 mr-1" />
                  좌석
                </button>
              </div>
            )}
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none"
            />
            {viewMode === "table" && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isSaving || isLoading}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                전체 저장
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-[10px] px-4 py-4 ${card.className}`}>
              <p className="text-sm font-medium opacity-80">{card.label}</p>
              <p className="mt-2 text-2xl font-bold">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[10px] border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          출석 상태가 입력된 교시만 저장됩니다. 미입력 교시는 건너뛰므로, 현재 교시까지만 체크 후 저장하셔도 됩니다.
        </div>
      </section>

      {viewMode === "seat" && hasSeatLayout && seatRooms && initialSeatLayout ? (
        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <AttendanceSeatView
            divisionSlug={divisionSlug}
            rooms={seatRooms}
            initialSeatLayout={initialSeatLayout}
            students={students}
            periods={periods}
            matrix={matrix}
            onUpdateCell={(studentId, periodId, value) => updateCell(studentId, periodId, value)}
            onSaveStudent={handleSaveStudent}
          />
        </section>
      ) : null}

      <section className={`overflow-hidden rounded-[10px] border border-slate-200-black/5 bg-white shadow-[0_16px_40px_rgba(18,32,56,0.06)] ${viewMode === "seat" ? "hidden" : ""}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-medium text-slate-700">학생 x 교시 매트릭스</p>
          {isLoading ? (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              새로고침 중
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <RefreshCcw className="h-4 w-4" />
              최신 상태
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-white">
              <tr>
                <th className="sticky left-0 z-10 w-[200px] min-w-[200px] border-b border-r border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-700">
                  학생
                </th>
                {periods.map((period) => (
                  <th key={period.id} className="min-w-[160px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                    <div>{period.name}</div>
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      {period.startTime}-{period.endTime}
                    </div>
                    <button
                      type="button"
                      onClick={() => updatePeriodAllStudents(period.id, "PRESENT")}
                      className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      전체 출석
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="align-top">
                  <td className="sticky left-0 z-10 w-[200px] min-w-[200px] border-r border-slate-200 bg-white px-4 py-4">
                    <div className="font-semibold text-slate-900">{student.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {student.seatDisplay || "좌석 미배정"} · {student.studentNumber}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{student.studyTrack || "직렬 미지정"}</div>
                    {/* 일괄 처리 버튼 */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(
                        [
                          { status: "PRESENT" as const, label: "전체출석", classes: "border-slate-200 bg-white text-emerald-600 hover:bg-slate-50" },
                          { status: "HOLIDAY" as const, label: "전체휴무", classes: "border-slate-200 bg-white text-slate-500 hover:bg-slate-50" },
                          { status: "ABSENT" as const, label: "전체결석", classes: "border-slate-200 bg-white text-rose-600 hover:bg-slate-50" },
                          { status: "NOT_APPLICABLE" as const, label: "해당없음", classes: "border-slate-200 bg-white text-slate-500 hover:bg-slate-50" },
                        ]
                      ).map(({ status, label, classes }) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => updateStudentAllPeriods(student.id, status)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${classes}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </td>
                  {periods.map((period) => {
                    const cell = matrix[student.id]?.[period.id] ?? { status: "", reason: "" };
                    const needsReason = cell.status === "ABSENT" || cell.status === "EXCUSED";

                    return (
                      <td key={period.id} className="min-w-[120px] border-b border-slate-100 px-2 py-2">
                        <select
                          value={cell.status}
                          onChange={(event) =>
                            updateCell(student.id, period.id, {
                              status: event.target.value as AttendanceOptionValue,
                              reason:
                                event.target.value === "ABSENT" || event.target.value === "EXCUSED"
                                  ? cell.reason
                                  : "",
                            })
                          }
                          className={`w-full rounded-[10px] border px-2 py-2.5 text-xs font-semibold outline-none ${getAttendanceStatusClasses(cell.status)}`}
                        >
                          {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                            <option key={option.value || "empty"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {needsReason && (
                          <input
                            value={cell.reason}
                            onChange={(event) => updateCell(student.id, period.id, { reason: event.target.value })}
                            placeholder="사유"
                            className="mt-1 h-7 w-full rounded-[10px] border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-400"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
});
