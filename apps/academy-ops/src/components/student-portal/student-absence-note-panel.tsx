"use client";

import { AbsenceCategory, AbsenceStatus, AttendType, Subject } from "@prisma/client";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ABSENCE_CATEGORY_LABEL, ATTEND_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDateTime, formatDateWithWeekday } from "@/lib/format";

type SessionOption = {
  id: number;
  week: number;
  subject: Subject;
  examDate: string;
  existingStatus: AbsenceStatus | null;
  canSubmit: boolean;
  attendType: AttendType | null;
  finalScore: number | null;
};

type NoteItem = {
  id: number;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory | null;
  status: AbsenceStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  adminNote: string | null;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  session: {
    id: number;
    week: number;
    subject: Subject;
    examDate: string;
  };
};

type StudentAbsenceNotePanelProps = {
  sessionOptions: SessionOption[];
  notes: NoteItem[];
};

const NOTE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "검토 대기",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
};

const NOTE_STATUS_CLASS: Record<AbsenceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

const NOTE_STATUS_ICON: Record<AbsenceStatus, string> = {
  PENDING: "⏳",
  APPROVED: "✓",
  REJECTED: "✕",
};

const ABSENCE_CATEGORY_ICON: Record<AbsenceCategory, string> = {
  MILITARY: "🪖",
  MEDICAL: "🏥",
  FAMILY: "👨‍👩‍👧",
  OTHER: "📝",
};

type NoteFilterTab = "ALL" | AbsenceStatus;

const NOTE_FILTER_LABEL: Record<NoteFilterTab, string> = {
  ALL: "전체",
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

export function StudentAbsenceNotePanel({
  sessionOptions,
  notes,
}: StudentAbsenceNotePanelProps) {
  const router = useRouter();
  const availableSessions = useMemo(
    () => sessionOptions.filter((session) => session.canSubmit),
    [sessionOptions],
  );
  const [sessionId, setSessionId] = useState(
    availableSessions[0] ? String(availableSessions[0].id) : "",
  );
  const [absenceCategory, setAbsenceCategory] = useState<AbsenceCategory>(AbsenceCategory.OTHER);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteFilter, setNoteFilter] = useState<NoteFilterTab>("ALL");

  useEffect(() => {
    if (availableSessions.length === 0) {
      if (sessionId !== "") {
        setSessionId("");
      }
      return;
    }

    if (!availableSessions.some((session) => String(session.id) === sessionId)) {
      setSessionId(String(availableSessions[0].id));
    }
  }, [availableSessions, sessionId]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sessionId) {
      setErrorMessage("사유서를 제출할 회차를 선택해 주세요.");
      return;
    }

    if (!reason.trim()) {
      setErrorMessage("상세 사유를 입력해 주세요.");
      return;
    }

    setNotice(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await requestJson("/api/student/absence-notes", {
        method: "POST",
        body: JSON.stringify({
          sessionId: Number(sessionId),
          absenceCategory,
          reason,
        }),
      });

      setNotice(
        absenceCategory === AbsenceCategory.MILITARY
          ? "예비군 사유서가 접수되어 자동 승인되었습니다. 출결과 개근 반영 여부도 함께 갱신했습니다."
          : "사유서가 접수되었습니다. 관리자의 검토 후 상태가 업데이트됩니다.",
      );
      setReason("");
      setSessionId("");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "사유서 제출에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // 상태별 카운트
  const pendingCount = notes.filter((n) => n.status === AbsenceStatus.PENDING).length;
  const approvedCount = notes.filter((n) => n.status === AbsenceStatus.APPROVED).length;
  const rejectedCount = notes.filter((n) => n.status === AbsenceStatus.REJECTED).length;

  const noteFilterCount: Record<NoteFilterTab, number> = {
    ALL: notes.length,
    PENDING: pendingCount,
    APPROVED: approvedCount,
    REJECTED: rejectedCount,
  };

  const filteredNotes = noteFilter === "ALL"
    ? notes
    : notes.filter((n) => n.status === noteFilter);

  const noteFilterTabs: NoteFilterTab[] = ["ALL", "PENDING", "APPROVED", "REJECTED"];

  return (
    <div className="space-y-6">
      {/* 상태별 카운트 요약 */}
      {notes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center rounded-[20px] border border-amber-200 bg-amber-50 p-3 text-center">
            <span className="text-lg">⏳</span>
            <p className="mt-1 text-xl font-bold text-amber-700">{pendingCount}</p>
            <p className="text-xs text-amber-600">대기 중</p>
          </div>
          <div className="flex flex-col items-center rounded-[20px] border border-forest/20 bg-forest/10 p-3 text-center">
            <span className="text-lg">✓</span>
            <p className="mt-1 text-xl font-bold text-forest">{approvedCount}</p>
            <p className="text-xs text-forest">승인됨</p>
          </div>
          <div className="flex flex-col items-center rounded-[20px] border border-red-200 bg-red-50 p-3 text-center">
            <span className="text-lg">✕</span>
            <p className="mt-1 text-xl font-bold text-red-700">{rejectedCount}</p>
            <p className="text-xs text-red-600">반려됨</p>
          </div>
        </div>
      )}

      {/* 사유서 제출 폼 */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">사유서 제출</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              지난 회차 결석 사유를 제출할 수 있습니다. 예비군은 자동 승인되고, 그 외 사유는 관리자 검토 후 상태가 반영됩니다.
            </p>
          </div>
          <div
            className={`rounded-[20px] border px-4 py-2.5 text-sm font-semibold ${
              availableSessions.length > 0
                ? "border-ember/20 bg-ember/10 text-ember"
                : "border-ink/10 bg-mist text-slate"
            }`}
          >
            제출 가능 {availableSessions.length}건
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

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          {/* 회차 선택 */}
          <div>
            <label className="mb-2 block text-sm font-medium">선택 회차</label>
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              disabled={isSubmitting || availableSessions.length === 0}
            >
              {availableSessions.length === 0 ? (
                <option value="">지금은 제출 가능한 회차가 없습니다.</option>
              ) : null}
              {availableSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDateWithWeekday(session.examDate)} / {session.week}주차 / {SUBJECT_LABEL[session.subject]}
                </option>
              ))}
            </select>
          </div>

          {/* 사유 구분 카드 선택 */}
          <div>
            <label className="mb-2 block text-sm font-medium">결석 유형</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.values(AbsenceCategory).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setAbsenceCategory(category)}
                  disabled={isSubmitting}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm font-semibold transition ${
                    absenceCategory === category
                      ? "border-ember/40 bg-ember/10 text-ember"
                      : "border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
                  }`}
                >
                  <span className="text-lg leading-none">{ABSENCE_CATEGORY_ICON[category]}</span>
                  {ABSENCE_CATEGORY_LABEL[category]}
                </button>
              ))}
            </div>
            {absenceCategory === AbsenceCategory.MILITARY ? (
              <p className="mt-2 rounded-xl border border-forest/20 bg-forest/10 px-3 py-2 text-xs leading-6 text-forest">
                예비군 사유서는 자동 승인되며, 출결 인정과 개근 반영 여부도 함께 처리됩니다.
              </p>
            ) : null}
          </div>

          {/* 상세 사유 */}
          <div>
            <label className="mb-2 block text-sm font-medium">상세 사유</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder="결석 사유와 필요한 보충 설명을 적어 주세요."
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              disabled={isSubmitting}
            />
          </div>

          {/* 파일 첨부 안내 */}
          <div className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-xs leading-6 text-slate">
            <p className="font-semibold text-ink">증빙 서류 제출 안내</p>
            <p className="mt-0.5">
              진단서·소집 통지서 등 증빙 서류는 온라인 첨부가 지원되지 않습니다.
              학원 창구로 직접 제출해 주세요.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-6 text-slate">
              제출한 내용은 관리자 검토 후 상태가 변경되며, 반려된 회차만 다시 제출할 수 있습니다.
            </p>
            <button
              type="submit"
              disabled={isSubmitting || availableSessions.length === 0}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {isSubmitting ? "제출 중..." : "사유서 제출"}
            </button>
          </div>
        </form>
      </section>

      {/* 제출 내역 + 필터 탭 */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">제출 내역</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              이전에 제출한 사유서의 처리 결과와 출결 반영 여부를 한 번에 확인할 수 있습니다.
            </p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-2.5 text-sm text-slate">
            총 {notes.length}건
          </div>
        </div>

        {/* 상태 필터 탭 */}
        {notes.length > 0 && (
          <div className="mt-5 flex gap-0 border-b border-ink/10">
            {noteFilterTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setNoteFilter(tab)}
                className={`flex items-center gap-1.5 border-b-2 px-4 pb-3 text-sm font-semibold transition ${
                  noteFilter === tab
                    ? "border-ember text-ember"
                    : "border-transparent text-slate hover:text-ink"
                }`}
              >
                {NOTE_FILTER_LABEL[tab]}
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs ${
                    noteFilter === tab ? "bg-ember text-white" : "bg-mist text-slate"
                  }`}
                >
                  {noteFilterCount[tab]}
                </span>
              </button>
            ))}
          </div>
        )}

        {filteredNotes.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            {noteFilter === "ALL" ? "제출한 사유서가 아직 없습니다." : `${NOTE_FILTER_LABEL[noteFilter]} 상태인 사유서가 없습니다.`}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {filteredNotes.map((note) => (
              <article key={note.id} className={`rounded-[24px] border p-5 ${note.status === AbsenceStatus.REJECTED ? "border-red-200" : "border-ink/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${NOTE_STATUS_CLASS[note.status]}`}>
                        <span>{NOTE_STATUS_ICON[note.status]}</span>
                        {NOTE_STATUS_LABEL[note.status]}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                        <span>{note.absenceCategory ? ABSENCE_CATEGORY_ICON[note.absenceCategory] : "📝"}</span>
                        {note.absenceCategory ? ABSENCE_CATEGORY_LABEL[note.absenceCategory] : "기타"}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {formatDateWithWeekday(note.session.examDate)} / {note.session.week}주차 / {SUBJECT_LABEL[note.session.subject]}
                    </h3>
                    <p className="mt-2 text-sm text-slate">
                      제출 {note.submittedAt ? formatDateTime(note.submittedAt) : "-"}
                      {note.approvedAt ? ` / 처리 ${formatDateTime(note.approvedAt)}` : ""}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm text-slate">
                    {note.attendCountsAsAttendance ? "출결 인정" : "결석 처리"}
                    <div className="mt-1">{note.attendGrantsPerfectAttendance ? "개근 반영" : "개근 제외"}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="rounded-[20px] bg-mist px-4 py-4 text-sm leading-7 text-ink">
                    {note.reason}
                  </div>
                  <div className="rounded-[20px] border border-ink/10 px-4 py-4 text-sm leading-7 text-slate">
                    <div>
                      반영 출결: {ATTEND_TYPE_LABEL[note.status === AbsenceStatus.APPROVED ? AttendType.EXCUSED : AttendType.ABSENT]}
                    </div>
                    {note.adminNote ? (
                      <div className={`mt-2 ${note.status === AbsenceStatus.REJECTED ? "text-red-700" : "text-slate"}`}>
                        관리자 메모: {note.adminNote}
                      </div>
                    ) : null}
                    {note.status === AbsenceStatus.REJECTED ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        반려된 회차는 내용을 보완해 다시 제출할 수 있습니다.
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 제출 불가 회차 안내 */}
      {sessionOptions.some((session) => !session.canSubmit) ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 text-sm leading-7 text-slate sm:p-6">
          <h2 className="text-xl font-semibold text-ink">제출할 수 없는 회차 안내</h2>
          <div className="mt-4 space-y-3">
            {sessionOptions
              .filter((session) => !session.canSubmit)
              .map((session) => (
                <div key={session.id} className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
                  {formatDateWithWeekday(session.examDate)} / {session.week}주차 / {SUBJECT_LABEL[session.subject]}
                  <div className="mt-1 text-xs text-slate">
                    {session.existingStatus === AbsenceStatus.PENDING && "이미 제출되어 검토 중인 회차입니다."}
                    {session.existingStatus === AbsenceStatus.APPROVED && "이미 승인 처리된 회차입니다."}
                    {session.attendType ? ` 현재 출결: ${ATTEND_TYPE_LABEL[session.attendType]}` : ""}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}