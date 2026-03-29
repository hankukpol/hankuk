"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AttendType, StudentStatus, Subject } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { StudentAttendanceCalendar } from "@/components/students/student-attendance-calendar";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SCORE_SOURCE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";

type ScoreHistoryRow = {
  id: number;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  note: string | null;
  sourceType: keyof typeof SCORE_SOURCE_LABEL | null;
  session: {
    id: number;
    week: number;
    subject: Subject;
    examDate: string;
    period: {
      name: string;
    };
  };
};

type StudentHistoryData = {
  examNumber: string;
  name: string;
  className: string | null;
  generation: number | null;
  examType: "GONGCHAE" | "GYEONGCHAE";
  currentStatus: StudentStatus;
  scores: ScoreHistoryRow[];
};

type EditDraft = {
  rawScore: string;
  oxScore: string;
  attendType: AttendType;
  note: string;
};

function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}

function SuccessCheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="check-animated h-3.5 w-3.5"
    >
      <path
        d="M5 10.5 8.5 14 15 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function resolveScoreValue(score: ScoreHistoryRow) {
  if (score.finalScore !== null) {
    return score.finalScore;
  }

  if (score.session.subject === Subject.POLICE_SCIENCE && score.oxScore !== null) {
    return score.oxScore;
  }

  return score.rawScore;
}

function buildScoreInsights(scores: ScoreHistoryRow[]) {
  const ordered = [...scores].sort(
    (left, right) =>
      new Date(left.session.examDate).getTime() - new Date(right.session.examDate).getTime() ||
      left.session.id - right.session.id ||
      left.id - right.id,
  );
  const deltas: Record<number, { current: number; previous: number | null }> = {};
  const previousBySubject = new Map<Subject, number>();
  let latestScore: number | null = null;
  let latestPreviousScore: number | null = null;

  for (const score of ordered) {
    const currentScore = resolveScoreValue(score);
    if (currentScore === null) {
      continue;
    }

    const subjectPreviousScore = previousBySubject.get(score.session.subject) ?? null;
    deltas[score.id] = { current: currentScore, previous: subjectPreviousScore };
    latestPreviousScore = subjectPreviousScore;
    latestScore = currentScore;
    previousBySubject.set(score.session.subject, currentScore);
  }

  return {
    deltas,
    latestScore,
    previousScore: latestPreviousScore,
  };
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = {} as T & { error?: string };

  if (text.trim().length > 0) {
    try {
      payload = (JSON.parse(text) as T & { error?: string }) ?? ({} as T & { error?: string });
    } catch {
      payload = {} as T & { error?: string };
    }
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

export function StudentScoreHistoryManager({
  initialStudent,
  canEdit,
}: {
  initialStudent: StudentHistoryData;
  canEdit: boolean;
}) {
  const [student, setStudent] = useState(initialStudent);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, EditDraft>>({});
  const [, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<{
    type: "save" | "delete";
    scoreId: number;
  } | null>(null);
  const [savedScoreId, setSavedScoreId] = useState<number | null>(null);
  const confirmModal = useActionModalState();
  const scoreInsights = useMemo(() => buildScoreInsights(student.scores), [student.scores]);

  useEffect(() => {
    if (savedScoreId === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSavedScoreId((current) => (current === savedScoreId ? null : current));
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [savedScoreId]);

  function getDraft(score: ScoreHistoryRow) {
    return (
      drafts[score.id] ?? {
        rawScore: score.rawScore?.toString() ?? "",
        oxScore: score.oxScore?.toString() ?? "",
        attendType: score.attendType,
        note: score.note ?? "",
      }
    );
  }

  function patchDraft(scoreId: number, patch: Partial<EditDraft>) {
    const currentScore = student.scores.find((score) => score.id === scoreId);

    if (!currentScore) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [scoreId]: {
        ...getDraft(currentScore),
        ...patch,
      },
    }));
  }

  function startEdit(score: ScoreHistoryRow) {
    if (activeAction !== null) {
      return;
    }

    setEditingId(score.id);
    setSavedScoreId(null);
    setDrafts((current) => ({
      ...current,
      [score.id]: getDraft(score),
    }));
  }

  async function refreshStudent() {
    const result = await requestJson<{ student: StudentHistoryData }>(
      `/api/students/${student.examNumber}/scores`,
    );

    if (!result.student) {
      throw new Error("학생 이력을 다시 불러오지 못했습니다.");
    }

    setStudent(result.student);
  }

  function saveScore(scoreId: number) {
    if (activeAction !== null) {
      return;
    }

    const currentScore = student.scores.find((score) => score.id === scoreId);

    if (!currentScore) {
      return;
    }

    const draft = getDraft(currentScore);
    setSavedScoreId(null);
    setActiveAction({ type: "save", scoreId });

    startTransition(async () => {
      try {
        await requestJson(`/api/scores/${scoreId}`, {
          method: "PUT",
          body: JSON.stringify({
            rawScore: draft.rawScore === "" ? null : Number(draft.rawScore),
            oxScore: draft.oxScore === "" ? null : Number(draft.oxScore),
            attendType: draft.attendType,
            note: draft.note.trim() || null,
          }),
        });

        await refreshStudent();
        setActiveAction(null);
        setSavedScoreId(scoreId);
        window.setTimeout(() => {
          setEditingId((current) => (current === scoreId ? null : current));
        }, 1200);
        toast.success("출결/성적을 수정했고, 경고·탈락 상태를 다시 계산했습니다.");
      } catch (error) {
        setActiveAction(null);
        toast.error(
          error instanceof Error ? error.message : "출결/성적 수정에 실패했습니다.",
        );
      }
    });
  }

  function deleteScore(scoreId: number) {
    if (activeAction !== null) {
      return;
    }

    confirmModal.openModal({
      badgeLabel: "성적 삭제",
      badgeTone: "warning",
      title: "이 성적을 삭제할까요?",
      description: "삭제 후에는 원래 점수와 출결을 되돌릴 수 없으며, 경고 상태도 다시 계산됩니다.",
      details: ["삭제한 기록은 복구되지 않으므로 필요하면 먼저 학생 이력을 확인해 주세요."],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setSavedScoreId(null);
        setActiveAction({ type: "delete", scoreId });
        startTransition(async () => {
          try {
            await requestJson(`/api/scores/${scoreId}`, { method: "DELETE" });
            await refreshStudent();
            setActiveAction(null);
            setEditingId((current) => (current === scoreId ? null : current));
            toast.success("성적을 삭제했고, 경고·탈락 상태를 다시 계산했습니다.");
          } catch (error) {
            setActiveAction(null);
            toast.error(
              error instanceof Error ? error.message : "성적 삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            학생 이력
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">
              {student.name} ({student.examNumber})
            </h1>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[student.currentStatus]}`}
            >
              {STATUS_LABEL[student.currentStatus]}
            </span>
            <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-slate">
              {EXAM_TYPE_LABEL[student.examType]}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate">
            {student.className ?? "-"} /{" "}
            {student.generation ? `${student.generation}기` : "기수 미설정"}
          </p>
          <p className="mt-2 text-sm leading-7 text-slate">
            {canEdit
              ? "출결 유형을 ABSENT에서 NORMAL/LIVE/EXCUSED로 수정하면 현재 경고 상태와 주차 이력이 즉시 다시 계산됩니다."
              : "조회 전용 계정입니다. 수정은 교사 이상 권한에서 가능합니다."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/students?examType=${student.examType}`}
            className="btn-ripple inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            목록으로
          </Link>
          <Link
            href={`/admin/students/${student.examNumber}/scores`}
            className="btn-ripple inline-flex items-center rounded-full border border-ember/20 px-4 py-2 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/5"
          >
            통합 성적 보기
          </Link>
          {canEdit ? (
            <Link
              href="/admin/scores/edit"
              className="btn-ripple inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
            >
              성적 수정 화면
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <article className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">최근 점수</p>
          <p className="count-animated mt-3 text-3xl font-semibold text-ink">{scoreInsights.latestScore ?? "-"}</p>
          <div className="mt-2 min-h-[20px]">
            <DeltaBadge current={scoreInsights.latestScore} previous={scoreInsights.previousScore} />
          </div>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">기록 건수</p>
          <p className="count-animated mt-3 text-3xl font-semibold text-ink">{student.scores.length}</p>
          <p className="mt-2 text-sm text-slate">같은 과목 전회차 대비 변화는 표에서 바로 확인할 수 있습니다.</p>
        </article>
      </div>

      <div className="mt-8">
        <StudentAttendanceCalendar scores={student.scores} />
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">기간</th>
              <th className="px-4 py-3 font-semibold">날짜</th>
              <th className="px-4 py-3 font-semibold">주차</th>
              <th className="px-4 py-3 font-semibold">과목</th>
              <th className="px-4 py-3 font-semibold">원점수</th>
              <th className="px-4 py-3 font-semibold">OX</th>
              <th className="px-4 py-3 font-semibold">최종점수</th>
              <th className="px-4 py-3 font-semibold">전회차 대비</th>
              <th className="px-4 py-3 font-semibold">응시유형</th>
              <th className="px-4 py-3 font-semibold">메모</th>
              <th className="px-4 py-3 font-semibold">입력원천</th>
              {canEdit ? <th className="px-4 py-3 font-semibold">정정</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {student.scores.map((score) => {
              const isEditing = canEdit && editingId === score.id;
              const draft = getDraft(score);
              const isActionLocked = activeAction !== null;
              const isSaving =
                activeAction?.type === "save" && activeAction.scoreId === score.id;
              const isSaved = savedScoreId === score.id;

              return (
                <tr key={score.id} className={isEditing ? "bg-amber-50/40" : ""}>
                  <td className="px-4 py-3">{score.session.period.name}</td>
                  <td className="px-4 py-3">{formatDate(score.session.examDate)}</td>
                  <td className="px-4 py-3">{score.session.week}주차</td>
                  <td className="px-4 py-3">{SUBJECT_LABEL[score.session.subject]}</td>
                  {isEditing ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={draft.rawScore}
                          onChange={(event) =>
                            patchDraft(score.id, { rawScore: event.target.value })
                          }
                          className="w-20 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={draft.oxScore}
                          onChange={(event) =>
                            patchDraft(score.id, { oxScore: event.target.value })
                          }
                          className="w-20 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate">자동 계산</td>
                      <td className="px-4 py-3">
                        <DeltaBadge current={scoreInsights.deltas[score.id]?.current} previous={scoreInsights.deltas[score.id]?.previous} />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={draft.attendType}
                          onChange={(event) =>
                            patchDraft(score.id, {
                              attendType: event.target.value as AttendType,
                            })
                          }
                          className="rounded-xl border border-ink/10 px-2 py-1 text-sm"
                        >
                          {Object.values(AttendType).map((type) => (
                            <option key={type} value={type}>
                              {ATTEND_TYPE_LABEL[type]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={draft.note}
                          onChange={(event) =>
                            patchDraft(score.id, { note: event.target.value })
                          }
                          className="w-40 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                          placeholder="메모"
                        />
                      </td>
                      <td className="px-4 py-3">{score.sourceType ? SCORE_SOURCE_LABEL[score.sourceType] : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => saveScore(score.id)}
                            disabled={isActionLocked || isSaved}
                            className={`btn-ripple btn-success inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white transition disabled:opacity-50 ${
                              isSaved ? "bg-forest" : "bg-ink hover:bg-forest"
                            }`}
                          >
                            {isSaving ? <LoadingSpinner /> : null}
                            {isSaved && !isSaving ? <SuccessCheckIcon /> : null}
                            <span>{isSaving ? "저장 중..." : isSaved ? "저장됨" : "저장"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={isActionLocked}
                            className="btn-ripple rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ink/30"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteScore(score.id)}
                            disabled={isActionLocked}
                            className="btn-ripple rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">{score.rawScore ?? "-"}</td>
                      <td className="px-4 py-3">{score.oxScore ?? "-"}</td>
                      <td className="px-4 py-3">{score.finalScore ?? "-"}</td>
                      <td className="px-4 py-3">
                        <DeltaBadge current={scoreInsights.deltas[score.id]?.current} previous={scoreInsights.deltas[score.id]?.previous} />
                      </td>
                      <td className="px-4 py-3">{ATTEND_TYPE_LABEL[score.attendType]}</td>
                      <td className="px-4 py-3 text-slate">{score.note ?? "-"}</td>
                      <td className="px-4 py-3">{score.sourceType ? SCORE_SOURCE_LABEL[score.sourceType] : "-"}</td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => startEdit(score)}
                            disabled={isActionLocked}
                            className="btn-ripple rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                          >
                            정정
                          </button>
                        </td>
                      ) : null}
                    </>
                  )}
                </tr>
              );
            })}
            {student.scores.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 12 : 11} className="px-4 py-8 text-center text-slate">
                  입력된 성적이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <p className="mt-4 text-xs leading-6 text-slate">
          정정 저장 후 학생의 현재 상태와 주차별 경고/탈락 이력이 자동으로 다시 계산됩니다.
        </p>
      ) : null}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={activeAction !== null}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
