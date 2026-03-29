"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AttendStatusType = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

type Session = {
  id: string;
  scheduleId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  isCancelled: boolean;
  note: string | null;
  schedule: {
    id: string;
    subjectName: string;
    instructorName: string | null;
    cohort: {
      id: string;
      name: string;
      examCategory: string;
    };
  };
};

type StudentRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  currentStatus: AttendStatusType | null;
  currentNote: string | null;
};

type AttendanceEntry = {
  studentId: string;
  status: AttendStatusType;
  note: string;
};

type Props = {
  session: Session;
  students: StudentRow[];
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

const STATUS_OPTIONS: { value: AttendStatusType; label: string }[] = [
  { value: "PRESENT", label: "출석" },
  { value: "LATE", label: "지각" },
  { value: "ABSENT", label: "결석" },
  { value: "EXCUSED", label: "공결" },
];

const STATUS_STYLE: Record<AttendStatusType, string> = {
  PRESENT: "border-forest/30 bg-forest/10 text-forest",
  LATE: "border-amber-200 bg-amber-50 text-amber-700",
  ABSENT: "border-red-200 bg-red-50 text-red-600",
  EXCUSED: "border-sky-200 bg-sky-50 text-sky-700",
};

const STATUS_DOT: Record<AttendStatusType, string> = {
  PRESENT: "bg-forest",
  LATE: "bg-amber-500",
  ABSENT: "bg-red-500",
  EXCUSED: "bg-sky-500",
};

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

export function BulkAttendanceClient({ session, students }: Props) {
  const router = useRouter();

  const initEntries = (): Map<string, AttendanceEntry> => {
    const map = new Map<string, AttendanceEntry>();
    for (const s of students) {
      map.set(s.examNumber, {
        studentId: s.examNumber,
        status: (s.currentStatus ?? "PRESENT") as AttendStatusType,
        note: s.currentNote ?? "",
      });
    }
    return map;
  };

  const [entries, setEntries] = useState<Map<string, AttendanceEntry>>(initEntries);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const setStatus = useCallback((examNumber: string, status: AttendStatusType) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(examNumber);
      if (existing) next.set(examNumber, { ...existing, status });
      return next;
    });
  }, []);

  const setNote = useCallback((examNumber: string, note: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(examNumber);
      if (existing) next.set(examNumber, { ...existing, note });
      return next;
    });
  }, []);

  const applyAll = useCallback((status: AttendStatusType) => {
    setEntries((prev) => {
      const next = new Map(prev);
      for (const [key, entry] of next) {
        next.set(key, { ...entry, status });
      }
      return next;
    });
  }, []);

  // 통계
  const stats = { total: students.length, present: 0, late: 0, absent: 0, excused: 0 };
  for (const entry of entries.values()) {
    if (entry.status === "PRESENT") stats.present++;
    else if (entry.status === "LATE") stats.late++;
    else if (entry.status === "ABSENT") stats.absent++;
    else if (entry.status === "EXCUSED") stats.excused++;
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const entriesArr = Array.from(entries.values()).map((e) => ({
        studentId: e.studentId,
        status: e.status,
        note: e.note.trim() || undefined,
      }));

      const res = await fetch("/api/attendance/lecture-attendance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, entries: entriesArr }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");

      setSaveSuccess(true);
      setTimeout(() => {
        router.push(`/admin/attendance/lecture/${session.id}`);
      }, 800);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/admin/attendance/lecture/${session.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-mist transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate">
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          강의 출결 일괄 입력
        </div>
      </div>

      {/* 세션 정보 */}
      <div className="mb-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              {session.schedule.subjectName} — 일괄 출결 입력
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate">{formatDisplayDate(session.sessionDate)}</span>
              <span className="text-sm text-slate">·</span>
              <span className="text-sm font-medium text-ink">
                {session.startTime} ~ {session.endTime}
              </span>
              <span className="rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                {session.schedule.cohort.name}
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                {EXAM_CATEGORY_LABEL[session.schedule.cohort.examCategory] ??
                  session.schedule.cohort.examCategory}
              </span>
            </div>
            {session.schedule.instructorName && (
              <p className="mt-1 text-sm text-slate">강사: {session.schedule.instructorName}</p>
            )}
          </div>
          {session.isCancelled && (
            <span className="self-start rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              강의 취소됨
            </span>
          )}
        </div>
      </div>

      {/* 일괄 적용 버튼 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate">일괄 적용:</span>
        {STATUS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => applyAll(value)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors hover:opacity-80 ${STATUS_STYLE[value]}`}
          >
            전체 {label}
          </button>
        ))}
      </div>

      {/* 출결 테이블 */}
      {students.length === 0 ? (
        <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center shadow-panel">
          <p className="text-base font-medium text-slate">이 기수에 등록된 수강생이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[80px_1fr_160px_1fr] items-center gap-3 border-b border-ink/8 bg-mist px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
            <span>학번</span>
            <span>이름</span>
            <span>출결 상태</span>
            <span>비고</span>
          </div>

          {/* 테이블 행 */}
          <div className="divide-y divide-ink/6">
            {students.map((student) => {
              const entry = entries.get(student.examNumber);
              if (!entry) return null;
              return (
                <div
                  key={student.examNumber}
                  className="grid grid-cols-[80px_1fr_160px_1fr] items-center gap-3 px-6 py-3 hover:bg-mist/40 transition-colors"
                >
                  {/* 학번 */}
                  <span className="font-mono text-xs text-slate">{student.examNumber}</span>

                  {/* 이름 */}
                  <span className="text-sm font-semibold text-ink">{student.name}</span>

                  {/* 출결 상태 드롭다운 */}
                  <div className="relative">
                    <select
                      value={entry.status}
                      onChange={(e) =>
                        setStatus(student.examNumber, e.target.value as AttendStatusType)
                      }
                      className={`w-full cursor-pointer appearance-none rounded-xl border px-3 py-1.5 pr-7 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ember/30 ${STATUS_STYLE[entry.status]}`}
                    >
                      {STATUS_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <svg className="h-3.5 w-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* 비고 */}
                  <input
                    type="text"
                    value={entry.note}
                    onChange={(e) => setNote(student.examNumber, e.target.value)}
                    placeholder="비고"
                    className="rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-ember/30"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 하단 요약 + 저장 버튼 */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-[28px] border border-ink/10 bg-white px-6 py-4 shadow-panel">
        <div className="flex flex-wrap items-center gap-4">
          {(
            [
              { key: "PRESENT" as AttendStatusType, count: stats.present, label: "출석" },
              { key: "LATE" as AttendStatusType, count: stats.late, label: "지각" },
              { key: "ABSENT" as AttendStatusType, count: stats.absent, label: "결석" },
              { key: "EXCUSED" as AttendStatusType, count: stats.excused, label: "공결" },
            ]
          ).map(({ key, count, label }) => (
            <span key={key} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[key]}`} />
              <span className="font-semibold text-ink">{count}</span>
              <span className="text-slate">{label}</span>
            </span>
          ))}
          <span className="text-sm text-slate">/ 총 {stats.total}명</span>
        </div>

        <div className="flex items-center gap-3">
          {saveError && <p className="text-sm font-medium text-red-600">{saveError}</p>}
          {saveSuccess && (
            <p className="text-sm font-medium text-forest">저장되었습니다.</p>
          )}
          <Link
            href={`/admin/attendance/lecture/${session.id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-slate hover:bg-mist transition-colors"
          >
            취소
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving || students.length === 0 || session.isCancelled}
            className="inline-flex items-center gap-2 rounded-xl bg-ember px-6 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                저장 중...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                저장
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
