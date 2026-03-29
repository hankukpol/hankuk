"use client";

import { Subject } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type WrongNoteRow = {
  id: number;
  questionId: number;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  examDate: string;
  subject: Subject;
  sessionId: number;
  questionNo: number;
  correctAnswer: string;
  correctRate: number | null;
  difficulty: string | null;
  studentAnswer: string | null;
};

type WrongNoteManagerProps = {
  initialNotes: WrongNoteRow[];
};

export function WrongNoteManager({ initialNotes }: WrongNoteManagerProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [subject, setSubject] = useState<Subject | "ALL">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(initialNotes.map((note) => [note.id, note.memo ?? ""])),
  );
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  // Compute per-subject counts across all notes (for tab badges)
  const subjectCounts = useMemo(() => {
    return notes.reduce<Partial<Record<Subject | "ALL", number>>>((acc, note) => {
      acc["ALL"] = (acc["ALL"] ?? 0) + 1;
      acc[note.subject] = (acc[note.subject] ?? 0) + 1;
      return acc;
    }, { ALL: 0 });
  }, [notes]);

  // Unique subjects present in notes, sorted by count descending
  const activeSubjects = useMemo(() => {
    return Object.values(Subject).filter((s) => (subjectCounts[s] ?? 0) > 0);
  }, [subjectCounts]);

  // Compute duplicate question counts: questionId → number of times it appears
  const questionRepeatCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const note of notes) {
      counts[note.questionId] = (counts[note.questionId] ?? 0) + 1;
    }
    return counts;
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (subject !== "ALL" && note.subject !== subject) {
        return false;
      }

      if (startDate && formatDate(note.examDate) < startDate) {
        return false;
      }

      if (endDate && formatDate(note.examDate) > endDate) {
        return false;
      }

      return true;
    });
  }, [endDate, notes, startDate, subject]);

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
    }

    return payload;
  }

  function saveMemo(noteId: number) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson(`/api/student/wrong-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            memo: drafts[noteId] ?? "",
          }),
        });

        setNotes((current) =>
          current.map((note) =>
            note.id === noteId
              ? {
                  ...note,
                  memo: payload.note.memo,
                  updatedAt: payload.note.updatedAt,
                }
              : note,
          ),
        );
        setNotice("메모를 저장했습니다.");
        setErrorMessage(null);
      } catch (error) {
        setNotice(null);
        setErrorMessage(
          error instanceof Error ? error.message : "메모 저장에 실패했습니다.",
        );
      }
    });
  }

  function deleteNote(noteId: number) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: "오답 노트 삭제",
      description: "이 오답 노트를 삭제하시겠습니까?",
      details: ["삭제한 노트는 다시 복구할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);

        startTransition(async () => {
          try {
            await requestJson(`/api/student/wrong-notes/${noteId}`, {
              method: "DELETE",
            });

            setNotes((current) => current.filter((note) => note.id !== noteId));
            setNotice("오답 노트를 삭제했습니다.");
            setErrorMessage(null);
          } catch (error) {
            setNotice(null);
            setErrorMessage(
              error instanceof Error ? error.message : "오답 노트 삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  function clearAll() {
    confirmModal.openModal({
      badgeLabel: "전체 삭제 확인",
      badgeTone: "warning",
      title: "오답 노트 전체 삭제",
      description: "저장한 오답 노트를 모두 삭제하시겠습니까?",
      details: ["전체 삭제 후에는 저장한 메모와 오답 기록을 복구할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "전체 삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);

        startTransition(async () => {
          try {
            await requestJson("/api/student/wrong-notes", {
              method: "DELETE",
            });

            setNotes([]);
            setNotice("오답 노트를 모두 삭제했습니다.");
            setErrorMessage(null);
          } catch (error) {
            setNotice(null);
            setErrorMessage(
              error instanceof Error ? error.message : "오답 노트 전체 삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6 no-print">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">오답 노트 필터</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              과목 탭 또는 날짜 범위로 저장한 오답을 빠르게 정리할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={notes.length === 0}
              className="print-show inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-forest/40 hover:text-forest disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 4a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Zm-1.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm.75 2.25a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 .75.75h3a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-3Z"
                  clipRule="evenodd"
                />
              </svg>
              오답노트 인쇄
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={isPending || notes.length === 0}
              className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              전체 삭제
            </button>
          </div>
        </div>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {/* Subject filter tabs */}
        {activeSubjects.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate">과목 필터</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubject("ALL")}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  subject === "ALL"
                    ? "border-ink/30 bg-ink text-white"
                    : "border-ink/10 bg-mist text-slate hover:border-ink/30 hover:text-ink"
                }`}
              >
                전체
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    subject === "ALL" ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                  }`}
                >
                  {subjectCounts["ALL"] ?? 0}
                </span>
              </button>
              {activeSubjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    subject === s
                      ? "border-forest/40 bg-forest text-white"
                      : "border-ink/10 bg-mist text-slate hover:border-forest/30 hover:text-forest"
                  }`}
                >
                  {SUBJECT_LABEL[s]}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      subject === s ? "bg-white/20 text-white" : "bg-ember/10 text-ember"
                    }`}
                  >
                    {subjectCounts[s] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date range filters */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">시작 날짜</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">종료 날짜</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">저장한 오답</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              현재 필터에 맞는 문항 {filteredNotes.length}건을 표시하고 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {filteredNotes.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-center">
              {notes.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-ink">아직 저장한 오답이 없습니다.</p>
                  <p className="text-sm text-slate leading-7">
                    성적 조회 화면에서 틀린 문항 옆의 <span className="font-semibold text-ink">노트 저장</span> 버튼을 눌러 오답을 기록해 보세요.
                  </p>
                  <a
                    href="/student/scores"
                    className="mt-2 inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
                  >
                    성적 조회로 이동
                  </a>
                </div>
              ) : (
                <p className="text-sm text-slate">현재 필터에 맞는 오답이 없습니다.</p>
              )}
            </div>
          ) : null}

          {filteredNotes.map((note) => {
            const dateKey = formatDate(note.examDate);
            const sessionHref = `/student/scores/${encodeURIComponent(dateKey)}`;
            const repeatCount = questionRepeatCounts[note.questionId] ?? 1;
            return (
            <article key={note.id} className="rounded-[24px] border border-ink/10 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                      {SUBJECT_LABEL[note.subject]}
                    </span>
                    <Link
                      href={sessionHref}
                      className="inline-flex items-center gap-1 rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/10"
                      title="해당 시험 성적 조회"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      {dateKey} 성적 보기
                    </Link>
                    {note.difficulty ? (
                      <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
                        난이도: {note.difficulty}
                      </span>
                    ) : null}
                    {repeatCount > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
                          />
                        </svg>
                        다시 틀린 문제 {repeatCount}회
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{note.questionNo}번 문항</h3>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate">정답</span>
                      <span className="rounded-lg border border-forest/20 bg-forest/10 px-2 py-0.5 font-semibold text-forest">
                        {note.correctAnswer}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate">내 답안</span>
                      <span className="rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 font-semibold text-red-700">
                        {note.studentAnswer ?? "-"}
                      </span>
                    </div>
                    {note.correctRate !== null && note.correctRate !== undefined ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate">정답률</span>
                        <span
                          className={`font-semibold ${
                            note.correctRate >= 70
                              ? "text-forest"
                              : note.correctRate >= 40
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {note.correctRate.toFixed(1)}%
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  삭제
                </button>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">메모</label>
                <textarea
                  value={drafts[note.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [note.id]: event.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full rounded-[20px] border border-ink/10 px-4 py-3 text-sm leading-7"
                  placeholder="복습 포인트나 다음에 다시 확인할 내용을 적어 두세요."
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate">마지막 수정 {formatDate(note.updatedAt)}</p>
                <button
                  type="button"
                  onClick={() => saveMemo(note.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
                >
                  메모 저장
                </button>
              </div>
            </article>
            );
          })}
        </div>
      </section>
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
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}