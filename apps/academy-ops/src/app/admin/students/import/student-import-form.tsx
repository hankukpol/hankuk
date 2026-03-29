"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExamType, StudentType } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { DUPLICATE_STRATEGY_LABEL, EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL } from "@/lib/constants";

// ─── Field config ────────────────────────────────────────────────────────────
const IMPORT_FIELDS = [
  { key: "examNumber", label: "수험번호", required: true },
  { key: "name", label: "이름", required: true },
  { key: "phone", label: "연락처", required: false },
  { key: "generation", label: "기수", required: false },
  { key: "className", label: "반", required: false },
  { key: "registeredAt", label: "등록일", required: false },
] as const;

type FieldKey = (typeof IMPORT_FIELDS)[number]["key"];

// ─── Types ────────────────────────────────────────────────────────────────────
type PreviewRow = {
  rowNumber: number;
  status: "valid" | "invalid" | "update";
  issues: string[];
  record: {
    examNumber: string;
    name: string;
    phone: string | null;
    generation: number | null;
    className: string | null;
    registeredAt?: string | null;
  };
};

type PreviewResponse = {
  previewRows: PreviewRow[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    updateRows: number;
  };
  columns?: Array<{ index: number; label: string }>;
  mapping?: Record<string, number | undefined>;
  sheetNames?: string[];
};

type ImportResponse = {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
};

type ConfirmModal = {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  onConfirm: () => void;
};

type CompletionModal = {
  title: string;
  description: string;
  details: string[];
};

type StudentImportFormProps = {
  initialExamType: ExamType;
};

const DUPLICATE_POLICY_OPTIONS: Array<{
  value: "UPDATE" | "SKIP" | "OVERWRITE";
  label: string;
}> = [
  { value: "UPDATE", label: DUPLICATE_STRATEGY_LABEL.UPDATE },
  { value: "SKIP", label: DUPLICATE_STRATEGY_LABEL.SKIP },
  { value: "OVERWRITE", label: DUPLICATE_STRATEGY_LABEL.OVERWRITE },
];

// ─── Component ───────────────────────────────────────────────────────────────
export function StudentImportForm({ initialExamType }: StudentImportFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [defaults, setDefaults] = useState({
    examType: initialExamType,
    studentType: "NEW" as StudentType,
    duplicateStrategy: "UPDATE" as "UPDATE" | "SKIP" | "OVERWRITE",
    classNameFallback: "",
  });
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({
    examNumber: 0,
    name: 1,
    phone: 2,
    generation: 3,
    className: 4,
    registeredAt: 5,
  });
  const [detectedColumns, setDetectedColumns] = useState<
    Array<{ index: number; label: string }>
  >([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [completionModal, setCompletionModal] = useState<CompletionModal | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset preview when inputs change
  useEffect(() => {
    setPreview(null);
  }, [file, defaults, mapping]);

  // ── File selection ─────────────────────────────────────────────────────────
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setDetectedColumns([]);
    setNotice(null);
    setErrorMessage(null);
  }

  function clearFile() {
    setFile(null);
    setDetectedColumns([]);
    setPreview(null);
    setNotice(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // ── Form data builder ──────────────────────────────────────────────────────
  function makeFormData(mode: "preview" | "execute") {
    if (!file) {
      throw new Error("파일을 선택해 주세요.");
    }
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append(
      "defaults",
      JSON.stringify({
        examType: defaults.examType,
        studentType: defaults.studentType,
        duplicateStrategy: defaults.duplicateStrategy,
        classNameFallback: defaults.classNameFallback,
      }),
    );
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("file", file);
    return formData;
  }

  // ── Fetch helper ───────────────────────────────────────────────────────────
  async function callApi<T>(mode: "preview" | "execute"): Promise<T> {
    const formData = makeFormData(mode);
    const response = await fetch("/api/students/excel-import", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) {
      throw new Error((payload as { error?: string }).error ?? "요청에 실패했습니다.");
    }
    return payload;
  }

  function run(action: () => Promise<void>) {
    setNotice(null);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.",
        );
      }
    });
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  async function runPreview() {
    const payload = await callApi<PreviewResponse>("preview");
    setPreview(payload);
    if (payload.columns && payload.columns.length > 0) {
      setDetectedColumns(payload.columns);
      // Auto-apply detected mapping from file
      if (payload.mapping) {
        setMapping(payload.mapping as Partial<Record<FieldKey, number>>);
      }
    }
    setNotice("미리보기를 생성했습니다. 열 매핑을 확인하고 '가져오기 실행'을 누르세요.");
  }

  // ── Execute ────────────────────────────────────────────────────────────────
  async function runExecute() {
    const payload = await callApi<ImportResponse>("execute");
    const details = [
      `신규 ${payload.createdCount}명`,
      `업데이트 ${payload.updatedCount}명`,
      `건너뜀 ${payload.skippedCount}명`,
    ];
    setNotice("가져오기 완료: " + details.join(" / "));
    setCompletionModal({
      title: "학생 가져오기 완료",
      description: "Excel 파일 데이터를 정상적으로 반영했습니다.",
      details,
    });
    setPreview(null);
    clearFile();
    router.refresh();
  }

  function requestExecute() {
    if (!preview) return;
    const targetCount = preview.summary.validRows + preview.summary.updateRows;
    setConfirmModal({
      title: "학생 데이터 가져오기",
      description: "미리보기 기준으로 학생 명단을 실제 DB에 반영합니다.",
      details: [
        `반영 대상 ${targetCount}건 / 제외 ${preview.summary.invalidRows}건`,
        `중복 처리: ${DUPLICATE_STRATEGY_LABEL[defaults.duplicateStrategy]}`,
        `직렬: ${EXAM_TYPE_LABEL[defaults.examType]} / 학생 구분: ${STUDENT_TYPE_LABEL[defaults.studentType]}`,
      ],
      confirmLabel: "가져오기 실행",
      onConfirm: () => {
        setConfirmModal(null);
        run(runExecute);
      },
    });
  }

  // ── Column selector helper ─────────────────────────────────────────────────
  const columnOptions = detectedColumns.length > 0 ? detectedColumns : buildDefaultColumnOptions();

  function buildDefaultColumnOptions() {
    return Array.from({ length: 10 }, (_, i) => ({
      index: i,
      label: String.fromCharCode(65 + i) + "열",
    }));
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* ── 파일 선택 + 옵션 ────────────────────────────────────────────── */}
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">파일 업로드</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          Excel(.xlsx, .xls) 또는 CSV 파일을 선택하세요. 첫 번째 시트의 데이터를 읽습니다.
        </p>

        {/* 파일 선택 */}
        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium">파일 선택</label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="block w-full rounded-2xl border border-dashed border-ink/20 bg-white px-4 py-4 text-sm"
            />
            {file ? (
              <button
                type="button"
                onClick={clearFile}
                className="shrink-0 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium transition hover:border-red-200 hover:text-red-600"
              >
                취소
              </button>
            ) : null}
          </div>
          {file ? (
            <p className="mt-2 text-sm text-forest">
              선택됨: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}
        </div>

        {/* 기본 옵션 */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              value={defaults.examType}
              onChange={(e) =>
                setDefaults((c) => ({ ...c, examType: e.target.value as ExamType }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">학생 구분</label>
            <select
              value={defaults.studentType}
              onChange={(e) =>
                setDefaults((c) => ({ ...c, studentType: e.target.value as StudentType }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="NEW">{STUDENT_TYPE_LABEL.NEW}</option>
              <option value="EXISTING">{STUDENT_TYPE_LABEL.EXISTING}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">중복 처리</label>
            <select
              value={defaults.duplicateStrategy}
              onChange={(e) =>
                setDefaults((c) => ({
                  ...c,
                  duplicateStrategy: e.target.value as typeof c.duplicateStrategy,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {DUPLICATE_POLICY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">반 기본값</label>
            <input
              value={defaults.classNameFallback}
              onChange={(e) =>
                setDefaults((c) => ({ ...c, classNameFallback: e.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: 기본A반"
            />
          </div>
        </div>

        {/* 열 매핑 */}
        <div className="mt-6 rounded-[24px] border border-ink/10 bg-white p-5">
          <h3 className="text-lg font-semibold">열 매핑</h3>
          <p className="mt-2 text-sm text-slate">
            파일의 각 열이 어느 필드에 해당하는지 지정합니다.
            미리보기 후 파일에서 자동 감지된 경우 자동 적용됩니다.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {IMPORT_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="mb-2 block text-sm font-medium">
                  {field.label}
                  {field.required ? (
                    <span className="ml-1 text-ember">*</span>
                  ) : null}
                </label>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping((c) => ({
                      ...c,
                      [field.key]: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
                >
                  <option value="">미사용</option>
                  {columnOptions.map((col) => (
                    <option key={col.index} value={col.index}>
                      {detectedColumns.length > 0
                        ? `${String.fromCharCode(65 + col.index)}열${col.label ? ` (${col.label})` : ""}`
                        : col.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => run(runPreview)}
            disabled={isPending || !file}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isPending ? "처리 중..." : "미리보기"}
          </button>
          <button
            type="button"
            onClick={requestExecute}
            disabled={isPending || !preview}
            className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate"
          >
            가져오기 실행
          </button>
        </div>
      </section>

      {/* ── 알림 영역 ────────────────────────────────────────────────────── */}
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* ── 확인 모달 ────────────────────────────────────────────────────── */}
      <ActionModal
        open={Boolean(confirmModal)}
        badgeLabel="확인"
        badgeTone="warning"
        title={confirmModal?.title ?? ""}
        description={confirmModal?.description ?? ""}
        details={confirmModal?.details ?? []}
        cancelLabel="취소"
        confirmLabel={confirmModal?.confirmLabel ?? "확인"}
        isPending={isPending}
        onClose={() => { if (!isPending) setConfirmModal(null); }}
        onConfirm={confirmModal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal)}
        badgeLabel="완료"
        badgeTone="success"
        title={completionModal?.title ?? ""}
        description={completionModal?.description ?? ""}
        details={completionModal?.details ?? []}
        confirmLabel="확인"
        onClose={() => setCompletionModal(null)}
      />

      {/* ── 미리보기 결과 ─────────────────────────────────────────────────── */}
      {preview ? (
        <>
          {/* 요약 카드 */}
          <section className="grid gap-4 md:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-white p-5">
              <p className="text-sm text-slate">전체 행</p>
              <p className="mt-3 text-3xl font-semibold">{preview.summary.totalRows}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-5">
              <p className="text-sm text-slate">신규</p>
              <p className="mt-3 text-3xl font-semibold text-forest">
                {preview.summary.validRows}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-5">
              <p className="text-sm text-slate">업데이트</p>
              <p className="mt-3 text-3xl font-semibold text-ember">
                {preview.summary.updateRows}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-5">
              <p className="text-sm text-slate">제외 (오류)</p>
              <p className="mt-3 text-3xl font-semibold text-red-700">
                {preview.summary.invalidRows}
              </p>
            </article>
          </section>

          {/* 미리보기 테이블 (처음 5행 표시) */}
          <section className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <div className="border-b border-ink/10 px-6 py-4">
              <h3 className="text-base font-semibold">
                미리보기
                <span className="ml-2 text-sm font-normal text-slate">
                  (전체 {preview.previewRows.length}행)
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">행</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                    <th className="px-4 py-3 font-semibold">수험번호</th>
                    <th className="px-4 py-3 font-semibold">이름</th>
                    <th className="px-4 py-3 font-semibold">연락처</th>
                    <th className="px-4 py-3 font-semibold">기수</th>
                    <th className="px-4 py-3 font-semibold">반</th>
                    <th className="px-4 py-3 font-semibold">오류</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 bg-white">
                  {preview.previewRows.slice(0, 5).map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.record.examNumber}`}
                      className={row.status === "invalid" ? "bg-red-50" : ""}
                    >
                      <td className="px-4 py-3 text-slate">{row.rowNumber}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            row.status === "valid"
                              ? "bg-forest/10 text-forest"
                              : row.status === "update"
                                ? "bg-ember/10 text-ember"
                                : "bg-red-50 text-red-700"
                          }`}
                        >
                          {row.status === "valid"
                            ? "신규"
                            : row.status === "update"
                              ? "업데이트"
                              : "제외"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{row.record.examNumber || "-"}</td>
                      <td className="px-4 py-3">{row.record.name || "-"}</td>
                      <td className="px-4 py-3">{row.record.phone ?? "-"}</td>
                      <td className="px-4 py-3">{row.record.generation ?? "-"}</td>
                      <td className="px-4 py-3">{row.record.className ?? "-"}</td>
                      <td className="px-4 py-3 text-slate">
                        {row.issues.length > 0 ? (
                          <span className="text-red-600">{row.issues.join(", ")}</span>
                        ) : (
                          "정상"
                        )}
                      </td>
                    </tr>
                  ))}
                  {preview.previewRows.length > 5 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-3 text-center text-sm text-slate"
                      >
                        ... 외 {preview.previewRows.length - 5}행 (가져오기 실행 시 전체 반영)
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* 오류 행 전체 목록 */}
          {preview.previewRows.some((r) => r.status === "invalid") ? (
            <section className="rounded-[28px] border border-red-200 bg-red-50 p-6">
              <h3 className="mb-4 font-semibold text-red-700">오류 행 목록</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-red-200 text-sm">
                  <thead className="text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-red-700">행</th>
                      <th className="px-4 py-3 font-semibold text-red-700">수험번호</th>
                      <th className="px-4 py-3 font-semibold text-red-700">이름</th>
                      <th className="px-4 py-3 font-semibold text-red-700">오류 내용</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {preview.previewRows
                      .filter((r) => r.status === "invalid")
                      .map((row) => (
                        <tr key={`err-${row.rowNumber}`} className="bg-red-50">
                          <td className="px-4 py-3 text-red-700">{row.rowNumber}</td>
                          <td className="px-4 py-3 font-mono text-red-700">
                            {row.record.examNumber || "(없음)"}
                          </td>
                          <td className="px-4 py-3 text-red-700">
                            {row.record.name || "(없음)"}
                          </td>
                          <td className="px-4 py-3 text-red-600">
                            {row.issues.join(", ")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
