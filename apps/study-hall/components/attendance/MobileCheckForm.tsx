"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCcw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { toast } from "@/lib/sonner";

import {
  ATTENDANCE_STATUS_OPTIONS,
  getAttendanceStatusClasses,
  getAttendanceStatusLabel,
  type AttendanceOptionValue,
} from "@/lib/attendance-meta";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { hasStudentSearchQuery, matchesStudentSearch } from "@/lib/student-search";

type PeriodItem = {
  id: string;
  name: string;
  label: string | null;
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
  studyRoomName: string | null;
  studyTrack: string | null;
};

type AttendanceRecordItem = {
  studentId: string;
  periodId: string;
  status: Exclude<AttendanceOptionValue, "">;
  reason: string | null;
};

export type MobileCheckFormProps = {
  divisionSlug: string;
  initialDate: string;
  initialPeriods: PeriodItem[];
  initialPeriodId: string | null;
  initialStudents: StudentItem[];
  initialRecords: AttendanceRecordItem[];
};

type FormState = Record<
  string,
  {
    status: AttendanceOptionValue;
    reason: string;
  }
>;

type SwipeContext = {
  studentId: string;
  startX: number;
  startY: number;
  width: number;
};

const QUICK_STATUS_BUTTONS: Array<{
  label: string;
  value: Extract<AttendanceOptionValue, "PRESENT" | "TARDY" | "ABSENT">;
  activeClassName: string;
}> = [
  { label: "출석", value: "PRESENT", activeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "지각", value: "TARDY", activeClassName: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "결석", value: "ABSENT", activeClassName: "border-rose-200 bg-rose-50 text-rose-700" },
];

function buildInitialState(students: StudentItem[], records: AttendanceRecordItem[]): FormState {
  const recordMap = new Map(records.map((record) => [record.studentId, record]));
  const nextState: FormState = {};

  for (const student of students) {
    const record = recordMap.get(student.id);
    nextState[student.id] = {
      status: record?.status ?? "",
      reason: record?.reason ?? "",
    };
  }

  return nextState;
}

function hasStudentStateChanged(
  currentState: { status: AttendanceOptionValue; reason: string } | undefined,
  previousState: { status: AttendanceOptionValue; reason: string } | undefined,
) {
  return (
    (currentState?.status ?? "") !== (previousState?.status ?? "") ||
    (currentState?.reason ?? "") !== (previousState?.reason ?? "")
  );
}

function getStudentCardClasses(status: AttendanceOptionValue) {
  switch (status) {
    case "PRESENT":
      return "border-emerald-100";
    case "TARDY":
      return "border-amber-100";
    case "ABSENT":
      return "border-rose-100";
    case "EXCUSED":
      return "border-sky-100";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
    case "NOT_APPLICABLE":
      return "border-slate-200 bg-slate-50/70";
    default:
      return "border-indigo-100";
  }
}

export function MobileCheckForm({
  divisionSlug,
  initialDate,
  initialPeriods,
  initialPeriodId,
  initialStudents,
  initialRecords,
}: MobileCheckFormProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedPeriodId, setSelectedPeriodId] = useState(initialPeriodId ?? initialPeriods[0]?.id ?? "");
  const [students, setStudents] = useState(initialStudents);
  const [periods] = useState(initialPeriods);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialStudents, initialRecords));
  // Track the last loaded/saved snapshot so mobile can also save only edited students.
  const [savedFormState, setSavedFormState] = useState<FormState>(() =>
    buildInitialState(initialStudents, initialRecords),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    title: string;
    description: string;
    notice?: string;
  } | null>(null);
  const [showOnlyUnchecked, setShowOnlyUnchecked] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(true);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [headerHeight, setHeaderHeight] = useState(132);
  const swipeRef = useRef<SwipeContext | null>(null);
  const swipeRafRef = useRef<number>(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const initialFormState = useMemo(
    () => buildInitialState(initialStudents, initialRecords),
    [initialRecords, initialStudents],
  );

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  const summary = useMemo(() => {
    let checkedCount = 0;
    let presentCount = 0;
    let absentCount = 0;

    for (const student of students) {
      const status = formState[student.id]?.status ?? "";

      if (status) {
        checkedCount += 1;
      }

      if (status === "PRESENT") {
        presentCount += 1;
      }

      if (status === "ABSENT") {
        absentCount += 1;
      }
    }

    return {
      checkedCount,
      uncheckedCount: Math.max(students.length - checkedCount, 0),
      presentCount,
      absentCount,
    };
  }, [formState, students]);

  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        matchesStudentSearch(student, deferredSearchQuery, [student.studyRoomName]),
      ),
    [deferredSearchQuery, students],
  );

  const visibleStudents = useMemo(() => {
    if (!showOnlyUnchecked) {
      return filteredStudents;
    }

    return filteredStudents.filter((student) => !formState[student.id]?.status);
  }, [filteredStudents, formState, showOnlyUnchecked]);
  const hasSearchQuery = hasStudentSearchQuery(searchQuery);

  const progressPercentage = students.length > 0 ? Math.round((summary.checkedCount / students.length) * 100) : 0;

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) {
      return;
    }

    if (selectedDate === initialDate && selectedPeriodId === (initialPeriodId ?? initialPeriods[0]?.id ?? "")) {
      setStudents(initialStudents);
      setFormState(initialFormState);
      setSavedFormState(initialFormState);
      setShowOnlyUnchecked(false);
      setSwipeOffsets({});
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadSnapshot() {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/${divisionSlug}/attendance?date=${selectedDate}&periodId=${selectedPeriodId}`,
          { cache: "no-store" },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "출석 데이터를 불러오지 못했습니다.");
        }

        if (!isMounted) {
          return;
        }

        const nextState = buildInitialState(data.students, data.records);

        setStudents(data.students);
        setFormState(nextState);
        setSavedFormState(nextState);
        setShowOnlyUnchecked(false);
        setSwipeOffsets({});
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "출석 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, [
    divisionSlug,
    initialDate,
    initialFormState,
    initialPeriodId,
    initialPeriods,
    initialStudents,
    selectedDate,
    selectedPeriodId,
  ]);

  function updateStudentState(studentId: string, value: Partial<{ status: AttendanceOptionValue; reason: string }>) {
    setFormState((current) => ({
      ...current,
      [studentId]: {
        status: value.status ?? current[studentId]?.status ?? "",
        reason: value.reason ?? current[studentId]?.reason ?? "",
      },
    }));
  }

  function applyStudentStatus(studentId: string, status: AttendanceOptionValue, vibrate = false) {
    updateStudentState(studentId, {
      status,
      reason: status === "ABSENT" || status === "EXCUSED" ? formState[studentId]?.reason ?? "" : "",
    });

    if (vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(25);
    }
  }

  function markAllPresent() {
    setFormState((current) => {
      const nextState: FormState = { ...current };

      for (const student of visibleStudents) {
        nextState[student.id] = { status: "PRESENT", reason: "" };
      }

      return nextState;
    });
  }

  async function refreshCurrentPeriod() {
    try {
      const response = await fetch(`/api/${divisionSlug}/periods/current`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "현재 교시를 조회하지 못했습니다.");
      }

      if (data.period?.id) {
        setSelectedPeriodId(data.period.id);
        toast.success(`현재 교시를 ${data.period.name}로 맞췄습니다.`);
      } else {
        toast.message("현재 시간에는 해당하는 활성 교시가 없습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "현재 교시를 조회하지 못했습니다.");
    }
  }

  async function handleSave() {
    if (!selectedPeriodId) {
      toast.error("교시를 선택해 주세요.");
      return;
    }

    const changedStudents = students.filter((student) =>
      hasStudentStateChanged(formState[student.id], savedFormState[student.id]),
    );

    if (changedStudents.length === 0) {
      toast.error("변경한 출결 데이터가 없습니다.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          periodId: selectedPeriodId,
          date: selectedDate,
          records: changedStudents.map((student) => ({
            studentId: student.id,
            status: formState[student.id].status,
            reason: formState[student.id].reason || null,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "출석 저장에 실패했습니다.");
      }

      const nextState = buildInitialState(data.students, data.records);
      setFormState(nextState);
      setSavedFormState(nextState);
      setSwipeOffsets({});
      toast.success("출석 기록을 저장했습니다.");
      setSaveSuccessModal({
        title: "출석 저장 완료",
        description: `${selectedDate} ${selectedPeriod?.name ?? "선택한 교시"} 출결이 저장되었습니다.`,
        notice: "저장한 출결과 사유 메모는 선택한 날짜와 교시에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "출석 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSwipeStart(studentId: string, event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    const width = event.currentTarget.getBoundingClientRect().width;

    swipeRef.current = {
      studentId,
      startX: touch.clientX,
      startY: touch.clientY,
      width,
    };
  }

  function handleSwipeMove(studentId: string, event: TouchEvent<HTMLDivElement>) {
    const currentSwipe = swipeRef.current;
    if (!currentSwipe || currentSwipe.studentId !== studentId) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - currentSwipe.startX;
    const deltaY = touch.clientY - currentSwipe.startY;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      swipeRef.current = null;
      setSwipeOffsets((current) => ({ ...current, [studentId]: 0 }));
      return;
    }

    const maxOffset = Math.min(120, currentSwipe.width * 0.34);
    const bounded = Math.max(-maxOffset, Math.min(maxOffset, deltaX));

    cancelAnimationFrame(swipeRafRef.current);
    swipeRafRef.current = requestAnimationFrame(() => {
      setSwipeOffsets((current) => ({ ...current, [studentId]: bounded }));
    });
  }

  function handleSwipeEnd(studentId: string) {
    const currentSwipe = swipeRef.current;
    const offset = swipeOffsets[studentId] ?? 0;

    if (currentSwipe?.studentId === studentId) {
      const threshold = Math.min(88, currentSwipe.width * 0.24);

      if (offset >= threshold) {
        applyStudentStatus(studentId, "PRESENT", true);
      } else if (offset <= -threshold) {
        applyStudentStatus(studentId, "ABSENT", true);
      }
    }

    swipeRef.current = null;
    setSwipeOffsets((current) => ({ ...current, [studentId]: 0 }));
  }

  return (
    <div className="space-y-3">
      <div className="sticky z-30 -mx-1 bg-[linear-gradient(180deg,#eef3f8_0%,#eef3f8_82%,rgba(238,243,248,0)_100%)] px-1 pb-3" style={{ top: `${headerHeight}px` }}>
        <section className="overflow-hidden rounded-[10px] border border-black/5 bg-white">
          {/* 항상 표시되는 컴팩트 헤더 바 */}
          <button
            type="button"
            onClick={() => setIsSummaryCollapsed((current) => !current)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--division-color)]">
                모바일 출결
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[15px] font-bold text-slate-950">
                  {selectedPeriod ? selectedPeriod.name : "교시 선택"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {selectedDate}
                </span>
              </div>
              {selectedPeriod && (
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {selectedPeriod.startTime} – {selectedPeriod.endTime}
                </p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-slate-950">
                {summary.checkedCount}/{students.length}
              </p>
              <p className="text-[10px] text-slate-400">
                {summary.uncheckedCount > 0 ? `미처리 ${summary.uncheckedCount}명` : "완료"}
              </p>
            </div>

            <div className="shrink-0 rounded-[10px] bg-slate-100 p-1.5 text-slate-500">
              {isSummaryCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>

          {/* 펼쳐지는 상세 정보 + 컨트롤 */}
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ${
              isSummaryCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-t border-slate-100 px-4 pt-3 pb-2">
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--division-color)] transition-[width] duration-200"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
                    <Users className="h-3.5 w-3.5" />
                    대상 {students.length}명
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    미처리 {summary.uncheckedCount}명
                  </span>
                </div>
              </div>

              <div className="grid gap-3 px-4 py-4">
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-2 py-2.5 text-center">
                    <p className="text-[10px] font-semibold text-slate-400">대상</p>
                    <p className="mt-0.5 text-base font-bold text-slate-950">{students.length}</p>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-2 py-2.5 text-center">
                    <p className="text-[10px] font-semibold text-slate-400">미처리</p>
                    <p className="mt-0.5 text-base font-bold text-slate-950">{summary.uncheckedCount}</p>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-2 py-2.5 text-center">
                    <p className="text-[10px] font-semibold text-slate-400">출석</p>
                    <p className="mt-0.5 text-base font-bold text-emerald-600">{summary.presentCount}</p>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-2 py-2.5 text-center">
                    <p className="text-[10px] font-semibold text-slate-400">결석</p>
                    <p className="mt-0.5 text-base font-bold text-rose-600">{summary.absentCount}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                      <CalendarDays className="h-4 w-4" />
                      날짜
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                      <Clock3 className="h-4 w-4" />
                      교시
                    </span>
                    <select
                      value={selectedPeriodId}
                      onChange={(event) => setSelectedPeriodId(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    >
                      {periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name} ({period.startTime}-{period.endTime})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={refreshCurrentPeriod}
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    현재 교시 맞추기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOnlyUnchecked((current) => !current)}
                    className={`inline-flex items-center justify-center gap-2 rounded-[10px] border px-4 py-3 text-sm font-semibold transition ${
                      showOnlyUnchecked
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {showOnlyUnchecked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {showOnlyUnchecked ? "전체 보기" : "미처리만 보기"}
                  </button>
                  <button
                    type="button"
                    onClick={markAllPresent}
                    className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
                  >
                    전원 출석 처리
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-3 pb-24">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">학생 목록</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">학생 출결 체크</h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {visibleStudents.length}명 표시
          </span>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="이름, 수험번호, 연락처, 좌석, 강의실로 검색"
            className="w-full rounded-[10px] border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400"
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

        {isLoading ? (
          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            출석 정보를 불러오는 중입니다.
          </div>
        ) : null}

        {!isLoading && visibleStudents.length === 0 ? (
          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {hasSearchQuery
              ? "검색 조건에 맞는 학생이 없습니다."
              : showOnlyUnchecked
                ? "미처리 학생이 없습니다."
                : "출석 대상 학생이 없습니다."}
          </div>
        ) : null}

        {visibleStudents.map((student) => {
          const state = formState[student.id] ?? { status: "", reason: "" };
          const needsReason = state.status === "ABSENT" || state.status === "EXCUSED";
          const swipeOffset = swipeOffsets[student.id] ?? 0;
          const locationLabel = [student.studyRoomName, student.seatDisplay].filter(Boolean).join(" / ");

          return (
            <div
              key={student.id}
              className="relative overflow-hidden rounded-[10px] border border-black/5 bg-[linear-gradient(135deg,#eef4ff_0%,#f8fafc_48%,#ffffff_100%)] touch-pan-y"
              onTouchStart={(event) => handleSwipeStart(student.id, event)}
              onTouchMove={(event) => handleSwipeMove(student.id, event)}
              onTouchEnd={() => handleSwipeEnd(student.id)}
              onTouchCancel={() => handleSwipeEnd(student.id)}
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-xs font-semibold text-transparent">
                <span className="text-emerald-600">오른쪽으로 밀기 · 출석</span>
                오른쪽 밀기 · 출석
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-semibold text-transparent">
                <span className="text-rose-600">왼쪽으로 밀기 · 결석</span>
                왼쪽 밀기 · 결석
              </div>

              <article
                className={`relative rounded-[10px] border bg-white p-3.5 ${getStudentCardClasses(state.status)}`}
                style={{
                  transform: `translateX(${swipeOffset}px)`,
                  transition: swipeOffset === 0 ? "transform 150ms" : "none",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {locationLabel || "좌석 미배정"}
                    </p>
                    <h3 className="mt-1.5 text-base font-bold text-slate-950">{student.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{student.studentNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">{student.studyTrack || "직렬 미지정"}</p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getAttendanceStatusClasses(
                      state.status,
                    )}`}
                  >
                    {getAttendanceStatusLabel(state.status)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {QUICK_STATUS_BUTTONS.map((button) => {
                    const isActive = state.status === button.value;

                    return (
                      <button
                        key={button.value}
                        type="button"
                        onClick={() => applyStudentStatus(student.id, button.value)}
                        className={`rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition ${
                          isActive
                            ? button.activeClassName
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {button.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    기타 상태
                  </label>
                  <select
                    value={state.status}
                    onChange={(event) => applyStudentStatus(student.id, event.target.value as AttendanceOptionValue)}
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  >
                    {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {needsReason ? (
                  <div className="mt-3">
                    <input
                      value={state.reason}
                      onChange={(event) => updateStudentState(student.id, { reason: event.target.value })}
                      placeholder="사유를 입력해 주세요."
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>
                ) : null}
              </article>
            </div>
          );
        })}
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
}
