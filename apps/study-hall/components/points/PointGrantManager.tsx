"use client";

import { memo, useMemo, useState } from "react";
import {
  CheckSquare,
  LoaderCircle,
  RefreshCcw,
  Save,
  Trophy,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import type { PointRecordItem, PointRuleItem } from "@/lib/services/point.service";
import type { StudentListItem } from "@/lib/services/student.service";
import { getStudentStatusLabel } from "@/lib/student-meta";

type PointGrantManagerProps = {
  divisionSlug: string;
  students: StudentListItem[];
  rules: PointRuleItem[];
  initialRecords: PointRecordItem[];
};

type GrantMode = "single" | "batch";

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

function formatRulePreview(rule: PointRuleItem) {
  return `${rule.name} · ${rule.points > 0 ? "+" : ""}${rule.points}점`;
}

export const PointGrantManager = memo(function PointGrantManager({
  divisionSlug,
  students,
  rules,
  initialRecords,
}: PointGrantManagerProps) {
  const router = useRouter();
  const activeRules = useMemo(() => rules.filter((rule) => rule.isActive), [rules]);
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );

  const [records, setRecords] = useState(initialRecords);
  const [panelMode, setPanelMode] = useState<GrantMode | null>(null);
  const [rankingOrder, setRankingOrder] = useState<"top" | "bottom">("top");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [singleStudentId, setSingleStudentId] = useState(activeStudents[0]?.id ?? "");
  const [singleRuleId, setSingleRuleId] = useState(activeRules[0]?.id ?? "");
  const [singleManualPoints, setSingleManualPoints] = useState("");
  const [singleNotes, setSingleNotes] = useState("");
  const [isSingleSaving, setIsSingleSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [batchRuleId, setBatchRuleId] = useState(activeRules[0]?.id ?? "");
  const [batchManualPoints, setBatchManualPoints] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchDate, setBatchDate] = useState(getKstToday());
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  const selectedSingleRule = activeRules.find((rule) => rule.id === singleRuleId) ?? null;
  const selectedBatchRule = activeRules.find((rule) => rule.id === batchRuleId) ?? null;

  const rankedStudents = useMemo(() => {
    const sorted = [...activeStudents].sort((a, b) =>
      rankingOrder === "top" ? b.netPoints - a.netPoints : a.netPoints - b.netPoints,
    );
    return sorted.slice(0, 20);
  }, [activeStudents, rankingOrder]);

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

  async function refreshRecords(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/points?limit=12`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 기록을 불러오지 못했습니다.");
      }

      setRecords(data.records);

      if (showToast) {
        toast.success("최근 상벌점 기록을 새로고침했습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 기록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
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
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 기록에 실패했습니다.");
      }

      toast.success("상벌점을 기록했습니다.");
      setSingleNotes("");
      setSingleManualPoints("");
      setPanelMode(null);
      await refreshRecords();
      router.refresh();
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
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "일괄 상벌점 부여에 실패했습니다.");
      }

      toast.success(
        `${data.result.createdCount}명에게 ${data.result.points > 0 ? "+" : ""}${data.result.points}점을 적용했습니다.`,
      );
      setSelectedStudentIds([]);
      setBatchNotes("");
      setBatchManualPoints("");
      setPanelMode(null);
      await refreshRecords();
      router.refresh();
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
      setRecords((current) => current.filter((record) => record.id !== recordId));
      router.refresh();
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
      </section>

      {/* 메인: 순위(좌/주) + 최근 기록(우/보조) */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* 상벌점 순위 (Primary) */}
        <section className="rounded-[10px] border border-slate-200/60 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">순위</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">상벌점 순위</h3>
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

          <div className="mt-5 space-y-2">
            {rankedStudents.length > 0 ? (
              rankedStudents.map((student, index) => {
                const isPositive = student.netPoints > 0;
                const isNegative = student.netPoints < 0;
                const isFirst = index === 0;
                return (
                  <div
                    key={student.id}
                    className={`flex items-center gap-4 rounded-[10px] border px-5 py-3 ${isFirst ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"}`}
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
                  </div>
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
        <section className="rounded-[10px] border border-slate-200/60 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">최근 내역</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">최근 기록</h3>
            </div>
            <button
              type="button"
              onClick={() => void refreshRecords(true)}
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

          <div className="mt-4 space-y-2">
            {records.length > 0 ? (
              records.map((record) => (
                <article
                  key={record.id}
                  className="rounded-[10px] border border-slate-100 bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {record.studentName}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">{record.studentNumber}</span>
                      </p>
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
        open={panelMode === "single"}
        onClose={() => setPanelMode(null)}
        title="개별 상벌점 부여"
        badge="개별 처리"
        description="학생 한 명에게 상점 또는 벌점을 빠르게 기록합니다."
      >
        <form onSubmit={handleSingleSubmit} className="space-y-5">
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
