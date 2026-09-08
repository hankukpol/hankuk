"use client";

import { useId } from "react";
import { DialogActions } from "@/components/ui/DialogActions";

import {
  memo,
  useEffect,
  useMemo,
  useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  LoaderCircle,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";
import { SlideOver } from "@/components/ui/SlideOver";
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
  const dialogFormId = useId();
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
  const [viewTab, setViewTab] = useState<"records" | "ranking">("records");
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
      (rankingOrder === "top" ? b.netPoints - a.netPoints : a.netPoints - b.netPoints) || (b.unusedHolidayCount ?? 0) - (a.unusedHolidayCount ?? 0) || a.studentNumber.localeCompare(b.studentNumber),
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
    setViewTab("records");
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
    <div className="admin-flat-page">
      <AdminTabs
        items={[
          { id: "records", label: "부여 내역" },
          { id: "ranking", label: "학생별 순위" },
        ]}
        activeId={viewTab}
        onChange={setViewTab}
        label="상벌점 업무"
        idPrefix="point-view"
      />

      <div className="admin-workspace-toolbar">
        <p className="admin-help">운영 학생 <strong className="text-admin-text">{activeStudents.length}명</strong></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPanelMode("single")} className="admin-button">
            <UserPlus className="h-4 w-4" />개별 부여
          </button>
          <button type="button" onClick={() => setPanelMode("batch")} className="admin-button admin-button-primary">
            <Users className="h-4 w-4" />일괄 부여
          </button>
        </div>
      </div>

      <form onSubmit={handleRangeSubmit} className="admin-filter-bar">
        <label>
          <span className="admin-label mb-2 block">시작일</span>
          <input type="date" value={draftDateFrom} onChange={(event) => setDraftDateFrom(event.target.value)} className="w-full" required />
        </label>
        <label>
          <span className="admin-label mb-2 block">종료일</span>
          <input type="date" value={draftDateTo} onChange={(event) => setDraftDateTo(event.target.value)} className="w-full" required />
        </label>
        <button type="submit" disabled={isRefreshing} className="admin-button">
          {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}조회
        </button>
        <button type="button" onClick={() => void handleThisMonthClick()} disabled={isRefreshing} className="admin-button">
          <CalendarDays className="h-4 w-4" />이번 달
        </button>
      </form>

      <AdminTabPanel id="records" activeId={viewTab} idPrefix="point-view" className="space-y-4">
        <div className="admin-workspace-toolbar">
          <div>
            <h2 className="admin-section-title">상벌점 부여 내역 <span className="text-admin-accent">{records.length}건</span></h2>
            <p className="admin-help mt-1">{appliedRange.dateFrom} ~ {appliedRange.dateTo} · 최근 최대 50건</p>
          </div>
          <button type="button" onClick={() => void refreshData(true)} disabled={isRefreshing} className="admin-button">
            {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침
          </button>
        </div>
        {records.length ? (
          <>
          <div className="space-y-4 md:hidden">
            {records.map((record) => (
              <article key={record.id} className="admin-record-card">
                <div className="admin-workspace-toolbar">
                  <button type="button" onClick={() => void openStudentHistory(getHistoryStudentFromRecord(record))} className="text-left font-semibold text-admin-accent">
                    {record.studentName}<span className="admin-help block">{record.studentNumber}</span>
                  </button>
                  <div className="flex items-center gap-2"><span className="admin-help">{record.points > 0 ? "상점" : "벌점"}</span><PointValueBadge points={record.points} /></div>
                </div>
                <p className="mt-4 font-semibold">{record.ruleName || "직접 입력"}</p>
                {record.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{record.notes}</p> : null}
                <div className="admin-workspace-toolbar mt-4 border-t border-admin-line-soft pt-4">
                  <p className="admin-help">{formatDateTime(record.date)}<br />처리자 {record.recordedByName}</p>
                  <button type="button" onClick={() => setConfirmDeleteId(record.id)} disabled={deletingId === record.id} className="admin-button admin-button-danger-outline w-11 px-0" aria-label={`${record.studentName} 상벌점 기록 삭제`} title="기록 삭제"><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
          </div>
          <div className="admin-table-frame hidden md:block">
            <table>
              <thead><tr><th>적용 일자</th><th>학생</th><th>구분</th><th>점수</th><th>부여 사유</th><th>처리자</th><th>관리</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDateTime(record.date)}</td>
                    <td className="admin-table-name">
                      <button type="button" onClick={() => void openStudentHistory(getHistoryStudentFromRecord(record))} className="font-semibold text-admin-accent hover:underline">
                        {record.studentName}
                      </button>
                      <p className="admin-help">{record.studentNumber}</p>
                    </td>
                    <td><span className={record.points > 0 ? "admin-badge text-admin-success" : "admin-badge text-admin-danger"}>{record.points > 0 ? "상점" : "벌점"}</span></td>
                    <td><PointValueBadge points={record.points} /></td>
                    <td className="admin-table-name">
                      <p>{record.ruleName || "직접 입력"}</p>
                      {record.notes ? <p className="admin-help mt-1 max-w-80 whitespace-pre-wrap break-words">{record.notes}</p> : null}
                    </td>
                    <td>{record.recordedByName}</td>
                    <td>
                      <button type="button" onClick={() => setConfirmDeleteId(record.id)} disabled={deletingId === record.id} className="admin-button admin-button-compact admin-button-danger-outline w-11 px-0" aria-label={`${record.studentName} 상벌점 기록 삭제`} title="기록 삭제">
                        {deletingId === record.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="admin-empty-state">
            <p className="font-semibold">조회 기간에 부여 내역이 없습니다.</p>
            <p className="admin-help mt-2">{appliedRange.dateFrom} ~ {appliedRange.dateTo}</p>
          </div>
        )}
      </AdminTabPanel>

      <AdminTabPanel id="ranking" activeId={viewTab} idPrefix="point-view" className="space-y-4">
        <div className="admin-workspace-toolbar">
          <div>
            <h2 className="admin-section-title">{activeStudents.some((student) => student.meritPoints !== undefined) ? "상점 순위" : "상벌점 순위"}</h2>
            <p className="admin-help mt-1">{appliedRange.dateFrom} ~ {appliedRange.dateTo} · 최대 20명{activeStudents.some((student) => student.meritPoints !== undefined) ? " · 동점은 휴일권 미사용 우선" : ""}</p>
          </div>
          <div className="admin-choice-group">
            <button type="button" onClick={() => setRankingOrder("top")} className="admin-choice-button" data-active={rankingOrder === "top"} aria-pressed={rankingOrder === "top"}>상위</button>
            <button type="button" onClick={() => setRankingOrder("bottom")} className="admin-choice-button" data-active={rankingOrder === "bottom"} aria-pressed={rankingOrder === "bottom"}>하위</button>
          </div>
        </div>
        <div className="space-y-3 md:hidden">
          {rankedStudents.map((student, index) => (
            <button key={student.id} type="button" onClick={() => void openStudentHistory(student)} className="admin-record-card flex w-full items-center gap-3 text-left">
              <span className="w-8 shrink-0 text-center font-bold tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{student.name}</span><span className="admin-help">{student.studentNumber}</span></span>
              <PointValueBadge points={student.netPoints} />
            </button>
          ))}
          {!rankedStudents.length ? <div className="admin-empty-state">운영 중인 학생이 없습니다.</div> : null}
        </div>
        <div className="admin-table-frame hidden md:block">
          <table>
            <thead><tr><th>순번</th><th>학생</th><th>수험번호</th><th>점수</th><th>이력</th></tr></thead>
            <tbody>
              {rankedStudents.map((student, index) => (
                <tr key={student.id}>
                  <td className="font-semibold">{index + 1}</td>
                  <td className="admin-table-name font-semibold">{student.name}</td>
                  <td>{student.studentNumber}</td>
                  <td><PointValueBadge points={student.netPoints} /></td>
                  <td><button type="button" onClick={() => void openStudentHistory(student)} className="admin-button admin-button-compact">상세 이력</button></td>
                </tr>
              ))}
              {!rankedStudents.length ? <tr><td colSpan={5}>운영 중인 학생이 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </AdminTabPanel>

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

      <SlideOver
        open={historyStudent !== null}
        onClose={closeStudentHistory}
        title={`${historyStudent?.name ?? ""} 상벌점 히스토리`}
        badge="학생 이력"
        description={
          historyStudent
            ? `${historyStudent.studentNumber} · ${historyStudent.studyTrack || "직렬 미지정"}`
            : undefined
        }

      >
        {historyStudent ? (
          <div className="space-y-4">
            <div className="grid overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-4">
              {[
                { label: activeStudents.some((s) => s.meritPoints !== undefined) ? "상점·벌점 별도 집계" : "현재 점수", value: activeStudents.some((s) => s.meritPoints !== undefined) ? "상계 없음" : `${historyRecords.length > 0 ? historyTotals.netPoints : historyStudent.netPoints}점` },
                { label: "상점 합계", value: `+${historyTotals.rewardPoints}점` },
                { label: "벌점 합계", value: `-${historyTotals.demeritPoints}점` },
                { label: "조회 기록", value: `${historyRecords.length}건` },
              ].map((item) => (
                <div key={item.label} className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <p className="admin-label">{item.label}</p>
                  <h2 className="admin-section-title">{item.value}</h2>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              {isHistoryLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  이력을 불러오는 중입니다.
                </div>
              ) : (
                <div className="admin-table-frame max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[780px]">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th>일시</th>
                        <th>구분</th>
                        <th>규칙</th>
                        <th>점수</th>
                        <th>메모</th>
                        <th>처리자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRecords.length > 0 ? (
                        historyRecords.map((record) => (
                          <tr key={record.id} className="border-b border-slate-100 last:border-b-0">
                            <td>{formatDateTime(record.displayDateTime)}</td>
                            <td>
                              <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${ record.points > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700" }`}>
                                {record.points > 0 ? "상점" : "벌점"}
                              </span>
                            </td>
                            <td>{record.ruleName || "직접 입력"}</td>
                            <td>
                              <PointValueBadge points={record.points} />
                            </td>
                            <td className="max-w-[280px]">
                              {record.notes || <span className="text-slate-400">-</span>}
                            </td>
                            <td>{record.recordedByName}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="admin-help px-4 py-12 text-center">
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
      </SlideOver>

      <SlideOver
        open={panelMode === "single"}
        onClose={() => !isSingleSaving && setPanelMode(null)}
        title="개별 상벌점 부여"
        badge="개별 처리"
        description="학생 한 명에게 상점 또는 벌점을 빠르게 기록합니다."
      >
        <form id={`${dialogFormId}-1`} onSubmit={handleSingleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="block">
              <span className="admin-label mb-2 block">학생 선택</span>
              <StudentSearchCombobox
                students={activeStudents}
                value={singleStudentId}
                onChange={setSingleStudentId}
                placeholder="학생을 선택해 주세요."
                showStudyTrack
              />
            </label>

            <label className="block">
              <span className="admin-label mb-2 block">적용 날짜</span>
              <input
                type="date"
                value={singleDate}
                onChange={(event) => setSingleDate(event.target.value)}
                className="w-full"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="admin-label mb-2 block">규칙 선택</span>
            <select
              value={singleRuleId}
              onChange={(event) => setSingleRuleId(event.target.value)}
              className="w-full"
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
              <span className="admin-label mb-2 block">직접 점수 입력</span>
              <input
                type="number"
                value={singleManualPoints}
                onChange={(event) => setSingleManualPoints(event.target.value)}
                className="w-full"
                placeholder="예: -2 또는 5"
                required
              />
            </label>
          ) : selectedSingleRule ? (
            <div className="admin-section">
              <div className="flex flex-wrap items-center gap-2">
                <PointCategoryBadge category={selectedSingleRule.category} />
                <PointValueBadge points={selectedSingleRule.points} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900">{selectedSingleRule.name}</p>
              <p className="admin-help mt-1 leading-6">
                {selectedSingleRule.description || "설명 없는 규칙입니다."}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="admin-label mb-2 block">사유 메모</span>
            <textarea
              value={singleNotes}
              onChange={(event) => setSingleNotes(event.target.value)}
              className="min-h-[140px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
              placeholder="예: 주간 모의고사 무단 결석"
            />
          </label>

          <DialogActions>
            <button
              type="button"
              disabled={isSingleSaving}
              onClick={() => setPanelMode(null)}
              className="admin-button"
            >
              취소
            </button>
            <button form={`${dialogFormId}-1`}
              type="submit"
              disabled={isSingleSaving}
              className="admin-button admin-button-primary"
            >
              {isSingleSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              기록 저장
            </button>
          </DialogActions>
        </form>
      </SlideOver>

      <SlideOver
        open={panelMode === "batch"}
        onClose={() => !isBatchSaving && setPanelMode(null)}
        title="일괄 상벌점 부여"
        badge="일괄 처리"
        description="같은 규칙이나 점수를 여러 학생에게 한 번에 적용합니다."
      >
        <form id={`${dialogFormId}-2`} onSubmit={handleBatchSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="block">
              <span className="admin-label mb-2 block">학생 검색</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full"
                placeholder="이름, 수험번호, 직렬 검색"
              />
            </label>

            <label className="block">
              <span className="admin-label mb-2 block">적용 날짜</span>
              <input
                type="date"
                value={batchDate}
                onChange={(event) => setBatchDate(event.target.value)}
                className="w-full"
                required
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="admin-button admin-button-compact"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              현재 목록 전체 선택
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="admin-button admin-button-compact"
            >
              선택 해제
            </button>
            <span className="admin-help">선택 학생 {selectedStudentIds.length}명</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
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
                      <p className="admin-help mt-1">
                        {student.studyTrack || "직렬 미지정"} · {getStudentStatusLabel(student.status)}
                      </p>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="admin-help px-4 py-8 text-center">
                검색 조건에 맞는 학생이 없습니다.
              </div>
            )}
          </div>

          <label className="block">
            <span className="admin-label mb-2 block">규칙 선택</span>
            <select
              value={batchRuleId}
              onChange={(event) => setBatchRuleId(event.target.value)}
              className="w-full"
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
              <span className="admin-label mb-2 block">직접 점수 입력</span>
              <input
                type="number"
                value={batchManualPoints}
                onChange={(event) => setBatchManualPoints(event.target.value)}
                className="w-full"
                placeholder="예: -1 또는 3"
                required
              />
            </label>
          ) : selectedBatchRule ? (
            <div className="admin-section">
              <div className="flex flex-wrap items-center gap-2">
                <PointCategoryBadge category={selectedBatchRule.category} />
                <PointValueBadge points={selectedBatchRule.points} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900">{selectedBatchRule.name}</p>
              <p className="admin-help mt-1 leading-6">
                {selectedBatchRule.description || "설명 없는 규칙입니다."}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="admin-label mb-2 block">사유 메모</span>
            <textarea
              value={batchNotes}
              onChange={(event) => setBatchNotes(event.target.value)}
              className="min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
              placeholder="예: 3월 전체 청소 점검 가산점"
            />
          </label>

          <DialogActions>
            <button
              type="button"
              disabled={isBatchSaving}
              onClick={() => setPanelMode(null)}
              className="admin-button"
            >
              취소
            </button>
            <button form={`${dialogFormId}-2`}
              type="submit"
              disabled={isBatchSaving}
              className="admin-button admin-button-primary"
            >
              {isBatchSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              {selectedStudentIds.length}명에게 적용
            </button>
          </DialogActions>
        </form>
      </SlideOver>
    </div>
  );
});
