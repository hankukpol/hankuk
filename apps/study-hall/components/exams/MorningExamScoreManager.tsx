"use client";

import { ChevronLeft, ChevronRight, Download, LoaderCircle, Save, Upload } from "lucide-react";
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
      <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
        등록된 아침모의고사 템플릿이 없습니다. 설정 &gt; 시험 템플릿에서 아침모의고사 템플릿을 먼저 추가해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">일일 입력</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">일일 성적 입력</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">시험 템플릿</span>
            <select
              value={selectedExamTypeId}
              onChange={(e) => {
                setSelectedExamTypeId(e.target.value);
                setWeekOffset(0);
              }}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            >
              {morningExamTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.studyTrack ? `(${t.studyTrack})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">과목 선택</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            >
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.maxScore ? `(만점 ${s.maxScore})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">시험일</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => {
                setExamDate(e.target.value);
                setWeekOffset(0);
              }}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>
        </div>

        <div className="mt-4">
          <details open className="group">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">
              엑셀에서 붙여넣기 / CSV 업로드
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs text-slate-500">
                  엑셀에서 &quot;수험번호 / 이름 / 점수 / 비고&quot; 순서로 복사한 뒤 아래 영역에 붙여넣으세요.
                  수험번호로 학생을 매칭합니다.
                </p>
                <textarea
                  ref={pasteRef}
                  rows={4}
                  className="mt-2 w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-slate-400"
                  placeholder={"P-001\t홍길동\t85\t\nP-002\t김철수\t92\t잘함"}
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  붙여넣기 반영
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  CSV 양식 다운로드
                </button>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
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
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[600px] divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-3 font-medium">수험번호</th>
                    <th className="px-3 py-3 font-medium">이름</th>
                    <th className="px-3 py-3 font-medium">
                      점수 {selectedSubject?.maxScore ? `(만점 ${selectedSubject.maxScore})` : ""}
                    </th>
                    <th className="px-3 py-3 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.studentId} className="align-top">
                      <td className="px-3 py-2 text-slate-600">{row.studentNumber}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.studentName}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.score}
                          onChange={(e) => handleRowScoreChange(row.studentId, e.target.value)}
                          className="w-24 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => handleRowNotesChange(row.studentId, e.target.value)}
                          className="w-32 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
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
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                성적 저장
              </button>
              <span className="text-sm text-slate-500">{rows.length}명</span>
            </div>
          </>
        )}
      </section>

      <section className="rounded-[10px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              주간 요약
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">주간 성적 현황</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              aria-label="이전 주"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                이번 주
              </button>
            )}

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              aria-label="다음 주"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {weeklySummary && (
              <button
                type="button"
                onClick={handleDownloadWeeklyCsv}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
            <p className="text-sm text-slate-600">
              {weeklySummary.weekYear}년 {weeklySummary.weekNumber}주차
              ({weeklySummary.weekDateRange.start} ~ {weeklySummary.weekDateRange.end})
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[800px] divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-3 font-medium">이름</th>
                    {weeklySummary.dailyEntries.map((entry) => (
                      <th key={entry.date} className="px-3 py-3 text-center font-medium">
                        <div>{entry.dayOfWeek}</div>
                        <div className="text-xs font-normal text-slate-400">{entry.subjectName}</div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-bold">주간합</th>
                    <th className="px-3 py-3 text-center font-bold">평균</th>
                    <th className="px-3 py-3 text-center font-bold">석차</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weeklySummary.rankings.map((ranking) => (
                    <tr key={ranking.studentId} className="align-top">
                      <td className="px-3 py-2 font-medium text-slate-900">
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
                      <td className="px-3 py-2 text-center font-bold text-slate-900">
                        {ranking.weeklyTotal ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">
                        {ranking.weeklyAverage ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-[var(--division-color)]">
                        {ranking.weeklyRank ? `${ranking.weeklyRank}등` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {weeklySummary.rankings.length === 0 && (
              <p className="mt-4 text-center text-sm text-slate-500">
                이 주차에 등록된 성적이 없습니다.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            시험 템플릿을 선택하면 주간 성적이 표시됩니다.
          </p>
        )}
      </section>
    </div>
  );
}
