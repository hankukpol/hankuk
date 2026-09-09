"use client";

import { Download, LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { isExamDate } from "@/lib/exam-meta";
import type { ExamScoreSheet, ExamTypeItem } from "@/lib/services/exam.service";

type ExamScoreManagerProps = {
  divisionSlug: string;
  initialExamTypes: ExamTypeItem[];
  initialSelection?: { examTypeId: string; examDate: string; examRound?: number };
};

type ScoreSheetRow = ExamScoreSheet["rows"][number];
type EditableRow = ScoreSheetRow & {
  scoreInputs: Record<string, string>;
};

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

function splitPasteCells(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return [];
  }

  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim());
  }

  if (line.includes(",")) {
    return line.split(",").map((cell) => cell.trim());
  }

  return trimmed.split(/\s+/);
}

function isScoreInputDraft(value: string) {
  const trimmed = value.trim();
  return trimmed === "" || /^[\d,]*\.?\d*$/.test(trimmed);
}

function formatScoreInput(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function buildScoreInputs(
  subjects: ExamScoreSheet["subjects"],
  scores: Record<string, number | null>,
) {
  return Object.fromEntries(
    subjects.map((subject) => [subject.id, formatScoreInput(scores[subject.id])]),
  );
}

function toEditableRows(sheet: ExamScoreSheet): EditableRow[] {
  return sheet.rows.map((row) => ({
    ...row,
    scoreInputs: buildScoreInputs(sheet.subjects, row.scores),
  }));
}

function normalizeDate(value: string) {
  return isExamDate(value) ? value : null;
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
  initialSelection,
}: ExamScoreManagerProps) {
  const [examTypes] = useState(initialExamTypes);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(initialSelection?.examTypeId ?? initialExamTypes[0]?.id ?? "");
  const [examDateInput, setExamDateInput] = useState(initialSelection?.examDate ?? getKstToday());
  const [appliedExamDate, setAppliedExamDate] = useState(initialSelection?.examDate ?? getKstToday());
  const [examDate, setExamDate] = useState(initialSelection?.examDate ?? getKstToday());
  const requestVersion = useRef(0);
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
  const normalizedDateInput = useMemo(
    () => normalizeDate(examDateInput),
    [examDateInput],
  );
  const currentSnapshot = useMemo(() => buildSnapshot(rows, examDate), [examDate, rows]);
  const hasUnsavedChanges =
    Boolean(sheet) && savedSnapshot.length > 0 && currentSnapshot !== savedSnapshot;
  const hasPendingDateChange =
    normalizedDateInput !== null && normalizedDateInput !== appliedExamDate;
  const blockingChangeMessage = useMemo(() => {
    if (hasUnsavedChanges && hasPendingDateChange) {
      return "저장하지 않은 성적 입력과 적용되지 않은 시험일 변경";
    }
    if (hasUnsavedChanges) {
      return "저장하지 않은 성적 입력";
    }
    if (hasPendingDateChange) {
      return "적용되지 않은 시험일 변경";
    }
    return null;
  }, [hasPendingDateChange, hasUnsavedChanges]);

  async function loadSheet(options?: {
    showToast?: boolean;
    targetExamTypeId?: string;
    targetDate?: string;
  }) {
    const nextExamTypeId = options?.targetExamTypeId ?? selectedExamTypeId;
    const nextDate = options?.targetDate ?? appliedExamDate;

    if (!nextExamTypeId) {
      setSheet(null);
      setRows([]);
      setSavedSnapshot("");
      return;
    }

    const normalizedDate = normalizeDate(nextDate);
    if (!normalizedDate) {
      toast.error("올바른 시험일을 선택해 주세요.");
      setIsRefreshing(false);
      return;
    }

    const version = ++requestVersion.current;
    setSheet(null);
    setRows([]);
    setSavedSnapshot("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/${divisionSlug}/exams?${new URLSearchParams({ examTypeId: nextExamTypeId, examDate: normalizedDate })}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (version !== requestVersion.current) return;

      if (!response.ok) {
        throw new Error(data.error ?? "성적 시트를 불러오지 못했습니다.");
      }

      const nextExamDate = data.sheet.examDate ?? normalizedDate;

      const editableRows = toEditableRows(data.sheet);

      setSheet(data.sheet);
      setRows(editableRows);
      setExamDate(nextExamDate);
      setExamDateInput(normalizedDate);
      setSavedSnapshot(buildSnapshot(editableRows, nextExamDate));

      if (options?.showToast) {
        toast.success("성적 시트를 새로 불러왔습니다.");
      }
    } catch (error) {
      if (version === requestVersion.current) toast.error(error instanceof Error ? error.message : "성적 시트를 불러오지 못했습니다.");
    } finally {
      if (version === requestVersion.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }

  useEffect(() => {
    void loadSheet();
    const pendingRequests = requestVersion;
    return () => { pendingRequests.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionSlug, selectedExamTypeId, appliedExamDate]);

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
    if (!sheet || isSaving || isLoading) return;
    if (hasPendingDateChange || !normalizedDateInput) {
      toast.error("시험일을 먼저 적용해 주세요.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examTypeId: sheet.examTypeId,
          examDate: appliedExamDate,
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

      const editableRows = toEditableRows(data.sheet);

      setSheet(data.sheet);
      setRows(editableRows);
      setExamDate(nextExamDate);
      setSavedSnapshot(buildSnapshot(editableRows, nextExamDate));
      toast.success("성적을 저장했습니다.");
      showActionComplete({
        title: "성적 저장 완료",
        description: `${selectedExamType?.name ?? "시험"} ${appliedExamDate} 성적을 저장했습니다.`,
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

    if (examDateInput.trim() && !normalizedDateInput) {
      toast.error("올바른 시험일을 선택해 주세요.");
      return;
    }

    if (!(await confirmDiscardChanges("시험 변경"))) {
      return;
    }

    const nextDate = normalizedDateInput ?? appliedExamDate;
    setExamDateInput(nextDate);
    setAppliedExamDate(nextDate);
    setSelectedExamTypeId(nextExamTypeId);
  }

  async function handleApplyDate() {
    if (!normalizedDateInput) {
      toast.error("올바른 시험일을 선택해 주세요.");
      return;
    }

    if (normalizedDateInput === appliedExamDate) {
      toast.message("현재 보고 있는 시험일과 같습니다.");
      return;
    }

    if (!(await confirmDiscardChanges("시험일 변경"))) {
      return;
    }

    setExamDateInput(normalizedDateInput);
    setAppliedExamDate(normalizedDateInput);
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
      const cells = splitPasteCells(line);
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

      const rawNote = cells.slice(valueOffset + sheet.subjects.length).join(" ").trim();

      nextRows[targetIndex] = {
        ...currentRow,
        scores: nextScores,
        scoreInputs: buildScoreInputs(sheet.subjects, nextScores),
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
      <section className="admin-help px-6 py-10">
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
        <section className="admin-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="admin-section-title">
                시험 성적 입력
              </h2>
              <p className="admin-page-description">
                시험, 시험일, 붙여넣기와 저장 순서를 한 화면에서 처리합니다. 저장 전
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
                  url.searchParams.set("examRound", String(sheet.examRound));
                  triggerDownload(url.toString());
                }}
                className="admin-button"
              >
                <Download className="h-4 w-4" />
                CSV 양식 다운로드
              </button>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isSaving || isRefreshing || isLoading}
                className="admin-button"
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
                disabled={isSaving || isLoading || !sheet || hasPendingDateChange}
                className="admin-button admin-button-primary"
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
                className="admin-section"
              >
                <p className="admin-help">{card.label}</p>
                <h2 className="admin-section-title">{card.value}</h2>
                <p className="admin-help mt-1">{card.hint}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="admin-filter-bar">
              <label className="block">
                <span className="admin-label mb-2 block">시험 템플릿</span>
                <select
                  disabled={isSaving}
                  value={selectedExamTypeId}
                  onChange={(event) => void handleExamTypeChange(event.target.value)}
                  className="w-full"
                >
                  {examTypes.map((examType) => (
                    <option key={examType.id} value={examType.id}>
                      [{formatTrackLabel(examType.studyTrack)}] {examType.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">시험일</span>
                <input
                  type="date"
                  disabled={isSaving}
                  value={examDateInput}
                  onChange={(event) => setExamDateInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleApplyDate();
                    }
                  }}
                  className="w-full"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  disabled={isSaving || isLoading}
                  onClick={() => void handleApplyDate()}
                  className="admin-button w-full"
                >
                  시험일 적용
                </button>
              </div>
            </div>

            <div className="admin-section">
              <h2 className="admin-section-title">붙여넣기 입력</h2>
              <p className="admin-help mt-2 leading-5">
                <span className="font-semibold">수험번호 + 과목 점수</span> 또는 <span className="font-semibold">과목 점수만</span> 탭으로 구분해
                붙여넣을 수 있습니다.
              </p>
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                className="mt-3 min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                placeholder={"P-2026-001\t80\t76\t72\t84\t88.5\nP-2026-002\t88\t80\t78\t86\t90"}
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={applyPaste}
                  className="admin-button"
                >
                  붙여넣기 반영
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-section">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="admin-section-title">
                {selectedExamType?.name || "시험"} {appliedExamDate} 성적 시트
              </h3>
              <p className="admin-help mt-2 leading-6">
                선택한 템플릿의 대상 직렬 학생만 표시됩니다.
              </p>
            </div>

            {selectedExamType ? (
              <div className="flex flex-wrap gap-2">
                <span className="admin-badge">
                  직렬 {formatTrackLabel(selectedExamType.studyTrack)}
                </span>
                <span className="admin-badge">
                  과목 {selectedExamType.subjects.filter((subject) => subject.isActive).length}개
                </span>
              </div>
            ) : null}
          </div>

          {sheet ? (
            <>
              <div className="admin-notice mt-5">
                대상 직렬 <strong>{formatTrackLabel(sheet.studyTrack)}</strong>
                {" · "}대상 학생 <strong>{rows.length}명</strong>
                {" · "}현재 시험일 <strong>{sheet.examDate}</strong>
              </div>

              <div className="admin-table-frame mt-6 overflow-x-auto">
                <table className="min-w-[1160px]">
                  <thead>
                    <tr>
                      <th>수험번호</th>
                      <th>이름</th>
                      {sheet.subjects.map((subject) => (
                        <th key={subject.id}>
                          <div>
                            <p>{subject.name}</p>
                            <p className="admin-help mt-1">{getSubjectMeta(subject)}</p>
                          </div>
                        </th>
                      ))}
                      <th>총점</th>
                      <th>석차</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const previewTotal = sumRowScores(row.scores);

                      return (
                        <tr key={row.studentId} className="align-top">
                          <td>{row.studentNumber}</td>
                          <td>{row.studentName}</td>
                          {sheet.subjects.map((subject) => (
                            <td key={subject.id} className="px-3 py-3">
                              <input
                                value={
                                  row.scoreInputs[subject.id] ?? formatScoreInput(row.scores[subject.id])
                                }
                                onChange={(event) => {
                                  const nextInput = event.target.value;

                                  if (!isScoreInputDraft(nextInput)) {
                                    return;
                                  }

                                  updateRow(row.studentId, (current) => {
                                    const nextScores = {
                                      ...current.scores,
                                      [subject.id]: normalizeNumericCell(nextInput),
                                    };

                                    return {
                                      ...current,
                                      scores: nextScores,
                                      scoreInputs: {
                                        ...current.scoreInputs,
                                        [subject.id]: nextInput,
                                      },
                                      totalScore: sumRowScores(nextScores),
                                    };
                                  });
                                }}
                                className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition"
                                inputMode="decimal"
                                placeholder="-"
                              />
                            </td>
                          ))}
                          <td>{previewTotal ?? "-"}</td>
                          <td>
                            {row.rankInClass ? `${row.rankInClass}등` : "-"}
                          </td>
                          <td>
                            <input
                              value={row.notes ?? ""}
                              onChange={(event) =>
                                updateRow(row.studentId, (current) => ({
                                  ...current,
                                  notes: event.target.value,
                                }))
                              }
                              className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition"
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
            <div className="admin-help mt-6 px-4 py-6">
              {isLoading
                ? "성적 시트를 불러오는 중입니다."
                : "시험 템플릿과 시험일을 선택해 주세요."}
            </div>
          )}
        </section>
      </div>

      {sheet && blockingChangeMessage ? (
        <div className="fixed bottom-6 left-4 right-4 z-40 mx-auto max-w-5xl">
          <div className="rounded-lg border border-slate-200 bg-white/95 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div>
                  <h2 className="admin-section-title">{blockingChangeMessage}이 있습니다.</h2>
                  <p className="admin-help mt-1">
                    시험 변경, 시험일 변경, 내부 이동, 새로고침 전에 저장하거나 정리해 주세요.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  className="admin-button"
                >
                  다시 불러오기
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isLoading || hasPendingDateChange}
                  className="admin-button admin-button-primary"
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
