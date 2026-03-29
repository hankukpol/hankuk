"use client";

import Link from "next/link";

export interface MonthlyScoreEntry {
  month: string; // "YYYY-MM"
  monthLabel: string; // "2026년 3월"
  avg: number | null;
  participationRate: number; // 0–100
  subjectScores: Record<string, number | null>;
  attendedCount: number;
  sessionCount: number;
  changeFromPrev: number | null;
}

export interface CounselingBriefingProps {
  examNumber: string;
  studentName: string;
  monthlyScores: MonthlyScoreEntry[];
  currentEnrollment?: {
    cohortName: string;
    status: string;
    endDate: string | null;
  } | null;
  hasOverduePayment: boolean;
  lastScoreDate: string | null;
}

function trendBadge(change: number | null) {
  if (change === null) return null;
  if (change >= 2)
    return (
      <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
        ▲ +{change.toFixed(1)}
      </span>
    );
  if (change <= -2)
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
        ▼ {change.toFixed(1)}
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-ink/10 bg-white px-2 py-0.5 text-xs font-semibold text-slate">
      ■ {change > 0 ? "+" : ""}
      {change.toFixed(1)}
    </span>
  );
}

function enrollmentStatusLabel(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "수강 중",
    PENDING: "등록 대기",
    SUSPENDED: "휴원",
    WITHDRAWN: "퇴원",
    COMPLETED: "수료",
    WAITING: "대기자",
  };
  return map[status] ?? status;
}

function enrollmentStatusClass(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "border-forest/20 bg-forest/10 text-forest",
    PENDING: "border-amber-200 bg-amber-50 text-amber-700",
    SUSPENDED: "border-amber-200 bg-amber-50 text-amber-700",
    WITHDRAWN: "border-red-200 bg-red-50 text-red-600",
    COMPLETED: "border-sky-200 bg-sky-50 text-sky-700",
    WAITING: "border-ink/10 bg-white text-slate",
  };
  return map[status] ?? "border-ink/10 bg-white text-slate";
}

function formatEndDate(endDate: string | null) {
  if (!endDate) return null;
  const d = new Date(endDate);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function CounselingBriefing({
  examNumber,
  studentName,
  monthlyScores,
  currentEnrollment,
  hasOverduePayment,
  lastScoreDate,
}: CounselingBriefingProps) {
  const recent3 = monthlyScores.slice(-3);

  // Compute weak subjects from the most recent month
  const latestMonth = monthlyScores.length > 0 ? monthlyScores[monthlyScores.length - 1] : null;
  const weakSubjects = latestMonth
    ? Object.entries(latestMonth.subjectScores)
        .filter(([, score]) => score !== null && latestMonth.avg !== null && score < latestMonth.avg - 5)
        .map(([subject]) => subject)
    : [];

  // Compute recent 30-day participation rate from latest month
  const recentAttendRate =
    latestMonth && latestMonth.sessionCount > 0
      ? Math.round((latestMonth.attendedCount / latestMonth.sessionCount) * 100)
      : null;

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-ink">
            {studentName} 면담 브리핑
          </span>
          {currentEnrollment && (
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${enrollmentStatusClass(currentEnrollment.status)}`}
            >
              {currentEnrollment.cohortName} · {enrollmentStatusLabel(currentEnrollment.status)}
              {currentEnrollment.endDate
                ? ` (~ ${formatEndDate(currentEnrollment.endDate)})`
                : ""}
            </span>
          )}
          {!currentEnrollment && (
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
              수강 정보 없음
            </span>
          )}
          {hasOverduePayment && (
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              미납 있음
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate">
          {lastScoreDate && (
            <span>
              마지막 성적:{" "}
              {new Date(lastScoreDate).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              })}
            </span>
          )}
          <Link
            href={`/admin/students/${examNumber}?tab=memos`}
            className="inline-flex items-center gap-1 rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/10"
          >
            + 상담 메모 작성
          </Link>
        </div>
      </div>

      {/* 3-month average trend */}
      <div className="mt-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">3개월 평균 추이</h3>
        {recent3.length === 0 ? (
          <p className="text-sm text-slate">최근 3개월 데이터가 없습니다.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {recent3.map((entry) => (
              <div
                key={entry.month}
                className="flex flex-col gap-1 rounded-[20px] border border-ink/10 bg-mist p-4"
              >
                <p className="text-xs font-semibold text-slate">{entry.monthLabel}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-semibold text-ink">
                    {entry.avg !== null ? entry.avg.toFixed(1) : "-"}
                  </p>
                  <p className="text-xs text-slate">점</p>
                </div>
                <div className="flex items-center gap-2">
                  {trendBadge(entry.changeFromPrev)}
                  <span className="text-xs text-slate">응시율 {entry.participationRate.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weak subjects */}
      {weakSubjects.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">취약 과목 (이번 달 평균 -5점 이하)</h3>
          <div className="flex flex-wrap gap-2">
            {weakSubjects.map((subject) => (
              <span
                key={subject}
                className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
              >
                {subject}
                {latestMonth?.subjectScores[subject] !== null &&
                  latestMonth?.subjectScores[subject] !== undefined && (
                    <span className="ml-1.5 opacity-80">
                      ({latestMonth.subjectScores[subject]?.toFixed(1)}점)
                    </span>
                  )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attendance summary */}
      {recentAttendRate !== null && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">이번 달 출석 현황</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 overflow-hidden rounded-full bg-ink/10" style={{ height: 8 }}>
              <div
                className={`h-full rounded-full transition-all ${
                  recentAttendRate >= 80
                    ? "bg-forest"
                    : recentAttendRate >= 60
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${recentAttendRate}%` }}
              />
            </div>
            <span
              className={`text-sm font-semibold ${
                recentAttendRate >= 80
                  ? "text-forest"
                  : recentAttendRate >= 60
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {recentAttendRate}%
            </span>
            {latestMonth && (
              <span className="text-xs text-slate">
                ({latestMonth.attendedCount}/{latestMonth.sessionCount}회)
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
