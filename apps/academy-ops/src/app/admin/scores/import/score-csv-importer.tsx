"use client";

import { type ChangeEvent, useRef, useState, useTransition } from "react";
import type { PeriodOption, SessionOption, SubjectOption } from "./page";

type CsvRow = {
  row: number;
  examNumber: string;
  scores: Record<string, number>;
  rawValues: Record<string, string>;
  errors: string[];
};

type ImportResult = {
  success: number;
  failed: Array<{ examNumber: string; subject: string; reason: string }>;
  sessionsFound: number;
  totalEntries: number;
};

type SubjectColumn = {
  header: string;
  subjectKey: string;
};

type Props = {
  periodOptions: PeriodOption[];
};

function getUniqueDates(sessions: SessionOption[]): string[] {
  return Array.from(new Set(sessions.map((session) => session.examDate.slice(0, 10)))).sort();
}

function getSubjectsForDate(sessions: SessionOption[], date: string): string[] {
  return sessions
    .filter((session) => session.examDate.slice(0, 10) === date)
    .map((session) => session.subject);
}

function buildSessionSubjectLabelMap(
  sessions: SessionOption[],
  subjectOptions: SubjectOption[],
) {
  const labelMap: Record<string, string> = {};

  for (const option of subjectOptions) {
    labelMap[option.key] = option.label;
  }

  for (const session of sessions) {
    const displayName = session.displaySubjectName?.trim();
    if (displayName) {
      labelMap[session.subject] = displayName;
    }
  }

  return labelMap;
}

function getSubjectLabel(
  subjectKey: string,
  sessionLabelMap: Record<string, string>,
) {
  return sessionLabelMap[subjectKey] ?? subjectKey;
}

function formatDateDisplay(iso: string) {
  const date = new Date(iso);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}(${weekdays[date.getDay()]})`;
}

function normalizeHeaderKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function parseCsvText(
  text: string,
  orderedSubjectKeys: string[],
  availableSubjectKeys: Set<string>,
  subjectLabelToKey: Record<string, string>,
): {
  rows: CsvRow[];
  headers: string[];
  subjectColumns: SubjectColumn[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], headers: [], subjectColumns: [] };
  }

  const headers = lines[0].split(",").map((cell) => cell.trim());
  const firstColumnKey = normalizeHeaderKey(headers[0] ?? "");
  const isHeaderRow =
    firstColumnKey === "학번" ||
    firstColumnKey === "examnumber" ||
    firstColumnKey === "수험번호" ||
    firstColumnKey === "번호";

  const subjectColumns: SubjectColumn[] = [];
  const dataStartLine = isHeaderRow ? 1 : 0;

  if (isHeaderRow) {
    for (let index = 1; index < headers.length; index += 1) {
      const header = headers[index];

      if (availableSubjectKeys.has(header)) {
        subjectColumns.push({ header, subjectKey: header });
        continue;
      }

      const subjectKeyByLabel = subjectLabelToKey[header];
      if (subjectKeyByLabel) {
        subjectColumns.push({ header, subjectKey: subjectKeyByLabel });
        continue;
      }

      subjectColumns.push({ header, subjectKey: header });
    }
  }

  const rows: CsvRow[] = [];

  for (let rowIndex = dataStartLine; rowIndex < lines.length; rowIndex += 1) {
    const values = lines[rowIndex].split(",").map((cell) => cell.trim());
    const examNumber = values[0] ?? "";
    const scores: Record<string, number> = {};
    const rawValues: Record<string, string> = {};
    const errors: string[] = [];

    if (!examNumber) {
      rows.push({
        row: rowIndex + 1,
        examNumber: "",
        scores,
        rawValues,
        errors: ["학번이 비어 있습니다."],
      });
      continue;
    }

    if (isHeaderRow) {
      for (let columnIndex = 0; columnIndex < subjectColumns.length; columnIndex += 1) {
        const { header, subjectKey } = subjectColumns[columnIndex];
        const rawValue = values[columnIndex + 1] ?? "";
        rawValues[header] = rawValue;

        if (rawValue === "" || rawValue === "-") {
          continue;
        }

        const score = Number(rawValue);
        if (!Number.isFinite(score)) {
          errors.push(`${header} 점수 "${rawValue}"를 숫자로 읽을 수 없습니다.`);
          continue;
        }

        if (score < 0 || score > 100) {
          errors.push(`${header} 점수 ${score}점은 허용 범위(0~100)를 벗어났습니다.`);
          continue;
        }

        scores[subjectKey] = score;
      }
    } else {
      for (
        let columnIndex = 0;
        columnIndex < orderedSubjectKeys.length && columnIndex + 1 < values.length;
        columnIndex += 1
      ) {
        const subjectKey = orderedSubjectKeys[columnIndex];
        const rawValue = values[columnIndex + 1] ?? "";
        rawValues[subjectKey] = rawValue;

        if (rawValue === "" || rawValue === "-") {
          continue;
        }

        const score = Number(rawValue);
        if (!Number.isFinite(score)) {
          errors.push(`${columnIndex + 2}열 점수 "${rawValue}"를 숫자로 읽을 수 없습니다.`);
          continue;
        }

        if (score < 0 || score > 100) {
          errors.push(`${columnIndex + 2}열 점수 ${score}점은 허용 범위(0~100)를 벗어났습니다.`);
          continue;
        }

        scores[subjectKey] = score;
      }
    }

    rows.push({
      row: rowIndex + 1,
      examNumber,
      scores,
      rawValues,
      errors,
    });
  }

  return {
    rows,
    headers: isHeaderRow ? headers : [],
    subjectColumns,
  };
}

export function ScoreCsvImporter({ periodOptions }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(() => {
    const activeIndex = periodOptions.findIndex((period) => period.isActive);
    return activeIndex >= 0 ? activeIndex : 0;
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvSubjectColumns, setCsvSubjectColumns] = useState<SubjectColumn[]>([]);
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPeriod = periodOptions[selectedPeriodIndex] ?? null;
  const selectedSubjectOptions = selectedPeriod?.subjectOptions ?? [];
  const selectedSessions = selectedPeriod?.sessions ?? [];
  const sessionSubjectLabelMap = buildSessionSubjectLabelMap(selectedSessions, selectedSubjectOptions);
  const availableDates = selectedPeriod ? getUniqueDates(selectedSessions) : [];
  const subjectsOnDate = selectedPeriod && selectedDate
    ? getSubjectsForDate(selectedSessions, selectedDate)
    : [];
  const orderedSubjectKeys =
    subjectsOnDate.length > 0
      ? subjectsOnDate
      : selectedSubjectOptions.map((subject) => subject.key);
  const subjectLabelToKey: Record<string, string> = {};

  for (const option of selectedSubjectOptions) {
    subjectLabelToKey[option.label] = option.key;
    subjectLabelToKey[option.key] = option.key;
  }

  for (const session of selectedSessions) {
    const displayName = session.displaySubjectName?.trim();
    if (displayName) {
      subjectLabelToKey[displayName] = session.subject;
    }
  }

  const validRows = csvRows.filter((row) => row.errors.length === 0 && Object.keys(row.scores).length > 0);
  const errorRows = csvRows.filter((row) => row.errors.length > 0 || row.examNumber === "");
  const emptyScoreRows = csvRows.filter(
    (row) => row.errors.length === 0 && row.examNumber !== "" && Object.keys(row.scores).length === 0,
  );

  function clearFileState() {
    setCsvRows([]);
    setCsvSubjectColumns([]);
    setFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function parseLoadedFile(file: File, nextOrderedSubjectKeys: string[]) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? "");
      const parsed = parseCsvText(
        text,
        nextOrderedSubjectKeys,
        new Set(nextOrderedSubjectKeys),
        subjectLabelToKey,
      );

      setCsvRows(parsed.rows);
      setCsvSubjectColumns(parsed.subjectColumns);
    };
    reader.readAsText(file, "utf-8");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setImportResult(null);
    setErrorMessage(null);
    parseLoadedFile(file, orderedSubjectKeys);
  }

  function handlePeriodChange(index: number) {
    setSelectedPeriodIndex(index);
    setSelectedDate("");
    setImportResult(null);
    setErrorMessage(null);
    clearFileState();
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setImportResult(null);
    setErrorMessage(null);

    const nextOrderedSubjectKeys = getSubjectsForDate(selectedSessions, date);
    const loadedFile = fileInputRef.current?.files?.[0];
    if (loadedFile) {
      parseLoadedFile(
        loadedFile,
        nextOrderedSubjectKeys.length > 0
          ? nextOrderedSubjectKeys
          : selectedSubjectOptions.map((subject) => subject.key),
      );
    }
  }

  function downloadTemplate() {
    const templateSubjectKeys = orderedSubjectKeys.length > 0
      ? orderedSubjectKeys
      : selectedSubjectOptions.map((subject) => subject.key);
    const templateSubjectLabels = templateSubjectKeys.map((subjectKey) =>
      getSubjectLabel(subjectKey, sessionSubjectLabelMap),
    );
    const sampleScores = ["85", "72", "90", "78", "83", "88"];
    const firstExample = templateSubjectLabels.map((_, index) => sampleScores[index] ?? "").join(",");
    const secondExample = templateSubjectLabels
      .map((_, index) => (index % 2 === 0 ? sampleScores[index] ?? "" : ""))
      .join(",");

    const header = ["학번", ...templateSubjectLabels].join(",");
    const exampleRows = [
      header,
      `2024001${firstExample ? `,${firstExample}` : ""}`,
      `2024002${secondExample ? `,${secondExample}` : ""}`,
    ];
    const csv = exampleRows.join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "score_import_template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    if (!selectedPeriod || !selectedDate || validRows.length === 0) {
      return;
    }

    setImportResult(null);
    setErrorMessage(null);

    const entries = validRows.map((row) => ({
      examNumber: row.examNumber,
      scores: row.scores,
    }));

    startTransition(async () => {
      try {
        const response = await fetch("/api/scores/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: selectedPeriod.id,
            examDate: selectedDate,
            examType: selectedPeriod.examType,
            entries,
          }),
          cache: "no-store",
        });

        const json = (await response.json()) as { data?: ImportResult; error?: string };
        if (!response.ok) {
          setErrorMessage(json.error ?? "성적 가져오기에 실패했습니다.");
          return;
        }

        if (json.data) {
          setImportResult(json.data);
          clearFileState();
        }
      } catch {
        setErrorMessage("네트워크 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[24px] border border-forest/20 bg-forest/5 p-6">
        <h2 className="text-base font-semibold text-forest">CSV 파일 형식 안내</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          첫 줄은 <code className="rounded bg-white px-1.5 py-0.5 text-xs font-mono">학번,과목명...</code> 형식의
          헤더로 입력하고, 이후 줄에는 학번과 과목별 점수를 쉼표로 구분해 적어 주세요.
          점수가 없는 칸은 비워 두거나 <code className="rounded bg-white px-1.5 py-0.5 text-xs font-mono">-</code>로
          넣을 수 있습니다.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-4 text-xs leading-6 text-ink">
{`학번,헌법,형법,형사소송법,경찰학
2024001,85,72,90,78
2024002,88,,92,-`}
        </pre>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
          >
            템플릿 다운로드
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">1단계 · 시험 기간 선택</h2>
        {periodOptions.length === 0 ? (
          <p className="rounded-xl border border-ink/10 bg-mist/60 px-4 py-3 text-sm text-slate">
            현재 지점에 등록된 시험 기간이 없습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {periodOptions.map((period, index) => (
              <button
                key={`${period.id}-${period.examType}`}
                type="button"
                onClick={() => handlePeriodChange(index)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedPeriodIndex === index
                    ? "bg-ink text-white"
                    : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                }`}
              >
                {period.name}
                {period.isActive ? <span className="ml-1.5 text-xs opacity-70">현재</span> : null}
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedPeriod ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">2단계 · 시험 날짜 선택</h2>
          {availableDates.length === 0 ? (
            <p className="text-sm text-slate">선택한 기간에 등록된 시험 날짜가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
              <div className="max-h-52 divide-y divide-ink/5 overflow-y-auto">
                {availableDates.map((date) => {
                  const subjectCount = getSubjectsForDate(selectedSessions, date).length;

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => handleDateChange(date)}
                      className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition ${
                        selectedDate === date ? "bg-ink text-white" : "hover:bg-mist"
                      }`}
                    >
                      <span className="font-semibold">{formatDateDisplay(`${date}T00:00:00`)}</span>
                      <span className={`text-xs ${selectedDate === date ? "opacity-70" : "text-slate"}`}>
                        {subjectCount}과목
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedDate && subjectsOnDate.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {subjectsOnDate.map((subjectKey) => (
                <span
                  key={subjectKey}
                  className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-0.5 text-xs font-medium text-forest"
                >
                  {getSubjectLabel(subjectKey, sessionSubjectLabelMap)}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedPeriod && selectedDate ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">3단계 · CSV 파일 업로드</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="block w-full rounded-xl border border-ink/10 px-4 py-2 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-ember/10 file:px-4 file:py-1 file:text-sm file:font-semibold file:text-ember hover:file:bg-ember/20"
          />
          {fileName ? (
            <p className="text-xs text-slate">
              업로드 파일: <span className="font-medium text-ink">{fileName}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {csvRows.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">4단계 · 미리보기 및 가져오기</h2>
            <div className="flex gap-3 text-xs">
              <span className="font-medium text-green-700">유효: {validRows.length}건</span>
              {emptyScoreRows.length > 0 ? (
                <span className="font-medium text-amber-700">점수 없음: {emptyScoreRows.length}건</span>
              ) : null}
              {errorRows.length > 0 ? (
                <span className="font-medium text-red-700">오류: {errorRows.length}건</span>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[24px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    행
                  </th>
                  <th className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    학번
                  </th>
                  {csvSubjectColumns.map((column) => (
                    <th
                      key={column.header}
                      className="whitespace-nowrap bg-mist/50 px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate"
                    >
                      {column.header}
                    </th>
                  ))}
                  <th className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {csvRows.slice(0, 20).map((row) => (
                  <tr
                    key={row.row}
                    className={
                      row.errors.length > 0
                        ? "bg-red-50"
                        : Object.keys(row.scores).length === 0
                          ? "bg-amber-50/50"
                          : ""
                    }
                  >
                    <td className="px-4 py-2 text-xs tabular-nums text-slate">{row.row}</td>
                    <td className="px-4 py-2 font-mono text-xs font-medium text-ink">
                      {row.examNumber || <span className="text-red-600">(없음)</span>}
                    </td>
                    {csvSubjectColumns.map((column) => {
                      const score = row.scores[column.subjectKey];
                      const rawValue = row.rawValues[column.header] ?? "";

                      return (
                        <td key={column.header} className="px-4 py-2 text-right text-xs tabular-nums">
                          {score !== undefined ? (
                            <span className="font-semibold text-ink">{score}</span>
                          ) : rawValue && rawValue !== "-" ? (
                            <span className="text-red-600">{rawValue}</span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-xs">
                      {row.errors.length > 0 ? (
                        <span className="text-red-600">{row.errors.join("; ")}</span>
                      ) : Object.keys(row.scores).length === 0 ? (
                        <span className="text-amber-600">점수가 없습니다.</span>
                      ) : (
                        <span className="text-green-600">확인 완료</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvRows.length > 20 ? (
              <p className="px-4 py-3 text-center text-xs text-slate">
                상위 20행만 표시 중입니다. 전체 행 수는 {csvRows.length}건입니다.
              </p>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={isPending || validRows.length === 0}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition ${
                isPending || validRows.length === 0
                  ? "cursor-not-allowed bg-ink/30"
                  : "bg-ember hover:bg-ember/90"
              }`}
            >
              {isPending ? "가져오는 중..." : `가져오기 실행 (${validRows.length}건)`}
            </button>
            {errorRows.length > 0 ? (
              <p className="text-xs text-amber-700">
                오류 {errorRows.length}건은 제외하고 유효한 {validRows.length}건만 가져옵니다.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {importResult ? (
        <section className="rounded-[24px] border border-forest/20 bg-forest/5 p-6">
          <h2 className="text-base font-semibold text-forest">가져오기 완료</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs text-slate">성공</p>
              <p className="mt-1 text-2xl font-bold text-forest">{importResult.success}건</p>
            </div>
            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs text-slate">매칭된 회차</p>
              <p className="mt-1 text-2xl font-bold text-ink">{importResult.sessionsFound}과목</p>
            </div>
            <div className={`rounded-[20px] p-4 ${importResult.failed.length > 0 ? "bg-red-50" : "bg-white"}`}>
              <p className="text-xs text-slate">실패</p>
              <p className={`mt-1 text-2xl font-bold ${importResult.failed.length > 0 ? "text-red-600" : "text-slate"}`}>
                {importResult.failed.length}건
              </p>
            </div>
          </div>

          {importResult.failed.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">실패 목록</h3>
              <div className="overflow-x-auto rounded-xl border border-red-200 bg-white">
                <table className="min-w-full divide-y divide-red-100 text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate">학번</th>
                      <th className="px-3 py-2 text-left font-medium text-slate">과목</th>
                      <th className="px-3 py-2 text-left font-medium text-slate">사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {importResult.failed.map((item, index) => (
                      <tr key={`${item.examNumber}-${item.subject}-${index}`}>
                        <td className="px-3 py-2 font-mono text-ink">{item.examNumber}</td>
                        <td className="px-3 py-2 text-slate">{item.subject}</td>
                        <td className="px-3 py-2 text-red-600">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
