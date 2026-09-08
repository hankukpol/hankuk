"use client";

import { ChevronLeft, ChevronRight, Download, LoaderCircle, Save, Upload } from "lucide-react";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import {
  inferDelimitedFileDelimiter,
  parseDelimitedLine,
  readTextFileWithEncoding,
} from "@/lib/csv";
import type { ExamTypeItem } from "@/lib/services/exam.service";
import type { MorningExamDailySheet, MorningExamWeeklySummary } from "@/lib/services/morning-exam.service";

type MorningExamScoreManagerProps = {
  divisionSlug: string;
  morningExamTypes: ExamTypeItem[];
};

type EditableRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  score: string;
  notes: string;
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getIsoWeekInfo(dateStr: string): { weekYear: number; weekNumber: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() - ((dayOfWeek + 6) % 7) + 3);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7,
  );
  return { weekYear: thursday.getUTCFullYear(), weekNumber };
}

function parseScoreInput(value: string): number | null {
  const trimmed = value.trim().replaceAll(",", "");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function sheetToRows(sheet: MorningExamDailySheet): EditableRow[] {
  return sheet.rows.map((row) => ({
    studentId: row.studentId,
    studentName: row.studentName,
    studentNumber: row.studentNumber,
    score: row.score !== null ? String(row.score) : "",
    notes: row.notes ?? "",
  }));
}

function triggerDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.click();
}

export function MorningExamScoreManager({
  divisionSlug,
  morningExamTypes,
}: MorningExamScoreManagerProps) {
  const [viewTab, setViewTab] = useState<"daily" | "weekly">("daily");
  const [selectedExamTypeId, setSelectedExamTypeId] = useState(morningExamTypes[0]?.id ?? "");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [examDate, setExamDate] = useState(getKstToday());
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<MorningExamWeeklySummary | null>(null);
  const [isLoadingWeekly, setIsLoadingWeekly] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedExamType = useMemo(
    () => morningExamTypes.find((t) => t.id === selectedExamTypeId),
    [morningExamTypes, selectedExamTypeId],
  );

  const activeSubjects = useMemo(
    () => selectedExamType?.subjects.filter((s) => s.isActive) ?? [],
    [selectedExamType],
  );

  useEffect(() => {
    if (activeSubjects.length > 0 && !activeSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(activeSubjects[0].id);
    }
  }, [activeSubjects, selectedSubjectId]);

  const selectedSubject = useMemo(
    () => activeSubjects.find((s) => s.id === selectedSubjectId),
    [activeSubjects, selectedSubjectId],
  );

  const loadDailySheet = useCallback(async () => {
    if (!selectedExamTypeId || !selectedSubjectId || !examDate) return;
    setIsLoadingSheet(true);
    try {
      const response = await fetch(
        `/api/${divisionSlug}/morning-exams?examTypeId=${selectedExamTypeId}&subjectId=${selectedSubjectId}&date=${examDate}`,
        { cache: "no-store" },
      );
      const data: MorningExamDailySheet = await response.json();
      if (!response.ok) throw new Error((data as unknown as { error: string }).error);
      setRows(sheetToRows(data));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성적 시트를 불러오지 못했습니다.");
    } finally {
      setIsLoadingSheet(false);
    }
  }, [divisionSlug, selectedExamTypeId, selectedSubjectId, examDate]);

  useEffect(() => {
    if (selectedExamTypeId && selectedSubjectId && examDate) {
      void loadDailySheet();
    }
  }, [selectedExamTypeId, selectedSubjectId, examDate, loadDailySheet]);

  const loadWeeklySummary = useCallback(async () => {
    if (!selectedExamTypeId) return;
    setIsLoadingWeekly(true);
    try {
      const baseDate = new Date(examDate);
      baseDate.setDate(baseDate.getDate() + weekOffset * 7);
      const dateStr = baseDate.toISOString().slice(0, 10);
      const { weekYear, weekNumber } = getIsoWeekInfo(dateStr);

      const response = await fetch(
        `/api/${divisionSlug}/morning-exams/weekly?examTypeId=${selectedExamTypeId}&weekYear=${weekYear}&weekNumber=${weekNumber}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWeeklySummary(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "주간 집계를 불러오지 못했습니다.");
    } finally {
      setIsLoadingWeekly(false);
    }
  }, [divisionSlug, selectedExamTypeId, examDate, weekOffset]);

  useEffect(() => {
    if (selectedExamTypeId) {
      void loadWeeklySummary();
    }
  }, [selectedExamTypeId, loadWeeklySummary]);

  function handleRowScoreChange(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, score: value } : row)),
    );
  }

  function handleRowNotesChange(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, notes: value } : row)),
    );
  }

  function handlePaste() {
    const text = pasteRef.current?.value ?? "";
    if (!text.trim()) return;

    const lines = text.trim().split("\n");
    const updatedRows = [...rows];

    for (const line of lines) {
      const cols = line.split("\t");
      if (cols.length < 1) continue;

      const studentNumber = cols[0]?.trim();
      const scoreValue = cols.length >= 3 ? cols[2]?.trim() : cols.length >= 2 ? cols[1]?.trim() : "";
      const notesValue = cols.length >= 4 ? cols[3]?.trim() : "";

      const idx = updatedRows.findIndex((r) => r.studentNumber === studentNumber);
      if (idx >= 0) {
        updatedRows[idx] = {
          ...updatedRows[idx],
          score: scoreValue ?? updatedRows[idx].score,
          notes: notesValue || updatedRows[idx].notes,
        };
      }
    }

    setRows(updatedRows);
    if (pasteRef.current) pasteRef.current.value = "";
    toast.success("붙여넣기 데이터를 반영했습니다.");
  }

  function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    void (async () => {
      const text = await readTextFileWithEncoding(file);
      if (!text) return;

      const delimiter = inferDelimitedFileDelimiter(text);
      const lines = text.trim().split(/\r?\n/);
      const updatedRows = [...rows];
      let matchCount = 0;

      for (const line of lines) {
        const cols = parseDelimitedLine(line, delimiter);
        if (cols.length < 2) continue;

        const studentNumber = cols[0]?.trim();
        if (
          !studentNumber ||
          studentNumber === "수험번호" ||
          studentNumber.toLowerCase().startsWith("sep=")
        ) {
          continue;
        }

        const hasNameColumn = cols.length >= 4;
        const scoreValue = hasNameColumn ? cols[2]?.trim() : cols[1]?.trim();
        const notesValue = hasNameColumn ? cols[3]?.trim() : cols[2]?.trim() ?? "";

        const idx = updatedRows.findIndex((r) => r.studentNumber === studentNumber);
        if (idx >= 0) {
          updatedRows[idx] = {
            ...updatedRows[idx],
            score: scoreValue ?? updatedRows[idx].score,
            notes: notesValue || updatedRows[idx].notes,
          };
          matchCount += 1;
        }
      }

      setRows(updatedRows);
      toast.success(`CSV 파일에서 ${matchCount}명의 성적을 반영했습니다.`);
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : "CSV 파일을 읽지 못했습니다.");
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDownloadTemplate() {
    if (!selectedExamType || !selectedSubject) return;
    const url = new URL(`/api/${divisionSlug}/morning-exams/template`, window.location.origin);
    url.searchParams.set("examTypeId", selectedExamType.id);
    url.searchParams.set("subjectId", selectedSubject.id);
    url.searchParams.set("date", examDate);
    triggerDownload(url.toString());
  }

  function handleDownloadWeeklyCsv() {
    if (!weeklySummary) return;
    const url = new URL(`/api/${divisionSlug}/morning-exams/weekly/export`, window.location.origin);
    url.searchParams.set("examTypeId", weeklySummary.examTypeId);
    url.searchParams.set("weekYear", String(weeklySummary.weekYear));
    url.searchParams.set("weekNumber", String(weeklySummary.weekNumber));
    triggerDownload(url.toString());
  }

  async function handleSave() {
    if (!selectedExamTypeId || !selectedSubjectId || !examDate) return;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/morning-exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examTypeId: selectedExamTypeId,
          subjectId: selectedSubjectId,
          date: examDate,
          rows: rows.map((row) => ({
            studentId: row.studentId,
            score: parseScoreInput(row.score),
            notes: row.notes.trim() || null,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(`${data.savedCount}명의 성적을 저장했습니다.`);
      void loadWeeklySummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성적 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  if (morningExamTypes.length === 0) {
    return (
      <div className="admin-help py-6 text-center">
        등록된 아침모의고사 템플릿이 없습니다. 설정 &gt; 시험 템플릿에서 아침모의고사 템플릿을 먼저 추가해주세요.
      </div>
    );
  }

  return (
    <div className="admin-flat-page">
      <AdminTabs
        items={[{ id: "daily", label: "일일 성적 입력" }, { id: "weekly", label: "주간 성적 현황" }]}
        activeId={viewTab}
        onChange={setViewTab}
        label="아침 모의고사 업무"
        idPrefix="morning-view"
        variant="secondary"
      />
        <div className="admin-filter-bar">
          <label className="block">
            <span className="admin-help mb-1 block">시험 템플릿</span>
            <select
              value={selectedExamTypeId}
              onChange={(e) => {
                setSelectedExamTypeId(e.target.value);
                setWeekOffset(0);
              }}
              className="w-full"
            >
              {morningExamTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.studyTrack ? `(${t.studyTrack})` : ""}
                </option>
              ))}
            </select>
          </label>

          {viewTab === "daily" ? <label className="block">
            <span className="admin-help mb-1 block">과목 선택</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full"
            >
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.maxScore ? `(만점 ${s.maxScore})` : ""}
                </option>
              ))}
            </select>
          </label> : null}

          <label className="block">
            <span className="admin-help mb-1 block">{viewTab === "daily" ? "시험일" : "기준일"}</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => {
                setExamDate(e.target.value);
                setWeekOffset(0);
              }}
              className="w-full"
            />
          </label>
        </div>


      <AdminTabPanel id="daily" activeId={viewTab} idPrefix="morning-view" className="space-y-4">
        <h2 className="admin-section-title">일일 성적 입력</h2>

        <div className="mt-4">
          <details open className="group">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">
              엑셀에서 붙여넣기 / CSV 업로드
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <p className="admin-help">
                  엑셀에서 &quot;수험번호 / 이름 / 점수 / 비고&quot; 순서로 복사한 뒤 아래 영역에 붙여넣으세요.
                  수험번호로 학생을 매칭합니다.
                </p>
                <textarea
                  ref={pasteRef}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-sm"
                  placeholder={"P-001\t홍길동\t85\t\nP-002\t김철수\t92\t잘함"}
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="admin-button mt-2"
                >
                  붙여넣기 반영
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="admin-button"
                >
                  <Download className="h-4 w-4" />
                  CSV 양식 다운로드
                </button>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  <Upload className="h-4 w-4" />
                  CSV 업로드
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </details>
        </div>

        {isLoadingSheet ? (
          <div className="mt-6 flex items-center justify-center py-12">
            <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <div className="admin-table-frame mt-4 overflow-x-auto">
              <table className="min-w-[600px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th>수험번호</th>
                    <th>이름</th>
                    <th>
                      점수 {selectedSubject?.maxScore ? `(만점 ${selectedSubject.maxScore})` : ""}
                    </th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.studentId} className="align-top">
                      <td>{row.studentNumber}</td>
                      <td>{row.studentName}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`${row.studentName} 점수`}
                          value={row.score}
                          onChange={(e) => handleRowScoreChange(row.studentId, e.target.value)}
                          className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="-"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          aria-label={`${row.studentName} 비고`}
                          value={row.notes}
                          onChange={(e) => handleRowNotesChange(row.studentId, e.target.value)}
                          className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder=""
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || rows.length === 0}
                className="admin-button admin-button-primary"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                성적 저장
              </button>
              <span className="admin-help">{rows.length}명</span>
            </div>
          </>
        )}
      </AdminTabPanel>

      <AdminTabPanel id="weekly" activeId={viewTab} idPrefix="morning-view" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">주간 성적 현황</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="admin-button admin-button-compact w-11 px-0"
              aria-label="이전 주"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="admin-button admin-button-compact"
              >
                이번 주
              </button>
            )}

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="admin-button admin-button-compact w-11 px-0"
              aria-label="다음 주"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {weeklySummary && (
              <button
                type="button"
                onClick={handleDownloadWeeklyCsv}
                className="admin-button"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
            )}
          </div>
        </div>

        {isLoadingWeekly ? (
          <div className="mt-6 flex items-center justify-center py-12">
            <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : weeklySummary ? (
          <div className="mt-4">
            <p className="admin-help">
              {weeklySummary.weekYear}년 {weeklySummary.weekNumber}주차
              ({weeklySummary.weekDateRange.start} ~ {weeklySummary.weekDateRange.end})
            </p>

            <div className="admin-table-frame mt-3 overflow-x-auto">
              <table className="min-w-[800px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th>이름</th>
                    {weeklySummary.dailyEntries.map((entry) => (
                      <th key={entry.date} className="px-3 py-3 text-center font-medium">
                        <div>{entry.dayOfWeek}</div>
                        <div className="admin-help">{entry.subjectName}</div>
                      </th>
                    ))}
                    <th>주간합</th>
                    <th>평균</th>
                    <th>석차</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklySummary.rankings.map((ranking) => (
                    <tr key={ranking.studentId} className="align-top">
                      <td>
                        {ranking.studentName}
                      </td>
                      {weeklySummary.dailyEntries.map((entry) => {
                        const ds = ranking.dailyScores[entry.date];
                        return (
                          <td
                            key={entry.date}
                            className="px-3 py-2 text-center text-slate-700"
                          >
                            {ds?.score !== null && ds?.score !== undefined ? ds.score : "-"}
                          </td>
                        );
                      })}
                      <td>
                        {ranking.weeklyTotal ?? "-"}
                      </td>
                      <td>
                        {ranking.weeklyAverage ?? "-"}
                      </td>
                      <td>
                        {ranking.weeklyRank ? `${ranking.weeklyRank}등` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {weeklySummary.rankings.length === 0 && (
              <p className="admin-help mt-4 text-center">
                이 주차에 등록된 성적이 없습니다.
              </p>
            )}
          </div>
        ) : (
          <p className="admin-help mt-4">
            시험 템플릿을 선택하면 주간 성적이 표시됩니다.
          </p>
        )}
      </AdminTabPanel>
    </div>
  );
}
