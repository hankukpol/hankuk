"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────

type CancelledSession = {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  subjectName: string;
  instructorName: string | null;
  cohortId: string;
  cohortName: string;
  examCategory: string;
  makeupDate: string | null;
  note: string;
};

type Props = {
  sessions: CancelledSession[];
};

// ─── Constants ─────────────────────────────────────────────────────────────

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_KO[d.getDay()];
  return `${d.getFullYear()}년 ${m}월 ${day}일(${dow})`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function MakeupNewForm({ sessions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions[0]?.id ?? ""
  );
  const [makeupDate, setMakeupDate] = useState<string>(() => {
    // Pre-fill from the first session's existing makeup date if any
    const first = sessions[0];
    return first?.makeupDate ?? "";
  });
  const [note, setNote] = useState<string>(() => sessions[0]?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // When user changes session selection, pre-fill existing values
  function handleSessionChange(id: string) {
    setSelectedSessionId(id);
    setError(null);
    setSuccess(false);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setMakeupDate(session.makeupDate ?? "");
      setNote(session.note);
    }
  }

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!selectedSessionId) {
      setError("취소 강의를 선택하세요.");
      return;
    }
    if (!makeupDate) {
      setError("보강 날짜를 선택하세요.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/makeups", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: selectedSessionId,
            makeupDate,
            note,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "저장에 실패했습니다.");
          return;
        }
        setSuccess(true);
        // Navigate back to list after 1.5 s
        setTimeout(() => {
          router.push("/admin/attendance/makeups");
        }, 1500);
      } catch {
        setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    });
  }

  // Group sessions: pending first, then scheduled
  const pendingSessions = sessions.filter((s) => !s.makeupDate);
  const scheduledSessions = sessions.filter((s) => !!s.makeupDate);

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
        {/* Form header */}
        <div className="border-b border-ink/5 bg-mist/40 px-8 py-5">
          <h2 className="text-base font-semibold text-ink">보강 일정 정보 입력</h2>
        </div>

        <div className="space-y-8 p-8">
          {/* ── 1. Select cancelled session ──────────────────────────────── */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">
              취소된 강의 선택 <span className="text-red-500">*</span>
            </label>
            <p className="mb-3 text-xs text-slate">
              보강 설정이 필요한 취소 강의를 선택하세요.
              목록은 보강 미설정(빨강) → 보강 예정(주황) 순으로 표시됩니다.
            </p>

            <select
              value={selectedSessionId}
              onChange={(e) => handleSessionChange(e.target.value)}
              disabled={isPending || success}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30 disabled:opacity-60"
            >
              {pendingSessions.length > 0 && (
                <optgroup label="보강 미설정 강의">
                  {pendingSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionDate(s.sessionDate)} {s.startTime}~{s.endTime}{" "}
                      {s.subjectName} ({s.cohortName})
                    </option>
                  ))}
                </optgroup>
              )}
              {scheduledSessions.length > 0 && (
                <optgroup label="보강 예정 (날짜 변경 가능)">
                  {scheduledSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionDate(s.sessionDate)} {s.startTime}~{s.endTime}{" "}
                      {s.subjectName} ({s.cohortName}) → 보강 {s.makeupDate}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Selected session preview card */}
            {selectedSession && (
              <div className="mt-3 rounded-2xl border border-ink/8 bg-mist/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {selectedSession.subjectName}
                  </span>
                  {selectedSession.instructorName && (
                    <span className="text-xs text-slate">
                      {selectedSession.instructorName} 강사
                    </span>
                  )}
                  <span className="rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-medium text-forest">
                    {selectedSession.cohortName}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                    {EXAM_CATEGORY_LABEL[selectedSession.examCategory] ?? selectedSession.examCategory}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate">
                  <span>
                    취소일:{" "}
                    <span className="font-medium text-ink">
                      {formatSessionDate(selectedSession.sessionDate)}
                    </span>
                  </span>
                  <span>
                    시간:{" "}
                    <span className="font-medium text-ink">
                      {selectedSession.startTime} ~ {selectedSession.endTime}
                    </span>
                  </span>
                  {selectedSession.makeupDate && (
                    <span>
                      기존 보강 날짜:{" "}
                      <span className="font-medium text-amber-700">
                        {selectedSession.makeupDate}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── 2. Makeup date ───────────────────────────────────────────── */}
          <div>
            <label htmlFor="makeup-date" className="mb-2 block text-sm font-semibold text-ink">
              보강 날짜 <span className="text-red-500">*</span>
            </label>
            <p className="mb-3 text-xs text-slate">
              보강 수업이 진행될 날짜를 선택하세요.
            </p>
            <input
              id="makeup-date"
              type="date"
              value={makeupDate}
              onChange={(e) => setMakeupDate(e.target.value)}
              disabled={isPending || success}
              min={new Date().toISOString().split("T")[0]}
              className="w-full max-w-xs rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30 disabled:opacity-60"
            />
            {makeupDate && selectedSession && (
              <p className="mt-2 text-xs text-slate">
                선택된 보강 날짜:{" "}
                <span className="font-semibold text-ember">{makeupDate}</span>
                {" "}
                {(() => {
                  const d = new Date(makeupDate + "T00:00:00");
                  const m = d.getMonth() + 1;
                  const day = d.getDate();
                  const dow = DAY_KO[d.getDay()];
                  return `(${m}월 ${day}일 ${dow}요일)`;
                })()}
              </p>
            )}
          </div>

          {/* ── 3. Note / reason ────────────────────────────────────────── */}
          <div>
            <label htmlFor="makeup-note" className="mb-2 block text-sm font-semibold text-ink">
              메모 <span className="text-xs font-normal text-slate">(선택)</span>
            </label>
            <p className="mb-3 text-xs text-slate">
              보강 장소, 변경 사유, 참고사항 등을 입력하세요.
            </p>
            <textarea
              id="makeup-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending || success}
              rows={3}
              placeholder="예: 301호 강의실, 강사 개인 사정으로 인한 보강"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-ember/30 disabled:opacity-60 resize-none"
            />
          </div>

          {/* ── Error / Success messages ─────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-red-500">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-3 rounded-2xl border border-forest/20 bg-forest/10 p-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-forest">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-forest">
                보강 일정이 저장되었습니다. 잠시 후 목록으로 이동합니다...
              </p>
            </div>
          )}
        </div>

        {/* Form footer */}
        <div className="flex items-center justify-between border-t border-ink/5 bg-mist/30 px-8 py-5">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            취소
          </button>

          <button
            type="submit"
            disabled={isPending || success || !selectedSessionId || !makeupDate}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                저장 중...
              </>
            ) : success ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                저장 완료
              </>
            ) : (
              "보강 일정 저장"
            )}
          </button>
        </div>
      </div>

      {/* Session list preview below form */}
      {sessions.length > 1 && (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-sm">
          <div className="border-b border-ink/5 bg-mist/40 px-6 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">
              전체 취소 강의 목록 ({sessions.length}건)
            </p>
          </div>
          <div>
            {sessions.map((s) => {
              const isSelected = s.id === selectedSessionId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSessionChange(s.id)}
                  disabled={isPending || success}
                  className={`w-full border-b border-ink/5 px-6 py-3 text-left transition last:border-b-0 hover:bg-mist/50 ${
                    isSelected ? "bg-ember/5" : ""
                  } disabled:opacity-60`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-ember" />
                    )}
                    <span className="text-sm font-semibold text-ink">{s.subjectName}</span>
                    <span className="text-xs text-slate">
                      {formatSessionDate(s.sessionDate)} {s.startTime}~{s.endTime}
                    </span>
                    <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                      {s.cohortName}
                    </span>
                    {s.makeupDate ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        보강 {s.makeupDate}
                      </span>
                    ) : (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        미설정
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}
