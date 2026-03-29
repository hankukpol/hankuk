"use client";

import Link from "next/link";
import { AttendType, ExamType, Subject } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  BulkSelectHeaderCheckbox,
  BulkSelectRowCheckbox,
  BulkSelectionActionBar,
} from "@/components/ui/bulk-select-table";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import {
  ATTEND_TYPE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  EXAM_TYPE_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getScoreSubjectLabel, type ScoreSubjectLabelMap } from "@/lib/scores/subject-filter";
import { useEffect, useMemo, useState, useTransition } from "react";

type SessionOption = {
  id: number;
  examType: "GONGCHAE" | "GYEONGCHAE";
  week: number;
  subject: Subject;
  displaySubjectName?: string | null;
  examDate: string;
  isCancelled: boolean;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
};

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: SessionOption[];
};

type ScoreRow = {
  id: number;
  examNumber: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  note: string | null;
  sourceType: string;
  student: {
    name: string;
    examType: string;
    mobile: string | null;
    enrollments: Array<{
      id: string;
      label: string;
      status: string;
    }>;
  } | null;
};

type EditDraft = {
  rawScore: string;
  oxScore: string;
  attendType: AttendType;
  note: string;
};

type ScoreEditPanelProps = {
  periods: PeriodOption[];
  subjectLabelMap: ScoreSubjectLabelMap;
  initialSessionId?: number | null;
  initialExamNumber?: string | null;
};

const MONTH_NAMES = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatKoreanDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_NAMES[date.getDay()]})`;
}

function formatSessionLabel(session: SessionOption, subjectLabelMap: ScoreSubjectLabelMap) {
  return `${session.week}주차 · ${EXAM_TYPE_LABEL[session.examType]} · ${getScoreSubjectLabel(
    session.subject,
    session.displaySubjectName ?? null,
    subjectLabelMap,
  )}`;
}

function sessionDateKey(session: SessionOption) {
  return formatDate(session.examDate);
}

function findTodaySelection(periods: PeriodOption[], todayKey: string) {
  for (const period of periods) {
    const todaySession = period.sessions.find((session) => sessionDateKey(session) === todayKey);
    if (todaySession) {
      return {
        dateKey: todayKey,
        sessionId: String(todaySession.id),
      };
    }
  }

  return {
    dateKey: todayKey,
    sessionId: "",
  };
}

function findSessionSelection(periods: PeriodOption[], targetSessionId: number) {
  for (const period of periods) {
    const session = period.sessions.find((s) => s.id === targetSessionId);
    if (session) {
      return {
        dateKey: sessionDateKey(session),
        sessionId: String(session.id),
      };
    }
  }
  return null;
}

function StudentIdentityBlock({ score }: { score: ScoreRow }) {
  const visibleEnrollments = score.student?.enrollments.slice(0, 2) ?? [];
  const hiddenEnrollmentCount = (score.student?.enrollments.length ?? 0) - visibleEnrollments.length;

  return (
    <div className="space-y-1.5">
      {score.student ? (
        <Link
          href={`/admin/students/${encodeURIComponent(score.examNumber)}`}
          className="inline-flex items-center text-sm font-semibold text-ink transition hover:text-ember"
        >
          {score.student.name}
        </Link>
      ) : (
        <div className="text-sm font-medium text-ink">-</div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate">
        <span className="font-mono">{score.examNumber}</span>
        {score.student?.mobile ? (
          <span>{score.student.mobile}</span>
        ) : (
          <span className="text-amber-700">연락처 없음</span>
        )}
        {score.student?.examType ? (
          <span className="rounded-full bg-ink/5 px-1.5 py-0.5 font-semibold text-slate">
            {EXAM_TYPE_LABEL[score.student.examType as ExamType]}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visibleEnrollments.length > 0 ? (
          <>
            {visibleEnrollments.map((enrollment) => (
              <span
                key={enrollment.id}
                className="rounded-full border border-ink/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate"
              >
                {enrollment.label} · {ENROLLMENT_STATUS_LABEL[enrollment.status as keyof typeof ENROLLMENT_STATUS_LABEL] ?? enrollment.status}
              </span>
            ))}
            {hiddenEnrollmentCount > 0 ? (
              <span className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                외 {hiddenEnrollmentCount}건
              </span>
            ) : null}
          </>
        ) : (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            수강내역 없음
          </span>
        )}
      </div>
    </div>
  );
}

export function ScoreEditPanel({
  periods,
  subjectLabelMap,
  initialSessionId,
  initialExamNumber,
}: ScoreEditPanelProps) {
  const today = new Date();
  const todayKey = toDateKey(today);

  // If initialSessionId is provided, try to pre-select that session; fall back to today
  const initialSelection = (() => {
    if (initialSessionId) {
      const found = findSessionSelection(periods, initialSessionId);
      if (found) return found;
    }
    return findTodaySelection(periods, todayKey);
  })();

  // When jumping to a pre-selected session, scroll/jump the calendar to that month
  const initialDate = initialSelection.dateKey ? new Date(`${initialSelection.dateKey}T00:00:00`) : today;

  const [periodOptions, setPeriodOptions] = useState(periods);
  const [calendarYear, setCalendarYear] = useState(initialDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(initialDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelection.dateKey);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(initialSelection.sessionId);
  const [searchQuery, setSearchQuery] = useState(initialExamNumber?.trim() ?? "");
  const [scores, setScores] = useState<ScoreRow[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, EditDraft>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [selectedScoreIds, setSelectedScoreIds] = useState<number[]>([]);
  const [didRunInitialLookup, setDidRunInitialLookup] = useState(false);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Array<SessionOption & { periodName: string }>>();

    for (const period of periodOptions) {
      for (const session of period.sessions) {
        const key = sessionDateKey(session);
        const current = map.get(key) ?? [];
        current.push({ ...session, periodName: period.name });
        map.set(
          key,
          current.sort((left, right) => {
            if (left.examDate !== right.examDate) {
              return left.examDate.localeCompare(right.examDate);
            }
            if (left.examType !== right.examType) {
              return left.examType.localeCompare(right.examType);
            }
            return left.subject.localeCompare(right.subject);
          }),
        );
      }
    }

    return map;
  }, [periodOptions]);

  const sessionsForSelectedDate = selectedDate ? sessionsByDate.get(selectedDate) ?? [] : [];
  const selectedSession =
    sessionsForSelectedDate.find((session) => String(session.id) === selectedSessionId) ?? null;
  const selectedSessionLocked = selectedSession?.isLocked ?? false;

  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

  async function requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: init?.cache ?? "no-store",
    });
    const text = await response.text();
    const payload = text.trim() ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });

    if (!response.ok) {
      throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
    }

    return payload as T;
  }

  function resetMessages() {
    setNotice(null);
    setErrorMessage(null);
  }

  function run(action: () => Promise<void>) {
    resetMessages();
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "작업 처리 중 오류가 발생했습니다.");
      }
    });
  }

  function handleSessionUpdated(updatedSession: SessionOption) {
    setPeriodOptions((current) =>
      current.map((period) => ({
        ...period,
        sessions: period.sessions.map((session) =>
          session.id === updatedSession.id ? { ...session, ...updatedSession } : session,
        ),
      })),
    );
    setSelectedDate(sessionDateKey(updatedSession));
    setSelectedSessionId(String(updatedSession.id));
  }

  function prevMonth() {
    if (calendarMonth === 0) {
      setCalendarYear((value) => value - 1);
      setCalendarMonth(11);
      return;
    }
    setCalendarMonth((value) => value - 1);
  }

  function nextMonth() {
    if (calendarMonth === 11) {
      setCalendarYear((value) => value + 1);
      setCalendarMonth(0);
      return;
    }
    setCalendarMonth((value) => value + 1);
  }

  function goToToday() {
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());

    const todaySessions = sessionsByDate.get(todayKey) ?? [];

    setSelectedDate(todayKey);
    setSelectedSessionId(todaySessions.length > 0 ? String(todaySessions[0].id) : "");
    setScores(null);
    setEditingId(null);
    setDrafts({});
    resetMessages();
    setPage(1);
  }

  function handleDateClick(dateKey: string) {
    const sessions = sessionsByDate.get(dateKey) ?? [];

    setSelectedDate(dateKey);
    setSelectedSessionId(sessions.length > 0 ? (sessions.length === 1 ? String(sessions[0].id) : "") : "");
    setScores(null);
    setEditingId(null);
    setDrafts({});
    resetMessages();
    setPage(1);
  }

  function getDraft(score: ScoreRow) {
    return (
      drafts[score.id] ?? {
        rawScore: score.rawScore?.toString() ?? "",
        oxScore: score.oxScore?.toString() ?? "",
        attendType: score.attendType,
        note: score.note ?? "",
      }
    );
  }

  function patchDraft(score: ScoreRow, patch: Partial<EditDraft>) {
    setDrafts((current) => ({
      ...current,
      [score.id]: {
        ...getDraft(score),
        ...patch,
      },
    }));
  }

  async function loadScoresFor(sessionId: string, query: string) {
    const params = new URLSearchParams({ sessionId });
    if (query.trim()) {
      params.set("query", query.trim());
    }

    const payload = await requestJson<{ scores: ScoreRow[] }>(`/api/scores?${params.toString()}`);
    setScores(payload.scores);
    setEditingId(null);
    setDrafts({});
    setSelectedScoreIds([]);
    setPage(1);
    setNotice(payload.scores.length === 0 ? "조회된 성적이 없습니다." : `성적 ${payload.scores.length}건을 불러왔습니다.`);
  }

  function searchScores() {
    if (!selectedSessionId) {
      setErrorMessage("조회할 회차를 선택해 주세요.");
      return;
    }

    run(async () => {
      await loadScoresFor(selectedSessionId, searchQuery);
    });
  }

  function saveScore(score: ScoreRow) {
    const draft = getDraft(score);

    run(async () => {
      await requestJson(`/api/scores/${score.id}`, {
        method: "PUT",
        body: JSON.stringify({
          rawScore: draft.rawScore === "" ? null : Number(draft.rawScore),
          oxScore: draft.oxScore === "" ? null : Number(draft.oxScore),
          attendType: draft.attendType,
          note: draft.note || null,
        }),
      });
      setEditingId(null);
      await searchScores();
      setNotice("성적을 수정했습니다.");
    });
  }

  function deleteScore(scoreId: number) {
    if (selectedSessionLocked) {
      setErrorMessage("잠금된 회차에서는 성적을 삭제할 수 없습니다.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: "성적 삭제",
      description: "선택한 성적을 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.",
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        run(async () => {
          await requestJson(`/api/scores/${scoreId}`, { method: "DELETE" });
          setScores((current) => current?.filter((score) => score.id !== scoreId) ?? null);
          if (editingId === scoreId) {
            setEditingId(null);
          }
          setNotice("성적을 삭제했습니다.");
        });
      },
    });
  }

  function toggleScoreSelection(scoreId: number, checked: boolean) {
    setSelectedScoreIds((current) =>
      checked ? Array.from(new Set([...current, scoreId])) : current.filter((value) => value !== scoreId),
    );
  }

  function toggleCurrentPageScoreSelection(checked: boolean) {
    setSelectedScoreIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...currentPageScoreIds]));
      }

      return current.filter((scoreId) => !currentPageScoreIds.includes(scoreId));
    });
  }

  function clearSelectedScores() {
    setSelectedScoreIds([]);
  }

  function deleteSelectedScores() {
    if (selectedSessionLocked) {
      setErrorMessage("잠금된 회차에서는 성적을 삭제할 수 없습니다.");
      return;
    }

    if (selectedScoreIds.length === 0) {
      setErrorMessage("삭제할 성적을 선택해 주세요.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "선택 삭제 확인",
      badgeTone: "warning",
      title: "선택 성적 일괄 삭제",
      description: `선택한 성적 ${selectedScoreIds.length}건을 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.`,
      cancelLabel: "취소",
      confirmLabel: "일괄 삭제",
      confirmTone: "danger",
      onConfirm: () => {
        const targetIds = [...selectedScoreIds];
        confirmModal.closeModal();
        run(async () => {
          const payload = await requestJson<{ deletedCount: number }>("/api/scores/bulk", {
            method: "POST",
            body: JSON.stringify({
              mode: "deleteScores",
              sessionId: Number(selectedSessionId),
              scoreIds: targetIds,
            }),
          });
          setScores((current) => current?.filter((score) => !targetIds.includes(score.id)) ?? null);
          setSelectedScoreIds([]);
          setDrafts((current) =>
            Object.fromEntries(
              Object.entries(current).filter(([key]) => !targetIds.includes(Number(key))),
            ) as Record<number, EditDraft>,
          );
          if (editingId !== null && targetIds.includes(editingId)) {
            setEditingId(null);
          }
          setNotice(`선택한 성적 ${payload.deletedCount}건을 삭제했습니다.`);
        });
      },
    });
  }

  function deleteSelectedSession() {
    if (!selectedSession) {
      setErrorMessage("삭제할 회차를 먼저 선택해 주세요.");
      return;
    }

    if (selectedSessionLocked) {
      setErrorMessage("잠금된 회차에서는 회차 전체 삭제를 진행할 수 없습니다.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "전체 삭제 확인",
      badgeTone: "warning",
      title: "선택 회차 전체 삭제",
      description: `${formatKoreanDate(sessionDateKey(selectedSession))} ${EXAM_TYPE_LABEL[selectedSession.examType]} ${getScoreSubjectLabel(
        selectedSession.subject,
        selectedSession.displaySubjectName,
        subjectLabelMap,
      )} 회차의 성적, 문항, 정답, 북마크 데이터를 모두 삭제합니다.`,
      details: ["삭제된 데이터는 즉시 반영되며 복구할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "전체 삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        run(async () => {
          const payload = await requestJson<{
            deletedScoreCount: number;
            deletedQuestionCount: number;
            deletedAnswerCount: number;
            deletedBookmarkCount: number;
          }>("/api/scores/bulk", {
            method: "POST",
            body: JSON.stringify({ mode: "deleteSession", sessionId: Number(selectedSessionId) }),
          });
          setScores([]);
          setSelectedScoreIds([]);
          setEditingId(null);
          setDrafts({});
          setNotice(
            `회차 전체를 삭제했습니다. 성적 ${payload.deletedScoreCount}건, 문항 ${payload.deletedQuestionCount}건, 정답 ${payload.deletedAnswerCount}건, 북마크 ${payload.deletedBookmarkCount}건이 정리되었습니다.`,
          );
        });
      },
    });
  }

  function toggleSessionLock() {
    if (!selectedSession) {
      setErrorMessage("잠금 상태를 변경할 회차를 선택해 주세요.");
      return;
    }

    run(async () => {
      const payload = await requestJson<{ session: SessionOption }>(`/api/sessions/${selectedSession.id}`, {
        method: "PUT",
        body: JSON.stringify({ isLocked: !selectedSession.isLocked }),
      });
      handleSessionUpdated(payload.session);
      setEditingId(null);
      setNotice(payload.session.isLocked ? "회차를 잠금 처리했습니다." : "회차 잠금을 해제했습니다.");
    });
  }

  const totalPages = Math.max(1, Math.ceil((scores?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedScores = scores?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? [];
  const currentPageScoreIds = pagedScores.map((score) => score.id);
  const allCurrentPageSelected =
    currentPageScoreIds.length > 0 &&
    currentPageScoreIds.every((scoreId) => selectedScoreIds.includes(scoreId));
  const someCurrentPageSelected =
    currentPageScoreIds.some((scoreId) => selectedScoreIds.includes(scoreId)) && !allCurrentPageSelected;

  useEffect(() => {
    setSelectedScoreIds([]);
  }, [currentPage, pageSize, selectedSessionId]);

  useEffect(() => {
    if (initialExamNumber && !initialSessionId) {
      setNotice("학생 검색어가 미리 입력되었습니다. 회차를 선택한 뒤 조회하세요.");
    }
  }, [initialExamNumber, initialSessionId]);

  useEffect(() => {
    if (didRunInitialLookup) {
      return;
    }
    if (!initialSessionId || selectedSessionId !== String(initialSessionId)) {
      return;
    }

    setDidRunInitialLookup(true);
    run(async () => {
      await loadScoresFor(String(initialSessionId), searchQuery);
    });
  }, [didRunInitialLookup, initialSessionId, searchQuery, selectedSessionId]);

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">시험 날짜 선택</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          달력에서 시험이 있는 날짜를 선택한 뒤 회차를 고르면 성적을 조회하고 수정할 수 있습니다.
        </p>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-sm font-semibold transition hover:border-ink/30 hover:bg-mist"
          >
            ←
          </button>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{calendarYear}년 {MONTH_NAMES[calendarMonth]}</span>
            <button
              type="button"
              onClick={goToToday}
              className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              오늘
            </button>
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-sm font-semibold transition hover:border-ink/30 hover:bg-mist"
          >
            →
          </button>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-7 text-center">
            {DAY_NAMES.map((day, index) => (
              <div
                key={day}
                className={`py-2 text-xs font-semibold ${
                  index === 0 ? "text-red-500" : index === 6 ? "text-blue-500" : "text-slate"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-y-1">
            {Array.from({ length: totalCells }).map((_, cellIndex) => {
              const dayNumber = cellIndex - firstDayOfMonth + 1;
              if (dayNumber < 1 || dayNumber > daysInMonth) {
                return <div key={cellIndex} className="h-16 border border-slate-200 bg-mist/20" />;
              }

              const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(
                dayNumber,
              ).padStart(2, "0")}`;
              const sessions = sessionsByDate.get(dateKey) ?? [];
              const isSelected = selectedDate === dateKey;
              const isToday = todayKey === dateKey;
              const dayOfWeek = (firstDayOfMonth + dayNumber - 1) % 7;
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => handleDateClick(dateKey)}
                  className={[
                    "relative flex h-16 flex-col items-center justify-center border border-slate-200 text-sm transition",
                    isSelected ? "border-ember bg-ember font-semibold text-white" : "bg-white",
                    isToday && !isSelected ? "border-ember/40" : "",
                    sessions.length > 0 && !isSelected ? "hover:border-ember/30 hover:bg-ember/5" : "",
                    sessions.length === 0 ? "text-ink/30 hover:border-ember/20 hover:bg-mist/40" : "",
                    !isSelected && isSunday ? "text-red-500" : "",
                    !isSelected && isSaturday ? "text-blue-500" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span>{dayNumber}</span>
                  {sessions.length > 0 ? (
                    <span className="mt-1 flex gap-1">
                      {sessions.slice(0, 3).map((session) => (
                        <span
                          key={session.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? "bg-white/80" : session.isCancelled ? "bg-ink/20" : "bg-ember"
                          }`}
                        />
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ember" />
            시험 있음
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink/20" />
            취소 회차 포함
          </span>
        </div>

        {selectedDate ? (
          <div className="mt-6 border-t border-ink/10 pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink">{formatKoreanDate(selectedDate)}</span>
              <div className="flex flex-wrap gap-2">
                {sessionsForSelectedDate.length === 0 ? <span className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs text-slate">이 날짜에 표시할 성적이 없습니다.</span> : null}
                {sessionsForSelectedDate.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setSelectedSessionId(String(session.id));
                      setScores(null);
                    }}
                    className={[
                      "rounded-full border px-4 py-2 text-sm font-semibold transition",
                      String(session.id) === selectedSessionId
                        ? "border-ember bg-ember text-white"
                        : "border-ink/10 hover:border-ember/30 hover:text-ember",
                      session.isCancelled ? "opacity-60 line-through" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {formatSessionLabel(session, subjectLabelMap)}
                    {session.isCancelled ? " [취소]" : ""}
                    {session.isLocked ? " [잠금]" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate">
              {selectedSession?.isLocked ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">잠금됨</span> : null}
              {selectedSession?.lockedAt ? <span>잠금 일시 {formatKoreanDate(selectedSession.lockedAt.slice(0, 10))}</span> : null}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">이름, 수험번호 또는 연락처 검색</label>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      searchScores();
                    }
                  }}
                  className="w-64 rounded-2xl border border-ink/10 px-4 py-2.5 text-sm"
                  placeholder="이름, 수험번호, 연락처"
                />
              </div>
              <button
                type="button"
                onClick={searchScores}
                disabled={isPending || !selectedSessionId}
                className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                {isPending ? "조회 중..." : "성적 조회"}
              </button>
              <button
                type="button"
                onClick={toggleSessionLock}
                disabled={isPending || !selectedSession}
                className={`inline-flex items-center rounded-full border px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate ${selectedSessionLocked ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-ink/10 hover:border-amber-300 hover:text-amber-700"}`}
              >
                {selectedSessionLocked ? "잠금 해제" : "회차 잠금"}
              </button>
              <button
                type="button"
                onClick={deleteSelectedSession}
                disabled={isPending || !selectedSessionId || selectedSessionLocked}
                className="inline-flex items-center rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate"
              >
                회차 전체 삭제
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-ink/15 px-5 py-8 text-center text-sm text-slate">
            달력에서 시험 날짜를 선택해 주세요.
          </div>
        )}
      </section>

      {notice ? <div role="status" aria-live="polite" className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{notice}</div> : null}
      {errorMessage ? <div role="alert" aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {selectedSessionLocked ? (
        <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          잠금된 회차입니다. 성적 조회는 가능하지만 수정, 삭제, 전체 삭제는 비활성화됩니다.
        </div>
      ) : null}

      {scores !== null ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">성적 목록 {selectedSession ? `· ${formatSessionLabel(selectedSession, subjectLabelMap)}` : ""}</h2>
          </div>
          <div className="mt-4 overflow-hidden rounded-[24px] border border-ink/10">
            <PaginationControls
              totalCount={scores.length}
              page={currentPage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
              itemLabel="건"
            />
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <caption className="sr-only">Score table for the selected session with editable rows.</caption>
                <thead className="bg-mist text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <BulkSelectHeaderCheckbox
                        checked={allCurrentPageSelected}
                        indeterminate={someCurrentPageSelected}
                        disabled={pagedScores.length === 0}
                        onChange={toggleCurrentPageScoreSelection}
                        ariaLabel="현재 페이지 성적 전체 선택"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">수험번호 / 이름</th>
                    <th className="px-4 py-3 font-semibold">원점수</th>
                    <th className="px-4 py-3 font-semibold">OX</th>
                    <th className="px-4 py-3 font-semibold">최종점수</th>
                    <th className="px-4 py-3 font-semibold">응시 유형</th>
                    <th className="px-4 py-3 font-semibold">메모</th>
                    <th className="px-4 py-3 font-semibold">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 bg-white">
                  {pagedScores.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate">조회된 성적이 없습니다.</td>
                    </tr>
                  ) : null}
                  {pagedScores.map((score) => {
                    const draft = getDraft(score);
                    const isEditing = editingId === score.id;
                    return (
                      <tr key={score.id} className={isEditing || selectedScoreIds.includes(score.id) ? "bg-amber-50/40" : ""}>
                        <td className="px-4 py-3">
                          <BulkSelectRowCheckbox
                            checked={selectedScoreIds.includes(score.id)}
                            onChange={(checked) => toggleScoreSelection(score.id, checked)}
                            ariaLabel={`${score.examNumber} 성적 선택`}
                          />
                        </td>
                        <td className="px-4 py-3">
  <StudentIdentityBlock score={score} />
</td>
                        {isEditing ? (
                          <>
                            <td className="px-4 py-3">
                              <input type="number" value={draft.rawScore} onChange={(event) => patchDraft(score, { rawScore: event.target.value })} className="w-20 rounded-xl border border-ink/10 px-2 py-1 text-sm" placeholder="-" />
                            </td>
                            <td className="px-4 py-3">
                              <input type="number" value={draft.oxScore} onChange={(event) => patchDraft(score, { oxScore: event.target.value })} className="w-20 rounded-xl border border-ink/10 px-2 py-1 text-sm" placeholder="-" />
                            </td>
                            <td className="px-4 py-3 text-slate">자동 계산</td>
                            <td className="px-4 py-3">
                              <select value={draft.attendType} onChange={(event) => patchDraft(score, { attendType: event.target.value as AttendType })} className="rounded-xl border border-ink/10 px-2 py-1 text-sm">
                                {Object.values(AttendType).map((type) => (
                                  <option key={type} value={type}>{ATTEND_TYPE_LABEL[type]}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input value={draft.note} onChange={(event) => patchDraft(score, { note: event.target.value })} className="w-40 rounded-xl border border-ink/10 px-2 py-1 text-sm" placeholder="메모" />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => saveScore(score)} disabled={isPending || selectedSessionLocked} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white transition hover:bg-forest disabled:opacity-50">저장</button>
                                <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ink/30">취소</button>
                                <button type="button" onClick={() => deleteScore(score.id)} disabled={isPending || selectedSessionLocked} className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50">삭제</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">{score.rawScore ?? "-"}</td>
                            <td className="px-4 py-3">{score.oxScore ?? "-"}</td>
                            <td className="px-4 py-3">{score.finalScore ?? "-"}</td>
                            <td className="px-4 py-3">{ATTEND_TYPE_LABEL[score.attendType]}</td>
                            <td className="px-4 py-3 text-slate">{score.note ?? "-"}</td>
                            <td className="px-4 py-3">
                              <button type="button" onClick={() => setEditingId(score.id)} disabled={selectedSessionLocked} className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">수정</button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 pt-4 sm:hidden">
              <button
                type="button"
                onClick={() => toggleCurrentPageScoreSelection(!allCurrentPageSelected)}
                disabled={pagedScores.length === 0}
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allCurrentPageSelected ? "현재 페이지 선택 해제" : "현재 페이지 전체 선택"}
              </button>
            </div>
            <div className="space-y-4 px-4 pb-4 sm:hidden">
              {pagedScores.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
                  표시할 성적이 없습니다.
                </div>
              ) : (
                pagedScores.map((score) => {
                  const draft = getDraft(score);
                  const isEditing = editingId === score.id;
                  const isSelected = selectedScoreIds.includes(score.id);

                  return (
                    <article
                      key={score.id}
                      className={`rounded-[24px] border p-4 shadow-sm ${
                        isEditing || isSelected
                          ? "border-ember/30 bg-amber-50/40"
                          : "border-ink/10 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
  <StudentIdentityBlock score={score} />
  <BulkSelectRowCheckbox
                          checked={isSelected}
                          onChange={(checked) => toggleScoreSelection(score.id, checked)}
                          ariaLabel={`${score.examNumber} 성적 선택`}
                        />
                      </div>

                      {isEditing ? (
                        <div className="mt-4 grid gap-3 rounded-[20px] border border-ink/10 p-4">
                          <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1 text-xs font-medium text-slate">
                              <span>원점수</span>
                              <input
                                type="number"
                                value={draft.rawScore}
                                onChange={(event) => patchDraft(score, { rawScore: event.target.value })}
                                className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm text-ink"
                                placeholder="-"
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-medium text-slate">
                              <span>OX</span>
                              <input
                                type="number"
                                value={draft.oxScore}
                                onChange={(event) => patchDraft(score, { oxScore: event.target.value })}
                                className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm text-ink"
                                placeholder="-"
                              />
                            </label>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-xs font-medium text-slate">
                              <span>응시 유형</span>
                              <select
                                value={draft.attendType}
                                onChange={(event) => patchDraft(score, { attendType: event.target.value as AttendType })}
                                className="rounded-xl border border-ink/10 px-3 py-2 text-sm text-ink"
                              >
                                {Object.values(AttendType).map((type) => (
                                  <option key={type} value={type}>
                                    {ATTEND_TYPE_LABEL[type]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="grid gap-1 text-xs font-medium text-slate">
                              <span>최종점수</span>
                              <div className="rounded-xl border border-dashed border-ink/10 bg-mist px-3 py-2 text-sm text-slate">
                                자동 계산
                              </div>
                            </div>
                          </div>
                          <label className="grid gap-1 text-xs font-medium text-slate">
                            <span>메모</span>
                            <input
                              value={draft.note}
                              onChange={(event) => patchDraft(score, { note: event.target.value })}
                              className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm text-ink"
                              placeholder="메모"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 rounded-[20px] bg-mist/60 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate">원점수</span>
                            <span className="text-sm font-semibold text-ink">{score.rawScore ?? "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate">OX</span>
                            <span className="text-sm font-semibold text-ink">{score.oxScore ?? "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate">최종점수</span>
                            <span className="text-sm font-semibold text-ink">{score.finalScore ?? "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate">응시 유형</span>
                            <span className="text-sm font-semibold text-ink">
                              {ATTEND_TYPE_LABEL[score.attendType]}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate">메모</span>
                            <span className="text-right text-sm font-semibold text-ink">
                              {score.note ?? "-"}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveScore(score)}
                              disabled={isPending || selectedSessionLocked}
                              className="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ink/30"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteScore(score.id)}
                              disabled={isPending || selectedSessionLocked}
                              className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              삭제
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingId(score.id)}
                            disabled={selectedSessionLocked}
                            className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate"
                          >
                            수정
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : null}
      <BulkSelectionActionBar selectedCount={selectedScoreIds.length} onClear={clearSelectedScores}>
        <button
          type="button"
          onClick={deleteSelectedScores}
          disabled={isPending || selectedSessionLocked}
          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {"\uC77C\uAD04 \uC0AD\uC81C"}
        </button>
      </BulkSelectionActionBar>
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
