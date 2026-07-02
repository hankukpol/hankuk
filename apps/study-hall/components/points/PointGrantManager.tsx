"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  LoaderCircle,
  RefreshCcw,
  Save,
  Search,
  Trophy,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import {
  appendPointDateRangeParams,
  getKstCurrentMonthRange,
  getKstTodayYmd,
  getMonthRangeForDate,
  type PointDateRange,
} from "@/lib/point-date-range";
import type { PointRecordItem, PointRuleItem } from "@/lib/services/point.service";
import type { StudentListItem } from "@/lib/services/student.service";
import { getStudentStatusLabel } from "@/lib/student-meta";

type PointGrantManagerProps = {
  divisionSlug: string;
  students: StudentListItem[];
  rules: PointRuleItem[];
  initialRecords: PointRecordItem[];
  initialDateFrom: string;
  initialDateTo: string;
};

type GrantMode = "single" | "batch";

type PointHistoryStudent = {
  id: string;
  name: string;
  studentNumber: string;
  studyTrack: string | null;
  netPoints: number;
};

type PointRecordsResponse = {
  records?: PointRecordItem[];
  error?: string;
};

type PointOverviewResponse = PointRecordsResponse & {
  students?: StudentListItem[];
};

function createPointBatchIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `point-batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatRulePreview(rule: PointRuleItem) {
  return `${rule.name} · ${rule.points > 0 ? "+" : ""}${rule.points}점`;
}

function isSameRange(left: PointDateRange, right: PointDateRange) {
  return left.dateFrom === right.dateFrom && left.dateTo === right.dateTo;
}

function isDateInRange(date: string, range: PointDateRange) {
  return date >= range.dateFrom && date <= range.dateTo;
}

export const PointGrantManager = memo(function PointGrantManager({
  divisionSlug,
  students,
  rules,
  initialRecords,
  initialDateFrom,
  initialDateTo,
}: PointGrantManagerProps) {
  const activeRules = useMemo(() => rules.filter((rule) => rule.isActive), [rules]);
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const initialRange = useMemo(
    () => ({ dateFrom: initialDateFrom, dateTo: initialDateTo }),
    [initialDateFrom, initialDateTo],
  );

  const [records, setRecords] = useState(initialRecords);
  const [rankStudents, setRankStudents] = useState(activeStudents);
  const [appliedRange, setAppliedRange] = useState<PointDateRange>(initialRange);
  const [draftDateFrom, setDraftDateFrom] = useState(initialDateFrom);
  const [draftDateTo, setDraftDateTo] = useState(initialDateTo);
  const [panelMode, setPanelMode] = useState<GrantMode | null>(null);
  const [rankingOrder, setRankingOrder] = useState<"top" | "bottom">("top");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<PointHistoryStudent | null>(null);
  const [historyRecords, setHistoryRecords] = useState<PointRecordItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [singleStudentId, setSingleStudentId] = useState(activeStudents[0]?.id ?? "");
  const [singleRuleId, setSingleRuleId] = useState(activeRules[0]?.id ?? "");
  const [singleManualPoints, setSingleManualPoints] = useState("");
  const [singleNotes, setSingleNotes] = useState("");
  const [singleDate, setSingleDate] = useState(getKstTodayYmd());
  const [isSingleSaving, setIsSingleSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [batchRuleId, setBatchRuleId] = useState(activeRules[0]?.id ?? "");
  const [batchManualPoints, setBatchManualPoints] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchDate, setBatchDate] = useState(getKstTodayYmd());
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchIdempotencyKey, setBatchIdempotencyKey] = useState(() =>
    createPointBatchIdempotencyKey(),
  );

  const selectedSingleRule = activeRules.find((rule) => rule.id === singleRuleId) ?? null;
  const selectedBatchRule = activeRules.find((rule) => rule.id === batchRuleId) ?? null;
  const historyTotals = useMemo(
    () =>
      historyRecords.reduce(
        (totals, record) => ({
          netPoints: totals.netPoints + record.points,
          rewardPoints: totals.rewardPoints + (record.points > 0 ? record.points : 0),
          demeritPoints: totals.demeritPoints + (record.points < 0 ? Math.abs(record.points) : 0),
        }),
        { netPoints: 0, rewardPoints: 0, demeritPoints: 0 },
      ),
    [historyRecords],
  );

  useEffect(() => {
    setRankStudents(activeStudents);
  }, [activeStudents]);

  useEffect(() => {
    setRecords(initialRecords);
  }, [initialRecords]);

  const rankedStudents = useMemo(() => {
    const sorted = [...rankStudents].sort((a, b) =>
      rankingOrder === "top" ? b.netPoints - a.netPoints : a.netPoints - b.netPoints,
    );
    return sorted.slice(0, 20);
  }, [rankStudents, rankingOrder]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return activeStudents;
    }

    return activeStudents.filter((student) => {
      const candidates = [student.name, student.studentNumber, student.studyTrack ?? ""]
        .join(" ")
        .toLowerCase();

      return candidates.includes(keyword);
    });
  }, [activeStudents, search]);

  function buildPointQuery(range: PointDateRange) {
    return appendPointDateRangeParams(new URLSearchParams(), range).toString();
  }

  function getValidatedDraftRange() {
    if (!draftDateFrom || !draftDateTo) {
      toast.error("시작일과 종료일을 선택해주세요.");
      return null;
    }

    if (draftDateFrom > draftDateTo) {
      toast.error("종료일은 시작일 이후로 선택해주세요.");
      return null;
    }

    return { dateFrom: draftDateFrom, dateTo: draftDateTo } satisfies PointDateRange;
  }

  async function loadStudentHistory(student: PointHistoryStudent, range = appliedRange) {
    setHistoryStudent(student);
    setHistoryRecords([]);
    setIsHistoryLoading(true);

    try {
      const params = appendPointDateRangeParams(new URLSearchParams(), range);
      params.set("studentId", student.id);
      const response = await fetch(
        `/api/${divisionSlug}/points?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as PointRecordsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "학생 상벌점 이력을 불러오지 못했습니다.");
      }

      setHistoryRecords(data.records ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 상벌점 이력을 불러오지 못했습니다.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function refreshData(showToast = false, range = appliedRange) {
    setIsRefreshing(true);

    try {
      const query = buildPointQuery(range);
      const response = await fetch(`/api/${divisionSlug}/points/overview?${query}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as PointOverviewResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 조회 데이터를 불러오지 못했습니다.");
      }

      setRecords(data.records ?? []);
      setRankStudents(
        (data.students ?? []).filter(
          (student) => student.status === "ACTIVE" || student.status === "ON_LEAVE",
        ),
      );
      setAppliedRange(range);

      if (showToast) {
        toast.success("상벌점 조회 데이터를 새로고침했습니다.");
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 조회 데이터를 불러오지 못했습니다.");
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRangeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRange = getValidatedDraftRange();

    if (!nextRange) {
      return;
    }

    const refreshed = await refreshData(true, nextRange);

    if (refreshed && historyStudent) {
      await loadStudentHistory(historyStudent, nextRange);
    }
  }

  async function handleThisMonthClick() {
    const nextRange = getKstCurrentMonthRange();
    setDraftDateFrom(nextRange.dateFrom);
    setDraftDateTo(nextRange.dateTo);
    const refreshed = await refreshData(true, nextRange);

    if (refreshed && historyStudent) {
      await loadStudentHistory(historyStudent, nextRange);
    }
  }

  async function refreshAfterGrant(grantDate: string, affectedStudentIds: string[]) {
    const nextRange = isDateInRange(grantDate, appliedRange)
      ? appliedRange
      : getMonthRangeForDate(grantDate);
    const movedRange = !isSameRange(nextRange, appliedRange);

    if (movedRange) {
      setDraftDateFrom(nextRange.dateFrom);
      setDraftDateTo(nextRange.dateTo);
    }

    const refreshed = await refreshData(false, nextRange);

    if (refreshed && historyStudent && affectedStudentIds.includes(historyStudent.id)) {
      await loadStudentHistory(historyStudent, nextRange);
    }

    return movedRange;
  }

  function getStudentPointTotal(studentId: string) {
    return rankStudents.find((student) => student.id === studentId)?.netPoints ?? 0;
  }

  function getHistoryStudentFromRecord(record: PointRecordItem): PointHistoryStudent {
    const student =
      rankStudents.find((candidate) => candidate.id === record.studentId) ??
      students.find((candidate) => candidate.id === record.studentId);

    if (student) {
      return student;
    }

    return {
      id: record.studentId,
      name: record.studentName,
      studentNumber: record.studentNumber,
      studyTrack: null,
      netPoints: getStudentPointTotal(record.studentId),
    };
  }

  async function openStudentHistory(student: PointHistoryStudent) {
    await loadStudentHistory(student);
  }

  function closeStudentHistory() {
    setHistoryStudent(null);
    setHistoryRecords([]);
    setIsHistoryLoading(false);
  }

  async function handleSingleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!singleStudentId) {
      toast.error("학생을 선택해 주세요.");
      return;
    }

    if (!singleRuleId && !singleManualPoints.trim()) {
      toast.error("직접 점수를 입력해 주세요.");
      return;
    }

    setIsSingleSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/points`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: singleStudentId,
          ruleId: singleRuleId || null,
          points: singleRuleId ? null : Number(singleManualPoints),
          notes: singleNotes || null,
          date: singleDate,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 기록에 실패했습니다.");
      }

      setSingleNotes("");
      setSingleManualPoints("");
      setPanelMode(null);
      const movedRange = await refreshAfterGrant(singleDate, [singleStudentId]);
      toast.success(
        movedRange
          ? `${singleDate.slice(0, 7)} 기록으로 저장하고 해당 월 조회로 이동했습니다.`
          : "상벌점을 기록했습니다.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 기록에 실패했습니다.");
    } finally {
      setIsSingleSaving(false);
    }
  }

  async function handleBatchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedStudentIds.length === 0) {
      toast.error("학생을 한 명 이상 선택해 주세요.");
      return;
    }

    if (!batchRuleId && !batchManualPoints.trim()) {
      toast.error("직접 점수를 입력해 주세요.");
      return;
    }

    setIsBatchSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/points/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentIds: selectedStudentIds,
          ruleId: batchRuleId || null,
          points: batchRuleId ? null : Number(batchManualPoints),
          notes: batchNotes || null,
          date: batchDate,
          idempotencyKey: batchIdempotencyKey,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "일괄 상벌점 부여에 실패했습니다.");
      }

      const affectedStudentIds = selectedStudentIds;
      setSelectedStudentIds([]);
      setBatchNotes("");
      setBatchManualPoints("");
      setBatchIdempotencyKey(createPointBatchIdempotencyKey());
      setPanelMode(null);
      const movedRange = await refreshAfterGrant(batchDate, affectedStudentIds);
      toast.success(
        movedRange
          ? `${data.result.createdCount}명에게 ${data.result.points > 0 ? "+" : ""}${data.result.points}점을 적용하고 ${batchDate.slice(0, 7)} 조회로 이동했습니다.`
          : `${data.result.createdCount}명에게 ${data.result.points > 0 ? "+" : ""}${data.result.points}점을 적용했습니다.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 상벌점 부여에 실패했습니다.");
    } finally {
      setIsBatchSaving(false);
    }
  }

  async function handleDelete() {
    const recordId = confirmDeleteId;
    if (!recordId) return;
    setDeletingId(recordId);
    setConfirmDeleteId(null);

    try {
      const response = await fetch(`/api/${divisionSlug}/points/${recordId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 기록 삭제에 실패했습니다.");
      }

      toast.success("상벌점 기록을 삭제했습니다.");
      const refreshed = await refreshData();
      if (refreshed && historyStudent) {
        await loadStudentHistory(historyStudent);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 기록 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((candidate) => candidate !== studentId)
        : [...current, studentId],
    );
  }

  function selectAllFiltered() {
    setSelectedStudentIds(
      Array.from(new Set([...selectedStudentIds, ...filteredStudents.map((student) => student.id)])),
    );
  }

  function clearSelection() {
    setSelectedStudentIds([]);
  }

  return (
    <div className="space-y-6">
      {/* 헤더: 요약 + 부여 버튼 */}
      <section className="rounded-[10px] border border-slate-200/60 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">운영 대상</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">
                {activeStudents.length}<span className="ml-1 text-base font-medium text-slate-500">명</span>
              </p>
            </div>
            <div className="h-10 w-px bg-slate-100" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">최근 기록</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">
                {records.length}<span className="ml-1 text-base font-medium text-slate-500">건</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPanelMode("single")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <UserPlus className="h-4 w-4" />
              개별 부여
            </button>
            <button
              type="button"
              onClick={() => setPanelMode("batch")}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Users className="h-4 w-4" />
              일괄 부여
            </button>
          </div>
        </div>

        <form
          onSubmit={handleRangeSubmit}
          className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5"
        >
          <label className="block min-w-[150px]">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">시작일</span>
            <input
              type="date"
              value={draftDateFrom}
              onChange={(event) => setDraftDateFrom(event.target.value)}
              className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400"
              required
            />
          </label>
          <label className="block min-w-[150px]">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">종료일</span>
            <input
              type="date"
              value={draftDateTo}
              onChange={(event) => setDraftDateTo(event.target.value)}
              className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400"
              required
            />
          </label>
          <button
            type="submit"
            disabled={isRefreshing}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--division-color)] px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isRefreshing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            조회
          </button>
          <button
            type="button"
            onClick={() => void handleThisMonthClick()}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <CalendarDays className="h-4 w-4" />
            이번 달
          </button>
        </form>
      </section>

      {/* 메인: 순위(좌/주) + 최근 기록(우/보조) */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* 상벌점 순위 (Primary) */}
        <section className="flex rounded-[10px] border border-slate-200/60 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)] xl:h-[680px] xl:flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">순위</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">상벌점 순위</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {appliedRange.dateFrom} ~ {appliedRange.dateTo}
                </p>
              </div>
            </div>
            <div className="flex rounded-[10px] border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setRankingOrder("top")}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${rankingOrder === "top" ? "bg-[var(--division-color)] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                상위
              </button>
              <button
                type="button"
                onClick={() => setRankingOrder("bottom")}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${rankingOrder === "bottom" ? "bg-[var(--division-color)] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                하위
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
            {rankedStudents.length > 0 ? (
              rankedStudents.map((student, index) => {
                const isPositive = student.netPoints > 0;
                const isNegative = student.netPoints < 0;
                const isFirst = index === 0;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => void openStudentHistory(student)}
                    className={`flex w-full items-center gap-4 rounded-[10px] border px-5 py-3 text-left transition hover:border-[var(--division-color)] hover:bg-slate-50 ${isFirst ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"}`}
                  >
                    <span className={`w-7 shrink-0 text-center text-sm font-bold ${isFirst ? "text-slate-950" : index < 3 ? "text-slate-700" : "text-slate-400"}`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-semibold ${isFirst ? "text-base text-slate-950" : "text-sm text-slate-800"}`}>
                        {student.name}
                      </p>
                      <p className="text-xs text-slate-400">{student.studentNumber}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${isPositive ? "bg-emerald-50 text-emerald-700" : isNegative ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                      {isPositive ? "+" : ""}{student.netPoints}점
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">
                운영 중인 학생이 없습니다.
              </div>
            )}
          </div>
        </section>

        {/* 최근 상벌점 기록 (Secondary, compact) */}
        <section className="flex rounded-[10px] border border-slate-200/60 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)] xl:h-[680px] xl:flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">최근 내역</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">최근 기록</h3>
              <p className="mt-1 text-xs text-slate-400">최대 50건</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshData(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              새로고침
            </button>
          </div>

          <div className="mt-4 space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
            {records.length > 0 ? (
              records.map((record) => (
                <article
                  key={record.id}
                  className="rounded-[10px] border border-slate-100 bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void openStudentHistory(getHistoryStudentFromRecord(record))}
                        className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 transition hover:text-[var(--division-color)]"
                      >
                        {record.studentName}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">{record.studentNumber}</span>
                      </button>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {record.ruleName || "직접 입력"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PointValueBadge points={record.points} />
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(record.id)}
                        disabled={deletingId === record.id}
                        className="text-slate-300 transition hover:text-rose-500 disabled:opacity-40"
                        title="기록 삭제"
                      >
                        {deletingId === record.id ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(record.date)}</p>
                </article>
              ))
            ) : (
              <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
                기록이 없습니다.
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="상벌점 기록 삭제"
        description="이 기록을 삭제하면 복구할 수 없습니다. 계속하시겠습니까?"
        confirmLabel="삭제"
        variant="danger"
        isLoading={deletingId !== null}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <Modal
        open={historyStudent !== null}
        onClose={closeStudentHistory}
        title={`${historyStudent?.name ?? ""} 상벌점 히스토리`}
        badge="학생 이력"
        description={
          historyStudent
            ? `${historyStudent.studentNumber} · ${historyStudent.studyTrack || "직렬 미지정"}`
            : undefined
        }
        widthClassName="max-w-5xl"
      >
        {historyStudent ? (
          <div className="space-y-4">
            <div className="grid overflow-hidden rounded-[10px] border border-slate-200 sm:grid-cols-4">
              {[
                { label: "현재 점수", value: `${historyRecords.length > 0 ? historyTotals.netPoints : historyStudent.netPoints}점` },
                { label: "상점 합계", value: `+${historyTotals.rewardPoints}점` },
                { label: "벌점 합계", value: `-${historyTotals.demeritPoints}점` },
                { label: "조회 기록", value: `${historyRecords.length}건` },
              ].map((item) => (
                <div key={item.label} className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-[10px] border border-slate-200">
              {isHistoryLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  이력을 불러오는 중입니다.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[780px] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="border-b border-slate-200 px-4 py-3">일시</th>
                        <th className="border-b border-slate-200 px-4 py-3">구분</th>
                        <th className="border-b border-slate-200 px-4 py-3">규칙</th>
                        <th className="border-b border-slate-200 px-4 py-3">점수</th>
                        <th className="border-b border-slate-200 px-4 py-3">메모</th>
                        <th className="border-b border-slate-200 px-4 py-3">처리자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRecords.length > 0 ? (
                        historyRecords.map((record) => (
                          <tr key={record.id} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-4 py-3 text-slate-600">{formatDateTime(record.displayDateTime)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                record.points > 0
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              }`}>
                                {record.points > 0 ? "상점" : "벌점"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{record.ruleName || "직접 입력"}</td>
                            <td className="px-4 py-3">
                              <PointValueBadge points={record.points} />
                            </td>
                            <td className="max-w-[280px] px-4 py-3 text-slate-600">
                              {record.notes || <span className="text-slate-400">-</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{record.recordedByName}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                            상벌점 이력이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={panelMode === "single"}
        onClose={() => setPanelMode(null)}
        title="개별 상벌점 부여"
        badge="개별 처리"
        description="학생 한 명에게 상점 또는 벌점을 빠르게 기록합니다."
      >
        <form onSubmit={handleSingleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
              <StudentSearchCombobox
                students={activeStudents}
                value={singleStudentId}
                onChange={setSingleStudentId}
                placeholder="학생을 선택해 주세요."
                showStudyTrack
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">적용 날짜</span>
              <input
                type="date"
                value={singleDate}
                onChange={(event) => setSingleDate(event.target.value)}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">규칙 선택</span>
            <select
              value={singleRuleId}
              onChange={(event) => setSingleRuleId(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            >
              <option value="">직접 점수 입력</option>
              {activeRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {formatRulePreview(rule)}
                </option>
              ))}
            </select>
          </label>

          {!singleRuleId ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">직접 점수 입력</span>
              <input
                type="number"
                value={singleManualPoints}
                onChange={(event) => setSingleManualPoints(event.target.value)}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: -2 또는 5"
                required
              />
            </label>
          ) : selectedSingleRule ? (
            <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <PointCategoryBadge category={selectedSingleRule.category} />
                <PointValueBadge points={selectedSingleRule.points} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900">{selectedSingleRule.name}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {selectedSingleRule.description || "설명 없는 규칙입니다."}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">사유 메모</span>
            <textarea
              value={singleNotes}
              onChange={(event) => setSingleNotes(event.target.value)}
              className="min-h-[140px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 주간 모의고사 무단 결석"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setPanelMode(null)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSingleSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSingleSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              기록 저장
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={panelMode === "batch"}
        onClose={() => setPanelMode(null)}
        title="일괄 상벌점 부여"
        badge="일괄 처리"
        description="같은 규칙이나 점수를 여러 학생에게 한 번에 적용합니다."
      >
        <form onSubmit={handleBatchSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">학생 검색</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="이름, 수험번호, 직렬 검색"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">적용 날짜</span>
              <input
                type="date"
                value={batchDate}
                onChange={(event) => setBatchDate(event.target.value)}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                required
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              현재 목록 전체 선택
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              선택 해제
            </button>
            <span className="text-xs text-slate-500">선택 학생 {selectedStudentIds.length}명</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-[10px] border border-slate-200-slate-200 bg-white">
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => {
                const checked = selectedStudentIds.includes(student.id);

                return (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-start gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudent(student.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {student.name} · {student.studentNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {student.studyTrack || "직렬 미지정"} · {getStudentStatusLabel(student.status)}
                      </p>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                검색 조건에 맞는 학생이 없습니다.
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">규칙 선택</span>
            <select
              value={batchRuleId}
              onChange={(event) => setBatchRuleId(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            >
              <option value="">직접 점수 입력</option>
              {activeRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {formatRulePreview(rule)}
                </option>
              ))}
            </select>
          </label>

          {!batchRuleId ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">직접 점수 입력</span>
              <input
                type="number"
                value={batchManualPoints}
                onChange={(event) => setBatchManualPoints(event.target.value)}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: -1 또는 3"
                required
              />
            </label>
          ) : selectedBatchRule ? (
            <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <PointCategoryBadge category={selectedBatchRule.category} />
                <PointValueBadge points={selectedBatchRule.points} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900">{selectedBatchRule.name}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {selectedBatchRule.description || "설명 없는 규칙입니다."}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">사유 메모</span>
            <textarea
              value={batchNotes}
              onChange={(event) => setBatchNotes(event.target.value)}
              className="min-h-[120px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 3월 전체 청소 점검 가산점"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setPanelMode(null)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isBatchSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isBatchSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              {selectedStudentIds.length}명에게 적용
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
});
