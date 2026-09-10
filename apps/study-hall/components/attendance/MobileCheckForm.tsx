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
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { toast } from "@/lib/sonner";

import { AdminTabs } from "@/components/ui/AdminTabs";
import { AttendanceSeatView } from "@/components/attendance/AttendanceSeatView";
import type { SeatLayout, StudyRoomItem } from "@/lib/services/seat.service";
import {
  ATTENDANCE_STATUS_OPTIONS,
  getAttendanceStatusLabel,
  kstMinutesOfDay,
  selectPeriodForCheck,
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
  /** 좌석 보기용. 넘기지 않으면 표만 보인다. */
  seatRooms?: StudyRoomItem[];
  initialSeatLayout?: SeatLayout;
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
  // 출결 상태색은 업무 의미가 있어 강조색으로 치환하지 않는다 (DESIGN.md 2).
  { label: "출석", value: "PRESENT", activeClassName: "text-attend-present" },
  { label: "지각", value: "TARDY", activeClassName: "text-attend-tardy" },
  { label: "결석", value: "ABSENT", activeClassName: "text-attend-absent" },
];

const QUICK_STATUS_VALUES = new Set<AttendanceOptionValue>(
  QUICK_STATUS_BUTTONS.map((button) => button.value),
);

/** 사유결석·휴무·반휴·해당없음처럼 빠른 버튼에 없는 상태인지. */
function isOtherStatus(status: AttendanceOptionValue) {
  return status !== "" && !QUICK_STATUS_VALUES.has(status);
}

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

const VIEW_TABS = [
  { id: "table" as const, label: "테이블" },
  { id: "seat" as const, label: "좌석" },
];

export function MobileCheckForm({
  divisionSlug,
  initialDate,
  initialPeriods,
  initialPeriodId,
  initialStudents,
  initialRecords,
  seatRooms,
  initialSeatLayout,
}: MobileCheckFormProps) {
  // 휴대폰 체크 화면과 같은 1차 탭이다. 좌석 배치도가 없으면 탭 자체를 세우지 않는다.
  const hasSeatLayout = Boolean(seatRooms?.length && initialSeatLayout);
  const [viewMode, setViewMode] = useState<"table" | "seat">("table");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  // 서버가 준 교시는 그 화면이 그려진 순간의 것이다. 조교는 출석부를 열어 두고 교시가
  // 바뀔 때마다 돌아오므로, 화면에서 현재 시각으로 다시 고른다. 손으로 교시를 고른 뒤에는
  // 건드리지 않는다 — 지난 교시를 정정하는 중일 수 있다.
  const [selectedPeriodId, setSelectedPeriodId] = useState(initialPeriodId ?? initialPeriods[0]?.id ?? "");
  const [pickedByHand, setPickedByHand] = useState(false);
  const [students, setStudents] = useState(initialStudents);
  const [periods] = useState(initialPeriods);

  // 오늘 화면이고 아직 손으로 고르지 않았다면, 현재 시각에 맞는 교시로 맞춘다.
  // 화면을 열어 둔 채 교시가 넘어가도 돌아왔을 때 그 교시가 잡혀 있다.
  useEffect(() => {
    if (pickedByHand || selectedDate !== initialDate) return;
    const sync = () => {
      const next = selectPeriodForCheck(periods, kstMinutesOfDay());
      if (next) setSelectedPeriodId((current) => (current === next.id ? current : next.id));
    };
    sync();
    // 렌더 검증 하네스에는 DOM 이 없다. 타이머·리스너 없이 한 번만 맞추고 끝낸다.
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(sync, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(timer); };
  }, [pickedByHand, selectedDate, initialDate, periods]);
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
  // 스와이프 중에는 "놓으면 무엇이 되는지" 만 들고 있는다. 예전에는 밀린 픽셀을 담아
  // <tr> 에 transform 으로 걸었는데, 표 행에 transform 을 주면 셀이 공통 열 너비를
  // 잃고 따로 배치돼 미는 동안 표가 무너져 보였다.
  const [swipeIntents, setSwipeIntents] = useState<Record<string, "PRESENT" | "ABSENT">>({});
  const [openOtherIds, setOpenOtherIds] = useState<Record<string, boolean>>({});
  // 자습실이 하나뿐이면 카드마다 같은 이름을 반복할 이유가 없다. 좌석 라벨만 남긴다.
  const showStudyRoomName = useMemo(
    () =>
      new Set(students.map((student) => student.studyRoomName).filter(Boolean)).size > 1,
    [students],
  );
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
    const headers = Array.from(document.querySelectorAll<HTMLElement>(".admin-mobile-topbar, header.admin-mobile-header"));
    const update = () => setHeaderHeight(Math.max(0, ...headers.map((header) => header.getBoundingClientRect().height)));
    update();
    const observer = new ResizeObserver(update);
    headers.forEach((header) => observer.observe(header));
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
      setSwipeIntents({});
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
        setSwipeIntents({});
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

  /**
   * 이미 기록된 칸(관리자가 미리 넣어둔 사유결석·휴무 등)은 건드리지 않고
   * 미처리 학생만 출석으로 채운다. 기존 기록을 바꾸려면 학생별로 직접 선택한다.
   */
  function markUncheckedPresent() {
    const targets = visibleStudents.filter((student) => !formState[student.id]?.status);

    if (targets.length === 0) {
      toast.message("미처리 학생이 없습니다. 기존 기록은 그대로 두었습니다.");
      return;
    }

    const targetIds = new Set(targets.map((student) => student.id));

    setFormState((current) => {
      const nextState: FormState = { ...current };

      for (const student of visibleStudents) {
        if (!targetIds.has(student.id) || current[student.id]?.status) {
          continue;
        }

        nextState[student.id] = { status: "PRESENT", reason: "" };
      }

      return nextState;
    });

    const skippedCount = visibleStudents.length - targets.length;
    toast.success(
      skippedCount > 0
        ? `미처리 ${targets.length}명을 출석 처리했습니다. 기존 기록 ${skippedCount}명은 그대로 두었습니다.`
        : `${targets.length}명을 출석 처리했습니다.`,
    );
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
      setSwipeIntents({});
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
      setSwipeIntents((current) => { const next = { ...current }; delete next[studentId]; return next; });
      return;
    }

    const threshold = Math.min(88, currentSwipe.width * 0.24);
    const intent = deltaX >= threshold ? "PRESENT" : deltaX <= -threshold ? "ABSENT" : null;

    cancelAnimationFrame(swipeRafRef.current);
    swipeRafRef.current = requestAnimationFrame(() => {
      setSwipeIntents((current) => {
        if (current[studentId] === intent) return current;
        const next = { ...current };
        if (intent) next[studentId] = intent; else delete next[studentId];
        return next;
      });
    });
  }

  function handleSwipeEnd(studentId: string) {
    const currentSwipe = swipeRef.current;
    const intent = swipeIntents[studentId];

    cancelAnimationFrame(swipeRafRef.current);

    if (currentSwipe?.studentId === studentId && intent) {
      applyStudentStatus(studentId, intent, true);
    }

    swipeRef.current = null;
    setSwipeIntents((current) => { const next = { ...current }; delete next[studentId]; return next; });
  }

  return (
    <div className="admin-check-workspace space-y-3">
      {/* DESIGN.md 5.4 — 보기 전체가 바뀌므로 1차 폴더 탭. 휴대폰 체크 화면과 같은 자리다. */}
      {hasSeatLayout ? (
        <AdminTabs
          items={VIEW_TABS}
          activeId={viewMode}
          onChange={setViewMode}
          label="출석 체크 보기"
          idPrefix="attendance-view"
        />
      ) : null}

      <div className="sticky z-20 -mx-1 bg-admin-surface px-1 pb-3" style={{ top: `${headerHeight}px` }}>
        <section className="admin-check-summary overflow-hidden rounded-lg border border-admin-line bg-white">
          {/* 항상 표시되는 컴팩트 헤더 바 */}
          <button
            type="button"
            onClick={() => setIsSummaryCollapsed((current) => !current)}
            aria-expanded={!isSummaryCollapsed}
            aria-controls="attendance-check-options"
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div className="min-w-0 flex-1">
              {/* 이 패널의 제목은 교시다. 위에 같은 뜻의 라벨을 덧붙이지 않는다 (DESIGN.md 1). */}
              <h2 className="admin-section-title">
                {selectedPeriod ? selectedPeriod.name : "교시 선택"}
                <span className="admin-help ml-2">{selectedDate}</span>
              </h2>
              {selectedPeriod && (
                <p className="admin-help mt-0.5">
                  {selectedPeriod.startTime} – {selectedPeriod.endTime}
                </p>
              )}
            </div>

            {/* 진행 수치는 섹션 제목이 아니다. 요약 값 규격(20px)을 쓴다. */}
            <div className="shrink-0 text-right">
              <p className="admin-metric-box-value">
                {summary.checkedCount}/{students.length}
              </p>
              <p className="admin-help">
                {summary.uncheckedCount > 0 ? `미처리 ${summary.uncheckedCount}명` : "완료"}
              </p>
            </div>

            <div className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-500">
              {isSummaryCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>

          {/* 펼쳐지는 상세 정보 + 컨트롤 */}
          <div
            id="attendance-check-options"
            hidden={isSummaryCollapsed}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-t border-slate-100 px-4 pt-3 pb-2">
                <div className="h-2 rounded-lg bg-admin-surface-muted">
                  <div
                    className="h-full rounded-lg bg-[var(--division-color)] transition-[width] duration-200"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 px-4 py-4">
                <div className="admin-metric-strip">
                  <div className="admin-metric-box">
                    <p className="admin-metric-box-label">대상</p>
                    <p className="admin-metric-box-value">{students.length}</p>
                  </div>
                  <div className="admin-metric-box">
                    <p className="admin-metric-box-label">미처리</p>
                    <p className="admin-metric-box-value">{summary.uncheckedCount}</p>
                  </div>
                  <div className="admin-metric-box">
                    <p className="admin-metric-box-label">출석</p>
                    {/* 출결 상태색은 업무 의미가 있어 강조색으로 치환하지 않는다 (DESIGN.md 2). */}
                    <p className="admin-metric-box-value text-attend-present">{summary.presentCount}</p>
                  </div>
                  <div className="admin-metric-box">
                    <p className="admin-metric-box-label">결석</p>
                    <p className="admin-metric-box-value text-attend-absent">{summary.absentCount}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="admin-label mb-2 flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      날짜
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      className="w-full"
                    />
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 flex items-center gap-2">
                      <Clock3 className="h-4 w-4" />
                      교시
                    </span>
                    <select
                      value={selectedPeriodId}
                      onChange={(event) => { setPickedByHand(true); setSelectedPeriodId(event.target.value); }}
                      className="w-full"
                    >
                      {periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name} ({period.startTime}-{period.endTime})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div>
                  <span className="admin-label mb-2 block">표시 범위</span>
                  <div className="admin-choice-group" role="group" aria-label="표시 범위">
                    <button
                      type="button"
                      onClick={() => setShowOnlyUnchecked(false)}
                      aria-pressed={!showOnlyUnchecked}
                      className="admin-choice-button"
                    >
                      <Eye className="h-4 w-4" />
                      전체
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowOnlyUnchecked(true)}
                      aria-pressed={showOnlyUnchecked}
                      className="admin-choice-button"
                    >
                      <EyeOff className="h-4 w-4" />
                      미처리만
                    </button>
                  </div>
                </div>

                {/* 주 실행은 저장 하나뿐이다. 나머지는 글자로 둔다 (DESIGN.md 5.6). */}
                <div className="flex flex-wrap items-center gap-x-4 border-t border-admin-line-soft pt-1">
                  <button
                    type="button"
                    onClick={refreshCurrentPeriod}
                    className="admin-text-action inline-flex items-center gap-1"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    현재 교시 맞추기
                  </button>
                  <button
                    type="button"
                    onClick={markUncheckedPresent}
                    className="admin-text-action"
                  >
                    미처리 전원 출석
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="admin-button admin-button-primary ml-auto max-md:hidden"
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

      <section className="admin-section">
        <div className="admin-workspace-toolbar">
          <h2 className="admin-section-title">학생 출결 체크</h2>
          <span className="admin-badge">{visibleStudents.length}명 표시</span>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="이름, 수험번호, 연락처, 좌석, 강의실로 검색"
            className="w-full pl-11 pr-11"
          />
          {hasSearchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-admin-text-muted transition hover:text-admin-text"
              aria-label="검색어 지우기"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>

        {isLoading ? (
          <div className="admin-notice">출석 정보를 불러오는 중입니다.</div>
        ) : null}

        {!isLoading && visibleStudents.length === 0 ? (
          <div className="admin-empty-state">
            <p className="font-semibold">
              {hasSearchQuery
                ? "검색 조건에 맞는 학생이 없습니다."
                : showOnlyUnchecked
                  ? "미처리 학생이 없습니다."
                  : "출석 대상 학생이 없습니다."}
            </p>
            <p className="admin-help mt-2">
              {selectedDate} · {selectedPeriod ? selectedPeriod.name : "교시 미선택"}
            </p>
          </div>
        ) : null}

        {/* DESIGN.md 5.8 — 명단은 카드가 아니라 표다. 선은 globals.css 가 긋는다.
            좁은 화면에서는 좌석·기타 열을 학생/출결 칸으로 접어 가로 스크롤을 피한다. */}
        {viewMode === "table" ? (
          <div className="admin-table-frame">
            <table>
              <thead>
                <tr>
                  <th>좌석</th>
                  <th>학생</th>
                  <th>출결</th>
                  <th className="hidden sm:table-cell">기타 상태</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => {
                  const state = formState[student.id] ?? { status: "", reason: "" };
                  const needsReason = state.status === "ABSENT" || state.status === "EXCUSED";
                  const swipeIntent = swipeIntents[student.id];
                  const hasOtherStatus = isOtherStatus(state.status);
                  // 이미 기타 상태가 지정된 행은 무엇이 걸렸는지 바로 보이도록 펼쳐 둔다.
                  const isOtherOpen = openOtherIds[student.id] ?? hasOtherStatus;
                  // seatDisplay 는 `자습실 / 좌석` 이라 자습실이 하나뿐이면 좌석만 남긴다.
                  const locationLabel = showStudyRoomName
                    ? student.seatDisplay ?? student.seatLabel ?? "좌석 미배정"
                    : student.seatLabel ?? "좌석 미배정";

                  return (
                    <tr
                      key={student.id}
                      className="touch-pan-y"
                      data-swipe={swipeIntent}
                      onTouchStart={(event) => handleSwipeStart(student.id, event)}
                      onTouchMove={(event) => handleSwipeMove(student.id, event)}
                      onTouchEnd={() => handleSwipeEnd(student.id)}
                      onTouchCancel={() => handleSwipeEnd(student.id)}
                    >
                      <td>{locationLabel}</td>

                      <td className="admin-table-name">
                        {student.name}
                        <span className="admin-help block">{student.studentNumber}</span>
                      </td>

                      <td>
                        <div className="flex flex-wrap justify-center gap-1">
                          {QUICK_STATUS_BUTTONS.map((button) => {
                            const isActive = state.status === button.value;

                            return (
                              <button
                                key={button.value}
                                type="button"
                                onClick={() => applyStudentStatus(student.id, button.value)}
                                aria-pressed={isActive}
                                className={`admin-status-button transition ${ isActive ? button.activeClassName : "" }`}
                              >
                                {button.label}
                              </button>
                            );
                          })}

                          {/* 640px 미만에는 기타 상태 열이 없다. 같은 줄의 토글로 연다. */}
                          <button
                            type="button"
                            onClick={() =>
                              setOpenOtherIds((current) => ({
                                ...current,
                                [student.id]: !isOtherOpen,
                              }))
                            }
                            aria-expanded={isOtherOpen}
                            aria-pressed={hasOtherStatus}
                            className="admin-status-button transition sm:hidden"
                          >
                            {hasOtherStatus ? getAttendanceStatusLabel(state.status) : "기타"}
                          </button>
                        </div>

                        {isOtherOpen ? (
                          <select
                            value={state.status}
                            onChange={(event) =>
                              applyStudentStatus(student.id, event.target.value as AttendanceOptionValue)
                            }
                            aria-label={`${student.name} 기타 상태`}
                            className="mt-1 block w-full sm:hidden"
                          >
                            {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                              <option key={option.value || "empty"} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {needsReason ? (
                          <input
                            value={state.reason}
                            onChange={(event) =>
                              updateStudentState(student.id, { reason: event.target.value })
                            }
                            placeholder="사유"
                            aria-label={`${student.name} 사유`}
                            className="mt-1 block w-full"
                          />
                        ) : null}
                      </td>

                      <td className="hidden sm:table-cell">
                        <select
                          value={state.status}
                          onChange={(event) =>
                            applyStudentStatus(student.id, event.target.value as AttendanceOptionValue)
                          }
                          aria-label={`${student.name} 기타 상태`}
                          className="block w-full"
                        >
                          {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                            <option key={option.value || "empty"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* 좌석 보기. 지금 고른 교시 한 칸만 다루므로 행렬은 그 교시로만 만든다. */}
        {viewMode === "seat" && hasSeatLayout && selectedPeriod ? (
          <AttendanceSeatView
            divisionSlug={divisionSlug}
            rooms={seatRooms!}
            initialSeatLayout={initialSeatLayout!}
            students={visibleStudents}
            periods={[selectedPeriod]}
            matrix={Object.fromEntries(
              visibleStudents.map((student) => [
                student.id,
                { [selectedPeriod.id]: formState[student.id] ?? { status: "", reason: "" } },
              ]),
            )}
            onUpdateCell={(studentId, _periodId, value) => updateStudentState(studentId, value)}
            // 이 화면은 교시 하나를 통째로 저장한다. 좌석에서 한 명을 저장해도
            // 같은 저장 경로를 태워, 표에서 고친 다른 학생이 뒤에 남지 않는다.
            onSaveStudent={async () => { await handleSave(); }}
          />
        ) : null}
      </section>

      <div className="admin-check-savebar md:hidden">
        <span className="admin-help">{selectedPeriod?.name ?? "교시 선택"} · 미처리 {summary.uncheckedCount}명</span>
        <button type="button" onClick={handleSave} disabled={isSaving || isLoading} className="admin-button admin-button-primary">
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "저장 중..." : "저장"}
        </button>
      </div>

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
