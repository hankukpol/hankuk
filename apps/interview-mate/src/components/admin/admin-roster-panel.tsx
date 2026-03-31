"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { LoaderCircle, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useSessionSelection } from "@/components/admin/use-session-selection";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { normalizePhone } from "@/lib/phone";
import type { SessionSummary } from "@/lib/sessions";
import {
  formatBytes,
  getSpreadsheetUploadLimitMessage,
  MAX_SPREADSHEET_UPLOAD_BYTES,
} from "@/lib/uploads";

type AdminRosterPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  sessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
  hideSessionField?: boolean;
};

type RegisteredStudentSummary = {
  id: string;
  sessionId: string;
  name: string;
  phone: string;
  gender: string | null;
  series: string | null;
  interviewExperience: boolean | null;
  createdAt: string;
};

type ManualRosterForm = {
  name: string;
  phone: string;
  gender: string;
  series: string;
  interviewExperience: "" | "있음" | "없음";
};

type DeleteAllPayload = {
  sessionId: string;
  deletedCount: number;
};

const defaultManualForm: ManualRosterForm = {
  name: "",
  phone: "",
  gender: "",
  series: "",
  interviewExperience: "",
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

export function AdminRosterPanel({
  adminKey,
  sessions,
  initialSessionId,
  sessionId: controlledSessionId,
  onSessionIdChange,
  hideSessionField = false,
}: AdminRosterPanelProps) {
  const { sessionId, setSessionId, selectedSession } = useSessionSelection({
    sessions,
    initialSessionId,
    sessionId: controlledSessionId,
    onSessionIdChange,
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [students, setStudents] = useState<RegisteredStudentSummary[]>([]);
  const [search, setSearch] = useState("");
  const [manualForm, setManualForm] = useState<ManualRosterForm>(defaultManualForm);
  const [deleteTarget, setDeleteTarget] =
    useState<RegisteredStudentSummary | null>(null);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const jsonHeaders = useMemo(
    () => ({
      "Content-Type": "application/json; charset=utf-8",
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  const isEditable = selectedSession?.status === "active";

  const loadRoster = useCallback(
    async (nextSessionId: string) => {
      if (!nextSessionId) {
        setStudents([]);
        return;
      }

      setIsLoading(true);

      try {
        const payload = await fetch(
          `/api/admin/roster?session_id=${nextSessionId}`,
          {
            headers: {
              "x-admin-key": adminKey,
            },
          },
        ).then(readJson<{ students: RegisteredStudentSummary[] }>);

        setStudents(payload.students);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "등록 명단을 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [adminKey],
  );

  useEffect(() => {
    void loadRoster(sessionId);
  }, [loadRoster, sessionId]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return students;
    }

    return students.filter((student) =>
      [
        student.name,
        student.phone,
        student.series ?? "",
        student.gender ?? "",
        student.interviewExperience === true
          ? "면접경험 있음"
          : student.interviewExperience === false
            ? "면접경험 없음"
            : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [search, students]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    if (nextFile && nextFile.size > MAX_SPREADSHEET_UPLOAD_BYTES) {
      event.target.value = "";
      setFile(null);
      toast.error(getSpreadsheetUploadLimitMessage());
      return;
    }

    setFile(nextFile);
  };

  const handleUpload = () => {
    if (!sessionId) {
      toast.error("세션을 먼저 선택해 주세요.");
      return;
    }

    if (!isEditable) {
      toast.error("종료된 세션의 명단은 수정할 수 없습니다.");
      return;
    }

    if (!file) {
      toast.error("업로드할 명단 파일을 선택해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.append("sessionId", sessionId);
          formData.append("file", file);
          formData.append("replaceExisting", String(replaceExisting));

          const payload = await fetch("/api/admin/roster", {
            method: "POST",
            headers: {
              "x-admin-key": adminKey,
            },
            body: formData,
          }).then(readJson<{ importedCount: number }>);

          await loadRoster(sessionId);
          setFile(null);
          setFileInputKey((current) => current + 1);
          toast.success(`등록 명단 ${payload.importedCount}명을 저장했습니다.`);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "등록 명단을 업로드하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleManualSave = () => {
    if (!sessionId) {
      toast.error("세션을 먼저 선택해 주세요.");
      return;
    }

    if (!isEditable) {
      toast.error("종료된 세션의 명단은 수정할 수 없습니다.");
      return;
    }

    if (!manualForm.name.trim() || !manualForm.phone.trim()) {
      toast.error("이름과 연락처를 입력해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch("/api/admin/roster/manual", {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
              sessionId,
              name: manualForm.name.trim(),
              phone: normalizePhone(manualForm.phone),
              gender: manualForm.gender || null,
              series: manualForm.series.trim() || null,
              interviewExperience:
                manualForm.interviewExperience === "있음"
                  ? true
                  : manualForm.interviewExperience === "없음"
                    ? false
                    : null,
            }),
          }).then(
            readJson<{
              student: RegisteredStudentSummary;
              mode: "created" | "updated";
            }>,
          );

          setManualForm(defaultManualForm);
          await loadRoster(sessionId);
          toast.success(
            payload.mode === "created"
              ? "등록 학생을 추가했습니다."
              : "등록 학생 정보를 수정했습니다.",
          );
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "등록 학생을 저장하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleDeleteOne = () => {
    if (!deleteTarget) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/roster/${deleteTarget.id}`, {
            method: "DELETE",
            headers: jsonHeaders,
          }).then(readJson<{ deletedId: string }>);

          setDeleteTarget(null);
          await loadRoster(sessionId);
          toast.success("등록 명단에서 학생을 삭제했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "등록 학생을 삭제하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleDeleteAll = () => {
    if (!sessionId) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch(`/api/admin/roster?session_id=${sessionId}`, {
            method: "DELETE",
            headers: {
              "x-admin-key": adminKey,
            },
          }).then(readJson<DeleteAllPayload>);

          setDeleteAllConfirmOpen(false);
          await loadRoster(payload.sessionId);
          toast.success(`등록 명단 ${payload.deletedCount}명을 전체 삭제했습니다.`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "등록 명단 전체 삭제를 처리하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <>
      <SectionCard
        title="등록 명단 상세 관리"
        description="파일 업로드, 수동 등록, 검색, 개별 삭제, 전체 초기화를 한 화면에서 처리합니다."
        action={
          <div className="flex items-center gap-2">
            <Badge tone="info">명단 {students.length}명</Badge>
            <button
              type="button"
              onClick={() => setDeleteAllConfirmOpen(true)}
              disabled={!isEditable || isPending || students.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              전체 삭제
            </button>
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div className="space-y-4">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">운영 세션</p>
              {!hideSessionField && (
              <select
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                className="mt-3 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">세션 선택</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={isEditable ? "success" : "neutral"}>
                  {isEditable ? "운영 중" : "종료"}
                </Badge>
                {selectedSession?.track ? (
                  <Badge tone="brand">{selectedSession.track}</Badge>
                ) : null}
              </div>
            </div>

            <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">파일 업로드</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                `이름`, `연락처` 헤더를 포함한 CSV 또는 엑셀 파일을 업로드합니다.
                `면접 경험 여부` 열을 함께 넣으면 명단에 같이 저장됩니다.
                최대 파일 크기는 {formatBytes(MAX_SPREADSHEET_UPLOAD_BYTES)}입니다.
              </p>
              <input
                key={fileInputKey}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                disabled={!isEditable}
                className="mt-3 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <label className="mt-3 flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                  disabled={!isEditable}
                  className="h-4 w-4 rounded border-slate-300"
                />
                기존 명단을 비우고 업로드 파일 기준으로 다시 저장
              </label>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!isEditable || isPending}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                명단 업로드
              </button>
            </div>

            <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">수동 등록</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                파일 없이 학생을 바로 추가하거나 같은 연락처 기준으로 수정할 수 있습니다.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  value={manualForm.name}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  disabled={!isEditable}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                  placeholder="이름"
                />
                <input
                  value={manualForm.phone}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  disabled={!isEditable}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                  placeholder="010-0000-0000"
                />
                <select
                  value={manualForm.gender}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      gender: event.target.value,
                    }))
                  }
                  disabled={!isEditable}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                >
                  <option value="">성별 미선택</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
                <input
                  value={manualForm.series}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      series: event.target.value,
                    }))
                  }
                  disabled={!isEditable}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                  placeholder="직렬"
                />
                <select
                  value={manualForm.interviewExperience}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      interviewExperience:
                        event.target.value as ManualRosterForm["interviewExperience"],
                    }))
                  }
                  disabled={!isEditable}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                >
                  <option value="">면접 경험 미선택</option>
                  <option value="있음">면접 경험 있음</option>
                  <option value="없음">면접 경험 없음</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleManualSave}
                disabled={!isEditable || isPending}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                학생 추가
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">명단 미리보기</p>
                  <p className="mt-1 text-xs text-slate-500">
                    학생 본인확인과 지원 가능 여부 검증에 바로 반영됩니다.
                  </p>
                </div>
                <div className="relative w-full md:max-w-[280px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm"
                    placeholder="이름, 연락처, 직렬, 면접 경험 검색"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">전체 등록 수</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {isLoading ? "불러오는 중" : `${students.length}명`}
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">검색 결과</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {isLoading ? "불러오는 중" : `${filteredStudents.length}명`}
                </p>
              </div>
            </div>

            <div className="grid max-h-[720px] gap-3 overflow-y-auto pr-1">
              {filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {student.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{student.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(student)}
                      disabled={!isEditable}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {student.gender ? <Badge tone="neutral">{student.gender}</Badge> : null}
                    {student.series ? <Badge tone="brand">{student.series}</Badge> : null}
                    {student.interviewExperience !== null ? (
                      <Badge tone={student.interviewExperience ? "info" : "neutral"}>
                        면접 경험 {student.interviewExperience ? "있음" : "없음"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))}

              {!isLoading && filteredStudents.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  {students.length === 0
                    ? "등록된 학생이 없습니다. 파일 업로드나 수동 등록으로 추가해 주세요."
                    : "검색 조건에 맞는 학생이 없습니다."}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="등록 학생을 삭제하시겠습니까?"
        description={
          deleteTarget
            ? `${deleteTarget.name} (${deleteTarget.phone}) 정보를 등록 명단에서 제거합니다.`
            : ""
        }
        confirmText="삭제"
        tone="danger"
        isPending={isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteOne}
      />

      <ConfirmDialog
        open={deleteAllConfirmOpen}
        title="등록 명단을 초기화하시겠습니까?"
        description={`등록 학생 ${students.length}명이 전체 삭제됩니다.`}
        confirmText="전체 삭제"
        tone="danger"
        isPending={isPending}
        onCancel={() => setDeleteAllConfirmOpen(false)}
        onConfirm={handleDeleteAll}
      />
    </>
  );
}
