"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionModal } from "@/components/ui/action-modal";
import {
  DUPLICATE_STRATEGY_LABEL,
  EXAM_TYPE_LABEL,
  STUDENT_PASTE_FIELDS,
  STUDENT_TYPE_LABEL,
} from "@/lib/constants";

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
  columns?: Array<{
    index: number;
    label: string;
  }>;
  mapping?: Record<string, number | undefined>;
  sheetNames?: string[];
};

type ExecuteResponse = {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
};

type ConfirmModalState = {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  onConfirm: () => void;
};

type CompletionModalState = {
  title: string;
  description: string;
  details: string[];
};

type PasteImportWorkbenchProps = {
  initialExamType: "GONGCHAE" | "GYEONGCHAE";
};

export function PasteImportWorkbench({
  initialExamType,
}: PasteImportWorkbenchProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [defaults, setDefaults] = useState({
    examType: initialExamType,
    studentType: "NEW" as const,
    duplicateStrategy: "UPDATE" as const,
    classNameFallback: "",
  });
  const [mapping, setMapping] = useState<Record<string, number | undefined>>({
    examNumber: 0,
    name: 1,
    phone: 2,
    generation: 3,
    className: 4,
    registeredAt: 5,
  });
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [completionModal, setCompletionModal] = useState<CompletionModalState | null>(null);
  const [isPending, startTransition] = useTransition();

  function makeFormData(action: "preview" | "execute") {
    const formData = new FormData();
    formData.append("mode", action);
    formData.append("defaults", JSON.stringify(defaults));
    formData.append("mapping", JSON.stringify(mapping));

    if (mode === "file" && file) {
      formData.append("file", file);
    } else {
      formData.append("text", text);
    }

    return formData;
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

  function openConfirmModal(modal: ConfirmModalState) {
    setConfirmModal(modal);
  }

  function closeConfirmModal() {
    if (!isPending) {
      setConfirmModal(null);
    }
  }

  function openCompletionModal(title: string, description: string, details: string[]) {
    setCompletionModal({ title, description, details });
  }

  function closeCompletionModal() {
    setCompletionModal(null);
  }

  async function request(action: "preview" | "execute") {
    const response = await fetch("/api/students/paste-import", {
      method: "POST",
      body: makeFormData(action),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  function buildImportSummary(previewValue: PreviewResponse) {
    const targetCount = previewValue.summary.validRows + previewValue.summary.updateRows;
    const sourceLabel = mode === "file" ? "파일 업로드" : "텍스트 붙여넣기";
    return sourceLabel + " 반영 대상 " + targetCount + "건 / 제외 " + previewValue.summary.invalidRows + "건";
  }

  function buildExecutionDetails(payload: ExecuteResponse) {
    return [
      "신규 " + payload.createdCount + "건",
      "업데이트 " + payload.updatedCount + "건",
      "건너뛰기 " + payload.skippedCount + "건",
    ];
  }

  async function previewImport() {
    const payload = (await request("preview")) as PreviewResponse;
    setPreview(payload);
    setNotice("미리보기를 생성했습니다.");
  }

  async function executeImport() {
    const payload = (await request("execute")) as ExecuteResponse;
    const details = buildExecutionDetails(payload);

    setNotice("반영 완료: " + details.join(" / "));
    openCompletionModal("학생 명단 등록 완료", "붙여넣기 또는 파일 업로드 데이터를 정상적으로 반영했습니다.", details);
    setPreview(null);
    router.refresh();
  }

  function requestExecuteImport() {
    if (!preview) {
      return;
    }

    openConfirmModal({
      title: "학생 명단 등록",
      description: "미리보기 기준으로 학생 명단을 실제 DB에 반영합니다.",
      details: [
        buildImportSummary(preview),
        "중복 처리 " + DUPLICATE_STRATEGY_LABEL[defaults.duplicateStrategy],
        "직렬 " + EXAM_TYPE_LABEL[defaults.examType] + " / 학생 구분 " + STUDENT_TYPE_LABEL[defaults.studentType],
      ],
      confirmLabel: "등록 시작",
      onConfirm: () => {
        setConfirmModal(null);
        run(executeImport);
      },
    });
  }

  useEffect(() => {
    setPreview(null);
  }, [defaults, file, mapping, mode, text]);

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">붙여넣기 / 파일 등록</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          엑셀에서 `수험번호-이름-연락처-기수-반-등록일` 6열을 복사해 붙여넣거나, 별도 명단 파일을
          업로드해 한꺼번에 등록할 수 있습니다.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(["text", "file"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                mode === tab
                  ? "bg-ink text-white"
                  : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              {tab === "text" ? "텍스트 붙여넣기" : "파일 업로드"}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              value={defaults.examType}
              onChange={(event) =>
                setDefaults((current) => ({
                  ...current,
                  examType: event.target.value as typeof current.examType,
                }))
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
              onChange={(event) =>
                setDefaults((current) => ({
                  ...current,
                  studentType: event.target.value as typeof current.studentType,
                }))
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
              onChange={(event) =>
                setDefaults((current) => ({
                  ...current,
                  duplicateStrategy: event.target.value as typeof current.duplicateStrategy,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {Object.entries(DUPLICATE_STRATEGY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">반 기본값</label>
            <input
              value={defaults.classNameFallback}
              onChange={(event) =>
                setDefaults((current) => ({
                  ...current,
                  classNameFallback: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: 기본A반"
            />
          </div>
        </div>

        {mode === "text" ? (
          <>
            <div className="mt-6 rounded-[24px] border border-ink/10 bg-white p-5">
              <h3 className="text-lg font-semibold">열 매핑</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {STUDENT_PASTE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-2 block text-sm font-medium">{field.label}</label>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]:
                            event.target.value === "" ? undefined : Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
                    >
                      <option value="">미사용</option>
                      {Array.from({ length: 8 }, (_, index) => (
                        <option key={index} value={index}>
                          {index + 1}열
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium">붙여넣기 텍스트</label>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="min-h-[220px] w-full rounded-[24px] border border-ink/10 bg-white px-4 py-4 text-sm leading-7"
                placeholder={"35357\t홍길동\t010-1234-5678\t49\t기본A반\t2026-03-01"}
              />
            </div>
          </>
        ) : (
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium">엑셀 파일</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-2xl border border-dashed border-ink/20 bg-white px-4 py-4 text-sm"
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => run(previewImport)}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            미리보기
          </button>
          <button
            type="button"
            onClick={requestExecuteImport}
            disabled={isPending || !preview}
            className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate"
          >
            등록 실행
          </button>
        </div>
      </section>

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
        onClose={closeConfirmModal}
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
        onClose={closeCompletionModal}
      />

      {preview ? (
        <>
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
              <p className="text-sm text-slate">제외</p>
              <p className="mt-3 text-3xl font-semibold text-red-700">
                {preview.summary.invalidRows}
              </p>
            </article>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
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
                  <th className="px-4 py-3 font-semibold">메시지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {preview.previewRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.record.examNumber}-${row.record.name}`}>
                    <td className="px-4 py-3">{row.rowNumber}</td>
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
                    <td className="px-4 py-3">{row.record.examNumber}</td>
                    <td className="px-4 py-3">{row.record.name}</td>
                    <td className="px-4 py-3">{row.record.phone ?? "-"}</td>
                    <td className="px-4 py-3">{row.record.generation ?? "-"}</td>
                    <td className="px-4 py-3">{row.record.className ?? "-"}</td>
                    <td className="px-4 py-3 text-slate">
                      {row.issues.length > 0 ? row.issues.join(", ") : "정상"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
