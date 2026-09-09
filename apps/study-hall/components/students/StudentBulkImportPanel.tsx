"use client";

import { LoaderCircle, Upload, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { DialogActions } from "@/components/ui/DialogActions";
import {
  inferDelimitedFileDelimiter,
  parseDelimitedLine,
  readTextFileWithEncoding,
} from "@/lib/csv";
import { toast } from "@/lib/sonner";
import {
  parseBulkStudentRows,
  type ParsedBulkStudentRow as ParsedRow,
} from "@/lib/student-bulk-import";

const BULK_STUDENT_LIMIT = 500;

type BulkResultItem = {
  rowNumber: number;
  studentNumber: string;
  name: string;
  result: "CREATED" | "DUPLICATE" | "FAILED";
  message: string | null;
};

type BulkResult = {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  items: BulkResultItem[];
};

export type StudentBulkImportPanelProps = {
  divisionSlug: string;
  /** 이미 등록된 수험번호. 중복 행을 미리 걸러내는 데 쓴다. */
  existingStudentNumbers: string[];
  studyTrackOptions: string[];
  onClose: () => void;
  onImported: () => void;
};

export function StudentBulkImportPanel({
  divisionSlug,
  existingStudentNumbers,
  studyTrackOptions,
  onClose,
  onImported,
}: StudentBulkImportPanelProps) {
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [studyTrack, setStudyTrack] = useState(() => studyTrackOptions[0] ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const registered = useMemo(
    () => new Set(existingStudentNumbers),
    [existingStudentNumbers],
  );
  const selectedRows = rows.filter((row) => selectedKeys.has(row.key));
  const newCount = rows.filter((row) => !row.duplicateReason).length;
  const duplicateCount = rows.length - newCount;

  function applyParsedRows(parsed: ParsedRow[], sourceLabel: string) {
    if (parsed.length === 0) {
      toast.error("읽을 수 있는 행이 없습니다. 수험번호와 이름이 각각 다른 칸에 있는지 확인해 주세요.");
      return;
    }

    setRows(parsed);
    // 이미 등록된 학생은 기본 선택에서 빼둔다. 필요하면 직접 체크할 수 있다.
    setSelectedKeys(new Set(parsed.filter((row) => !row.duplicateReason).map((row) => row.key)));
    setResult(null);

    const skipped = parsed.length - parsed.filter((row) => !row.duplicateReason).length;
    toast.success(
      skipped > 0
        ? `${sourceLabel} ${parsed.length}행을 읽었습니다. 이미 등록된 ${skipped}명은 선택에서 제외했습니다.`
        : `${sourceLabel} ${parsed.length}행을 읽었습니다.`,
    );
  }

  function handlePaste() {
    const text = pasteRef.current?.value ?? "";

    if (!text.trim()) {
      toast.error("붙여넣은 내용이 없습니다.");
      return;
    }

    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));
    applyParsedRows(parseBulkStudentRows(lines, registered), "붙여넣기에서");
  }

  function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    void (async () => {
      const text = await readTextFileWithEncoding(file);
      if (!text) return;

      const delimiter = inferDelimitedFileDelimiter(text);
      const lines = text
        .trim()
        .split(/\r?\n/)
        .filter((line) => !line.toLowerCase().startsWith("sep="))
        .map((line) => parseDelimitedLine(line, delimiter));
      applyParsedRows(parseBulkStudentRows(lines, registered), "CSV 파일에서");
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : "CSV 파일을 읽지 못했습니다.");
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleRow(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  async function handleSubmit() {
    if (selectedRows.length === 0) {
      toast.error("등록할 학생을 한 명 이상 선택해 주세요.");
      return;
    }

    if (selectedRows.length > BULK_STUDENT_LIMIT) {
      toast.error(`한 번에 등록할 수 있는 인원은 ${BULK_STUDENT_LIMIT}명까지입니다.`);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/students/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyTrack: studyTrack || null,
          rows: selectedRows.map((row) => ({
            studentNumber: row.studentNumber,
            name: row.name,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "학생 일괄 등록에 실패했습니다.");
      }

      setResult(data as BulkResult);
      toast.success(`${data.createdCount}명을 등록했습니다.`);
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 일괄 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  const failedItems = result?.items.filter((item) => item.result === "FAILED") ?? [];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="admin-label">
          직렬
          <select
            value={studyTrack}
            onChange={(event) => setStudyTrack(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="">지정 안 함</option>
            {studyTrackOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {studyTrack ? (
          <p className="admin-help">등록하는 학생 전원에게 «{studyTrack}» 직렬이 적용됩니다.</p>
        ) : (
          <p className="admin-notice admin-notice-warning font-medium">
            직렬을 지정하지 않으면 직렬이 걸린 시험 템플릿의 성적 입력 화면에 학생이 나타나지 않습니다.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <p className="admin-label">엑셀에서 붙여넣기</p>
        <p className="admin-help">
          엑셀에서 <strong>수험번호</strong>와 <strong>이름</strong>이 이 순서로 앞 두 칸에 오도록 복사해 붙여넣으세요.
          뒤에 붙은 다른 열(응시분야·점수 등)은 무시하므로 채점표를 그대로 붙여넣어도 됩니다.
        </p>
        <textarea
          ref={pasteRef}
          rows={6}
          placeholder={"20550\t박성빈\n20563\t이건영"}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePaste} className="admin-button">
            붙여넣기 읽기
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="admin-button"
          >
            <Upload className="h-4 w-4" />
            CSV 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvUpload}
            className="hidden"
          />
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="admin-label">
              등록 대상
              <span className="ml-1.5 font-semibold text-[var(--division-color)]">
                {selectedRows.length}명 선택
              </span>
              <span className="ml-1.5 font-normal text-slate-400">
                / 읽은 {rows.length}행 · 신규 {newCount}명 · 이미 등록 {duplicateCount}명
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedKeys(new Set(rows.map((row) => row.key)))}
                className="admin-button admin-button-compact"
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedKeys(
                    new Set(rows.filter((row) => !row.duplicateReason).map((row) => row.key)),
                  )
                }
                className="admin-button admin-button-compact"
              >
                신규만
              </button>
              <button
                type="button"
                onClick={() => setSelectedKeys(new Set())}
                className="admin-button admin-button-compact"
              >
                전체 해제
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.key}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(row.key)}
                      onChange={() => toggleRow(row.key)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="font-mono text-xs text-slate-500">{row.studentNumber}</span>
                    <span className="font-medium text-slate-900">{row.name}</span>
                    {row.duplicateReason ? (
                      <span className="ml-auto text-xs text-amber-600">
                        {row.duplicateReason === "REGISTERED" ? "이미 등록됨" : "목록 내 중복"}
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="admin-label">등록 결과</p>
          <p className="admin-notice admin-notice-success font-medium">
            등록 {result.createdCount}명 · 건너뜀 {result.duplicateCount}명 · 실패{" "}
            {result.failedCount}명
          </p>
          {failedItems.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {failedItems.map((item) => (
                <li key={`${item.rowNumber}:${item.studentNumber}`}>
                  {item.studentNumber} {item.name} — {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="admin-help">
            좌석·수강기간·수강료는 등록되지 않습니다. 학생 목록에서 개별 수정해 주세요.
          </p>
        </div>
      ) : null}

      <DialogActions>
        <button type="button" onClick={onClose} className="admin-button">
          {result ? "닫기" : "취소"}
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSaving || selectedRows.length === 0}
          className="admin-button admin-button-primary"
        >
          {isSaving ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          {isSaving ? "등록 중..." : `${selectedRows.length}명 등록`}
        </button>
      </DialogActions>
    </div>
  );
}
