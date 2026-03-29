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

const STATUS_CONFIG: Record<
  AttendStatusType,
  { label: string; color: string; dot: string }
> = {
  PRESENT: {
    label: "출석",
    color: "border-forest/30 bg-forest/10 text-forest",
    dot: "bg-forest",
  },
  LATE: {
    label: "지각",
    color: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  ABSENT: {
    label: "결석",
    color: "border-red-200 bg-red-50 text-red-600",
    dot: "bg-red-500",
  },
  EXCUSED: {
    label: "공결",
    color: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
};

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

export function AttendanceInput({ session, students }: Props) {
  const router = useRouter();

  // 초기 상태: 기존 출결 있으면 가져오고, 없으면 PRESENT로 초기화
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
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // 개별 상태 변경
  const setStatus = useCallback(
    (examNumber: string, status: AttendStatusType) => {
      setEntries((prev) => {
        const next = new Map(prev);
        const existing = next.get(examNumber);
        if (existing) {
          next.set(examNumber, { ...existing, status });
        }
        return next;
      });
    },
    [],
  );

  // 비고 변경
  const setNote = useCallback((examNumber: string, note: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(examNumber);
      if (existing) {
        next.set(examNumber, { ...existing, note });
      }
      return next;
    });
  }, []);

  // 전체 일괄 적용
  const applyAll = useCallback((status: AttendStatusType) => {
    setEntries((prev) => {
      const next = new Map(prev);
      for (const [key, entry] of next) {
        next.set(key, { ...entry, status });
      }
      return next;
    });
  }, []);

  // 통계 계산
  const stats = {
    total: students.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };
  for (const entry of entries.values()) {
    if (entry.status === "PRESENT") stats.present++;
    else if (entry.status === "LATE") stats.late++;
    else if (entry.status === "ABSENT") stats.absent++;
    else if (entry.status === "EXCUSED") stats.excused++;
  }

  // 저장
  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const attendances = Array.from(entries.values()).map((e) => ({
        studentId: e.studentId,
        status: e.status,
        note: e.note.trim() || undefined,
      }));

      const res = await fetch(
        `/api/attendance/sessions/${session.id}/attendances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attendances }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");

      setSaveSuccess(true);
      setTimeout(() => {
        router.push(`/admin/attendance/lecture?date=${session.sessionDate}`);
      }, 800);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }

  const backDate = session.sessionDate;

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/admin/attendance/lecture?date=${backDate}`}
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
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            강의 출결 입력
          </div>
        </div>
      </div>

      {/* 세션 정보 카드 */}
      <div className="mb-6 rounded-[28px] border border-ink/8 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              {session.schedule.subjectName} 출결 입력
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate">
                {formatDisplayDate(session.sessionDate)}
              </span>
              <span className="text-sm text-slate">·</span>
              <span className="text-sm font-medium text-ink">
                {session.startTime} ~ {session.endTime}
              </span>
              <span className="rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                {session.schedule.cohort.name}
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                {EXAM_CATEGORY_LABEL[session.schedule.cohort.examCategory] ?? session.schedule.cohort.examCategory}
              </span>
            </div>
            {session.schedule.instructorName && (
              <p className="mt-1 text-sm text-slate">
                강사: {session.schedule.instructorName}
              </p>
            )}
          </div>
          <Link
            href={`/admin/attendance/lecture/${session.id}/bulk`}
            className="inline-flex items-center gap-2 rounded-xl border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember hover:bg-ember/20 transition-colors self-start"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            일괄 입력
          </Link>
        </div>
      </div>

      {/* 일괄 적용 버튼 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate">일괄 적용:</span>
        {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendStatusType[]).map(
          (status) => (
            <button
              key={status}
              onClick={() => applyAll(status)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors hover:opacity-80 ${STATUS_CONFIG[status].color}`}
            >
              전체 {STATUS_CONFIG[status].label}
            </button>
          ),
        )}
      </div>

      {/* 출결 테이블 */}
      {students.length === 0 ? (
        <div className="rounded-[28px] border border-ink/8 bg-white p-12 text-center">
          <p className="text-base font-medium text-slate">
            이 기수에 등록된 수강생이 없습니다.
          </p>
        </div>
      ) : (
        <div className="rounded-[28px] border border-ink/8 bg-white overflow-hidden shadow-sm">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[80px_1fr_repeat(4,56px)_1fr] items-center gap-2 border-b border-ink/8 bg-mist px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
            <span>학번</span>
            <span>이름</span>
            <span className="text-center text-forest">출석</span>
            <span className="text-center text-amber-600">지각</span>
            <span className="text-center text-red-600">결석</span>
            <span className="text-center text-sky-600">공결</span>
            <span>비고</span>
          </div>

          {/* 테이블 행 */}
          <div className="divide-y divide-ink/6">
            {students.map((student) => {
              const entry = entries.get(student.examNumber);
              if (!entry) return null;
              return (
                <StudentAttendanceRow
                  key={student.examNumber}
                  student={student}
                  status={entry.status}
                  note={entry.note}
                  onStatusChange={(s) => setStatus(student.examNumber, s)}
                  onNoteChange={(n) => setNote(student.examNumber, n)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 하단 요약 + 저장 버튼 */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-[28px] border border-ink/8 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {(
            [
              { key: "PRESENT", count: stats.present },
              { key: "LATE", count: stats.late },
              { key: "ABSENT", count: stats.absent },
              { key: "EXCUSED", count: stats.excused },
            ] as Array<{ key: AttendStatusType; count: number }>
          ).map(({ key, count }) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <span key={key} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                <span className={`font-semibold ${cfg.color.split(" ").find((c) => c.startsWith("text-")) ?? ""}`}>
                  {count}
                </span>
                <span className="text-slate">{cfg.label}</span>
              </span>
            );
          })}
          <span className="text-sm text-slate">/ 총 {stats.total}명</span>
        </div>

        <div className="flex items-center gap-3">
          {saveError && (
            <p className="text-sm font-medium text-red-600">{saveError}</p>
          )}
          {saveSuccess && (
            <p className="text-sm font-medium text-forest">저장되었습니다.</p>
          )}
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
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
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

type RowProps = {
  student: StudentRow;
  status: AttendStatusType;
  note: string;
  onStatusChange: (s: AttendStatusType) => void;
  onNoteChange: (n: string) => void;
};

function StudentAttendanceRow({
  student,
  status,
  note,
  onStatusChange,
  onNoteChange,
}: RowProps) {
  const STATUSES: AttendStatusType[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

  return (
    <div className="grid grid-cols-[80px_1fr_repeat(4,56px)_1fr] items-center gap-2 px-6 py-3 hover:bg-mist/50 transition-colors">
      {/* 학번 */}
      <span className="text-xs font-mono text-slate">{student.examNumber}</span>

      {/* 이름 */}
      <div>
        <span className="text-sm font-semibold text-ink">{student.name}</span>
      </div>

      {/* 출결 라디오 버튼들 */}
      {STATUSES.map((s) => {
        const cfg = STATUS_CONFIG[s];
        const isSelected = status === s;
        return (
          <div key={s} className="flex items-center justify-center">
            <button
              onClick={() => onStatusChange(s)}
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                isSelected
                  ? `${cfg.dot} border-transparent`
                  : "border-ink/20 bg-white hover:border-ink/40"
              }`}
              title={cfg.label}
            >
              {isSelected && (
                <span className="flex items-center justify-center">
                  <svg
                    className="h-3.5 w-3.5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </button>
          </div>
        );
      })}

      {/* 비고 */}
      <input
        type="text"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="비고"
        className="rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-xs text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-ember/30"
      />
    </div>
  );
}
