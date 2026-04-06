"use client";

import dynamic from "next/dynamic";
import { LayoutGrid, LoaderCircle, RefreshCcw, Save, Search, Table2, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import {
  ATTENDANCE_STATUS_OPTIONS,
  getAttendanceStatusClasses,
  type AttendanceOptionValue,
} from "@/lib/attendance-meta";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { hasStudentSearchQuery, matchesStudentSearch } from "@/lib/student-search";
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
  phone?: string | null;
  seatLabel: string | null;
  seatDisplay: string | null;
  studyRoomName?: string | null;
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

type BulkApplyDraft = {
  isOpen: boolean;
  startPeriodId: string;
  endPeriodId: string;
  status: AttendanceOptionValue;
  reason: string;
};

function getCellState(matrix: MatrixState, studentId: string, periodId: string) {
  return matrix[studentId]?.[periodId] ?? { status: "", reason: "" };
}

function hasCellChanged(
  currentCell: { status: AttendanceOptionValue; reason: string },
  previousCell: { status: AttendanceOptionValue; reason: string },
) {
  return currentCell.status !== previousCell.status || currentCell.reason !== previousCell.reason;
}

function createBulkApplyDraft(periods: PeriodItem[]): BulkApplyDraft {
  const firstPeriodId = periods[0]?.id ?? "";
  const lastPeriodId = periods[periods.length - 1]?.id ?? firstPeriodId;

  return {
    isOpen: false,
    startPeriodId: firstPeriodId,
    endPeriodId: lastPeriodId,
    status: "EXCUSED",
    reason: "",
  };
}

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
  const [savedMatrix, setSavedMatrix] = useState<MatrixState>(() => initialMatrix);
  const [stats, setStats] = useState(initialStats);
  const [bulkApplyByStudent, setBulkApplyByStudent] = useState<Record<string, BulkApplyDraft>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    title: string;
    description: string;
    notice?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const hasSeatLayout = Boolean(seatRooms && seatRooms.length > 0 && initialSeatLayout);
  const [viewMode, setViewMode] = useState<"table" | "seat">("table");
  const [isDirty, setIsDirty] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

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

  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        matchesStudentSearch(student, deferredSearchQuery, [student.studyRoomName]),
      ),
    [deferredSearchQuery, students],
  );
  const hasSearchQuery = hasStudentSearchQuery(searchQuery);

  useEffect(() => {
    let isMounted = true;

    if (selectedDate === initialDate) {
      setStudents(initialStudents);
      setPeriods(initialPeriods);
      setMatrix(initialMatrix);
      setSavedMatrix(initialMatrix);
      setStats(initialStats);
      setBulkApplyByStudent({});
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

        const nextMatrix = createMatrix(attendanceData.students, attendanceData.periods, attendanceData.records);

        setStudents(attendanceData.students);
        setPeriods(attendanceData.periods);
        setMatrix(nextMatrix);
        setSavedMatrix(nextMatrix);
        setStats(statsData);
        setBulkApplyByStudent({});
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

  function updatePeriodAllStudents(
    periodId: string,
    status: AttendanceOptionValue,
    targetStudents: StudentItem[] = students,
  ) {
    markDirty();
    setMatrix((current) => {
      const updated = { ...current };

      for (const student of targetStudents) {
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

  function updateBulkApplyDraft(studentId: string, value: Partial<BulkApplyDraft>) {
    setBulkApplyByStudent((current) => ({
      ...current,
      [studentId]: {
        ...(current[studentId] ?? createBulkApplyDraft(periods)),
        ...value,
      },
    }));
  }

  function toggleBulkApply(studentId: string) {
    setBulkApplyByStudent((current) => {
      const nextDraft = current[studentId] ?? createBulkApplyDraft(periods);

      return {
        ...current,
        [studentId]: {
          ...nextDraft,
          isOpen: !nextDraft.isOpen,
        },
      };
    });
  }

  function applyBulkRangeToStudent(studentId: string) {
    const draft = bulkApplyByStudent[studentId] ?? createBulkApplyDraft(periods);
    const startIndex = periods.findIndex((period) => period.id === draft.startPeriodId);
    const endIndex = periods.findIndex((period) => period.id === draft.endPeriodId);

    if (startIndex === -1 || endIndex === -1) {
      toast.error("교시 범위를 다시 선택해 주세요.");
      return;
    }

    const [fromIndex, toIndex] =
      startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const targetPeriods = periods.slice(fromIndex, toIndex + 1);

    if (targetPeriods.length === 0) {
      toast.error("적용할 교시를 찾지 못했습니다.");
      return;
    }

    const nextReason =
      draft.status === "ABSENT" || draft.status === "EXCUSED" ? draft.reason : "";

    markDirty();
    setMatrix((current) => {
      const updated = {
        ...current,
        [studentId]: { ...(current[studentId] ?? {}) },
      };

      for (const period of targetPeriods) {
        updated[studentId][period.id] = {
          status: draft.status,
          reason: nextReason,
        };
      }

      return updated;
    });

    const targetStudent = students.find((student) => student.id === studentId);
    const rangeLabel =
      targetPeriods.length === 1
        ? targetPeriods[0].name
        : `${targetPeriods[0].name}~${targetPeriods[targetPeriods.length - 1].name}`;

    toast.success(`${targetStudent?.name ?? "선택한 학생"}에게 ${rangeLabel} 구간을 적용했습니다.`);
  }

  // Save only edited cells so future-period pre-checks do not require filling every student.
  async function persistChangedPeriodsForStudents(targetStudentIds?: string[]) {
    const targetStudents = targetStudentIds
      ? students.filter((student) => targetStudentIds.includes(student.id))
      : students;

    const periodsWithChanges = periods.filter((period) =>
      targetStudents.some((student) => {
        const currentCell = getCellState(matrix, student.id, period.id);
        const previousCell = getCellState(savedMatrix, student.id, period.id);

        return hasCellChanged(currentCell, previousCell);
      }),
    );

    if (periodsWithChanges.length === 0) {
      throw new Error("변경한 출결 데이터가 없습니다.");
    }

    await Promise.all(
      periodsWithChanges.map(async (period) => {
        const changedRecords = targetStudents.flatMap((student) => {
          const currentCell = getCellState(matrix, student.id, period.id);
          const previousCell = getCellState(savedMatrix, student.id, period.id);

          if (!hasCellChanged(currentCell, previousCell)) {
            return [];
          }

          return [
            {
              studentId: student.id,
              status: currentCell.status,
              reason: currentCell.reason || null,
            },
          ];
        });

        if (changedRecords.length === 0) {
          return;
        }

        const response = await fetch(`/api/${divisionSlug}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: period.id,
            date: selectedDate,
            records: changedRecords,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? `${period.name} 저장에 실패했습니다.`);
        }
      }),
    );

    const statsResponse = await fetch(
      `/api/${divisionSlug}/attendance/stats?dateFrom=${selectedDate}&dateTo=${selectedDate}`,
      { cache: "no-store" },
    );
    const statsData = await statsResponse.json();
    if (statsResponse.ok) {
      setStats(statsData);
    }

    setSavedMatrix((current) => {
      if (!targetStudentIds) {
        return matrix;
      }

      const next = { ...current };
      for (const studentId of targetStudentIds) {
        if (matrix[studentId]) {
          next[studentId] = matrix[studentId];
        }
      }
      return next;
    });
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      await persistChangedPeriodsForStudents();
      setIsDirty(false);
      toast.success("출석부를 저장했습니다.");
      setSaveSuccessModal({
        title: "출석부 저장 완료",
        description: `${selectedDate} 출석부가 저장되어 통계와 좌석 보드에 반영되었습니다.`,
        notice: "저장한 출결과 사유 메모는 선택한 날짜의 통계와 좌석 보드에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "출석부 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveStudent(studentId: string) {
    try {
      await persistChangedPeriodsForStudents([studentId]);
      const targetStudent = students.find((student) => student.id === studentId);
      toast.success("저장되었습니다.");
      setSaveSuccessModal({
        title: "학생 출결 저장 완료",
        description: `${targetStudent?.name ?? "선택한 학생"}의 ${selectedDate} 출결이 저장되었습니다.`,
        notice: "저장한 출결과 사유 메모는 선택한 날짜의 좌석 보드와 출석 통계에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 출결 저장에 실패했습니다.");
      throw error;
    }
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
          변경한 칸만 저장됩니다. 미입력 칸은 그대로 두셔도 되고, 미래 날짜나 미래 교시의 사유 메모도 미리 기록할 수 있습니다.
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="이름, 수험번호, 연락처, 좌석, 강의실로 검색"
              className="w-full rounded-[10px] border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
            {hasSearchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                aria-label="검색어 지우기"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {filteredStudents.length}명 표시 / 전체 {students.length}명
          </div>
        </div>
      </section>

      {viewMode === "seat" && hasSeatLayout && seatRooms && initialSeatLayout ? (
        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          {hasSearchQuery ? (
            <div className="mb-4 rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              검색 조건에 맞는 학생만 좌석도에 표시됩니다.
            </div>
          ) : null}
          {filteredStudents.length > 0 ? (
            <AttendanceSeatView
              divisionSlug={divisionSlug}
              rooms={seatRooms}
              initialSeatLayout={initialSeatLayout}
              students={filteredStudents}
              periods={periods}
              matrix={matrix}
              onUpdateCell={(studentId, periodId, value) => updateCell(studentId, periodId, value)}
              onSaveStudent={handleSaveStudent}
            />
          ) : (
            <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500">
              검색 조건에 맞는 학생이 없습니다.
            </div>
          )}
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
                      onClick={() => updatePeriodAllStudents(period.id, "PRESENT", filteredStudents)}
                      className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      전체 출석
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={periods.length + 1}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    검색 조건에 맞는 학생이 없습니다.
                  </td>
                </tr>
              ) : null}
              {filteredStudents.map((student) => {
                const bulkApplyDraft = bulkApplyByStudent[student.id] ?? createBulkApplyDraft(periods);
                const bulkNeedsReason =
                  bulkApplyDraft.status === "ABSENT" || bulkApplyDraft.status === "EXCUSED";

                return (
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
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleBulkApply(student.id)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                          bulkApplyDraft.isOpen
                            ? "border-[var(--division-color)] bg-[color-mix(in_srgb,var(--division-color)_10%,white)] text-[var(--division-color)]"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        구간 적용
                      </button>
                    </div>
                    {bulkApplyDraft.isOpen && (
                      <div className="mt-2 space-y-2 rounded-[10px] border border-slate-200 bg-slate-50 p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] font-medium text-slate-500">
                            시작
                            <select
                              value={bulkApplyDraft.startPeriodId}
                              onChange={(event) =>
                                updateBulkApplyDraft(student.id, {
                                  startPeriodId: event.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-[10px] border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none"
                            >
                              {periods.map((period) => (
                                <option key={period.id} value={period.id}>
                                  {period.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[10px] font-medium text-slate-500">
                            종료
                            <select
                              value={bulkApplyDraft.endPeriodId}
                              onChange={(event) =>
                                updateBulkApplyDraft(student.id, {
                                  endPeriodId: event.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-[10px] border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none"
                            >
                              {periods.map((period) => (
                                <option key={period.id} value={period.id}>
                                  {period.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="block text-[10px] font-medium text-slate-500">
                          상태
                          <select
                            value={bulkApplyDraft.status}
                            onChange={(event) =>
                              updateBulkApplyDraft(student.id, {
                                status: event.target.value as AttendanceOptionValue,
                                reason:
                                  event.target.value === "ABSENT" || event.target.value === "EXCUSED"
                                    ? bulkApplyDraft.reason
                                    : "",
                              })
                            }
                            className={`mt-1 w-full rounded-[10px] border px-2 py-1.5 text-[11px] font-semibold outline-none ${getAttendanceStatusClasses(
                              bulkApplyDraft.status,
                            )}`}
                          >
                            {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                              <option key={option.value || "bulk-empty"} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {bulkNeedsReason && (
                          <input
                            value={bulkApplyDraft.reason}
                            onChange={(event) =>
                              updateBulkApplyDraft(student.id, { reason: event.target.value })
                            }
                            placeholder="같은 사유 메모를 한 번에 적용"
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-slate-400"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => applyBulkRangeToStudent(student.id)}
                          className="w-full rounded-[10px] bg-[var(--division-color)] px-3 py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
                        >
                          선택 구간에 적용
                        </button>
                      </div>
                    )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ActionCompleteModal
        open={saveSuccessModal !== null}
        onClose={() => setSaveSuccessModal(null)}
        title={saveSuccessModal?.title ?? "저장 완료"}
        description={saveSuccessModal?.description}
        notice={saveSuccessModal?.notice}
      />
    </div>
  );
});
