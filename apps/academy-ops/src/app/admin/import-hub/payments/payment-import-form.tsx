"use client";

import { type ChangeEvent, useRef, useState } from "react";

type ParsedPaymentRow = {
  examNumber: string;
  paidAt: string;
  method: string;
  amount: string;
  category: string;
  note: string;
  rowNumber: number;
  error?: string;
};

type PaymentImportResult = {
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
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
    examNumber: ["학번", "examnumber", "studentid"],
    paidAt: ["결제일yyyymmdd", "결제일", "paidat", "date"],
    method: ["결제방법cashcardtransfer", "결제방법", "method"],
    amount: ["수납금액원", "수납금액", "금액", "amount"],
    category: ["분류tuitiontextbookfacilityetc", "분류", "category"],
    note: ["비고", "note", "memo"],
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

const VALID_METHODS = ["CASH", "CARD", "TRANSFER", "현금", "카드", "이체", "계좌이체"];
const VALID_CATEGORIES = ["", "TUITION", "TEXTBOOK", "FACILITY", "ETC", "수강료", "교재", "시설", "기타"];

export function PaymentImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedPaymentRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<PaymentImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  function resetState() {
    setSelectedFile(null);
    setFileName("");
    setRows([]);
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

    setSelectedFile(file);
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
        const examNumber = readCell(columns, headerMap, "examNumber");
        const paidAt = readCell(columns, headerMap, "paidAt");
        const method = readCell(columns, headerMap, "method");
        const amount = readCell(columns, headerMap, "amount");
        const category = readCell(columns, headerMap, "category");
        let error: string | undefined;

        if (!examNumber) {
          error = "학번이 비어 있습니다.";
        } else if (!paidAt || Number.isNaN(new Date(paidAt).getTime())) {
          error = "결제일 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요.";
        } else if (!method || (!VALID_METHODS.includes(method.toUpperCase()) && !VALID_METHODS.includes(method))) {
          error = "결제방법은 CASH, CARD, TRANSFER 또는 현금, 카드, 이체만 사용할 수 있습니다.";
        } else if (!amount || Number.isNaN(Number(amount.replace(/,/g, ""))) || Number(amount.replace(/,/g, "")) <= 0) {
          error = "수납금액은 0보다 큰 숫자여야 합니다.";
        } else if (!VALID_CATEGORIES.includes(category.toUpperCase()) && !VALID_CATEGORIES.includes(category)) {
          error = "분류는 TUITION, TEXTBOOK, FACILITY, ETC 또는 수강료, 교재, 시설, 기타만 사용할 수 있습니다.";
        }

        return {
          examNumber,
          paidAt,
          method,
          amount,
          category,
          note: readCell(columns, headerMap, "note"),
          rowNumber: index + 2,
          error,
        } satisfies ParsedPaymentRow;
      });

      setRows(parsedRows);
    };

    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    if (!selectedFile) return;
    const validRows = rows.filter((row) => !row.error);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/import/payments", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as {
        data?: PaymentImportResult;
        error?: string;
      };

      if (!response.ok) {
        setImportError(json.error ?? "수납 가져오기에 실패했습니다.");
        return;
      }

      setResult(json.data ?? { inserted: 0, skipped: 0, errors: [] });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "수납 가져오기에 실패했습니다.");
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
          수납 CSV를 업로드하면 기존 결제 이관 API를 그대로 사용해 처리합니다. 결제일과 결제방법 형식을 먼저 확인해 주세요.
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
                  {["행", "학번", "결제일", "결제방법", "수납금액", "분류", "비고", "상태"].map((column) => (
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
                    <td className="px-4 py-3 text-slate">{row.paidAt}</td>
                    <td className="px-4 py-3 text-slate">{row.method}</td>
                    <td className="px-4 py-3 text-slate">{row.amount}</td>
                    <td className="px-4 py-3 text-slate">{row.category || "TUITION"}</td>
                    <td className="px-4 py-3 text-slate">{row.note || "-"}</td>
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
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs text-slate">등록 완료</div>
              <div className="mt-1 text-xl font-semibold text-ink">{result.inserted.toLocaleString()}건</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs text-slate">건너뜀</div>
              <div className="mt-1 text-xl font-semibold text-ink">{result.skipped.toLocaleString()}건</div>
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
                  <li key={`${error.row}-${error.reason}`}>행 {error.row}: {error.reason}</li>
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
          disabled={!selectedFile || rows.filter((row) => !row.error).length === 0 || isImporting}
          className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-slate/40"
        >
          {isImporting ? "가져오는 중..." : `유효한 ${validCount.toLocaleString()}건 가져오기`}
        </button>
      </div>
    </div>
  );
}