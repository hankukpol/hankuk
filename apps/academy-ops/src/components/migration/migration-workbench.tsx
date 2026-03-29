"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client/fetch-json";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  STUDENT_MIGRATION_FIELDS,
  STUDENT_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";

type StudentPreviewResponse = {
  sheetNames: string[];
  sheetName: string;
  headerRowIndex: number;
  columns: Array<{
    index: number;
    letter: string;
    header: string;
    label: string;
    sample: string;
  }>;
  mapping: Partial<Record<(typeof STUDENT_MIGRATION_FIELDS)[number]["key"], number>>;
  previewRows: Array<{
    rowNumber: number;
    status: "valid" | "invalid" | "update";
    issues: string[];
    record: {
      examNumber: string;
      name: string;
      phone: string | null;
      generation: number | null;
      className: string | null;
      onlineId: string | null;
    };
  }>;
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    updateRows: number;
  };
};

type RecentRun = {
  id: number;
  targetId: string;
  createdAt: string;
  adminName: string;
  fileName: string;
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  rolledBackAt: string | null;
  rollbackDeletedCount: number;
  rollbackRestoredCount: number;
  rollbackSkippedDeletes: string[];
};

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: Array<{
    id: number;
    examType: keyof typeof EXAM_TYPE_LABEL;
    week: number;
    subject: keyof typeof SUBJECT_LABEL;
    examDate: string;
    isCancelled: boolean;
  }>;
};

type LegacyWorkbookPreview = {
  fileName: string;
  period: {
    id: number;
    name: string;
  };
  examType: keyof typeof EXAM_TYPE_LABEL;
  sheetNames: string[];
  summary: {
    totalRows: number;
    readyRows: number;
    overwriteRows: number;
    invalidRows: number;
    absentRows: number;
    excusedRows: number;
    affectedSessions: number;
  };
  rows: Array<{
    rowKey: string;
    sheetName: string;
    week: number;
    subject: keyof typeof SUBJECT_LABEL;
    sessionId: number | null;
    sessionLabel: string | null;
    sessionExamDate: string | null;
    examNumber: string;
    name: string;
    rawScore: number | null;
    oxScore: number | null;
    finalScore: number | null;
    attendType: keyof typeof ATTEND_TYPE_LABEL;
    status: "ready" | "overwrite" | "invalid";
    issues: string[];
    note: string | null;
  }>;
};

type MigrationWorkbenchProps = {
  recentRuns: RecentRun[];
  periods: PeriodOption[];
};

type StudentDefaults = {
  examType: keyof typeof EXAM_TYPE_LABEL;
  studentType: "NEW" | "EXISTING";
  classNameFallback: string;
};

type CompletionModalState = {
  title: string;
  description: string;
  details: string[];
};

const statusStyle = {
  valid: "border-forest/20 bg-forest/10 text-forest",
  update: "border-ember/20 bg-ember/10 text-ember",
  invalid: "border-red-200 bg-red-50 text-red-700",
} as const;

const scoreStatusStyle = {
  ready: "border-forest/20 bg-forest/10 text-forest",
  overwrite: "border-ember/20 bg-ember/10 text-ember",
  invalid: "border-red-200 bg-red-50 text-red-700",
} as const;

function inferExamTypeFromFileName(fileName: string) {
  return fileName.includes("경채") ? "GYEONGCHAE" : "GONGCHAE";
}

export function MigrationWorkbench({ recentRuns, periods }: MigrationWorkbenchProps) {
  const router = useRouter();
  const initialPeriodId = periods.find((period) => period.isActive)?.id ?? periods[0]?.id ?? null;
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [studentDefaults, setStudentDefaults] = useState<StudentDefaults>({
    examType: "GONGCHAE",
    studentType: "NEW",
    classNameFallback: "",
  });
  const [sheetName, setSheetName] = useState("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<
    Partial<Record<(typeof STUDENT_MIGRATION_FIELDS)[number]["key"], number>>
  >({});
  const [studentPreview, setStudentPreview] = useState<StudentPreviewResponse | null>(null);
  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(initialPeriodId);
  const [selectedExamType, setSelectedExamType] = useState<keyof typeof EXAM_TYPE_LABEL>("GONGCHAE");
  const [workbookPreview, setWorkbookPreview] = useState<LegacyWorkbookPreview | null>(null);
  const [completionModal, setCompletionModal] = useState<CompletionModalState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  const matchedSessionCount = useMemo(
    () =>
      selectedPeriod?.sessions.filter((session) => session.examType === selectedExamType).length ?? 0,
    [selectedExamType, selectedPeriod],
  );

  function resetMessages() {
    setNotice(null);
    setErrorMessage(null);
  }

  function openCompletionModal(title: string, description: string, details: string[]) {
    setCompletionModal({ title, description, details });
  }

  function closeCompletionModal() {
    setCompletionModal(null);
  }

  useEffect(() => {
    if (!completionModal) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCompletionModal();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [completionModal]);

  function createStudentPayload() {
    if (!studentFile) {
      throw new Error("학생 명단 파일을 먼저 선택해 주세요.");
    }

    const formData = new FormData();
    formData.append("file", studentFile);
    formData.append("sheetName", sheetName);
    formData.append("headerRowIndex", String(headerRowIndex));
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("defaults", JSON.stringify(studentDefaults));
    return formData;
  }

  function createWorkbookPayload(mode: "preview" | "execute") {
    if (!workbookFile) {
      throw new Error("구간 통합본 파일을 선택해 주세요.");
    }

    if (!selectedPeriodId) {
      throw new Error("시험 기간을 선택해 주세요.");
    }

    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("file", workbookFile);
    formData.append("periodId", String(selectedPeriodId));
    formData.append("examType", selectedExamType);
    return formData;
  }

  function run(action: () => Promise<void>) {
    resetMessages();
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "작업 처리 중 오류가 발생했습니다.");
      }
    });
  }

  async function requestJson<T>(url: string, init?: RequestInit) {
    return fetchJson<T>(url, init, {
      defaultError: "요청 처리에 실패했습니다.",
      timeoutError:
        "서버 처리 시간이 너무 오래 걸렸습니다. 저장 범위를 줄이거나 잠시 후 다시 시도해 주세요.",
    });
  }

  function fetchStudentPreview() {
    run(async () => {
      const payload = await requestJson<StudentPreviewResponse>("/api/migration/students/preview", {
        method: "POST",
        body: createStudentPayload(),
      });

      setStudentPreview(payload);
      setSheetName(payload.sheetName);
      setHeaderRowIndex(payload.headerRowIndex);
      setMapping(payload.mapping ?? {});
      setNotice("학생 명단 미리보기를 생성했습니다.");
    });
  }

  function executeStudentImport() {
    run(async () => {
      const payload = await requestJson<{
        importedCount: number;
        createdCount: number;
        updatedCount: number;
      }>("/api/migration/students/execute", {
        method: "POST",
        body: createStudentPayload(),
      });

      setNotice(
        `학생 ${payload.importedCount}건을 반영했습니다. 신규 ${payload.createdCount}건, 업데이트 ${payload.updatedCount}건입니다.`,
      );
      openCompletionModal("학생 명단 반영 완료", "학생 명단 마이그레이션을 정상적으로 반영했습니다.", [
        `반영 건수 ${payload.importedCount}건`,
        `신규 생성 ${payload.createdCount}건`,
        `기존 업데이트 ${payload.updatedCount}건`,
      ]);
      router.refresh();
    });
  }

  function rollbackRun(auditLogId: number) {
    run(async () => {
      const payload = await requestJson<{
        deletedCount: number;
        restoredCount: number;
        skippedDeletes: string[];
      }>("/api/migration/students/rollback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ auditLogId }),
      });

      setNotice(
        payload.skippedDeletes.length > 0
          ? `롤백 완료: 삭제 ${payload.deletedCount}건, 복원 ${payload.restoredCount}건, 보류 ${payload.skippedDeletes.join(", ")}`
          : `롤백 완료: 삭제 ${payload.deletedCount}건, 복원 ${payload.restoredCount}건`,
      );
      openCompletionModal("롤백 완료", "선택한 학생 마이그레이션을 롤백했습니다.", [
        `삭제 ${payload.deletedCount}건`,
        `복원 ${payload.restoredCount}건`,
        payload.skippedDeletes.length > 0
          ? `삭제 보류 ${payload.skippedDeletes.join(", ")}`
          : "삭제 보류 없음",
      ]);
      router.refresh();
    });
  }

  function previewLegacyWorkbook() {
    run(async () => {
      const payload = await requestJson<LegacyWorkbookPreview>("/api/migration/scores/workbook", {
        method: "POST",
        body: createWorkbookPayload("preview"),
      });

      setWorkbookPreview(payload);
      setNotice("구간 통합본 점수 미리보기를 생성했습니다.");
    });
  }

  function executeLegacyWorkbook() {
    run(async () => {
      const payload = await requestJson<{
        importedCount: number;
        createdCount: number;
        updatedCount: number;
        invalidCount: number;
      }>("/api/migration/scores/workbook", {
        method: "POST",
        body: createWorkbookPayload("execute"),
      });

      setNotice(
        `점수 ${payload.importedCount}건을 반영했습니다. 신규 ${payload.createdCount}건, 덮어쓰기 ${payload.updatedCount}건, 제외 ${payload.invalidCount}건입니다.`,
      );
      openCompletionModal("점수 반영 완료", "구간 통합본 점수 마이그레이션을 정상적으로 반영했습니다.", [
        `반영 건수 ${payload.importedCount}건`,
        `신규 생성 ${payload.createdCount}건`,
        `기존 덮어쓰기 ${payload.updatedCount}건`,
        `제외 ${payload.invalidCount}건`,
      ]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">학생 명단 마이그레이션</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          기존 통합본의 학생 명단 시트를 읽어 학생 DB에 반영합니다. 필요하면 시트명, 헤더 행, 열 매핑을 조정할 수 있습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-ink">학생 명단 파일</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setStudentFile(file);
                setStudentPreview(null);
                resetMessages();
              }}
              className="block w-full rounded-2xl border border-dashed border-ink/20 bg-white px-4 py-3 text-sm text-slate"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">직렬</label>
            <select
              value={studentDefaults.examType}
              onChange={(event) =>
                setStudentDefaults((current) => ({
                  ...current,
                  examType: event.target.value as StudentDefaults["examType"],
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">학생 구분</label>
            <select
              value={studentDefaults.studentType}
              onChange={(event) =>
                setStudentDefaults((current) => ({
                  ...current,
                  studentType: event.target.value as StudentDefaults["studentType"],
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="NEW">{STUDENT_TYPE_LABEL.NEW}</option>
              <option value="EXISTING">{STUDENT_TYPE_LABEL.EXISTING}</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_180px]">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">기본 반 이름</label>
            <input
              value={studentDefaults.classNameFallback}
              onChange={(event) =>
                setStudentDefaults((current) => ({
                  ...current,
                  classNameFallback: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="파일에 반 정보가 없을 때 사용할 값"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">시트명</label>
            <select
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
              disabled={!studentPreview}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm disabled:bg-zinc-100"
            >
              <option value="">자동 선택</option>
              {studentPreview?.sheetNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">헤더 행</label>
            <input
              type="number"
              min={0}
              value={headerRowIndex}
              onChange={(event) => setHeaderRowIndex(Number(event.target.value))}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchStudentPreview}
            disabled={!studentFile || isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {studentPreview ? "미리보기 갱신" : "파일 분석"}
          </button>
          <button
            type="button"
            onClick={executeStudentImport}
            disabled={!studentPreview || isPending}
            className="inline-flex items-center rounded-full border border-ember/30 bg-white px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate"
          >
            학생 DB 반영
          </button>
        </div>

        {studentPreview ? (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">전체 행</p><p className="mt-3 text-3xl font-semibold">{studentPreview.summary.totalRows}</p></article>
              <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">신규 반영 가능</p><p className="mt-3 text-3xl font-semibold text-forest">{studentPreview.summary.validRows}</p></article>
              <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">업데이트 대상</p><p className="mt-3 text-3xl font-semibold text-ember">{studentPreview.summary.updateRows}</p></article>
              <article className="rounded-3xl bg-white p-5"><p className="text-sm text-slate">제외</p><p className="mt-3 text-3xl font-semibold text-red-700">{studentPreview.summary.invalidRows}</p></article>
            </div>

            <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
              <h3 className="text-lg font-semibold">열 매핑</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {STUDENT_MIGRATION_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-2 block text-sm font-medium text-ink">{field.label}{field.required ? " *" : ""}</label>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: event.target.value === "" ? undefined : Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
                    >
                      <option value="">매핑 안 함</option>
                      {studentPreview.columns.map((column) => (
                        <option key={column.index} value={column.index}>
                          {column.label}{column.sample ? ` | 예시 ${column.sample}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-6 py-4"><h3 className="text-lg font-semibold">미리보기 상위 20건</h3></div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist text-left">
                    <tr>
                      <th className="px-5 py-4 font-semibold">행</th>
                      <th className="px-5 py-4 font-semibold">상태</th>
                      <th className="px-5 py-4 font-semibold">수험번호</th>
                      <th className="px-5 py-4 font-semibold">이름</th>
                      <th className="px-5 py-4 font-semibold">기수</th>
                      <th className="px-5 py-4 font-semibold">연락처</th>
                      <th className="px-5 py-4 font-semibold">검토 결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {studentPreview.previewRows.slice(0, 20).map((row) => (
                      <tr key={`${row.rowNumber}-${row.record.examNumber}-${row.record.name}`}>
                        <td className="px-5 py-4 text-slate">{row.rowNumber}</td>
                        <td className="px-5 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle[row.status]}`}>{row.status === "valid" ? "신규" : row.status === "update" ? "업데이트" : "제외"}</span></td>
                        <td className="px-5 py-4 font-medium">{row.record.examNumber}</td>
                        <td className="px-5 py-4">{row.record.name}</td>
                        <td className="px-5 py-4">{row.record.generation ?? "-"}</td>
                        <td className="px-5 py-4">{row.record.phone ?? "-"}</td>
                        <td className="px-5 py-4 text-slate">{row.issues.length > 0 ? row.issues.join(", ") : "정상"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">구간 통합본 점수 마이그레이션</h2>
        <p className="mt-3 text-sm leading-7 text-slate">
          주차 시트를 직접 읽어 선택한 기간의 회차와 매칭한 뒤 점수를 반영합니다.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_220px_220px]">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">구간 통합본 파일</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setWorkbookFile(file);
                setWorkbookPreview(null);
                if (file) {
                  setSelectedExamType(inferExamTypeFromFileName(file.name));
                }
                resetMessages();
              }}
              className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">시험 기간</label>
            <select value={selectedPeriodId ?? ""} onChange={(event) => { setSelectedPeriodId(Number(event.target.value)); setWorkbookPreview(null); }} className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
              {periods.map((period) => <option key={period.id} value={period.id}>{period.name}{period.isActive ? " · 활성" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">직렬</label>
            <select value={selectedExamType} onChange={(event) => { setSelectedExamType(event.target.value as keyof typeof EXAM_TYPE_LABEL); setWorkbookPreview(null); }} className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-ink/10 bg-mist px-5 py-4 text-sm leading-7 text-slate">
          {selectedPeriod ? (
            <>
              선택 기간에는 <span className="font-semibold text-ink">{matchedSessionCount}개</span>의 {EXAM_TYPE_LABEL[selectedExamType]} 회차가 있습니다.
            </>
          ) : (
            "시험 기간을 먼저 선택해 주세요."
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={previewLegacyWorkbook} disabled={!workbookFile || !selectedPeriodId || isPending} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">점수 미리보기</button>
          <button type="button" onClick={executeLegacyWorkbook} disabled={!workbookPreview || isPending} className="inline-flex items-center rounded-full border border-ember/30 bg-white px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">점수 DB 반영</button>
        </div>

        {workbookPreview ? (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-6">
              <article className="rounded-3xl bg-mist p-5"><p className="text-sm text-slate">전체 행</p><p className="mt-3 text-3xl font-semibold">{workbookPreview.summary.totalRows}</p></article>
              <article className="rounded-3xl bg-mist p-5"><p className="text-sm text-slate">신규 반영</p><p className="mt-3 text-3xl font-semibold text-forest">{workbookPreview.summary.readyRows}</p></article>
              <article className="rounded-3xl bg-mist p-5"><p className="text-sm text-slate">덮어쓰기</p><p className="mt-3 text-3xl font-semibold text-ember">{workbookPreview.summary.overwriteRows}</p></article>
              <article className="rounded-3xl bg-mist p-5"><p className="text-sm text-slate">제외</p><p className="mt-3 text-3xl font-semibold text-red-700">{workbookPreview.summary.invalidRows}</p></article>
              <article className="rounded-3xl bg-mist p-5"><p className="text-sm text-slate">무단 결시</p><p className="mt-3 text-3xl font-semibold">{workbookPreview.summary.absentRows}</p></article>
              <article className="rounded-3xl bg-mist p-5"><p className="text-sm text-slate">사유 결시</p><p className="mt-3 text-3xl font-semibold">{workbookPreview.summary.excusedRows}</p></article>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              미리보기에서 회차 매칭 결과를 반드시 확인해 주세요. 날짜와 과목이 실제 반영 대상과 일치해야 합니다.
            </div>

            <div className="mt-6 rounded-[24px] border border-ink/10 bg-mist px-5 py-4 text-sm leading-7 text-slate">
              <div>파일: {workbookPreview.fileName}</div>
              <div>기간: {workbookPreview.period.name}</div>
              <div>직렬: {EXAM_TYPE_LABEL[workbookPreview.examType]}</div>
              <div>시트: {workbookPreview.sheetNames.join(", ")}</div>
            </div>

            <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-6 py-4"><h3 className="text-lg font-semibold">점수 미리보기 상위 120건</h3></div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">주차</th>
                      <th className="px-4 py-3 font-semibold">과목</th>
                      <th className="px-4 py-3 font-semibold">상태</th>
                      <th className="px-4 py-3 font-semibold">회차 매칭</th>
                      <th className="px-4 py-3 font-semibold">회차 날짜</th>
                      <th className="px-4 py-3 font-semibold">수험번호</th>
                      <th className="px-4 py-3 font-semibold">이름</th>
                      <th className="px-4 py-3 font-semibold">원점수</th>
                      <th className="px-4 py-3 font-semibold">OX</th>
                      <th className="px-4 py-3 font-semibold">최종</th>
                      <th className="px-4 py-3 font-semibold">응시 유형</th>
                      <th className="px-4 py-3 font-semibold">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {workbookPreview.rows.slice(0, 120).map((row) => (
                      <tr key={row.rowKey}>
                        <td className="px-4 py-3">{row.week}주차</td>
                        <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                        <td className="px-4 py-3"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${scoreStatusStyle[row.status]}`}>{row.status === "ready" ? "신규" : row.status === "overwrite" ? "덮어쓰기" : "제외"}</span></td>
                        <td className="px-4 py-3 text-slate">{row.sessionLabel ?? "매칭 실패"}</td>
                        <td className="px-4 py-3 text-slate">{row.sessionExamDate ?? "-"}</td>
                        <td className="px-4 py-3 font-medium">{row.examNumber || "-"}</td>
                        <td className="px-4 py-3">{row.name || "-"}</td>
                        <td className="px-4 py-3">{row.rawScore ?? "-"}</td>
                        <td className="px-4 py-3">{row.oxScore ?? "-"}</td>
                        <td className="px-4 py-3">{row.finalScore ?? "-"}</td>
                        <td className="px-4 py-3">{ATTEND_TYPE_LABEL[row.attendType]}</td>
                        <td className="px-4 py-3 text-slate">{row.issues.length > 0 ? row.issues.join(", ") : row.note ?? "정상"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {notice ? <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{notice}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">최근 학생 명단 마이그레이션</h2>
        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist text-left">
              <tr>
                <th className="px-5 py-4 font-semibold">실행 시각</th>
                <th className="px-5 py-4 font-semibold">작업자</th>
                <th className="px-5 py-4 font-semibold">파일명</th>
                <th className="px-5 py-4 font-semibold">반영 수</th>
                <th className="px-5 py-4 font-semibold">신규 / 업데이트</th>
                <th className="px-5 py-4 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {recentRuns.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate">최근 실행한 학생 명단 마이그레이션이 없습니다.</td></tr>
              ) : null}
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="px-5 py-4">{new Date(run.createdAt).toLocaleString("ko-KR")}</td>
                  <td className="px-5 py-4">{run.adminName}</td>
                  <td className="px-5 py-4">{run.fileName}</td>
                  <td className="px-5 py-4">{run.importedCount}건</td>
                  <td className="px-5 py-4">신규 {run.createdCount} / 업데이트 {run.updatedCount}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {run.rolledBackAt ? (
                        <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">롤백 완료</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">반영됨</span>
                      )}
                      <button type="button" onClick={() => rollbackRun(run.id)} disabled={isPending || Boolean(run.rolledBackAt)} className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">{run.rolledBackAt ? "롤백 완료" : "롤백"}</button>
                    </div>
                    {run.rolledBackAt ? (
                      <div className="mt-2 space-y-1 text-xs text-slate">
                        <div>{new Date(run.rolledBackAt).toLocaleString("ko-KR")}</div>
                        <div>삭제 {run.rollbackDeletedCount} / 복원 {run.rollbackRestoredCount}</div>
                        {run.rollbackSkippedDeletes.length > 0 ? <div className="text-red-700">보류: {run.rollbackSkippedDeletes.join(", ")}</div> : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {completionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="migration-complete-title" onClick={closeCompletionModal}>
          <div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-forest">Completed</div>
            <h3 id="migration-complete-title" className="mt-4 text-2xl font-semibold text-ink">{completionModal.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate">{completionModal.description}</p>
            <div className="mt-5 rounded-3xl bg-mist p-4">
              <div className="space-y-2 text-sm text-ink">
                {completionModal.details.map((detail) => <p key={detail}>{detail}</p>)}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={closeCompletionModal} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest">확인</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
