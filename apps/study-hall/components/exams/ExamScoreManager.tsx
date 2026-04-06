"use client";

import { AlertTriangle, Download, LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { ExamScoreSheet, ExamTypeItem } from "@/lib/services/exam.service";

type ExamScoreManagerProps = {
  divisionSlug: string;
  initialExamTypes: ExamTypeItem[];
};

type EditableRow = ExamScoreSheet["rows"][number];

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sumRowScores(scores: Record<string, number | null>) {
  const numericScores = Object.values(scores).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  return numericScores.length > 0
    ? numericScores.reduce((sum, value) => sum + value, 0)
    : null;
}

function normalizeNumericCell(value: string) {
  const trimmed = value.trim().replaceAll(",", "");

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRound(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return String(parsed);
}

function formatTrackLabel(studyTrack: string | null) {
  return studyTrack || "공통";
}

function buildSnapshot(rows: EditableRow[], examDate: string) {
  return JSON.stringify({
    examDate,
    rows: rows.map((row) => ({
      studentId: row.studentId,
      scores: row.scores,
      notes: row.notes ?? "",
    })),
  });
}

function getSubjectMeta(subject: ExamScoreSheet["subjects"][number]) {
  const meta: string[] = [];

  if (subject.totalItems) {
    meta.push(`${subject.totalItems}문항`);
  }
  if (subject.pointsPerItem) {
    meta.push(`문항당 ${subject.pointsPerItem}점`);
  }
  if (subject.maxScore) {
    meta.push(`만점 ${subject.maxScore}`);
  }

  return meta.join(" · ");
}

function triggerDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.click();
}

export function ExamScoreManager({
  divisionSlug,
  initialExamTypes,
}: ExamScoreManagerProps) {
  const [examTypes] = useState(initialExamTypes);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(initialExamTypes[0]?.id ?? "");
  const [examRoundInput, setExamRoundInput] = useState("1");
  const [appliedExamRound, setAppliedExamRound] = useState("1");
  const [examDate, setExamDate] = useState(getKstToday());
  const [sheet, setSheet] = useState<ExamScoreSheet | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  const selectedExamType = useMemo(
    () => examTypes.find((examType) => examType.id === selectedExamTypeId) ?? null,
    [examTypes, selectedExamTypeId],
  );
  const normalizedRoundInput = useMemo(
    () => normalizeRound(examRoundInput),
    [examRoundInput],
  );
  const currentSnapshot = useMemo(() => buildSnapshot(rows, examDate), [examDate, rows]);
  const hasUnsavedChanges =
    Boolean(sheet) && savedSnapshot.length > 0 && currentSnapshot !== savedSnapshot;
  const hasPendingRoundChange =
    normalizedRoundInput !== null && normalizedRoundInput !== appliedExamRound;
  const blockingChangeMessage = useMemo(() => {
    if (hasUnsavedChanges && hasPendingRoundChange) {
      return "저장하지 않은 성적 입력과 적용되지 않은 회차 변경";
    }
    if (hasUnsavedChanges) {
      return "저장하지 않은 성적 입력";
    }
    if (hasPendingRoundChange) {
      return "적용되지 않은 회차 변경";
    }
    return null;
  }, [hasPendingRoundChange, hasUnsavedChanges]);

  async function loadSheet(options?: {
    showToast?: boolean;
    targetExamTypeId?: string;
    targetRound?: string;
  }) {
    const nextExamTypeId = options?.targetExamTypeId ?? selectedExamTypeId;
    const nextRound = options?.targetRound ?? appliedExamRound;

    if (!nextExamTypeId) {
      setSheet(null);
      setRows([]);
      setSavedSnapshot("");
      return;
    }

    const normalizedRound = normalizeRound(nextRound);
    if (!normalizedRound) {
      toast.error("회차는 1 이상의 숫자로 입력해 주세요.");
      setIsRefreshing(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/${divisionSlug}/exams?examTypeId=${nextExamTypeId}&examRound=${normalizedRound}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "성적 시트를 불러오지 못했습니다.");
      }

      const nextExamDate = data.sheet.examDate ?? getKstToday();

      setSheet(data.sheet);
      setRows(data.sheet.rows);
      setExamDate(nextExamDate);
      setExamRoundInput(normalizedRound);
      setSavedSnapshot(buildSnapshot(data.sheet.rows, nextExamDate));

      if (options?.showToast) {
        toast.success("성적 시트를 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성적 시트를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamTypeId, appliedExamRound]);

  async function confirmDiscardChanges(targetLabel: string) {
    if (!blockingChangeMessage) {
      return true;
    }

    return confirm({
      title: `${targetLabel} 전 확인`,
      description: `${blockingChangeMessage}이 있습니다. ${targetLabel} 전에 계속하면 변경 내용이 사라집니다. 계속하시겠습니까?`,
      confirmLabel: "계속",
      cancelLabel: "취소",
      variant: "warning",
    });
  }

  function updateRow(studentId: string, updater: (current: EditableRow) => EditableRow) {
    setRows((current) => current.map((row) => (row.studentId === studentId ? updater(row) : row)));
  }

  async function handleSave() {
    if (!sheet) {
      return;
    }

    const roundNumber = Number(appliedExamRound);
    if (Number.isNaN(roundNumber) || roundNumber < 1) {
      toast.error("회차를 다시 확인해 주세요.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examTypeId: sheet.examTypeId,
          examRound: roundNumber,
          examDate: examDate || null,
          rows: rows.map((row) => ({
            studentId: row.studentId,
            scores: row.scores,
            notes: row.notes,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "성적 저장에 실패했습니다.");
      }

      const nextExamDate = data.sheet.examDate ?? examDate;

      setSheet(data.sheet);
      setRows(data.sheet.rows);
      setExamDate(nextExamDate);
      setSavedSnapshot(buildSnapshot(data.sheet.rows, nextExamDate));
      toast.success("성적을 저장했습니다.");
      showActionComplete({
        title: "성적 저장 완료",
        description: `${selectedExamType?.name ?? "시험"} ${appliedExamRound}회차 성적을 저장했습니다.`,
        notice: "저장된 성적은 학생 화면과 집계 화면에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성적 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExamTypeChange(nextExamTypeId: string) {
    if (nextExamTypeId === selectedExamTypeId) {
      return;
    }

    if (examRoundInput.trim() && !normalizedRoundInput) {
      toast.error("회차는 1 이상의 숫자로 입력해 주세요.");
      return;
    }

    if (!(await confirmDiscardChanges("시험 변경"))) {
      return;
    }

    const nextRound = normalizedRoundInput ?? appliedExamRound;
    setExamRoundInput(nextRound);
    setAppliedExamRound(nextRound);
    setSelectedExamTypeId(nextExamTypeId);
  }

  async function handleApplyRound() {
    if (!normalizedRoundInput) {
      toast.error("회차는 1 이상의 숫자로 입력해 주세요.");
      return;
    }

    if (normalizedRoundInput === appliedExamRound) {
      toast.message("현재 보고 있는 회차와 같습니다.");
      return;
    }

    if (!(await confirmDiscardChanges("회차 변경"))) {
      return;
    }

    setExamRoundInput(normalizedRoundInput);
    setAppliedExamRound(normalizedRoundInput);
  }

  async function handleRefresh() {
    if (!(await confirmDiscardChanges("시트 새로고침"))) {
      return;
    }

    setIsRefreshing(true);
    void loadSheet({ showToast: true });
  }

  function applyPaste() {
    if (!sheet || !pasteText.trim()) {
      return;
    }

    const lines = pasteText
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    const studentIndexByToken = new Map<string, number>();
    rows.forEach((row, index) => {
      studentIndexByToken.set(row.studentNumber, index);
      studentIndexByToken.set(row.studentName, index);
    });

    const nextRows = [...rows];
    let appliedCount = 0;

    lines.forEach((line, lineIndex) => {
      const cells = line.split("\t");
      const firstToken = cells[0]?.trim();
      const matchedIndex = firstToken ? studentIndexByToken.get(firstToken) : undefined;
      const targetIndex = matchedIndex ?? lineIndex;
      const valueOffset = matchedIndex !== undefined ? 1 : 0;

      if (targetIndex < 0 || targetIndex >= nextRows.length) {
        return;
      }

      const currentRow = nextRows[targetIndex];
      const nextScores = { ...currentRow.scores };

      sheet.subjects.forEach((subject, subjectIndex) => {
        const rawCell = cells[valueOffset + subjectIndex] ?? "";
        nextScores[subject.id] = normalizeNumericCell(rawCell);
      });

      const rawNote = cells[valueOffset + sheet.subjects.length]?.trim();

      nextRows[targetIndex] = {
        ...currentRow,
        scores: nextScores,
        totalScore: sumRowScores(nextScores),
        notes: rawNote ? rawNote : currentRow.notes,
      };
      appliedCount += 1;
    });

    setRows(nextRows);
    setPasteText("");
    toast.success(`${appliedCount}명의 점수 행을 붙여넣기에서 반영했습니다.`);
  }

  if (examTypes.length === 0) {
    return (
      <section className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-6 py-10 text-sm text-slate-600">
        시험 템플릿이 아직 없습니다. 먼저 시험 설정 화면에서 직렬별 시험 템플릿을
        만들어 주세요.
      </section>
    );
  }

  const summaryCards = [
    {
      label: "대상 직렬",
      value: formatTrackLabel(sheet?.studyTrack ?? selectedExamType?.studyTrack ?? null),
      hint: "현재 선택한 시험 템플릿 기준",
    },
    {
      label: "대상 학생",
      value: `${rows.length}명`,
      hint: "해당 직렬 학생만 시트에 포함",
    },
    {
      label: "활성 과목",
      value: `${selectedExamType?.subjects.filter((subject) => subject.isActive).length ?? 0}개`,
      hint: "시험 템플릿 기준",
    },
    {
      label: "편집 상태",
      value: blockingChangeMessage ? "변경 내용 있음" : "저장 완료",
      hint: blockingChangeMessage ?? "현재 시트와 서버 상태가 같습니다.",
    },
  ];

  return (
    <>
      <UnsavedChangesGuard
        isDirty={Boolean(blockingChangeMessage)}
        message={
          blockingChangeMessage
            ? `${blockingChangeMessage}이 있습니다. 페이지를 떠나면 변경 내용이 사라집니다.`
            : "저장하지 않은 변경사항이 있습니다. 페이지를 떠나시겠습니까?"
        }
      />
      <div className="space-y-6 pb-28">
        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                성적 데스크
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
                시험 성적 입력
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                시험, 회차, 날짜, 붙여넣기와 저장 순서를 한 화면에서 처리합니다. 저장 전
                내부 이동과 브라우저 이탈도 경고 후 진행됩니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!sheet}
                onClick={() => {
                  if (!sheet || !selectedExamType) return;
                  const url = new URL(`/api/${divisionSlug}/exams/template`, window.location.origin);
                  url.searchParams.set("examTypeId", selectedExamType.id);
                  url.searchParams.set("examRound", appliedExamRound);
                  triggerDownload(url.toString());
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                CSV 양식 다운로드
              </button>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing || isLoading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing || isLoading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                시트 새로고침
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !sheet}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                성적 저장
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-4"
              >
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{card.value}</p>
                <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-4 md:grid-cols-[1.3fr_0.8fr_0.6fr_1fr]">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">시험 템플릿</span>
                <select
                  value={selectedExamTypeId}
                  onChange={(event) => void handleExamTypeChange(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  {examTypes.map((examType) => (
                    <option key={examType.id} value={examType.id}>
                      [{formatTrackLabel(examType.studyTrack)}] {examType.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">회차</span>
                <input
                  value={examRoundInput}
                  onChange={(event) => setExamRoundInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleApplyRound();
                    }
                  }}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  inputMode="numeric"
                  placeholder="1"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void handleApplyRound()}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  회차 적용
                </button>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">시험일</span>
                <input
                  type="date"
                  value={examDate}
                  onChange={(event) => setExamDate(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-xl font-bold text-slate-950">붙여넣기 입력</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                <code>수험번호 + 과목 점수</code> 또는 <code>과목 점수만</code> 탭으로 구분해
                붙여넣을 수 있습니다.
              </p>
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                className="mt-3 min-h-[120px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                placeholder={"P-2026-001\t80\t76\t72\t84\t88\nP-2026-002\t88\t80\t78\t86\t90"}
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={applyPaste}
                  className="rounded-full border border-slate-200-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  붙여넣기 반영
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                성적 시트
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">
                {selectedExamType?.name || "시험"} {appliedExamRound}회차 성적 시트
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                선택한 템플릿의 대상 직렬 학생만 표시됩니다. 총점은 입력값 기준으로 즉시
                계산됩니다.
              </p>
            </div>

            {selectedExamType ? (
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  직렬 {formatTrackLabel(selectedExamType.studyTrack)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  과목 {selectedExamType.subjects.filter((subject) => subject.isActive).length}개
                </span>
              </div>
            ) : null}
          </div>

          {sheet ? (
            <>
              <div className="mt-5 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                대상 직렬{" "}
                <span className="font-semibold text-slate-900">{formatTrackLabel(sheet.studyTrack)}</span>
                <span className="mx-2 text-slate-300">|</span>
                대상 학생 <span className="font-semibold text-slate-900">{rows.length}명</span>
                <span className="mx-2 text-slate-300">|</span>
                현재 회차 <span className="font-semibold text-slate-900">{sheet.examRound}회차</span>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-[1160px] divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-3 font-medium">수험번호</th>
                      <th className="px-3 py-3 font-medium">이름</th>
                      {sheet.subjects.map((subject) => (
                        <th key={subject.id} className="px-3 py-3 font-medium">
                          <div>
                            <p>{subject.name}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{getSubjectMeta(subject)}</p>
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-3 font-medium">총점</th>
                      <th className="px-3 py-3 font-medium">석차</th>
                      <th className="px-3 py-3 font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const previewTotal = sumRowScores(row.scores);

                      return (
                        <tr key={row.studentId} className="align-top">
                          <td className="px-3 py-3 font-medium text-slate-700">{row.studentNumber}</td>
                          <td className="px-3 py-3 font-medium text-slate-950">{row.studentName}</td>
                          {sheet.subjects.map((subject) => (
                            <td key={subject.id} className="px-3 py-3">
                              <input
                                value={row.scores[subject.id] ?? ""}
                                onChange={(event) =>
                                  updateRow(row.studentId, (current) => ({
                                    ...current,
                                    scores: {
                                      ...current.scores,
                                      [subject.id]: normalizeNumericCell(event.target.value),
                                    },
                                  }))
                                }
                                className="w-24 rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                                inputMode="numeric"
                                placeholder="-"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-3 font-semibold text-slate-950">{previewTotal ?? "-"}</td>
                          <td className="px-3 py-3 text-slate-600">
                            {row.rankInClass ? `${row.rankInClass}등` : "-"}
                          </td>
                          <td className="px-3 py-3">
                            <input
                              value={row.notes ?? ""}
                              onChange={(event) =>
                                updateRow(row.studentId, (current) => ({
                                  ...current,
                                  notes: event.target.value,
                                }))
                              }
                              className="w-56 rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                              placeholder="메모"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
              {isLoading
                ? "성적 시트를 불러오는 중입니다."
                : "시험 템플릿과 회차를 선택해 주세요."}
            </div>
          )}
        </section>
      </div>

      {sheet && blockingChangeMessage ? (
        <div className="fixed bottom-6 left-4 right-4 z-40 mx-auto max-w-5xl">
          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white/95 px-5 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-950">{blockingChangeMessage}이 있습니다.</p>
                  <p className="mt-1 text-sm text-slate-600">
                    시험 변경, 회차 변경, 내부 이동, 새로고침 전에 저장하거나 정리해 주세요.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  className="rounded-full border border-slate-200-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  다시 불러오기
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  변경 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
