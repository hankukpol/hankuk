"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type ExamType = "GONGCHAE" | "GYEONGCHAE";
type Subject =
  | "POLICE_SCIENCE"
  | "CONSTITUTIONAL_LAW"
  | "CRIMINOLOGY"
  | "CRIMINAL_PROCEDURE"
  | "CRIMINAL_LAW"
  | "CUMULATIVE";

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const SUBJECT_LABEL: Record<Subject, string> = {
  POLICE_SCIENCE: "경찰학",
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  CUMULATIVE: "누적 모의고사",
};

const EXAM_TYPE_SUBJECTS: Record<ExamType, Subject[]> = {
  GONGCHAE: [
    "CONSTITUTIONAL_LAW",
    "CRIMINAL_LAW",
    "CRIMINAL_PROCEDURE",
    "POLICE_SCIENCE",
    "CUMULATIVE",
  ],
  GYEONGCHAE: [
    "CRIMINOLOGY",
    "CRIMINAL_LAW",
    "CRIMINAL_PROCEDURE",
    "POLICE_SCIENCE",
    "CUMULATIVE",
  ],
};

type SessionData = {
  id: number;
  examType: ExamType;
  week: number;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: string;
  isCancelled: boolean;
  cancelReason: string | null;
  isLocked: boolean;
  lockedAt: string | null;
  scoresCount: number;
};

type PeriodData = {
  id: number;
  name: string;
  totalWeeks: number;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
};

type SessionManagerProps = {
  period: PeriodData;
  sessions: SessionData[];
};

type FormMode = "add" | "edit" | null;

type FormState = {
  examType: ExamType;
  week: string;
  subject: Subject;
  displaySubjectName: string;
  examDate: string;
  isCancelled: boolean;
  cancelReason: string;
  isLocked: boolean;
};

function getDefaultForm(examType: ExamType): FormState {
  return {
    examType,
    week: "1",
    subject: EXAM_TYPE_SUBJECTS[examType][0],
    displaySubjectName: "",
    examDate: "",
    isCancelled: false,
    cancelReason: "",
    isLocked: false,
  };
}

function StatusBadge({
  isCancelled,
  isLocked,
}: {
  isCancelled: boolean;
  isLocked: boolean;
}) {
  if (isCancelled) {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
        취소됨
      </span>
    );
  }
  if (isLocked) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        잠금
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
      정상
    </span>
  );
}

function formatDateShort(isoString: string) {
  const d = new Date(isoString);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

export function SessionManager({ period, sessions: initialSessions }: SessionManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sessions, setSessions] = useState<SessionData[]>(initialSessions);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeExamTypes: ExamType[] = [];
  if (period.isGongchaeEnabled) activeExamTypes.push("GONGCHAE");
  if (period.isGyeongchaeEnabled) activeExamTypes.push("GYEONGCHAE");

  const [form, setForm] = useState<FormState>(
    getDefaultForm(activeExamTypes[0] ?? "GONGCHAE"),
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // When examType changes, reset subject to first valid option
      if (key === "examType") {
        const availableSubjects = EXAM_TYPE_SUBJECTS[value as ExamType];
        if (!availableSubjects.includes(next.subject)) {
          next.subject = availableSubjects[0];
        }
      }
      return next;
    });
  }

  function openAddForm() {
    setFormMode("add");
    setEditingSessionId(null);
    setForm(getDefaultForm(activeExamTypes[0] ?? "GONGCHAE"));
    setErrorMessage(null);
  }

  function openEditForm(session: SessionData) {
    setFormMode("edit");
    setEditingSessionId(session.id);
    setForm({
      examType: session.examType,
      week: String(session.week),
      subject: session.subject,
      displaySubjectName: session.displaySubjectName ?? "",
      examDate: session.examDate.slice(0, 10),
      isCancelled: session.isCancelled,
      cancelReason: session.cancelReason ?? "",
      isLocked: session.isLocked,
    });
    setErrorMessage(null);
  }

  function closeForm() {
    setFormMode(null);
    setEditingSessionId(null);
    setErrorMessage(null);
  }

  function handleAdd() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const body = {
          examType: form.examType,
          week: Number(form.week),
          subject: form.subject,
          displaySubjectName: form.displaySubjectName.trim() || null,
          examDate: form.examDate,
        };

        const response = await fetch(`/api/periods/${period.id}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          session?: SessionData;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "회차 추가에 실패했습니다.");
        }

        if (payload.session) {
          setSessions((prev) =>
            [...prev, { ...payload.session!, scoresCount: 0 }].sort(
              (a, b) => {
                if (a.examType !== b.examType) return a.examType.localeCompare(b.examType);
                return new Date(a.examDate).getTime() - new Date(b.examDate).getTime();
              },
            ),
          );
        }

        toast.success("회차를 추가했습니다.");
        closeForm();
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "회차 추가에 실패했습니다.",
        );
      }
    });
  }

  function handleEdit() {
    if (!editingSessionId) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const body = {
          subject: form.subject,
          displaySubjectName: form.displaySubjectName.trim() || null,
          examDate: form.examDate,
          isCancelled: form.isCancelled,
          cancelReason: form.isCancelled ? (form.cancelReason.trim() || null) : null,
          isLocked: form.isLocked,
        };

        const response = await fetch(`/api/exam-sessions/${editingSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          session?: SessionData;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "회차 수정에 실패했습니다.");
        }

        if (payload.session) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === editingSessionId
                ? { ...payload.session!, scoresCount: s.scoresCount }
                : s,
            ),
          );
        }

        toast.success("회차를 수정했습니다.");
        closeForm();
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "회차 수정에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(sessionId: number) {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/exam-sessions/${sessionId}`, {
          method: "DELETE",
          cache: "no-store",
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "회차 삭제에 실패했습니다.");
        }

        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toast.success("회차를 삭제했습니다.");
        setDeleteConfirmId(null);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "회차 삭제에 실패했습니다.",
        );
        setDeleteConfirmId(null);
      }
    });
  }

  const availableSubjects = EXAM_TYPE_SUBJECTS[form.examType] ?? [];

  return (
    <div className="mt-8 space-y-8">
      {/* Add session button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          총 <span className="font-semibold text-ink">{sessions.length}</span>개 회차
        </p>
        {formMode === null && (
          <button
            onClick={openAddForm}
            className="inline-flex items-center rounded-full bg-ember px-5 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            + 회차 추가
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {formMode !== null && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-sm font-semibold text-ink">
            {formMode === "add" ? "새 회차 추가" : "회차 수정"}
          </h2>

          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Exam Type (add only) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                직렬 {formMode === "add" && <span className="text-red-500">*</span>}
              </label>
              {formMode === "add" ? (
                <select
                  value={form.examType}
                  onChange={(e) => setField("examType", e.target.value as ExamType)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
                >
                  {activeExamTypes.map((t) => (
                    <option key={t} value={t}>
                      {EXAM_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-2xl border border-ink/10 bg-mist/50 px-4 py-2.5 text-sm text-slate">
                  {EXAM_TYPE_LABEL[form.examType]} (변경 불가)
                </p>
              )}
            </div>

            {/* Week (add only) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                주차 {formMode === "add" && <span className="text-red-500">*</span>}
              </label>
              {formMode === "add" ? (
                <input
                  type="number"
                  min={1}
                  max={period.totalWeeks + 2}
                  value={form.week}
                  onChange={(e) => setField("week", e.target.value)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
                />
              ) : (
                <p className="rounded-2xl border border-ink/10 bg-mist/50 px-4 py-2.5 text-sm text-slate">
                  {form.week}주차 (변경 불가)
                </p>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                과목 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.subject}
                onChange={(e) => setField("subject", e.target.value as Subject)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
              >
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {SUBJECT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            {/* Display Subject Name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                표시 과목명 <span className="text-slate/60">(선택)</span>
              </label>
              <input
                type="text"
                value={form.displaySubjectName}
                onChange={(e) => setField("displaySubjectName", e.target.value)}
                placeholder="예: 형법 (야간반)"
                className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
              />
            </div>

            {/* Exam Date */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                시험일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.examDate}
                onChange={(e) => setField("examDate", e.target.value)}
                required
                className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
              />
            </div>

            {/* Lock status */}
            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isLocked}
                  onChange={(e) => setField("isLocked", e.target.checked)}
                  className="accent-amber-600"
                />
                <span className="text-sm font-medium text-ink">채점 잠금</span>
              </label>
              <p className="mt-1 text-xs text-slate">잠금 시 성적 수정 불가</p>
            </div>

            {/* Cancelled (edit only) */}
            {formMode === "edit" && (
              <div className="flex flex-col justify-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isCancelled}
                    onChange={(e) => setField("isCancelled", e.target.checked)}
                    className="accent-red-600"
                  />
                  <span className="text-sm font-medium text-ink">회차 취소</span>
                </label>
              </div>
            )}
          </div>

          {/* Cancel reason (edit + cancelled) */}
          {formMode === "edit" && form.isCancelled && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate">
                취소 사유
              </label>
              <input
                type="text"
                value={form.cancelReason}
                onChange={(e) => setField("cancelReason", e.target.value)}
                placeholder="예: 공휴일로 인한 휴강"
                className="w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
              />
            </div>
          )}

          {/* Form actions */}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={formMode === "add" ? handleAdd : handleEdit}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-ember px-6 py-2 text-sm font-medium text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending
                ? "처리 중..."
                : formMode === "add"
                  ? "추가"
                  : "저장"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2 text-sm font-medium text-ink transition hover:border-ink/30 disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Sessions table grouped by exam type */}
      {activeExamTypes.map((examType) => {
        const typeSessions = sessions.filter((s) => s.examType === examType);
        return (
          <div key={examType}>
            <h2 className="text-base font-semibold text-ink">
              {EXAM_TYPE_LABEL[examType]} 회차
              <span className="ml-2 text-sm font-normal text-slate">
                ({typeSessions.length}건)
              </span>
            </h2>

            {typeSessions.length === 0 ? (
              <div className="mt-3 rounded-[20px] border border-ink/10 bg-white px-6 py-8 text-center text-sm text-slate">
                등록된 회차가 없습니다.
              </div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead>
                    <tr>
                      {["주차", "과목", "시험일", "성적 수", "상태", "취소 사유", "동작"].map(
                        (h) => (
                          <th
                            key={h}
                            className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {typeSessions.map((session) => (
                      <tr key={session.id} className="transition hover:bg-mist/30">
                        <td className="px-4 py-3 tabular-nums font-medium text-ink">
                          {session.week}주차
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {session.displaySubjectName
                            ? session.displaySubjectName
                            : SUBJECT_LABEL[session.subject]}
                          {session.displaySubjectName && (
                            <span className="ml-1 text-xs text-slate">
                              ({SUBJECT_LABEL[session.subject]})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">
                          {formatDateShort(session.examDate)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">
                          {session.scoresCount > 0 ? (
                            <span className="font-semibold text-ink">{session.scoresCount}</span>
                          ) : (
                            <span className="text-slate/50">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            isCancelled={session.isCancelled}
                            isLocked={session.isLocked}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate">
                          {session.cancelReason ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditForm(session)}
                              disabled={isPending || formMode !== null}
                              className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest transition hover:border-forest hover:bg-forest/5 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              수정
                            </button>
                            {deleteConfirmId === session.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(session.id)}
                                  disabled={isPending}
                                  className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                                >
                                  확인
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  disabled={isPending}
                                  className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink transition hover:border-ink/30"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(session.id)}
                                disabled={
                                  isPending ||
                                  formMode !== null ||
                                  session.isLocked ||
                                  session.scoresCount > 0
                                }
                                title={
                                  session.scoresCount > 0
                                    ? "성적이 입력된 회차는 삭제할 수 없습니다."
                                    : session.isLocked
                                      ? "잠긴 회차는 삭제할 수 없습니다."
                                      : "회차 삭제"
                                }
                                className="inline-flex items-center rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
