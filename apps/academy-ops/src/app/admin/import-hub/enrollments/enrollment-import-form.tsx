"use client";

import { type ChangeEvent, useRef, useState } from "react";

type ParsedEnrollmentRow = {
  examNumber: string;
  courseType: string;
  courseName: string;
  startDate: string;
  endDate: string;
  regularFee: string;
  discountAmount: string;
  staffExamNumber: string;
  rowNumber: number;
  error?: string;
};

type EnrollmentImportResult = {
  created: number;
  errors: string[];
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "").trim();
}

function mapHeaders(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const aliases: Record<string, string[]> = {
    examNumber: ["학번", "수험번호", "examnumber", "studentid"],
    courseType: ["강좌유형", "유형", "coursetype", "type"],
    courseName: ["강좌명", "강좌", "coursename", "name"],
    startDate: ["시작일", "수강시작일", "startdate", "start"],
    endDate: ["종료일", "수강종료일", "enddate", "end"],
    regularFee: ["수강료", "정가", "regularfee", "fee"],
    discountAmount: ["할인금액", "할인", "discountamount", "discount"],
    staffExamNumber: ["담당자학번", "담당자", "staffexamnumber", "staff"],
  };

  const mapping: Record<string, number> = {};

  for (const [field, candidates] of Object.entries(aliases)) {
    for (const candidate of candidates) {
      const index = normalized.indexOf(normalizeHeader(candidate));
      if (index !== -1) {
        mapping[field] = index;
        break;
      }
    }
  }

  return mapping;
}

function readCell(columns: string[], mapping: Record<string, number>, field: string) {
  const index = mapping[field];
  return index === undefined ? "" : (columns[index] ?? "").trim();
}

const VALID_COURSE_TYPES = ["종합", "단과", "특강"];

function isValidDate(value: string) {
  if (!value.trim()) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function EnrollmentImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedEnrollmentRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<EnrollmentImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  function resetState() {
    setRows([]);
    setFileName("");
    setParseError("");
    setImportError("");
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError("");
    setImportError("");
    setResult(null);

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const text = String(loadEvent.target?.result ?? "");
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/^\uFEFF/, "").trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        setParseError("헤더와 데이터 1행 이상이 포함된 CSV 파일이 필요합니다.");
        setRows([]);
        return;
      }

      const headers = parseCSVLine(lines[0]);
      const headerMap = mapHeaders(headers);
      if (headerMap.examNumber === undefined) {
        setParseError("'학번' 컬럼을 찾지 못했습니다. CSV 헤더를 확인해 주세요.");
        setRows([]);
        return;
      }

      const parsedRows = lines.slice(1).map((line, index) => {
        const columns = parseCSVLine(line);
        const courseType = readCell(columns, headerMap, "courseType") || "종합";
        let error: string | undefined;

        if (!readCell(columns, headerMap, "examNumber")) {
          error = "학번이 비어 있습니다.";
        } else if (!readCell(columns, headerMap, "startDate")) {
          error = "시작일이 비어 있습니다.";
        } else if (!isValidDate(readCell(columns, headerMap, "startDate"))) {
          error = `시작일 '${readCell(columns, headerMap, "startDate")}' 형식이 올바르지 않습니다.`;
        } else if (readCell(columns, headerMap, "endDate") && !isValidDate(readCell(columns, headerMap, "endDate"))) {
          error = `종료일 '${readCell(columns, headerMap, "endDate")}' 형식이 올바르지 않습니다.`;
        } else if (!VALID_COURSE_TYPES.includes(courseType)) {
          error = `강좌유형 '${courseType}'은 종합, 단과, 특강만 사용할 수 있습니다.`;
        }

        return {
          examNumber: readCell(columns, headerMap, "examNumber"),
          courseType,
          courseName: readCell(columns, headerMap, "courseName"),
          startDate: readCell(columns, headerMap, "startDate"),
          endDate: readCell(columns, headerMap, "endDate"),
          regularFee: readCell(columns, headerMap, "regularFee"),
          discountAmount: readCell(columns, headerMap, "discountAmount"),
          staffExamNumber: readCell(columns, headerMap, "staffExamNumber"),
          rowNumber: index + 2,
          error,
        } satisfies ParsedEnrollmentRow;
      });

      setRows(parsedRows);
    };

    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    const validRows = rows.filter((row) => !row.error);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportError("");
    setResult(null);

    try {
      const payload = validRows.map((row) => ({
        examNumber: row.examNumber,
        courseType: row.courseType,
        courseName: row.courseName || null,
        startDate: row.startDate,
        endDate: row.endDate || null,
        regularFee: parseInt(row.regularFee.replace(/[^0-9]/g, ""), 10) || 0,
        discountAmount: parseInt(row.discountAmount.replace(/[^0-9]/g, ""), 10) || 0,
        staffExamNumber: row.staffExamNumber || null,
      }));

      const response = await fetch("/api/import/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollments: payload }),
      });

      const json = (await response.json()) as {
        data?: EnrollmentImportResult;
        error?: string;
      };

      if (!response.ok) {
        setImportError(json.error ?? "수강 가져오기에 실패했습니다.");
        return;
      }

      setResult(json.data ?? { created: 0, errors: [] });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "수강 가져오기에 실패했습니다.");
    } finally {
      setIsImporting(false);
    }
  }

  const previewRows = rows.slice(0, 10);
  const validCount = rows.filter((row) => !row.error).length;
  const errorCount = rows.length - validCount;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">CSV 파일 선택</h2>
        <p className="mt-1 text-sm text-slate">
          UTF-8 인코딩 CSV 파일을 업로드해 주세요. 학번 기준으로 학생을 찾아 수강 내역을 연결합니다.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-ink/20 bg-mist px-5 py-3 text-sm font-semibold text-slate transition hover:border-forest/30 hover:text-forest">
            <span>파일 선택</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {fileName ? <span className="text-sm font-medium text-ink">{fileName}</span> : null}
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={resetState}
              className="text-xs text-slate underline hover:text-red-600"
            >
              초기화
            </button>
          ) : null}
        </div>

        {parseError ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseError}
          </div>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold">
              미리보기
              <span className="ml-2 text-sm font-normal text-slate">
                전체 {rows.length}건 · 유효 {validCount}건 · 오류 {errorCount}건
              </span>
            </h2>
            {rows.length > 10 ? <p className="text-xs text-slate">최대 10행까지 표시</p> : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60 text-left">
                  {["행", "학번", "강좌유형", "강좌명", "시작일", "종료일", "수강료", "할인금액", "상태"].map((column) => (
                    <th key={column} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {previewRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.examNumber}`} className={row.error ? "bg-red-50/60" : "hover:bg-mist/20"}>
                    <td className="px-4 py-3 font-mono text-xs text-slate">{row.rowNumber}</td>
                    <td className="px-4 py-3 font-mono text-slate">{row.examNumber}</td>
                    <td className="px-4 py-3 text-slate">{row.courseType}</td>
                    <td className="px-4 py-3 text-slate">{row.courseName || "-"}</td>
                    <td className="px-4 py-3 text-slate">{row.startDate}</td>
                    <td className="px-4 py-3 text-slate">{row.endDate || "-"}</td>
                    <td className="px-4 py-3 text-slate">{row.regularFee || "0"}</td>
                    <td className="px-4 py-3 text-slate">{row.discountAmount || "0"}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.error ? (
                        <span className="font-medium text-red-700">{row.error}</span>
                      ) : (
                        <span className="font-medium text-forest">등록 가능</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {importError}
        </div>
      ) : null}

      {result ? (
        <section className="rounded-[28px] border border-forest/20 bg-forest/10 p-6">
          <h2 className="text-base font-semibold text-forest">가져오기 완료</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs text-slate">신규 등록</div>
              <div className="mt-1 text-xl font-semibold text-ink">{result.created.toLocaleString()}건</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs text-slate">오류</div>
              <div className="mt-1 text-xl font-semibold text-ink">{result.errors.length.toLocaleString()}건</div>
            </div>
          </div>

          {result.errors.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">오류 목록</p>
              <ul className="mt-2 space-y-1">
                {result.errors.slice(0, 20).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleImport}
          disabled={rows.filter((row) => !row.error).length === 0 || isImporting}
          className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-slate/40"
        >
          {isImporting ? "가져오는 중..." : `유효한 ${validCount.toLocaleString()}건 가져오기`}
        </button>
      </div>
    </div>
  );
}